"""Isolated chord evidence for an exact interval of original song audio."""
from __future__ import annotations

import hashlib
import math
from pathlib import Path
from typing import Any

from chordpilot_audio import load_audio
from chordpilot_bass import bass_noise_floor
from chordpilot_common import normalize_analysis_options, normalize_known_key, log, PITCH_NAMES
from chordpilot_chords import (
    chroma_for_segment, chord_evidence, detected_pitch_confidence,
    estimate_key_from_chroma, rank_chord_candidates, half_diminished_hint,
    scored_pitch_class_evidence,
)
from chordpilot_analysis import estimate_bass_reference, chord_reference_for_segment, accompaniment_reference_for_evidence, fading_root_for_crop
from chordpilot_spectrum import spectrum_for_crop, spectral_power_for_crop, spectrum_from_power, reduce_sustain_tail, apply_tail_to_chroma, detected_pitches_for_crop, attenuate_detected_pitches, apply_overtone_weighting, voicing_frames_for_crop

STUDY_ALGORITHM_VERSION = "local-study-v28"
SOURCE_NAMES = {"full_mix", "bass", "other", "vocals", "drums"}




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
        "known_key", "chroma_low_hz", "chroma_high_hz", "chord_alternatives", "simplify_chords", "tail_reduction", "tail_half_life", "overtone_weighting")}
    settings["song_key"] = normalize_known_key(raw_options.get("song_key"))
    original, original_sr = load_audio(Path(audio_path))
    start, end = validate_range(start, end, len(original) / original_sr)
    crops, chromas, evidence, fingerprints = {}, {}, {}, {}
    recording_bass_floor = None
    for name, filename in source_paths.items():
        file = Path(filename)
        if not file.is_file():
            raise FileNotFoundError(f"Selected source {name} is unavailable.")
        audio, sr = (original, original_sr) if file.resolve() == Path(audio_path).resolve() else load_audio(file)
        if name == 'bass':
            recording_bass_floor = bass_noise_floor(audio, sr, np)
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
        power = spectral_power_for_crop(crop, sr, np)
        evidence[name]["spectrum"] = spectrum_from_power(power, sr, np)
        recognition_power = power
        context_crop = None
        if settings['tail_reduction'] > 0 and (name != 'bass' or len(source_paths) == 1):
            context_start = max(0., start - (end - start))
            context_crop = np.ascontiguousarray(audio[math.ceil(context_start * sr):math.floor(start * sr)], dtype=np.float32)
            previous = spectral_power_for_crop(context_crop, sr, np) if len(context_crop) >= 3 else None
            elapsed = (end - context_start) / 2
            reduced, info = reduce_sustain_tail(power, previous, elapsed, settings, np)
            recognition_power = reduced
            reduced_spectrum = spectrum_from_power(reduced, sr, np, reference_power=evidence[name]['spectrum']['reference_power'])
            if info['applied'] and info['removed_fraction'] > 1e-9:
                original_evidence = evidence[name]
                chromas[name] = apply_tail_to_chroma(chromas[name], power, reduced, sr, np, settings)
                evidence[name] = chord_evidence(chromas[name], start, end, name, np)
                evidence[name]['spectrum'] = original_evidence['spectrum']
                evidence[name]['original_detected_notes'] = original_evidence['detected_notes']
                evidence[name]['original_detected_pitches'] = original_evidence['detected_pitches']
                evidence[name]['detected_pitches'] = attenuate_detected_pitches(original_evidence['detected_pitches'], power, reduced, sr, np)
            evidence[name]['tail_reduced_spectrum'] = reduced_spectrum
            evidence[name]['tail_reduction'] = {**info, 'context_range': [context_start, start]}
        chromas[name] = apply_overtone_weighting(evidence[name], chromas[name], recognition_power, sr, np, settings)
        if name in {'other', 'full_mix'}:
            evidence[name]['voicing_frames'] = [{**frame, 'start': round(start + frame['start'], 4),
                'end': round(start + frame['end'], 4)} for frame in
                voicing_frames_for_crop(crop, sr, np, settings, power, recognition_power)]
        stat = file.stat()
        digest = hashlib.sha256(str(sr).encode("ascii") + crop.astype("<f4").tobytes()).hexdigest()
        fingerprints[name] = {"size": stat.st_size, "mtime_ns": stat.st_mtime_ns, "sample_sha256": digest}
        if name == 'bass':
            fingerprints[name]['bass_noise_floor'] = recording_bass_floor
            evidence[name]['noise_gate'] = {'threshold_rms': recording_bass_floor,
                'reference': 'recording', 'selection_rms': float(np.sqrt(np.mean(crop ** 2)))}
        if context_crop is not None:
            fingerprints[name]['tail_context_sha256'] = hashlib.sha256(str(sr).encode('ascii') + context_crop.astype('<f4').tobytes()).hexdigest()
    harmonic_names = [name for name in source_paths if name != "bass"] or ["bass"]
    bass_usable = True
    if 'bass' in crops:
        bass_crop, bass_sr = crops['bass']
        bass_level = float(np.sqrt(np.mean(bass_crop ** 2))) if len(bass_crop) else 0.
        reference_level = max((float(np.sqrt(np.mean(crop ** 2))) if len(crop) else 0.
            for name, (crop, _) in crops.items() if name != 'bass'), default=0.)
        bass_usable = bass_level >= max(1e-5, reference_level * .03)
        evidence['bass']['used_for_notes'] = bass_usable
        if harmonic_names == ['bass'] and not bass_usable:
            chromas['bass'] = np.zeros(12)
    active = [chromas[name] for name in harmonic_names if float(chromas[name].sum()) > 0]
    chroma = np.mean(active, axis=0) if active else np.zeros(12)
    bass_reference = None
    anchor_name = next((name for name in ('other', 'full_mix') if name in crops), None)
    if anchor_name:
        anchor_crop, anchor_sr = crops[anchor_name]
        bass_crop, bass_sr = crops.get('bass', (None, None))
        if not bass_usable:
            bass_crop, bass_sr = None, None
        bass_reference = chord_reference_for_segment(anchor_crop, anchor_sr, 0, len(anchor_crop) / anchor_sr, np, bass_crop, bass_sr,
            bass_noise_floor=recording_bass_floor)
        if bass_reference and bass_reference.get('origin') == 'accompaniment':
            bass_reference = accompaniment_reference_for_evidence(
                evidence[anchor_name]['detected_pitches'], evidence[anchor_name]['detected_notes'])
        elif bass_reference:
            source_name = anchor_name if bass_reference.get('origin') == 'accompaniment' else 'bass'
            bass_reference['raw_detected_pitches'] = evidence[source_name]['detected_pitches']
    elif "bass" in crops and bass_usable:
        crop, sr = crops["bass"]
        bass_reference = estimate_bass_reference(crop, sr, 0, len(crop) / sr, np, recording_bass_floor)
        if bass_reference:
            bass_reference["source"] = "bass"
            bass_reference['origin'] = 'bass'
            bass_reference['raw_detected_pitches'] = evidence['bass'].get('original_detected_pitches', evidence['bass']['detected_pitches'])
    if harmonic_names == ['bass'] and bass_reference is None:
        # Spectral noise alone must not become a bass-only chord suggestion.
        chroma, active = np.zeros(12), []
    key = settings["known_key"] or settings["song_key"] or estimate_key_from_chroma(chroma, np)
    origin = "override" if settings["known_key"] else "song" if settings["song_key"] else "selection"
    registered = half_diminished_hint(chroma, evidence[anchor_name], bass_reference, np, settings) if anchor_name and len(harmonic_names) == 1 else None
    if registered:
        evidence[anchor_name]['registered_chord'] = registered
    ranked, _libraries = rank_chord_candidates(chroma, key, None, None, bass_reference, np, settings, registered_hint=registered)
    if anchor_name and len(harmonic_names) == 1:
        crop, sr = crops[anchor_name]
        hint = fading_root_for_crop(crop, sr, start, chroma, evidence[anchor_name], bass_reference, ranked, key, np, settings)
        if hint:
            evidence[anchor_name]['fading_root'] = hint
            ranked, _libraries = rank_chord_candidates(chroma, key, None, None, bass_reference, np, settings,
                fading_hint=hint, registered_hint=registered)
    best = ranked[0]
    pitch_confidence = detected_pitch_confidence(chroma, np)
    confidence = round(max(0, min(.98, best["score"] * .72 + pitch_confidence * .28)), 3) if active else 0
    pitched_sources = []
    for name, item in evidence.items():
        if name == 'bass':
            verified = bass_reference and bass_reference.get('origin') == 'bass' and bass_reference.get('method') == 'periodicity'
            source_pitches = bass_reference['detected_pitches'] if verified else []
            item['used_for_notes'] = bool(source_pitches)
        else:
            source_pitches = item['detected_pitches']
        if source_pitches and item.get('used_for_notes', True):
            pitched_sources.append(source_pitches)
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
    combined_evidence.update(scored_pitch_class_evidence(chroma, bass_reference, np))
    combined_evidence['scoring_source'] = ', '.join(harmonic_names)
    combined_evidence["detected_pitches"] = detected
    if anchor_name:
        combined_evidence['voicing_frames'] = evidence[anchor_name].get('voicing_frames', [])
        if evidence[anchor_name].get('fading_root'):
            combined_evidence['fading_root'] = evidence[anchor_name]['fading_root']
        if registered:
            combined_evidence['registered_chord'] = registered
    combined_evidence['overtone_weighted'] = any(item.get('overtone_weighting', {}).get('applied') for item in evidence.values())
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
