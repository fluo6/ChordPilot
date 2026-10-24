"""Read-only, full-song evaluation of the optional steady beat decoder.

Writes candidate fixtures under --output, never to the input sessions. No score,
PDF or reference beat timestamps enter inference.
"""
import argparse
import copy
import hashlib
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT / 'backend')]
for package in ('beat-this-packages', 'drum-packages', 'melody/game-packages'):
    sys.path.append(str(ROOT / '.tool-cache' / package))

import numpy as np
import torch
from beat_this.inference import Audio2Frames
from chordpilot_audio import load_audio
from chordpilot_beats import steady_model_grid
from chordpilot_common import normalize_analysis_options


def candidate_chart(chart, rhythm):
    """Rebin saved absolute-time events for display checks, without re-detection."""
    updated = copy.deepcopy(chart)
    chord_events = [event for bar in chart['bars'] for event in bar.get('chord_events', [])]
    bass_events = [event for bar in chart['bars'] for event in bar.get('bass_events', [])]
    bars = []
    for index, measure in enumerate(rhythm['measure_grid']):
        start, end = measure['start'], measure['end']
        owner = max((bar for bar in chart['bars'] if bar['start'] <= start), key=lambda bar: bar['start'], default=chart['bars'][0])
        bar = {'number': index + 1, 'start': start, 'time_signature': f"{measure['beats']}/4",
               'section': owner.get('section', ''), 'chord': owner.get('chord', 'N.C.'), 'timing_evidence': measure}
        if measure.get('pickup_beats'):
            bar.update(time_signature='4/4', pickup_beats=measure['pickup_beats'])
        for field, events in [('chord_events', chord_events), ('bass_events', bass_events)]:
            bar[field] = [{**event, 'start': max(start, event['start']), 'end': min(end, event['end'])}
                          for event in events if event['end'] > start and event['start'] < end]
        bars.append(bar)
    updated.update({field: rhythm[field] for field in ('tempo', 'tempo_exact', 'beat_times', 'downbeat_times', 'timing_diagnostics')})
    updated['bars'] = bars
    return updated


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--session', type=Path, action='append', required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--min-bpm', type=int, default=60)
    parser.add_argument('--max-bpm', type=int, default=190)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    torch.set_num_threads(4)
    model = Audio2Frames(checkpoint_path=str(ROOT / '.tool-cache/beat-this-models/final0.ckpt'), device='cpu')
    records = []
    for index, session_path in enumerate(args.session):
        original = session_path.read_bytes()
        session = json.loads(original.decode('utf-8-sig'))
        chart = session['chart']
        folder = args.output / f'song-{index + 1}'
        folder.mkdir(exist_ok=True)
        source = Path(chart['source_path'])
        audio, sr = load_audio(source)
        started = time.perf_counter()
        cache = folder / 'activations.npz'
        if cache.exists():
            values = np.load(cache)
            assert str(values['source_sha256']) == hashlib.sha256(source.read_bytes()).hexdigest()
            beat, downbeat = values['beat'], values['downbeat']
        else:
            beat, downbeat = model(audio, sr)
            beat, downbeat = beat.sigmoid().cpu().numpy(), downbeat.sigmoid().cpu().numpy()
            np.savez_compressed(cache, beat=beat, downbeat=downbeat, source_sha256=hashlib.sha256(source.read_bytes()).hexdigest())
        options = normalize_analysis_options({'rhythm_engine': 'beat_this_steady', 'min_bpm': args.min_bpm, 'max_bpm': args.max_bpm})
        try:
            rhythm = steady_model_grid(beat, downbeat, len(audio)/sr, np, options)
        except RuntimeError as error:
            record = {'session': str(session_path), 'input_sha256': hashlib.sha256(original).hexdigest(),
                      'title': chart['title'], 'saved_bpm': chart['tempo'], 'error': str(error)}
            records.append(record)
            (args.output/'results.json').write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding='utf8')
            print(json.dumps(record, ensure_ascii=True), flush=True)
            continue
        beats, measures = rhythm['beat_times'], rhythm['measure_grid']
        assert all(a < b for a, b in zip(beats, beats[1:])), 'Unordered beats'
        assert all(a['end'] == b['start'] for a, b in zip(measures, measures[1:])), 'Gap or overlap in measures'
        mismatches = [m for m in measures if len([b for b in beats if m['start']+.001 < b < m['end']-.001]) != m['beats']-1]
        updated = candidate_chart(chart, rhythm)
        for field in ('melody', 'drums'):
            assert updated.get(field) == chart.get(field), field + ' changed'
        assert session_path.read_bytes() == original, 'Input session modified'
        record = {'session': str(session_path), 'input_sha256': hashlib.sha256(original).hexdigest(),
                  'title': chart['title'], 'saved_bpm': chart['tempo'], 'candidate_bpm': rhythm['tempo_exact'],
                  'saved_bars': len(chart['bars']), 'candidate_bars': len(measures), 'beats': len(beats),
                  'anchor_mismatches': mismatches, 'short_bars': [m['start'] for m in measures if m['meter_estimate']],
                  'inferred_bars': sum(m['inferred'] for m in measures), 'seconds': round(time.perf_counter()-started, 2),
                  'options': options, 'original_session_unchanged': True}
        (folder/'rhythm.json').write_text(json.dumps(rhythm, indent=2), encoding='utf8')
        (folder/'chart.json').write_text(json.dumps(updated, ensure_ascii=False), encoding='utf8')
        records.append(record)
        (args.output/'results.json').write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding='utf8')
        print(json.dumps(record, ensure_ascii=True), flush=True)


if __name__ == '__main__':
    main()
