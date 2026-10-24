"""Compare saved/new timing to independent attacks; these proxies are not beat labels."""
import argparse
import hashlib
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'backend'))
import numpy as np
from scipy.signal import find_peaks
from chordpilot_analysis import estimate_rhythm, measured_bar_starts
from chordpilot_audio import load_audio
from chordpilot_common import normalize_analysis_options


def alignment(beats, attacks):
    if not len(beats) or not len(attacks):
        return None
    beats, attacks = np.asarray(beats), np.asarray(sorted(set(attacks)))
    right = np.searchsorted(attacks, beats).clip(0, len(attacks) - 1)
    left = (right - 1).clip(0, len(attacks) - 1)
    errors = np.minimum(abs(attacks[right] - beats), abs(attacks[left] - beats))
    return {'beat_count': len(beats), 'median_nearest_attack_ms': round(float(np.median(errors) * 1000), 2),
            'p95_nearest_attack_ms': round(float(np.percentile(errors, 95) * 1000), 2),
            'within_30ms_percent': round(float(np.mean(errors <= .03) * 100), 2)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--session', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    original = args.session.read_bytes()
    chart = json.loads(original.decode('utf-8-sig'))['chart']
    drum = next((s['path'] for s in chart.get('stems', {}).get('stems', []) if s.get('name') == 'drums' and s.get('path')), None)
    source = Path(drum or chart['source_path'])
    audio, sr = load_audio(source)
    options = normalize_analysis_options(chart.get('analysis_engine', {}).get('options'))
    began = time.perf_counter()
    rhythm = estimate_rhythm(audio, sr, np, options)
    elapsed = time.perf_counter() - began
    # Positive 1 ms RMS differences are independent of the spectral-flux tracker.
    # They include offbeats and other attacks: proximity is not beat/downbeat F1.
    block = max(1, round(sr * .001))
    padded = np.pad(audio, (0, (-len(audio)) % block))
    rms = np.sqrt(np.mean(padded.reshape(-1, block) ** 2, axis=1))
    rise = np.maximum(0, np.diff(rms, prepend=0))
    positive = rise[rise > 1e-6]
    peaks, _ = find_peaks(rise, distance=max(1, round(.08 * sr / block)),
                         prominence=float(np.percentile(positive, 75)) if len(positive) else 1.)
    attacks = peaks * block / sr
    before, after = chart.get('beat_times', []), rhythm['beat_times']
    windows = []
    for start in range(0, int(len(audio) / sr), 60):
        windows.append({'start': start, 'end': min(start + 60, len(audio) / sr),
                        'saved': alignment([b for b in before if start <= b < start + 60], attacks),
                        'new': alignment([b for b in after if start <= b < start + 60], attacks)})
    hits = [e['time'] for e in chart.get('drums', {}).get('events', []) if e.get('score', 0) >= .6]
    report = {'session': str(args.session.resolve()), 'session_sha256': hashlib.sha256(original).hexdigest(),
              'title': chart.get('title'), 'rhythm_source': str(source), 'duration': len(audio) / sr,
              'options': options, 'elapsed_seconds': round(elapsed, 3),
              'saved_tempo': chart.get('tempo'), 'rhythm': rhythm,
              'saved_beat_times': before, 'new_bar_starts': measured_bar_starts(after, 4, options['bar_phase']),
              'overall_audio_alignment': {'saved': alignment(before, attacks), 'new': alignment(after, attacks)},
              'audio_attacks': attacks.tolist(), 'audio_attack_alignment': windows,
              'drum_model_alignment': {'saved': alignment(before, hits), 'new': alignment(after, hits)},
              'limitation': 'Attack-proximity diagnostics only. Attacks include offbeats; human beat/downbeat labels are unavailable.'}
    assert args.session.read_bytes() == original, 'Input session changed during validation'
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'output': str(args.output), 'tempo': rhythm['tempo_exact'], 'engine': rhythm['tempo_beats'],
                      'first_beats': after[:8], 'last_beats': after[-3:], 'windows': windows,
                      'drum_model_alignment': report['drum_model_alignment'], 'elapsed_seconds': report['elapsed_seconds']}))


if __name__ == '__main__':
    main()
