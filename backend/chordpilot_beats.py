"""Optional joint beat/downbeat inference; lightweight onset tracking stays default."""
from __future__ import annotations

import hashlib
import os
from pathlib import Path
import sys


def steady_model_grid(beat, downbeat, duration, np, options):
    """Decode model probabilities with a bounded pulse and a sparse 2/4 transition.

    This is deliberately opt-in: strong half-bar predictions do not by themselves
    establish a meter change. Short-bar placement remains an explicit estimate.
    """
    import librosa
    from chordpilot_analysis import estimate_tempo_from_envelope
    fps = 50
    minimum, maximum = int(options.get('min_bpm', 60)), int(options.get('max_bpm', 190))
    # Model probabilities already describe beats. The onset tracker's fast-pulse
    # preference would manufacture silent offbeats for a genuine 60–80 BPM song.
    prior = estimate_tempo_from_envelope(beat, fps, 1, np, minimum, maximum, prefer_fast=False)
    _, frames = librosa.beat.beat_track(onset_envelope=beat, sr=fps, hop_length=1,
                                       bpm=prior, tightness=300, trim=False)
    frames = np.asarray(frames, dtype=int)
    frames = frames[frames / fps < duration - .35 * 60/prior]
    if len(frames) < 8:
        raise RuntimeError('Not enough model evidence for a steady metrical grid.')
    times = frames / fps
    strength = np.asarray([max(downbeat[max(0, frame - 2):frame + 3]) for frame in frames])
    supported = (beat[frames[:-1]] >= .5) & (beat[frames[1:]] >= .5) & (strength[:-1] >= .5)
    locks = np.flatnonzero(supported)
    if not len(locks):
        raise RuntimeError('No supported model downbeat sequence; review the tempo range.')
    lock = int(locks[0])
    # Prefer ordinary 4/4; permit a 2/4 bridge when persistent later downbeat
    # evidence outweighs its cost. No score/reference timestamps enter decoding.
    costs = {lock: (-float(np.log(max(strength[lock], 1e-5))), [lock])}
    for index in range(lock + 1, len(times)):
        candidates = []
        for length in (4, 2):
            if index - length in costs:
                cost, path = costs[index - length]
                candidates.append((cost - float(np.log(max(strength[index], 1e-5))) + (6 if length == 2 else 0), path + [index]))
        if candidates:
            costs[index] = min(candidates)
    # Cover all audio, including a partial final measure. Uncertain intro/fade
    # pulses are retained and labelled, rather than silently dropping that audio.
    # Any of the last four quarter onsets can begin the final partial measure.
    # Forcing the latest reachable onset invents a 2/4 bridge just to fit the tail.
    last = min((index for index in costs if index >= len(times)-4), key=lambda index: costs[index][0])
    path = costs[last][1]
    path = list(range(lock % 4, lock, 4)) + path
    if path[0]:
        path.insert(0, 0)
    measures = []
    for position, index in enumerate(path):
        following = path[position + 1] if position + 1 < len(path) else None
        count = following - index if following is not None else len(times)-index
        finish = times[following] if following is not None else duration
        measures.append({'start': round(float(times[index]), 3), 'end': round(float(finish), 3),
                         'beats': count, 'confidence': round(float(strength[index]), 4),
                         'inferred': bool(index < lock or strength[index] < .5 or beat[frames[index]] < .5),
                         'meter_estimate': bool(following is not None and count == 2 and index >= lock),
                         **({'pickup_beats':count} if index < lock and count < 4 else {})})
    span = min(8, len(times)-1)
    exact = float(60 * span / np.median(times[span:] - times[:-span]))
    return {'tempo': round(exact), 'tempo_exact': round(exact, 4), 'beat_times': [round(float(t), 3) for t in times],
            'downbeat_times': [measure['start'] for measure in measures], 'measure_grid': measures,
            'timing_diagnostics': steady_timing_diagnostics(measures), 'tempo_beats': 'Beat This! bounded steady pulse; estimated 4/4 with 2/4 bridges',
            'bar_alignment': 'model probability sequence; meter changes and weak passages require review'}


def steady_timing_diagnostics(measures):
    warnings = [f"Estimated 2/4 measure at {measure['start']:.3f}s: competing half-bar downbeats can make the exact meter-change position ambiguous. Review against the audio."
                for measure in measures if measure['meter_estimate']]
    uncertain = sum(measure['inferred'] for measure in measures)
    if uncertain:
        warnings.append(f'{uncertain} measure starts have weak model support (including possible free-time intro/fade); their pulse is inferred, not verified.')
    return warnings


def offset_steady_grid(result, offset, duration):
    """Shift measured timing; retain honest short measures at clipped edges."""
    original = result['beat_times']
    beats = [round(t+offset, 3) for t in original if 0 <= t+offset < duration]
    measures = []
    for measure in result['measure_grid']:
        start, end = measure['start']+offset, min(duration, measure['end']+offset)
        inside = [t for t in beats if start-.001 <= t < end-.001]
        if not inside:
            continue
        clipped = start < 0 or measure['end']+offset > duration
        measures.append({**measure, 'start':inside[0], 'end':round(end, 3), 'beats':len(inside),
                         'inferred':measure['inferred'] or clipped, 'meter_estimate':measure['meter_estimate'] and not clipped,
                         **({'pickup_beats':len(inside)} if start < 0 and len(inside) < 4 else {})})
    # A negative offset leaves an unsupported audio tail. Retain it explicitly
    # as inferred pulses instead of stretching the preceding measured quarter.
    if measures and measures[-1]['end'] < duration:
        samples = original[-9:]
        period = sorted(b-a for a,b in zip(samples,samples[1:]))
        step = period[len(period)//2]
        tail = measures[-1]['end']
        extra = []
        while tail < duration-.35*step:
            extra.append(round(tail, 3));tail += step
        beats.extend(extra)
        if not extra:
            measures[-1].update(end=duration, inferred=True)
        for index in range(0,len(extra),4):
            group = extra[index:index+4]
            measures.append({'start':group[0], 'end':extra[index+4] if index+4<len(extra) else duration,
                             'beats':len(group), 'confidence':0., 'inferred':True, 'meter_estimate':False})
    result.update(beat_times=beats, measure_grid=measures, downbeat_times=[m['start'] for m in measures],
                  timing_diagnostics=steady_timing_diagnostics(measures))


def metrical_grid(raw_beats, raw_downbeats, duration, np):
    beats = sorted({float(t) for t in raw_beats if np.isfinite(t) and 0 <= t < duration})
    downbeats = sorted({float(t) for t in raw_downbeats if np.isfinite(t) and 0 <= t < duration})
    if len(downbeats) < 2:
        raise RuntimeError('Beat This! did not find enough downbeats for a 4/4 grid.')
    period = float(np.median(np.diff(downbeats))) / 4
    if any(not 2.5 * period < b - a < 5.5 * period for a, b in zip(downbeats, downbeats[1:])):
        raise RuntimeError('Beat This! found irregular bar lengths; review the meter or use onset tracking.')
    inferred = 0

    def observed(target, step):
        nonlocal inferred
        nearest = min(beats, key=lambda t: abs(t - target)) if beats else None
        if nearest is not None and abs(nearest - target) <= .22 * step:
            return nearest
        inferred += 1
        return target

    # One quarter per slot prevents extra strum peaks from changing the bar count.
    # Missing beat peaks are explicit interpolations between measured downbeats.
    grid = []
    pickup = min(3, max(0, round((downbeats[0] - beats[0]) / period))) if beats else 0
    grid.extend(observed(downbeats[0] - i * period, period) for i in range(pickup, 0, -1))
    for left, right in zip(downbeats, downbeats[1:]):
        step = (right - left) / 4
        grid.append(left)
        grid.extend(observed(left + beat * step, step) for beat in (1, 2, 3))
    grid.append(downbeats[-1])
    # Keep only supported final beats; do not extend the pulse through a silent tail.
    for beat in (1, 2, 3):
        target = downbeats[-1] + beat * period
        if any(abs(t - target) <= .22 * period for t in beats):
            grid.append(observed(target, period))
    return sorted({round(t, 3) for t in grid if 0 <= t < duration}), [round(t, 3) for t in downbeats], inferred


def estimate_model_rhythm(audio, sr, np, options):
    root = Path(__file__).resolve().parents[1]
    checkpoint = Path(os.environ.get('CHORDPILOT_BEAT_THIS_CHECKPOINT') or root / '.tool-cache/beat-this-models/final0.ckpt')
    if not checkpoint.is_file():
        raise RuntimeError('Beat This! is optional. Install its packages/checkpoint as described in docs/beat-tracking.md, or select Onset tracking.')
    # Local evaluation dependencies are optional and excluded from app packaging.
    for folder in ('.tool-cache/beat-this-packages', '.tool-cache/drum-packages', '.tool-cache/melody/game-packages'):
        path = str(root / folder)
        if Path(path).is_dir() and path not in sys.path:
            sys.path.append(path)
    try:
        import torch
        from beat_this.inference import Audio2Beats, Audio2Frames
        torch.set_num_threads(min(4, torch.get_num_threads()))
        if options.get('rhythm_engine') == 'beat_this_steady':
            model = Audio2Frames(checkpoint_path=str(checkpoint), device='cpu')
            beat, downbeat = model(audio, sr)
            result = steady_model_grid(beat.sigmoid().cpu().numpy(), downbeat.sigmoid().cpu().numpy(), len(audio)/float(sr), np, options)
            offset = float(options.get('beat_offset', 0))
            if offset:
                offset_steady_grid(result, offset, len(audio)/float(sr))
            result['rhythm_model'] = {'name': 'Beat This!', 'decoder': 'bounded-steady-v2', 'checkpoint': checkpoint.name,
                'checkpoint_sha256': hashlib.sha256(checkpoint.read_bytes()).hexdigest()}
            return result
        model = Audio2Beats(checkpoint_path=str(checkpoint), device='cpu', dbn=False)
        raw_beats, raw_downbeats = model(audio, sr)
    except (ImportError, OSError) as exc:
        raise RuntimeError('Beat This! dependencies are unavailable; see docs/beat-tracking.md or select Onset tracking.') from exc
    duration = len(audio) / float(sr)
    beats, downbeats, inferred = metrical_grid(raw_beats, raw_downbeats, duration, np)
    # Several bars reduce the model's 20 ms frame-quantization error in BPM.
    span = min(8, len(downbeats) - 1)
    exact = float(240 * span / np.median(np.asarray(downbeats[span:]) - np.asarray(downbeats[:-span])))
    offset = float(options.get('beat_offset', 0))
    beats = sorted({round(t + offset, 3) for t in beats if 0 <= t + offset < duration})
    downbeats = sorted({round(t + offset, 3) for t in downbeats if 0 <= t + offset < duration})
    return {'tempo': round(exact), 'tempo_exact': round(exact, 4), 'beat_times': beats,
        'downbeat_times': downbeats, 'tempo_beats': 'Beat This! joint beats/downbeats; 4/4 metrical grid',
        'bar_alignment': 'model downbeats; unverified estimate',
        'rhythm_model': {'name': 'Beat This!', 'checkpoint': checkpoint.name,
            'checkpoint_sha256': hashlib.sha256(checkpoint.read_bytes()).hexdigest(),
            'raw_beat_count': len(raw_beats), 'downbeat_count': len(raw_downbeats), 'interpolated_beats': inferred}}
