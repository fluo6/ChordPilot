"""Isolated chord evidence for an exact interval of original song audio."""
from __future__ import annotations

import hashlib
import math
from pathlib import Path
from typing import Any

from chordpilot_audio import load_audio
from chordpilot_common import normalize_analysis_options, normalize_known_key, log, PITCH_NAMES
from chordpilot_chords import (
    chroma_for_segment, chord_evidence, detected_pitch_confidence,
    estimate_key_from_chroma, rank_chord_candidates,
)
from chordpilot_analysis import estimate_bass_reference

STUDY_ALGORITHM_VERSION = "local-study-v2"
SOURCE_NAMES = {"full_mix", "bass", "other", "vocals", "drums"}


def detected_pitches_for_crop(crop: Any, sr: int, np: Any) -> list[dict[str, Any]]:
    """Keep spectral peaks in MIDI space instead of folding them into pitch classes."""
    # Spectral pitches can include instrumental overtones; they are not a played-note transcription.
    frame = 2 ** math.ceil(math.log2(max(2048, sr * .5)))
    frequencies = np.fft.rfftfreq(frame, 1 / sr)
    energy, frequency_sum = {}, {}
    for offset in range(0, len(crop), frame // 2):
        chunk = crop[offset:offset + frame]
        if len(chunk) < 3:
            continue
        # Window the actual crop before zero padding; never pull neighboring samples.
        spectrum = np.abs(np.fft.rfft(chunk * np.hanning(len(chunk)), n=frame))
        maximum = float(spectrum.max())
        if maximum <= 1e-9:
            continue
        peaks = np.flatnonzero((spectrum[1:-1] > spectrum[:-2]) & (spectrum[1:-1] >= spectrum[2:])) + 1
        for index in peaks:
            if spectrum[index] < maximum * .1 or not 20 <= frequencies[index] <= 4500:
                continue
            left, center, right = spectrum[index - 1:index + 2]
            denominator = left - 2 * center + right
            adjustment = .5 * (left - right) / denominator if denominator else 0
            frequency = float((index + adjustment) * sr / frame)
            midi = round(69 + 12 * math.log2(frequency / 440))
            if not 21 <= midi <= 108:
                continue
            weight = float(center ** 2 / len(chunk))
            energy[midi] = energy.get(midi, 0) + weight
            frequency_sum[midi] = frequency_sum.get(midi, 0) + frequency * weight
    total = sum(energy.values())
    return [{"midi": midi, "note": f"{PITCH_NAMES[midi % 12]}{midi // 12 - 1}",
             "frequency_hz": round(frequency_sum[midi] / energy[midi], 2), "strength": round(energy[midi] / total, 3)}
            for midi in sorted(energy, key=energy.get, reverse=True) if energy[midi] / total >= .02]


def validate_range(start: float, end: float, duration: float) -> tuple[float, float]:
    try:
        start, end, duration = float(start), float(end), float(duration)
    except (ValueError, TypeError):
        raise ValueError("Enter valid start and end times.") from None
    if not all(math.isfinite(value) for value in (start, end, duration)):
        raise ValueError("Start and end times must be finite.")
    if start < 0 or end > duration or end <= start or end - start < .05 - 1e-9:
        raise ValueError("Select at least 0.05 seconds within the source duration.")
    return start, end


def analyze_range(audio_path: str, source_paths: dict[str, str], start: float,
                  end: float, raw_options: dict[str, Any] | None = None) -> dict[str, Any]:
    import numpy as np

    if not isinstance(source_paths, dict) or not source_paths or set(source_paths) - SOURCE_NAMES:
        raise ValueError("Select at least one available audio source.")
    if "full_mix" in source_paths and len(source_paths) > 1:
        raise ValueError("Full Mix cannot be combined with individual stems.")
    raw_options = raw_options or {}
    if not isinstance(raw_options, dict):
        raise ValueError("Study settings must be an object.")
    normalized = normalize_analysis_options(raw_options)
    settings = {key: normalized[key] for key in (
        "known_key", "chroma_low_hz", "chroma_high_hz", "chord_alternatives", "simplify_chords")}
    settings["song_key"] = normalize_known_key(raw_options.get("song_key"))
    original, original_sr = load_audio(Path(audio_path))
    start, end = validate_range(start, end, len(original) / original_sr)
    crops, chromas, evidence, fingerprints = {}, {}, {}, {}
    for name, filename in source_paths.items():
        file = Path(filename)
        if not file.is_file():
            raise FileNotFoundError(f"Selected source {name} is unavailable.")
        audio, sr = (original, original_sr) if file.resolve() == Path(audio_path).resolve() else load_audio(file)
        try:
            validate_range(start, end, len(audio) / sr)
        except ValueError:
            raise ValueError(f"Selected source {name} does not cover this interval.") from None
        # Crop first: feature helpers may pad FFT windows but cannot read outside this range.
        crop = np.ascontiguousarray(audio[math.ceil(start * sr):math.floor(end * sr)], dtype=np.float32)
        crops[name] = (crop, sr)
        chromas[name] = chroma_for_segment(crop, sr, 0, len(crop) / sr, np, settings)
        evidence[name] = chord_evidence(chromas[name], start, end, name, np)
        evidence[name]["detected_pitches"] = detected_pitches_for_crop(crop, sr, np)
        stat = file.stat()
        digest = hashlib.sha256(str(sr).encode("ascii") + crop.astype("<f4").tobytes()).hexdigest()
        fingerprints[name] = {"size": stat.st_size, "mtime_ns": stat.st_mtime_ns, "sample_sha256": digest}
    harmonic_names = [name for name in source_paths if name != "bass"] or ["bass"]
    active = [chromas[name] for name in harmonic_names if float(chromas[name].sum()) > 0]
    chroma = np.mean(active, axis=0) if active else np.zeros(12)
    bass_reference = None
    if "bass" in crops:
        crop, sr = crops["bass"]
        bass_reference = estimate_bass_reference(crop, sr, 0, len(crop) / sr, np)
        if bass_reference:
            bass_reference["source"] = "bass"
    key = settings["known_key"] or settings["song_key"] or estimate_key_from_chroma(chroma, np)
    origin = "override" if settings["known_key"] else "song" if settings["song_key"] else "selection"
    ranked, _libraries = rank_chord_candidates(chroma, key, None, None, bass_reference, np, settings)
    best = ranked[0]
    pitch_confidence = detected_pitch_confidence(chroma, np)
    confidence = round(max(0, min(.98, best["score"] * .72 + pitch_confidence * .28)), 3) if active else 0
    pitched_sources = [item["detected_pitches"] for item in evidence.values() if item["detected_pitches"]]
    pitches = {}
    for source in pitched_sources:
        for pitch in source:
            midi = pitch["midi"]
            item = pitches.setdefault(midi, {**pitch, "strength": 0, "frequency_hz": 0})
            item["strength"] += pitch["strength"] / len(pitched_sources)
            item["frequency_hz"] += pitch["frequency_hz"] * pitch["strength"] / len(pitched_sources)
    detected = [{**item, "frequency_hz": round(item["frequency_hz"] / item["strength"], 2), "strength": round(item["strength"], 3)}
                for item in sorted(pitches.values(), key=lambda item: item["strength"], reverse=True)]
    combined_evidence = chord_evidence(chroma, start, end, ", ".join(harmonic_names), np)
    combined_evidence["detected_pitches"] = detected
    log(f"study: analyzed {start:.3f}-{end:.3f}s ({', '.join(source_paths)})")
    return {
        "chord": best["chord"], "chord_confidence": confidence,
        "pitch_confidence": pitch_confidence,
        "alternatives": [{key: item.get(key, [] if key == "reasons" else 0) for key in ("chord", "score", "raw_score", "reasons")}
                         for item in ranked[:settings["chord_alternatives"]]],
        "evidence": combined_evidence,
        "source_evidence": evidence, "bass_reference": bass_reference,
        "range": [start, end], "sources": list(source_paths), "settings": settings,
        "key_context": {"key": key, "origin": origin}, "input_fingerprints": fingerprints,
        "algorithm_version": STUDY_ALGORITHM_VERSION,
    }
