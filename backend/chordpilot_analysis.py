from __future__ import annotations

from chordpilot_common import *
from chordpilot_audio import audio_duration, load_audio, waveform_peaks
from chordpilot_cache import read_analysis_cache, write_analysis_cache, append_history
from chordpilot_chords import *
from chordpilot_lyrics import generate_lyrics_reference, apply_lyrics_to_bars
from chordpilot_stems import run_demucs
from chordpilot_bass import bass_note_events, bass_reference_from_events
from chordpilot_timing import analysis_cell_bounds, group_chord_cells, stabilize_chord_cells
from chordpilot_spectrum import spectral_power_for_crop, spectrum_from_power, reduce_sustain_tail, apply_tail_to_chroma, detected_pitches_for_crop, attenuate_detected_pitches, reduce_overtones, apply_overtone_weighting, voicing_frames_for_crop

def estimate_with_librosa(path: Path) -> dict[str, Any]:
    result: dict[str, Any] = {}
    librosa = try_import("librosa")
    if not librosa:
        return result

    try:
        y, sr = librosa.load(str(path), mono=True)
        tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
        tempo_value = float(tempo[0] if hasattr(tempo, "__len__") else tempo)
        beat_times = librosa.frames_to_time(beat_frames, sr=sr).tolist()
        result["tempo"] = round(tempo_value)
        result["beat_times"] = [round(float(value), 3) for value in beat_times]
    except Exception:
        return {}

    return result

def estimate_rhythm(audio: Any, sr: int, np: Any, options: dict[str, Any] | None = None) -> dict[str, Any]:
    options = options or dict(DEFAULT_ANALYSIS_OPTIONS)
    if options.get('rhythm_engine') in {'beat_this', 'beat_this_steady'}:
        from chordpilot_beats import estimate_model_rhythm
        return estimate_model_rhythm(audio, sr, np, options)
    hop, frame = int(options.get('onset_hop', 512)), int(options.get('onset_frame', 2048))
    envelope = onset_envelope(audio, sr, frame, hop, np)
    minimum, maximum = int(options.get('min_bpm', 60)), int(options.get('max_bpm', 190))
    tempo = estimate_tempo_from_envelope(envelope, sr, hop, np, minimum, maximum)
    beats = []
    engine = 'no rhythmic evidence; tempo fallback'
    if len(envelope) and float(envelope.std()) > 1e-8:
        librosa = try_import('librosa')
        if librosa:
            try:
                _, frames = librosa.beat.beat_track(onset_envelope=envelope, sr=sr,
                                                   hop_length=hop, bpm=float(tempo), trim=False)
                # Librosa's default trim can remove a real attack at t=0.
                # Trim only unsupported endpoints, retaining interior gaps.
                frames = np.asarray(frames, dtype=int)
                supported = np.flatnonzero(envelope[frames] >= .1 * envelope.max())
                frames = frames[supported[0]:supported[-1] + 1] if len(supported) else []
                beats = [float(index) * hop / sr for index in frames]
                engine = 'librosa onset beat tracking'
            except Exception as exc:
                log(f'rhythm: librosa unavailable ({exc}); using onset dynamic programming')
        if not beats:
            beats = estimate_beat_times(envelope, tempo, sr, hop, np)
            engine = 'onset dynamic programming' if beats else engine
    # Report a tempo derived from several measured intervals without using its
    # rounded display value to reconstruct timing.
    exact = float(tempo)
    if len(beats) > 1:
        span = min(8, len(beats) - 1)
        intervals = np.asarray(beats[span:]) - np.asarray(beats[:-span])
        exact = float(np.clip(np.median(60 * span / intervals[intervals > 0]), minimum, maximum))
    offset = float(options.get('beat_offset', 0))
    duration = len(audio) / float(sr)
    beats = sorted({round(value + offset, 3) for value in beats if 0 <= value + offset < duration})
    log(f'rhythm: {engine}; {exact:.3f} BPM; {len(beats)} beats')
    return {'tempo': round(exact), 'tempo_exact': round(exact, 4), 'beat_times': beats,
            'tempo_beats': engine, 'bar_alignment': 'manual beat phase' if options.get('bar_phase') else 'first tracked beat; unverified downbeat'}

def estimate_builtin(path: Path, options: dict[str, Any] | None = None) -> dict[str, Any]:
    options = options or dict(DEFAULT_ANALYSIS_OPTIONS)
    np = __import__("numpy")

    log("analysis: decoding/loading audio")
    audio, sr = load_audio(path)
    if not len(audio):
        return {}

    log(f"analysis: {round(len(audio) / float(sr), 2)}s at {sr} Hz")
    rhythm = estimate_rhythm(audio, sr, np, options)
    tempo, beat_times = rhythm['tempo'], rhythm['beat_times']
    log("analysis: estimating bar chords from chroma")
    bars = estimate_bars_from_audio(audio, sr, tempo, "4/4", beat_times, np, "full mix", options, rhythm.get('downbeat_times'), rhythm.get('measure_grid'))
    estimated_key = estimate_key_from_chroma(duration_weighted_cell_chroma(audio, sr, bars, tempo, "4/4", beat_times, np, options), np) if bars else "C"
    key = str(options.get("known_key") or estimated_key or "C")
    normalize_bars_chords(bars, key, np, options, "full mix", None)
    attach_timed_chord_events(bars, audio, sr, tempo, "4/4", beat_times, np, options, "full mix", key=key)
    if options.get("known_key"):
        log(f"analysis: using known key {key}; estimate was {estimated_key}; bars {len(bars)}")
    else:
        log(f"analysis: key estimate {key}; bars {len(bars)}")

    clean_bars = []
    for bar in bars:
        clean_bars.append({key_name: value for key_name, value in bar.items() if key_name != "_chroma"})

    return {
        **rhythm,
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
    # Frame indices represent original-audio time, including at the file edges.
    audio = np.pad(audio, (frame // 2, frame // 2))
    previous = 0.
    values = []
    for start in range(0, len(audio) - frame, hop):
        spectrum = np.abs(np.fft.rfft(audio[start:start + frame] * window))
        values.append(float(np.maximum(spectrum - previous, 0).sum()))
        previous = spectrum

    envelope = np.asarray(values, dtype=np.float32)
    if envelope.size:
        envelope = envelope - envelope.min()
        high = float(np.percentile(envelope, 95)) or float(envelope.max()) or 1.0
        envelope = np.clip(envelope / high, 0, 1)
    return envelope

def estimate_tempo_from_envelope(envelope: Any, sr: int, hop: int, np: Any, min_bpm: int = 70, max_bpm: int = 190, prefer_fast: bool = True) -> int:
    fallback = max(min_bpm, min(max_bpm, 120))
    if len(envelope) < 8:
        return fallback

    env = envelope - envelope.mean()
    size = 1 << (2 * len(env) - 1).bit_length()
    spectrum = np.fft.rfft(env, size)
    corr = np.fft.irfft(spectrum * spectrum.conj(), size)[:len(env)]
    min_lag = max(1, int((60.0 / max_bpm) * sr / hop))
    max_lag = min(len(corr) - 1, int((60.0 / min_bpm) * sr / hop))
    if max_lag <= min_lag:
        return fallback

    lag = int(np.argmax(corr[min_lag:max_lag]) + min_lag)
    bpm = 60.0 * sr / (hop * lag)
    # The octave preference must stay inside the user's requested search range.
    while prefer_fast and bpm < 80 and bpm * 2 <= max_bpm:
        bpm *= 2
    while prefer_fast and bpm > 180 and bpm / 2 >= min_bpm:
        bpm /= 2
    return max(min_bpm, min(max_bpm, int(round(bpm))))

def estimate_beat_times(envelope: Any, tempo: int, sr: int, hop: int, np: Any, offset: float = 0.0) -> list[float]:
    """Track an onset-supported beat path; the tempo is a prior, not a clock."""
    envelope = np.maximum(0., np.nan_to_num(np.asarray(envelope, dtype=float)))
    if not len(envelope) or float(envelope.max()) <= 1e-8 or float(envelope.std()) <= 1e-8:
        return []
    period = 60.0 * sr / (max(float(tempo), 1.) * hop)
    steps = np.arange(max(1, int(period * .5)), max(2, int(period * 2) + 1))
    penalty = -30 * np.log(steps / period) ** 2
    strength = envelope / envelope.std()
    scores = np.zeros(len(envelope))
    previous = np.full(len(envelope), -1, dtype=int)
    for index, value in enumerate(strength):
        count = int(np.searchsorted(steps, index, side='right'))
        if count:
            candidates = scores[index - steps[:count]] + penalty[:count]
            best = int(np.argmax(candidates))
            if candidates[best] > 0:
                previous[index] = index - steps[best]
                scores[index] = candidates[best]
        scores[index] += value
    index = int(np.argmax(scores))
    frames = []
    while index >= 0:
        frames.append(index)
        index = int(previous[index])
    frames.reverse()
    # Do not extrapolate beats into silence at either end. Interior missing
    # attacks retain their position in the beat sequence.
    supported = [i for i, frame_index in enumerate(frames) if envelope[frame_index] >= .1 * envelope.max()]
    if not supported:
        return []
    times = []
    for frame_index in frames[supported[0]:supported[-1] + 1]:
        fraction = 0.
        if 0 < frame_index < len(envelope) - 1:
            left, middle, right = envelope[frame_index - 1:frame_index + 2]
            curvature = left - 2 * middle + right
            if curvature < 0 and middle >= max(left, right):
                fraction = float(np.clip(.5 * (left - right) / curvature, -.5, .5))
        time = (frame_index + fraction) * hop / float(sr) + offset
        if time >= 0:
            times.append(round(time, 3))
    return sorted(set(times))

def measured_bar_starts(beat_times: list[float], beats_per_bar: int, phase: int = 0) -> list[float]:
    beats = sorted({float(value) for value in beat_times if math.isfinite(float(value)) and float(value) >= 0})
    phase %= beats_per_bar
    # Keep a short pickup measure before the selected first full downbeat.
    return ([beats[0]] if phase and beats else []) + beats[phase::beats_per_bar]


def estimate_bars_from_audio(audio: Any, sr: int, tempo: int, time_signature: str, beat_times: list[float], np: Any, evidence_source: str = "full mix", options: dict[str, Any] | None = None, downbeat_times: list[float] | None = None, measure_grid: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    options = options or dict(DEFAULT_ANALYSIS_OPTIONS)
    beats_per_bar = parse_beats_per_bar(time_signature)
    seconds_per_bar = (60.0 / max(tempo, 1)) * beats_per_bar
    duration = len(audio) / float(sr)
    phase = int(options.get('bar_phase', 0)) % beats_per_bar
    starts = measured_bar_starts(beat_times, beats_per_bar, phase)
    if downbeat_times:
        starts = sorted({float(t) for t in downbeat_times if 0 <= float(t) < duration})
        pickup = [t for t in beat_times if t < starts[0]] if starts else []
        phase = len(pickup)
        if pickup:
            starts.insert(0, pickup[0])
    if not starts:
        starts = [index * seconds_per_bar for index in range(max(8, int(math.ceil(duration / seconds_per_bar))))]

    starts = [start for start in starts if start < duration]
    sections = expand_sections(len(starts))
    bars = []
    for index, start in enumerate(starts):
        end = min(duration, starts[index + 1] if index + 1 < len(starts) else duration)
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
    if measure_grid:
        grid = {round(item['start'], 3): item for item in measure_grid}
        for bar in bars:
            item = grid.get(bar['start'])
            if item:
                bar['time_signature'] = '4/4' if item.get('pickup_beats') else f"{item['beats']}/4"
                if item.get('pickup_beats'):
                    bar['pickup_beats'] = item['pickup_beats']
                bar['timing_evidence'] = item
        phase = 0
    if bars and phase and beat_times:
        bars[0]['pickup_beats'] = min(phase, len(beat_times))
        bars[0]['section'] = 'Pickup'
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
    rhythm_name = 'drums' if 'drums' in stem_paths else 'full mix'
    rhythm_path = stem_paths.get("drums") or source_path
    model_rhythm = options.get('rhythm_engine') in {'beat_this', 'beat_this_steady'}
    if model_rhythm:
        rhythm_name, rhythm_path = 'full mix', source_path
    chord_path, chord_source = select_high_quality_chord_source(source_path, stem_paths, options)
    bass_path = stem_paths.get("bass")
    bass_audio = None
    bass_sr = None

    log("hq: checking rhythm source")
    rhythm_audio, rhythm_sr = load_audio(rhythm_path)
    rhythm_selection = 'drum stem available' if rhythm_name == 'drums' else 'no drum stem; full mix fallback'
    if model_rhythm:
        rhythm_selection = 'joint beat/downbeat model uses full mix'
    log(f'hq: estimating beat grid from {rhythm_name} ({rhythm_selection})')
    rhythm_result = estimate_rhythm(rhythm_audio, rhythm_sr, np, options)
    rhythm_result.update({'rhythm_source': rhythm_name, 'rhythm_selection': rhythm_selection})
    tempo = int(rhythm_result.get("tempo") or 120)
    beat_times = rhythm_result.get("beat_times") or []

    log(f"hq: estimating chord tones from {chord_source}")
    chord_audio, chord_sr = (rhythm_audio, rhythm_sr) if chord_path == rhythm_path else load_audio(chord_path)
    bars = estimate_bars_from_audio(chord_audio, chord_sr, tempo, "4/4", beat_times, np, chord_source, options, rhythm_result.get('downbeat_times'), rhythm_result.get('measure_grid'))
    duration = len(chord_audio) / float(chord_sr)

    if bass_path:
        log("hq: reading bass stem as bass/root evidence")
        bass_audio, bass_sr = load_audio(bass_path)
        add_bass_reference_to_bars(bars, bass_audio, bass_sr, np, "bass stem")

    estimated_key = estimate_key_from_chroma(duration_weighted_cell_chroma(chord_audio, chord_sr, bars, tempo, "4/4", beat_times, np, options), np) if bars else "C"
    key = str(options.get("known_key") or estimated_key or "C")
    normalize_bars_chords(bars, key, np, options, chord_source, "bass stem" if bass_path else None)
    attach_timed_chord_events(bars, chord_audio, chord_sr, tempo, "4/4", beat_times, np, options, chord_source, bass_audio, bass_sr, key)
    clean_bars = []
    for bar in bars:
        clean_bar = {key_name: value for key_name, value in bar.items() if key_name != "_chroma"}
        clean_bars.append(clean_bar)

    return {
        **rhythm_result,
        "duration": duration,
        "tempo": tempo,
        "beat_times": beat_times,
        "bars": clean_bars,
        "key": key,
        "engine": f"demucs stems: {chord_source} chords, bass roots, {rhythm_name} rhythm",
    }

def add_bass_reference_to_bars(bars: list[dict[str, Any]], bass_audio: Any, bass_sr: int, np: Any, source: str = "bass stem") -> None:
    notes = bass_note_events(bass_audio, bass_sr, np)
    for index, bar in enumerate(bars):
        start = float(bar.get("start", 0.0))
        end = min(len(bass_audio) / float(bass_sr), float(bars[index + 1]['start']) if index + 1 < len(bars) else len(bass_audio) / float(bass_sr))
        bar['bass_events'] = [{**note, 'start': max(start, note['start']), 'end': min(end, note['end'])}
                              for note in notes if note['end'] > start and note['start'] < end]
        bass_reference = bass_reference_from_events(notes, start, end)
        if bass_reference is None:
            continue
        bass_reference["source"] = source
        bar["bass_root"] = bass_reference["note"]
        bar["bass_reference"] = bass_reference


def chord_reference_for_segment(audio: Any, sr: int, start: float, end: float, np: Any,
                                bass_audio: Any = None, bass_sr: int | None = None,
                                bass_notes: list[dict[str, Any]] | None = None,
                                bass_noise_floor: float | None = None) -> dict[str, Any] | None:
    """Prefer audible separated bass; otherwise retain a strong measured low accompaniment note."""
    crop = audio[math.ceil(start * sr):math.floor(end * sr)]
    level = float(np.sqrt(np.mean(crop ** 2))) if len(crop) else 0.
    if bass_audio is not None and bass_sr:
        bass_crop = bass_audio[math.ceil(start * bass_sr):math.floor(end * bass_sr)]
        bass_level = float(np.sqrt(np.mean(bass_crop ** 2))) if len(bass_crop) else 0.
        if bass_level >= max(1e-5, level * .03):
            reference = (bass_reference_from_events(bass_notes, start, end) if bass_notes is not None
                         else estimate_bass_reference(bass_audio, bass_sr, start, end, np, bass_noise_floor))
            if reference:
                return {**reference, 'origin': 'bass', 'source': 'bass stem'}
    if level < 1e-5:
        return None
    pitches = detected_pitches_for_crop(crop, sr, np)
    chroma = chroma_for_segment(crop, sr, 0, len(crop) / sr, np)
    return accompaniment_reference_for_evidence(pitches, chord_evidence(chroma, start, end, '', np)['detected_notes'])


def accompaniment_reference_for_evidence(pitches: list[dict[str, Any]], notes: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Use the same retained pitches for low-note guidance and chord recognition."""
    candidates = [pitch for pitch in pitches if pitch['midi'] <= 60 and pitch['strength'] >= .04
        and abs(1200 * math.log2(pitch['frequency_hz'] / (440 * 2 ** ((pitch['midi'] - 69) / 12)))) <= 30]
    if not candidates:
        return None
    pitch = min(candidates, key=lambda item: item['midi'])
    if pitch['strength'] < .15:
        return None  # A weaker lower note prevents promoting its stronger upper chord tone to bass.
    return {'note': PITCH_NAMES[pitch['midi'] % 12], 'pitch_class': pitch['midi'] % 12,
        'confidence': round(min(.95, .55 + pitch['strength'] * .6), 3),
        'origin': 'accompaniment', 'source': 'low accompaniment pitch',
        'detected_notes': notes, 'detected_pitches': pitches}

def fading_root_for_crop(crop: Any, sr: int, start: float, chroma: Any, evidence: dict[str, Any],
                         reference: dict[str, Any] | None, ranked: list[dict[str, Any]],
                         key: str, np: Any, options: dict[str, Any]) -> dict[str, Any] | None:
    from chordpilot_chords import fading_chord_hint, chroma_for_segment
    count = round(sr * .25)
    if len(crop) < 2 * count or len(crop) > sr * 2 or (reference or {}).get('confidence', 0) >= .62:
        return None
    # Both attack and decay measurements stay inside this cell/selection.
    # Equal window lengths keep FFT peak power comparable.
    early_crop = crop[:count]
    power = spectral_power_for_crop(early_crop, sr, np)
    late_power = spectral_power_for_crop(crop[-count:], sr, np)
    early_chroma = chroma_for_segment(early_crop, sr, 0, count / sr, np, options)
    early_evidence = chord_evidence(early_chroma, start, start + count / sr, '', np)
    early_evidence['detected_pitches'] = detected_pitches_for_crop(early_crop, sr, np)
    early_evidence['spectrum'] = spectrum_from_power(power, sr, np, bin_count=192)
    early_chroma = apply_overtone_weighting(early_evidence, early_chroma, power, sr, np, options, bin_count=192)
    reference = accompaniment_reference_for_evidence(early_evidence['detected_pitches'], early_evidence['detected_notes'])
    decay = {}
    for pitch in early_evidence['detected_pitches']:
        index = round(pitch['frequency_hz'] * (len(power) - 1) * 2 / sr)
        before = float(power[max(0, index - 1):index + 2].sum())
        after = float(late_power[max(0, index - 1):index + 2].sum())
        decay[str(pitch['midi'])] = after / before if before > 0 else 1
    return fading_chord_hint(chroma, evidence, None, {'chroma': early_chroma,
        'evidence': early_evidence, 'bass_reference': reference, 'root_decay': decay}, ranked, key, np, options)


def duration_weighted_bar_chroma(bars: list[dict[str, Any]], duration: float, tempo: int, time_signature: str, np: Any) -> Any:
    total = np.zeros(12)
    for index, bar in enumerate(bars):
        start = float(bar.get("start", 0.0))
        end = min(duration, float(bars[index + 1]["start"]) if index + 1 < len(bars) else duration)
        total += bar["_chroma"] * max(0.0, end - start)
    return total

def duration_weighted_cell_chroma(audio: Any, sr: int, bars: list[dict[str, Any]], tempo: int,
                                  time_signature: str, beat_times: list[float], np: Any,
                                  options: dict[str, Any]) -> Any:
    from chordpilot_chords import chroma_for_segment
    total = np.zeros(12)
    duration = len(audio) / float(sr) if sr else 0.0
    if options.get("chord_timing", "legacy") == "legacy":
        return duration_weighted_bar_chroma(bars, duration, tempo, time_signature, np)
    beats_per_bar = parse_beats_per_bar(time_signature)
    for index, bar in enumerate(bars):
        start = float(bar.get("start", 0.0))
        end = min(duration, float(bars[index + 1]["start"]) if index + 1 < len(bars) else duration)
        for cell_start, cell_end in analysis_cell_bounds(start, end, beat_times, options.get("chord_grid", "beat"), bar.get('pickup_beats', parse_beats_per_bar(bar.get('time_signature', time_signature))), tempo):
            total += chroma_for_segment(audio, sr, cell_start, cell_end, np, options) * (cell_end - cell_start)
    return total

def refine_cell_bass_boundaries(cells: list[dict[str, Any]], bass_audio: Any, sr: int, np: Any,
                                bass_notes: list[dict[str, Any]] | None = None) -> bool:
    """Refine supported root changes using adjacent independent bass fundamentals."""
    if len(cells) < 2:
        return False
    if bass_notes is None:
        bass_notes = bass_note_events(bass_audio, sr, np, cells[0]['start'], cells[-1]['end'])
    changed = False
    for left, right in zip(cells, cells[1:]):
        old, new = left.get('bass_reference') or {}, right.get('bass_reference') or {}
        if old.get('origin') == 'accompaniment' or new.get('origin') == 'accompaniment':
            continue
        old_pc, new_pc = old.get('pitch_class'), new.get('pitch_class')
        if old_pc is None or new_pc is None or old_pc == new_pc or min(old.get('confidence', 0), new.get('confidence', 0)) < .62:
            continue
        boundary = float(right['start'])
        minimum = min(boundary - left['start'], right['end'] - boundary)
        radius = max(0, min(minimum * .8, minimum - .08))
        crossings = []
        for before, after in zip(bass_notes, bass_notes[1:]):
            if before['midi'] % 12 != old_pc or after['midi'] % 12 != new_pc:
                continue
            if after['start'] - before['end'] > .16 or min(before['confidence'], after['confidence']) < .8:
                continue
            crossing = (before['end'] + after['start']) / 2
            if abs(crossing - boundary) <= radius:
                crossings.append((crossing, [before['end'], after['start']]))
        if crossings:
            crossing, bracket = min(crossings, key=lambda value: abs(value[0] - boundary))
            refined = round(crossing, 6)
            if abs(refined - boundary) > .005:
                left['end'] = right['start'] = refined
                right['_boundary_refinement'] = {'grid_time': boundary, 'time': refined, 'bass_bracket': bracket}
                changed = True
    return changed


def attach_timed_chord_events(bars: list[dict[str, Any]], audio: Any, sr: int, tempo: int,
                              time_signature: str, beat_times: list[float], np: Any,
                              options: dict[str, Any], evidence_source: str,
                              bass_audio: Any = None, bass_sr: int | None = None, key: str = "C") -> None:
    bass_notes = None
    if bass_audio is not None and bass_sr:
        if not all(isinstance(bar.get('bass_events'), list) for bar in bars):
            add_bass_reference_to_bars(bars, bass_audio, bass_sr, np)
        bass_notes = [note for bar in bars for note in bar['bass_events']]
    mode = options.get("chord_timing", "legacy")
    if mode == "legacy":
        return
    from chordpilot_chords import chroma_for_segment
    beats_per_bar = parse_beats_per_bar(time_signature)
    song_duration = len(audio) / float(sr) if sr else 0.0
    cells: list[dict[str, Any]] = []
    cells_by_bar: list[list[dict[str, Any]]] = []
    for index, bar in enumerate(bars):
        start = float(bar.get("start", 0.0))
        end = min(song_duration, float(bars[index + 1]["start"]) if index + 1 < len(bars) else song_duration)
        bounds = analysis_cell_bounds(start, end, beat_times, str(options.get("chord_grid", "beat")), bar.get('pickup_beats', parse_beats_per_bar(bar.get('time_signature', time_signature))), tempo)
        bar_cells = []
        for cell_start, cell_end in bounds:
            chroma = chroma_for_segment(audio, sr, cell_start, cell_end, np, options)
            reference = chord_reference_for_segment(audio, sr, cell_start, cell_end, np, bass_audio, bass_sr, bass_notes)
            evidence = chord_evidence(chroma, cell_start, cell_end, evidence_source, np)
            cell = {"start": cell_start, "end": cell_end, "chord": "N.C.", "confidence": 0.0,
                    "chord_confidence": 0.0, "pitch_confidence": detected_pitch_confidence(chroma, np),
                    "alternatives": [], "evidence": evidence, "bass_reference": reference, "_chroma": chroma}
            bar_cells.append(cell)
            cells.append(cell)
        if mode == "auto" and bass_audio is not None and bass_sr and refine_cell_bass_boundaries(bar_cells, bass_audio, int(bass_sr), np, bass_notes):
            for cell in bar_cells:
                chroma = chroma_for_segment(audio, sr, cell["start"], cell["end"], np, options)
                cell.update({"_chroma": chroma, "evidence": chord_evidence(chroma, cell["start"], cell["end"], evidence_source, np),
                    "bass_reference": chord_reference_for_segment(audio, sr, cell["start"], cell["end"], np, bass_audio, bass_sr, bass_notes)})
        cells_by_bar.append(bar_cells)
    if not cells:
        return
    previous_power, previous_center = None, None
    for cell in cells:
        crop = audio[math.ceil(cell['start'] * sr):math.floor(cell['end'] * sr)]
        power = spectral_power_for_crop(crop, sr, np)
        original_spectrum = spectrum_from_power(power, sr, np, bin_count=192)
        recognition_power = power
        cell['evidence']['detected_pitches'] = detected_pitches_for_crop(crop, sr, np)
        if bass_audio is not None and bass_sr and cell.get('bass_reference') and cell['bass_reference'].get('origin') != 'accompaniment':
            bass_crop = bass_audio[math.ceil(cell['start'] * bass_sr):math.floor(cell['end'] * bass_sr)]
            cell['bass_reference']['raw_detected_pitches'] = detected_pitches_for_crop(bass_crop, bass_sr, np)
            if options.get('overtone_weighting', .5) > 0:
                bass_power = spectral_power_for_crop(bass_crop, bass_sr, np)
                weighted_bass, bass_info = reduce_overtones(bass_power, bass_sr, np, options.get('overtone_weighting', .5))
                cell['bass_reference']['overtone_weighting'] = bass_info
                cell['bass_reference']['raw_detected_pitches'] = attenuate_detected_pitches(cell['bass_reference']['raw_detected_pitches'], bass_power, weighted_bass, bass_sr, np, minimum_strength=0)
        center = (cell['start'] + cell['end']) / 2
        if options.get('tail_reduction', 0) > 0:
            reduced, info = reduce_sustain_tail(power, previous_power, center - previous_center if previous_center is not None else 0, options, np)
            recognition_power = reduced
            if info['applied'] and info['removed_fraction'] > 1e-9:
                original_notes = cell['evidence'].get('detected_notes', [])
                original_pitches = cell['evidence']['detected_pitches']
                cell['_chroma'] = apply_tail_to_chroma(cell['_chroma'], power, reduced, sr, np, options)
                cell['evidence'] = chord_evidence(cell['_chroma'], cell['start'], cell['end'], evidence_source, np)
                cell['evidence']['original_detected_notes'] = original_notes
                cell['evidence']['original_detected_pitches'] = original_pitches
                cell['evidence']['detected_pitches'] = attenuate_detected_pitches(original_pitches, power, reduced, sr, np)
            cell['evidence']['tail_reduction'] = info
            cell['evidence']['tail_reduced_spectrum'] = spectrum_from_power(reduced, sr, np, bin_count=192,
                reference_power=original_spectrum['reference_power'])
        cell['evidence']['spectrum'] = original_spectrum
        cell['_chroma'] = apply_overtone_weighting(cell['evidence'], cell['_chroma'], recognition_power, sr, np, options, bin_count=192)
        if (cell.get('bass_reference') or {}).get('origin') == 'accompaniment':
            cell['bass_reference'] = accompaniment_reference_for_evidence(
                cell['evidence']['detected_pitches'], cell['evidence']['detected_notes'])
        previous_power, previous_center = power, center
    provisional = []
    for cell in cells:
        registered = half_diminished_hint(cell['_chroma'], cell['evidence'], cell.get('bass_reference'), np, options) if not any(
            name in evidence_source.lower() for name in ('bass', 'drum', 'vocal')) else None
        if registered:
            cell['evidence']['registered_chord'] = registered
        ranked, _ = rank_chord_candidates(cell['_chroma'], key, None, None, cell.get('bass_reference'), np, options,
            registered_hint=registered)
        if mode == 'auto':
            crop = audio[math.ceil(cell['start'] * sr):math.floor(cell['end'] * sr)]
            hint = fading_root_for_crop(crop, sr, cell['start'], cell['_chroma'], cell['evidence'],
                cell.get('bass_reference'), ranked, key, np, options)
            if hint:
                cell['evidence']['fading_root'] = hint
                ranked, _ = rank_chord_candidates(cell['_chroma'], key, None, None,
                    cell.get('bass_reference'), np, options, fading_hint=hint, registered_hint=registered)
        provisional.append(ranked[0]['chord'])
    limit = int(options.get("chord_alternatives", 6))
    for index, cell in enumerate(cells):
        ranked, libraries = rank_chord_candidates(cell["_chroma"], key, provisional[index - 1] if index else None,
            provisional[index + 1] if index + 1 < len(cells) else None, cell.get("bass_reference"), np, options,
            fading_hint=cell['evidence'].get('fading_root'), registered_hint=cell['evidence'].get('registered_chord'))
        best = ranked[0]
        alternatives = [{"chord": item["chord"], "score": item["score"], "raw_score": item["raw_score"], "reasons": item.get("reasons", [])} for item in ranked[:limit]]
        pitch_confidence = detected_pitch_confidence(cell["_chroma"], np)
        confidence = round(max(0.0, min(0.98, float(best["score"]) * .72 + pitch_confidence * .28)), 3)
        cell.update({"chord": best["chord"], "confidence": confidence, "chord_confidence": confidence,
                     "pitch_confidence": pitch_confidence, "alternatives": alternatives,
                     "debug": {"chosen_chord": best["chord"], "chosen_score": best["score"], "alternatives": alternatives,
                               "library_candidates": libraries or ["internal templates"]}})
        if mode == 'auto' and options.get('chord_stability', 'detailed') != 'detailed':
            cell['_ranked'] = [{'chord': item['chord'], 'raw_score': item['raw_score']} for item in ranked]
    if mode == 'auto':
        stabilize_chord_cells(cells, np, {**options, 'beat_period': 60.0 / max(tempo, 1), 'beats_per_bar': beats_per_bar, 'key': key})
    for cell in cells:
        cell.pop('_ranked', None)
    for bar, bar_cells in zip(bars, cells_by_bar):
        grouped = group_chord_cells(bar_cells, np, {"beat_period": 60.0 / max(tempo, 1)}) if mode == "auto" else bar_cells
        events = []
        for group in grouped:
            raw_cells = group.get("cells", [group])
            hints = [cell['evidence']['fading_root'] for cell in raw_cells
                if cell['evidence'].get('fading_root', {}).get('chord') == group['chord']]
            group_hint = None
            if hints:
                supported = sum(cell['end'] - cell['start'] for cell in raw_cells
                    if cell['evidence'].get('fading_root', {}).get('chord') == group['chord'])
                fraction = supported / (group['end'] - group['start'])
                group_hint = {**hints[0], 'bonus': .45 * fraction, 'support_fraction': fraction,
                    'support_ranges': [hint['early_range'] for hint in hints]}
            registered_cells = [cell for cell in raw_cells
                if cell['evidence'].get('registered_chord', {}).get('chord') == group['chord']]
            registered = None
            if registered_cells:
                duration = group['end'] - group['start']
                registered = {**registered_cells[0]['evidence']['registered_chord'],
                    'bonus': sum(cell['evidence']['registered_chord']['bonus'] * (cell['end'] - cell['start']) / duration
                        for cell in registered_cells),
                    'support_ranges': [[cell['start'], cell['end']] for cell in registered_cells]}
            reference = chord_reference_for_segment(audio, sr, group['start'], group['end'], np, bass_audio, bass_sr, bass_notes)
            if (reference or {}).get('origin') == 'accompaniment':
                # Averaging retained cell pitches avoids reintroducing subtracted sustain tails.
                pitches = {}
                for cell in raw_cells:
                    weight = (cell['end'] - cell['start']) / (group['end'] - group['start'])
                    for pitch in cell['evidence']['detected_pitches']:
                        item = pitches.setdefault(pitch['midi'], {**pitch, 'strength': 0.})
                        item['strength'] += pitch['strength'] * weight
                notes = chord_evidence(group['_chroma'], group['start'], group['end'], evidence_source, np)['detected_notes']
                reference = accompaniment_reference_for_evidence(list(pitches.values()), notes)
            if registered and (reference or {}).get('confidence', 0) >= .62 and reference.get('pitch_class') != parse_candidate_symbol(registered['chord'])['root']:
                registered = None
            ranked, libraries = rank_chord_candidates(group["_chroma"], key, None, None, reference, np, options,
                fading_hint=group_hint, registered_hint=registered)
            selected = next((item for item in ranked if item["chord"] == group["chord"]), ranked[0])
            pitch_confidence = detected_pitch_confidence(group["_chroma"], np)
            evidence = chord_evidence(group["_chroma"], group["start"], group["end"], evidence_source, np)
            evidence.update(scored_pitch_class_evidence(group["_chroma"], reference, np))
            evidence['scoring_source'] = evidence_source
            if group_hint:
                evidence['fading_root'] = group_hint
            if registered:
                evidence['registered_chord'] = registered
            if not any(name in evidence_source.lower() for name in ('bass', 'drum', 'vocal')):
                crop = audio[math.ceil(group['start'] * sr):math.floor(group['end'] * sr)]
                group_power = spectral_power_for_crop(crop, sr, np)
                retained_power = group_power
                if options.get('tail_reduction', 0) > 0:
                    context_start = max(0., group['start'] - (group['end'] - group['start']))
                    context = audio[math.ceil(context_start * sr):math.floor(group['start'] * sr)]
                    previous = spectral_power_for_crop(context, sr, np) if len(context) >= 3 else None
                    retained_power, _ = reduce_sustain_tail(group_power, previous, (group['end'] - context_start) / 2, options, np)
                evidence['voicing_frames'] = [{**frame, 'start': round(group['start'] + frame['start'], 4),
                    'end': round(group['start'] + frame['end'], 4)} for frame in
                    voicing_frames_for_crop(crop, sr, np, options, group_power, retained_power)]
            alternatives = [{"chord": item["chord"], "score": item["score"], "raw_score": item["raw_score"], "reasons": item.get("reasons", [])} for item in ranked[:limit]]
            events.append({"start": round(float(group["start"]), 3), "end": round(float(group["end"]), 3),
                "chord": group["chord"], "confidence": round(max(0.0, min(.98, float(selected["score"]) * .72 + pitch_confidence * .28)), 3),
                "chord_confidence": round(max(0.0, min(.98, float(selected["score"]) * .72 + pitch_confidence * .28)), 3), "pitch_confidence": pitch_confidence,
                "alternatives": alternatives, "evidence": evidence, "bass_reference": reference,
                "debug": {"stability": options.get('chord_stability') if mode == 'auto' and options.get('chord_stability', 'detailed') != 'detailed' else None,
                    "selection_reasons": [f"Consolidated with {options.get('chord_stability')} chord stability; original beat detections remain in the debug cells."] if group.get('_stability') else selected.get('reasons', []),
                    "cells": [{"start": cell["start"], "end": cell["end"], "chord": cell["chord"],
                    "boundary_refinement": cell.get("_boundary_refinement"),
                    "stability": cell.get("_stability"),
                    "detected_chord": cell.get("detected_chord", cell["chord"]), "confidence": cell["confidence"], "alternatives": cell["alternatives"], "evidence": cell["evidence"],
                    "bass_reference": cell.get("bass_reference")} for cell in raw_cells], "library_candidates": libraries}})
        if not events:
            continue
        bar["chord_events"] = events
        dominant = max(enumerate(events), key=lambda pair: (pair[1]["end"] - pair[1]["start"], -pair[0]))[1]
        for field in ("chord", "confidence", "chord_confidence", "pitch_confidence", "alternatives", "evidence", "bass_reference", "debug"):
            if field in dominant:
                bar[field] = dominant[field]

def estimate_bass_root(audio: Any, sr: int, start: float, end: float, np: Any) -> int | None:
    reference = estimate_bass_reference(audio, sr, start, end, np)
    return None if reference is None else int(reference["pitch_class"])

def estimate_bass_reference(audio: Any, sr: int, start: float, end: float, np: Any,
                            noise_floor: float | None = None) -> dict[str, Any] | None:
    return bass_reference_from_events(bass_note_events(audio, sr, np, start, end, noise_floor), start, end)


def build_bars(duration: float, tempo: int, time_signature: str, beat_times: list[float] | None, phase: int = 0) -> list[Bar]:
    beats_per_bar = parse_beats_per_bar(time_signature)
    seconds_per_bar = (60.0 / max(tempo, 1)) * beats_per_bar
    estimated_count = max(8, min(160, int(math.ceil(duration / seconds_per_bar))))

    starts: list[float] = []
    if beat_times:
        starts = [start for start in measured_bar_starts(beat_times, beats_per_bar, phase) if start < duration]

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
    cache_mode = f"{normalized_mode}-{options_cache_suffix(options)}-waveform-v2-spectrum-v3-tail-v1-pitches-v1-overtones-v1-low-reference-v2-bass-f0-v2-rhythm-v2"
    if options['rhythm_engine'] == 'beat_this_steady':
        cache_mode += '-steady-v2'
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

    librosa_result: dict[str, Any] = {}
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
                if options.get('rhythm_engine') in {'beat_this', 'beat_this_steady'}:
                    raise
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
        if options.get("require_stems") or options.get('rhythm_engine') in {'beat_this', 'beat_this_steady'}:
            raise
        builtin_result = {"error": str(exc)}

    if not builtin_result.get('bars'):
        librosa_result = estimate_with_librosa(path)
    duration = float(builtin_result.get("duration") or audio_duration(path))
    if librosa_result:
        offset = float(options.get('beat_offset', 0))
        librosa_result['beat_times'] = sorted({round(float(value) + offset, 3)
            for value in librosa_result.get('beat_times', []) if 0 <= float(value) + offset < duration})
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
        bars = build_bars(duration, tempo, time_signature, librosa_result.get("beat_times"), options['bar_phase'])
        for index, bar in enumerate(bars):
            bar.chord = "N.C."
            bar.confidence = 0.0
            bar.notes = f"Analysis failed: {failure}" if index == 0 else "No chord estimate; enter manually."
        bars_payload = [asdict(bar) for bar in bars]
        if bars_payload and options['bar_phase'] and librosa_result.get('beat_times'):
            bars_payload[0]['pickup_beats'] = min(options['bar_phase'], len(librosa_result['beat_times']))
            bars_payload[0]['section'] = 'Pickup'
        chord_engine = f"unavailable: {builtin_result.get('error', 'missing analyzer')}"
        confidence_note = "no chord estimate"

    payload = {
        "title": path.stem or "Untitled",
        "source_path": str(path),
        "duration": round(duration, 3),
        "waveform": waveform_peaks(path),
        "key": key,
        "tempo": tempo,
        "tempo_exact": builtin_result.get('tempo_exact', float(tempo)),
        "time_signature": time_signature,
        "beat_times": builtin_result.get("beat_times") or librosa_result.get("beat_times") or [],
        "downbeat_times": builtin_result.get('downbeat_times', []),
        "timing_diagnostics": builtin_result.get('timing_diagnostics', []),
        "analysis_engine": {
            "mode": normalized_mode,
            "options": options,
            "duration": "decoded audio" if builtin_result.get("duration") else "fallback",
            "tempo_beats": builtin_result.get('tempo_beats') or ("librosa" if librosa_result else "fallback"),
            "rhythm_source": builtin_result.get('rhythm_source', 'full mix'),
            "rhythm_selection": builtin_result.get('rhythm_selection', 'full mix analysis'),
            "rhythm_model": builtin_result.get('rhythm_model'),
            "bar_alignment": builtin_result.get('bar_alignment', 'manual beat phase' if options['bar_phase'] else 'first tracked beat; unverified downbeat'),
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
