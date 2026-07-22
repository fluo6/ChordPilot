from chordpilot_common import *
from chordpilot_audio import audio_duration, load_audio, waveform_peaks
from chordpilot_cache import read_analysis_cache, write_analysis_cache, append_history
from chordpilot_chords import *
from chordpilot_lyrics import generate_lyrics_reference, apply_lyrics_to_bars
from chordpilot_stems import run_demucs

def estimate_with_librosa(path: Path) -> dict[str, Any]:
    result: dict[str, Any] = {}
    librosa = try_import("librosa")
    if not librosa:
        return result

    try:
        y, sr = librosa.load(str(path), mono=True, duration=240)
        tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
        tempo_value = float(tempo[0] if hasattr(tempo, "__len__") else tempo)
        beat_times = librosa.frames_to_time(beat_frames, sr=sr).tolist()
        result["tempo"] = round(tempo_value)
        result["beat_times"] = [round(float(value), 3) for value in beat_times]
    except Exception:
        return {}

    return result

def estimate_builtin(path: Path, options: dict[str, Any] | None = None) -> dict[str, Any]:
    options = options or dict(DEFAULT_ANALYSIS_OPTIONS)
    np = __import__("numpy")
    signal = __import__("scipy.signal", fromlist=["find_peaks"])

    log("analysis: decoding/loading audio")
    audio, sr = load_audio(path)
    if not len(audio):
        return {}

    log(f"analysis: {round(len(audio) / float(sr), 2)}s at {sr} Hz")
    hop = int(options.get("onset_hop", 512))
    frame = int(options.get("onset_frame", 2048))
    log("analysis: computing onset envelope")
    envelope = onset_envelope(audio, sr, frame, hop, np)
    log("analysis: estimating tempo")
    tempo = estimate_tempo_from_envelope(envelope, sr, hop, np, int(options.get("min_bpm", 60)), int(options.get("max_bpm", 190)))
    log(f"analysis: tempo estimate {tempo} BPM")
    beat_times = estimate_beat_times(envelope, tempo, sr, hop, np, float(options.get("beat_offset", 0.0)))
    log(f"analysis: beat grid {len(beat_times)} beats")
    log("analysis: estimating bar chords from chroma")
    bars = estimate_bars_from_audio(audio, sr, tempo, "4/4", beat_times, np, "full mix", options)
    estimated_key = estimate_key_from_chroma(sum((bar["_chroma"] for bar in bars), np.zeros(12)), np) if bars else "C"
    key = str(options.get("known_key") or estimated_key or "C")
    normalize_bars_chords(bars, key, np, options, "full mix", None)
    if options.get("known_key"):
        log(f"analysis: using known key {key}; estimate was {estimated_key}; bars {len(bars)}")
    else:
        log(f"analysis: key estimate {key}; bars {len(bars)}")

    clean_bars = []
    for bar in bars:
        clean_bars.append({key_name: value for key_name, value in bar.items() if key_name != "_chroma"})

    return {
        "duration": len(audio) / float(sr),
        "tempo": tempo,
        "beat_times": beat_times,
        "bars": clean_bars,
        "key": key,
        "engine": "builtin scipy chroma/onset",
    }

def onset_envelope(audio: Any, sr: int, frame: int, hop: int, np: Any) -> Any:
    if len(audio) < frame:
        return np.zeros(1)

    window = np.hanning(frame)
    previous = None
    values = []
    for start in range(0, len(audio) - frame, hop):
        spectrum = np.abs(np.fft.rfft(audio[start:start + frame] * window))
        if previous is None:
            values.append(0.0)
        else:
            values.append(float(np.maximum(spectrum - previous, 0).sum()))
        previous = spectrum

    envelope = np.asarray(values, dtype=np.float32)
    if envelope.size:
        envelope = envelope - envelope.min()
        high = float(np.percentile(envelope, 95)) or float(envelope.max()) or 1.0
        envelope = np.clip(envelope / high, 0, 1)
    return envelope

def estimate_tempo_from_envelope(envelope: Any, sr: int, hop: int, np: Any, min_bpm: int = 70, max_bpm: int = 190) -> int:
    if len(envelope) < 8:
        return 120

    env = envelope - envelope.mean()
    corr = np.correlate(env, env, mode="full")[len(env) - 1:]
    min_lag = max(1, int((60.0 / max_bpm) * sr / hop))
    max_lag = min(len(corr) - 1, int((60.0 / min_bpm) * sr / hop))
    if max_lag <= min_lag:
        return 120

    lag = int(np.argmax(corr[min_lag:max_lag]) + min_lag)
    bpm = 60.0 * sr / (hop * lag)
    while bpm < 80:
        bpm *= 2
    while bpm > 180:
        bpm /= 2
    return int(round(bpm))

def estimate_beat_times(envelope: Any, tempo: int, sr: int, hop: int, np: Any, offset: float = 0.0) -> list[float]:
    beat_period = 60.0 / max(tempo, 1)
    duration = len(envelope) * hop / float(sr)
    if duration <= 0:
        return []

    search_seconds = min(duration, beat_period * 4)
    search_frames = max(1, int(search_seconds * sr / hop))
    first_frame = int(np.argmax(envelope[:search_frames])) if len(envelope) else 0
    first_time = max(0.0, first_frame * hop / float(sr) + offset)
    if first_time > beat_period:
        first_time = first_time % beat_period

    times = []
    value = first_time
    while value < duration:
        times.append(round(value, 3))
        value += beat_period
    return times

def estimate_bars_from_audio(audio: Any, sr: int, tempo: int, time_signature: str, beat_times: list[float], np: Any, evidence_source: str = "full mix", options: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    options = options or dict(DEFAULT_ANALYSIS_OPTIONS)
    beats_per_bar = parse_beats_per_bar(time_signature)
    seconds_per_bar = (60.0 / max(tempo, 1)) * beats_per_bar
    duration = len(audio) / float(sr)
    starts = [beat_times[index] for index in range(0, len(beat_times), beats_per_bar)] if beat_times else []
    if not starts:
        starts = [index * seconds_per_bar for index in range(max(8, int(math.ceil(duration / seconds_per_bar))))]

    starts = [start for start in starts if start < duration]
    sections = expand_sections(len(starts))
    bars = []
    for index, start in enumerate(starts):
        end = starts[index + 1] if index + 1 < len(starts) else min(duration, start + seconds_per_bar)
        chroma = chroma_for_segment(audio, sr, start, end, np, options)
        chord, confidence = estimate_chord(chroma, np)
        alternatives = chord_alternatives(chroma, np, int(options.get("chord_alternatives", 6)))
        evidence = chord_evidence(chroma, start, end, evidence_source, np)
        pitch_confidence = detected_pitch_confidence(chroma, np)
        evidence["pitch_confidence"] = pitch_confidence
        bars.append(
            {
                "number": index + 1,
                "section": sections[index],
                "chord": chord,
                "start": round(float(start), 3),
                "repeat_start": False,
                "repeat_end": 0,
                "notes": "",
                "lyrics": "",
                "confidence": round(float(confidence), 3),
                "chord_confidence": round(float(confidence), 3),
                "pitch_confidence": pitch_confidence,
                "alternatives": alternatives,
                "evidence": evidence,
                "_chroma": chroma,
            }
        )
    return bars

def select_high_quality_chord_source(source_path: Path, stem_paths: dict[str, Path], options: dict[str, Any]) -> tuple[Path, str]:
    requested = str(options.get("chord_source", "auto")).replace("-", "_")
    if requested in {"auto", "other", "accompaniment"}:
        if stem_paths.get("other"):
            return stem_paths["other"], "other/accompaniment stem"
        if requested == "auto":
            log("hq: accompaniment stem missing; falling back to full mix for chord tones")
            return source_path, "full mix fallback"
    if requested in {"vocals", "bass", "drums"} and stem_paths.get(requested):
        return stem_paths[requested], f"{requested} stem (explicit)"
    if requested == "full_mix":
        return source_path, "full mix (explicit)"
    return source_path, "full mix fallback"

def estimate_high_quality_from_stems(source_path: Path, stems_result: dict[str, Any], options: dict[str, Any] | None = None) -> dict[str, Any]:
    options = options or dict(DEFAULT_ANALYSIS_OPTIONS)
    np = __import__("numpy")
    stem_paths = {stem["name"]: Path(stem["path"]) for stem in stems_result.get("stems", []) if stem.get("path")}
    rhythm_path = stem_paths.get("drums") or source_path
    chord_path, chord_source = select_high_quality_chord_source(source_path, stem_paths, options)
    bass_path = stem_paths.get("bass")

    log("hq: estimating beat grid from drums/full mix")
    rhythm_result = estimate_builtin(rhythm_path, options)
    tempo = int(rhythm_result.get("tempo") or 120)
    beat_times = rhythm_result.get("beat_times") or []

    log(f"hq: estimating chord tones from {chord_source}")
    chord_audio, chord_sr = load_audio(chord_path)
    bars = estimate_bars_from_audio(chord_audio, chord_sr, tempo, "4/4", beat_times, np, chord_source, options)
    duration = len(chord_audio) / float(chord_sr)

    if bass_path:
        log("hq: reading bass stem as bass/root evidence")
        bass_audio, bass_sr = load_audio(bass_path)
        add_bass_reference_to_bars(bars, bass_audio, bass_sr, np, "bass stem")

    estimated_key = estimate_key_from_chroma(sum((bar["_chroma"] for bar in bars), np.zeros(12)), np) if bars else "C"
    key = str(options.get("known_key") or estimated_key or "C")
    normalize_bars_chords(bars, key, np, options, chord_source, "bass stem" if bass_path else None)
    clean_bars = []
    for bar in bars:
        clean_bar = {key_name: value for key_name, value in bar.items() if key_name != "_chroma"}
        clean_bars.append(clean_bar)

    return {
        "duration": duration,
        "tempo": tempo,
        "beat_times": beat_times,
        "bars": clean_bars,
        "key": key,
        "engine": "demucs stems: other chords, bass roots, drums rhythm",
    }

def add_bass_reference_to_bars(bars: list[dict[str, Any]], bass_audio: Any, bass_sr: int, np: Any, source: str = "bass stem") -> None:
    for index, bar in enumerate(bars):
        start = float(bar.get("start", 0.0))
        end = float(bars[index + 1].get("start", start + 2.0)) if index + 1 < len(bars) else start + 2.0
        bass_reference = estimate_bass_reference(bass_audio, bass_sr, start, end, np)
        if bass_reference is None:
            continue
        bass_reference["source"] = source
        bar["bass_root"] = bass_reference["note"]
        bar["bass_reference"] = bass_reference

def estimate_bass_root(audio: Any, sr: int, start: float, end: float, np: Any) -> int | None:
    reference = estimate_bass_reference(audio, sr, start, end, np)
    return None if reference is None else int(reference["pitch_class"])

def estimate_bass_reference(audio: Any, sr: int, start: float, end: float, np: Any) -> dict[str, Any] | None:
    start_sample = max(0, int(start * sr))
    end_sample = min(len(audio), max(start_sample + 2048, int(end * sr)))
    segment = audio[start_sample:end_sample]
    if len(segment) < 1024:
        return None

    frame = 4096
    window = np.hanning(min(frame, len(segment)))
    chunk = segment[:len(window)] * window
    spectrum = np.abs(np.fft.rfft(chunk, n=frame))
    freqs = np.fft.rfftfreq(frame, 1.0 / sr)
    valid = (freqs >= 38.0) & (freqs <= 260.0)
    if not valid.any():
        return None
    spectrum = spectrum[valid]
    freqs = freqs[valid]
    if float(spectrum.max()) <= 0:
        return None
    pitch_classes = np.round(12 * np.log2(freqs / 440.0) + 69).astype(int) % 12
    chroma = np.zeros(12, dtype=np.float64)
    for pc in range(12):
        chroma[pc] = float(spectrum[pitch_classes == pc].sum())
    if chroma.max() <= 0:
        return None
    total = float(chroma.sum()) or 1.0
    normalized = chroma / total
    order = np.argsort(normalized)[::-1]
    root = int(order[0])
    top = float(normalized[root])
    second = float(normalized[int(order[1])]) if len(order) > 1 else 0.0
    confidence = round(max(0.0, min(0.98, (top * 1.2) + ((top - second) * 1.7))), 3)
    return {
        "pitch_class": root,
        "note": PITCH_NAMES[root],
        "confidence": confidence,
        "detected_notes": [
            {"note": PITCH_NAMES[int(index)], "strength": round(float(normalized[int(index)]), 3)}
            for index in order[:4]
            if float(normalized[int(index)]) > 0.03
        ],
    }

def build_bars(duration: float, tempo: int, time_signature: str, beat_times: list[float] | None) -> list[Bar]:
    beats_per_bar = parse_beats_per_bar(time_signature)
    seconds_per_bar = (60.0 / max(tempo, 1)) * beats_per_bar
    estimated_count = max(8, min(160, int(math.ceil(duration / seconds_per_bar))))

    starts: list[float] = []
    if beat_times and len(beat_times) >= beats_per_bar * 2:
        for index in range(0, len(beat_times), beats_per_bar):
            starts.append(float(beat_times[index]))
        starts = starts[:estimated_count]

    if not starts:
        starts = [round(index * seconds_per_bar, 3) for index in range(estimated_count)]

    bars: list[Bar] = []
    section_names = expand_sections(len(starts))

    for index, start in enumerate(starts):
        bars.append(
            Bar(
                number=index + 1,
                section=section_names[index],
                chord=CHORD_CYCLE[index % len(CHORD_CYCLE)],
                start=round(float(start), 3),
                repeat_start=index in {4, 20},
                repeat_end=2 if index in {11, 27} else 0,
                confidence=0.45,
            )
        )

    return bars

def parse_beats_per_bar(time_signature: str) -> int:
    try:
        return max(1, int(str(time_signature).split("/")[0]))
    except Exception:
        return 4

def expand_sections(count: int) -> list[str]:
    names: list[str] = []
    while len(names) < count:
        for section, length in SECTION_PLAN:
            names.extend([section] * length)
            if len(names) >= count:
                break
    return names[:count]

def has_complete_stems(payload: dict[str, Any]) -> bool:
    stems_result = payload.get("stems")
    if not isinstance(stems_result, dict) or not stems_result.get("ok"):
        return False
    stems = stems_result.get("stems")
    if not isinstance(stems, list):
        return False
    paths = {
        str(stem.get("name")): Path(str(stem.get("path")))
        for stem in stems
        if isinstance(stem, dict) and stem.get("name") and stem.get("path")
    }
    return all(name in paths and paths[name].exists() for name in STEM_NAMES)

def analyze(path_text: str, mode: str = "fast", raw_options: dict[str, Any] | None = None) -> dict[str, Any]:
    path = Path(path_text)
    options = normalize_analysis_options(raw_options)
    known_key = str(options.get("known_key") or "").strip()
    normalized_mode = "high-quality" if mode in {"high-quality", "hq", "stems"} else "fast"
    cache_mode = f"{normalized_mode}-{options_cache_suffix(options)}"
    log(f"analyze: {path}")
    log(f"mode: {normalized_mode}")
    log(f"options: {json.dumps(options, sort_keys=True)}")
    if path.exists() and options.get("use_cache", True):
        cached = read_analysis_cache(path, cache_mode)
        if cached:
            cached_lyrics = cached.get("lyrics") if isinstance(cached.get("lyrics"), dict) else None
            if options.get("require_stems") and not has_complete_stems(cached):
                log("cache: required stem files missing; recomputing analysis")
            elif options.get("lyrics_enabled") and not (cached_lyrics and cached_lyrics.get("ok")):
                log("cache: cached lyrics missing or failed; recomputing analysis")
            else:
                append_history(cached)
                return cached
    else:
        log("analyze: source file not found; using fallback draft")

    librosa_result = estimate_with_librosa(path)
    time_signature = "4/4"

    builtin_result: dict[str, Any] = {}
    stems_result: dict[str, Any] | None = None
    try:
        if normalized_mode == "high-quality":
            try:
                log("hq: preparing source separation")
                stems_result = run_demucs(path, options)
                builtin_result = estimate_high_quality_from_stems(path, stems_result, options)
            except Exception as exc:
                log(f"hq: unavailable - {exc}")
                if options.get("require_stems"):
                    raise RuntimeError(f"Stem separation failed: {exc}") from exc
                stems_result = {
                    "ok": False,
                    "engine": "demucs unavailable",
                    "error": str(exc),
                    "stems": [],
                }
                log("hq: falling back to fast full-mix analysis")
                builtin_result = estimate_builtin(path, options)
        else:
            builtin_result = estimate_builtin(path, options)
    except Exception as exc:
        log(f"analysis: failed - {exc}")
        if options.get("require_stems"):
            raise
        builtin_result = {"error": str(exc)}

    duration = float(builtin_result.get("duration") or audio_duration(path))
    tempo = int(builtin_result.get("tempo") or librosa_result.get("tempo") or 120)
    essentia_key = estimate_key_with_essentia(path) if not known_key else None
    builtin_key = str(builtin_result.get("key") or "").strip()
    key = known_key or essentia_key or builtin_key or "C"
    key_source = "known preset" if known_key else "essentia" if essentia_key else "estimated" if builtin_key else "fallback"

    if builtin_result.get("bars"):
        bars_payload = builtin_result["bars"]
        chord_engine = builtin_result.get("engine", "builtin")
        confidence_note = "real estimated chords; still rough"
    else:
        failure = str(builtin_result.get("error", "missing analyzer"))
        log("analysis: creating no-chord fallback chart")
        bars = build_bars(duration, tempo, time_signature, librosa_result.get("beat_times"))
        for index, bar in enumerate(bars):
            bar.chord = "N.C."
            bar.confidence = 0.0
            bar.notes = f"Analysis failed: {failure}" if index == 0 else "No chord estimate; enter manually."
        bars_payload = [asdict(bar) for bar in bars]
        chord_engine = f"unavailable: {builtin_result.get('error', 'missing analyzer')}"
        confidence_note = "no chord estimate"

    payload = {
        "title": path.stem or "Untitled",
        "source_path": str(path),
        "duration": round(duration, 3),
        "waveform": waveform_peaks(path),
        "key": key,
        "tempo": tempo,
        "time_signature": time_signature,
        "beat_times": builtin_result.get("beat_times") or librosa_result.get("beat_times") or [],
        "analysis_engine": {
            "mode": normalized_mode,
            "options": options,
            "duration": "decoded audio" if builtin_result.get("duration") else "fallback",
            "tempo_beats": "librosa" if librosa_result else "fallback",
            "key": key_source,
            "chords": chord_engine,
            "confidence": confidence_note,
        },
        "bars": bars_payload,
    }

    if stems_result is not None:
        payload["stems"] = stems_result

    if options.get("lyrics_enabled"):
        lyrics_result = generate_lyrics_reference(path, stems_result, options, duration)
        payload["lyrics"] = lyrics_result
        payload["analysis_engine"]["lyrics"] = lyrics_result.get("engine", "lyrics unavailable")
        if lyrics_result.get("ok"):
            apply_lyrics_to_bars(payload.get("bars", []), lyrics_result.get("lines", []), duration)
    else:
        payload["analysis_engine"]["lyrics"] = "disabled"

    should_cache = normalized_mode == "fast" or stems_result is None or bool(stems_result.get("ok"))
    if path.exists() and should_cache and options.get("use_cache", True):
        write_analysis_cache(path, payload, cache_mode)
    append_history(payload)
    return payload
