"""Compare local audio evidence and optional Auto timing with a checked chord reference."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).absolute().parents[2] / 'backend'))
from chordpilot_common import CHORD_QUALITIES, normalize_analysis_options
from chordpilot_chords import parse_candidate_symbol
from chordpilot_study import analyze_range


def chord_function(candidate):
    quality = CHORD_QUALITIES[candidate['quality']]
    seventh = 10 if 10 in quality['intervals'] else 11 if 11 in quality['intervals'] else None
    return quality['third'], seventh, quality['suspension']


def agreement(expected, actual):
    target, detected = parse_candidate_symbol(expected), parse_candidate_symbol(actual)
    root = bool(target and detected and target['root'] == detected['root'])
    return root, bool(root and chord_function(target) == chord_function(detected))


def exact_agreement(expected, actual):
    target, detected = parse_candidate_symbol(expected), parse_candidate_symbol(actual)
    return bool(target and detected and all(target[k] == detected[k] for k in ('root', 'quality', 'bass')))


def confidence_audit(rows):
    """Descriptive buckets only: these selected windows are not calibration ground truth."""
    bands = []
    for low, high in ((0, .5), (.5, .75), (.75, .9), (.9, 1.01)):
        selected = [row for row in rows if low <= row['chord_confidence'] < high]
        bands.append({'range': [low, min(high, 1)], 'count': len(selected),
            'mean_score': round(sum(row['chord_confidence'] for row in selected) / len(selected), 3) if selected else None,
            'correct_roots': sum(row['root_agreement'] for row in selected),
            'wrong_roots': sum(not row['root_agreement'] for row in selected),
            'correct_functions': sum(row['function_agreement'] for row in selected),
            'exact_symbols': sum(row['exact_agreement'] for row in selected)})
    return bands


def reference_changes(bars):
    result = []
    previous = None
    for bar in bars:
        for index, chord in enumerate(bar['chords']):
            root = parse_candidate_symbol(chord)['root']
            start = bar['start'] + (bar['end'] - bar['start']) * index / len(bar['chords'])
            if previous is not None and root != previous:
                result.append({'time': start, 'from_root': previous, 'to_root': root})
            previous = root
    return result


def analyze_timeline(args, options, reference):
    from chordpilot_analysis import estimate_high_quality_from_stems
    stems = [{'name': name, 'path': path} for name, path in
        [('other', args.other), ('bass', args.bass), ('drums', args.drums)] if path]
    result = estimate_high_quality_from_stems(Path(args.audio), {'stems': stems}, options)
    bars, tempo = result['bars'], result['tempo']
    events = [event for bar in bars for event in bar['chord_events']]
    duration = root_duration = function_duration = 0.
    for window in reference['windows']:
        for event in events:
            overlap = max(0., min(window['end'], event['end']) - max(window['start'], event['start']))
            root, function = agreement(window['chord'], event['chord'])
            root_duration += overlap * root
            function_duration += overlap * function
        duration += window['end'] - window['start']
    changes = []
    previous = None
    for event in events:
        parsed = parse_candidate_symbol(event['chord'])
        root = parsed['root'] if parsed else None
        if root is not None and previous is not None and root != previous:
            changes.append({'time': event['start'], 'from_root': previous, 'to_root': root})
        previous = root
    boundaries = match_boundaries(reference_changes(reference['bars']), changes, 60 / tempo)
    return {'tempo': tempo, 'key': result['key'], 'root_agreement_fraction': root_duration / duration,
        'function_agreement_fraction': function_duration / duration,
        'boundaries': boundaries, 'events': [{key: event[key] for key in ('start', 'end', 'chord')} for event in events]}


def match_boundaries(targets, changes, tolerance):
    boundaries, used = [], set()
    for target in targets:
        matches = [(index, change) for index, change in enumerate(changes) if index not in used
            and change['from_root'] == target['from_root'] and change['to_root'] == target['to_root']
            and abs(change['time'] - target['time']) <= tolerance]
        nearest_pair = min(matches, key=lambda pair: abs(pair[1]['time'] - target['time']), default=None)
        nearest = nearest_pair[1] if nearest_pair else None
        if nearest_pair: used.add(nearest_pair[0])
        boundaries.append({**target, 'detected_time': nearest['time'] if nearest else None,
            'error_seconds': abs(nearest['time'] - target['time']) if nearest else None})
    return boundaries


def analyze_bass_points(path, reference):
    import numpy as np
    from chordpilot_audio import load_audio
    from chordpilot_bass import bass_note_events
    from chordpilot_analysis import estimate_bass_reference
    audio, sr = load_audio(Path(path))
    notes = bass_note_events(audio, sr, np)
    rows = []
    for point in reference['bass_points']:
        time = point['time']
        selected = estimate_bass_reference(audio, sr, max(0, time - .07), min(len(audio) / sr, time + .07), np)
        current = next((note for note in notes if note['start'] <= time < note['end']), None)
        rows.append({**point, 'local_midi': selected['midi'] if selected else None,
                     'tracked_midi': current['midi'] if current else None})
    summary = {}
    for kind in sorted({row['kind'] for row in rows}):
        selected = [row for row in rows if row['kind'] == kind]
        summary[kind] = {'total': len(selected)}
        for field in ('local_midi', 'tracked_midi'):
            summary[kind][field] = {'correct': sum(row[field] == row['midi'] for row in selected),
                                  'wrong': sum(row[field] is not None and row[field] != row['midi'] for row in selected),
                                  'unvoiced': sum(row[field] is None for row in selected)}
    rejections=[]
    for window in reference.get('bass_rejections', []):
        false_notes=[note for note in notes if window['start'] <= note['start'] < window['end']
                     and note['midi'] in window['midis']]
        rejections.append({**window, 'false_attacks': false_notes})
    return {'summary': summary, 'points': rows, 'rejections':rejections, 'events': notes}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('audio', 'other', 'bass', 'reference', 'output'):
        parser.add_argument('--' + name, required=True)
    parser.add_argument('--timed', action='store_true', help='Also evaluate the automatic beat grid and chord changes.')
    parser.add_argument('--drums', help='Rhythm stem for the timed comparison; otherwise uses the mix.')
    args = parser.parse_args()
    reference = json.loads(Path(args.reference).read_text(encoding='utf-8'))
    options = normalize_analysis_options(reference['settings'])
    rows = []
    for window in reference['windows']:
        if not parse_candidate_symbol(window['chord']):
            raise ValueError(f"Unsupported reference chord: {window['chord']}")
        run = analyze_range(args.audio, {'other': args.other, 'bass': args.bass}, window['start'], window['end'], options)
        root, function = agreement(window['chord'], run['chord'])
        rows.append({**window, 'detected': run['chord'], 'chord_confidence': run['chord_confidence'],
            'root_agreement': root, 'function_agreement': function,
            'exact_agreement': exact_agreement(window['chord'], run['chord'])})
    report = {'reference': reference['title'], 'source_url': reference['source_url'], 'settings': options,
        'algorithm_version': run['algorithm_version'], 'local_windows': rows,
        'local_root_agreement': {'correct': sum(row['root_agreement'] for row in rows), 'total': len(rows)},
        'local_function_agreement': {'correct': sum(row['function_agreement'] for row in rows), 'total': len(rows)},
        'local_exact_agreement': {'correct': sum(row['exact_agreement'] for row in rows), 'total': len(rows)},
        'confidence_audit': confidence_audit(rows)}
    if args.timed:
        report['timeline'] = analyze_timeline(args, options, reference)
    if reference.get('bass_points'):
        report['bass'] = analyze_bass_points(args.bass, reference)
    Path(args.output).write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({key: report[key] for key in ('local_root_agreement', 'local_function_agreement')}))


if __name__ == '__main__':
    main()
