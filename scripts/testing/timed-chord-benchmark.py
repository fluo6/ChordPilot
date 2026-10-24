"""Evaluate an audio-generated chart against separate timed reference annotations."""
import argparse
import json
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'backend'))
from chordpilot_chords import parse_candidate_symbol
from chordpilot_common import CHORD_QUALITIES


def agreement(expected, actual):
    target, found = parse_candidate_symbol(expected), parse_candidate_symbol(actual)
    root = bool(target and found and target['root'] == found['root'])
    family = False
    if root:
        a,b = CHORD_QUALITIES[target['quality']], CHORD_QUALITIES[found['quality']]
        seventh = next((n for n in (10,11) if n in a['intervals']), None)
        family = a['third'] == b['third'] and a['fifth'] == b['fifth'] and a['suspension'] == b['suspension'] and (seventh is None or seventh in b['intervals'])
    return {'root':root, 'family':family, 'exact':bool(target and found and target == found),
            'bass':bool(target and found and (target['bass'] if target['bass'] is not None else target['root']) == (found['bass'] if found['bass'] is not None else found['root']))}


def evaluate(chart, reference):
    events = [event for bar in chart['bars'] for event in bar.get('chord_events',[])]
    rows = []
    for window in reference['windows']:
        overlaps = []
        scores = {name:0. for name in ('root','family','exact','bass')}
        for event in events:
            duration = max(0.,min(event['end'],window['end'])-max(event['start'],window['start']))
            if duration <= 0: continue
            overlaps.append({'chord':event['chord'],'seconds':round(duration,4)})
            for name,correct in agreement(window['chord'],event['chord']).items(): scores[name] += duration*correct
        length = window['end']-window['start']
        rows.append({**window,'detected':overlaps,**{name:round(value/length,4) for name,value in scores.items()}})
    splits = {}
    for split in ['calibration','held_out','all']:
        selected = [row for row in rows if split=='all' or row['split']==split]
        total = sum(row['end']-row['start'] for row in selected)
        splits[split] = {'windows':len(selected),'seconds':round(total,3),**{
            name+'_percent':round(100*sum(row[name]*(row['end']-row['start']) for row in selected)/total,2)
            for name in ('root','family','exact','bass')}}
    beats = chart['beat_times']
    beat_rows = []
    for target in reference['attacked_beats']:
        nearest = min(beats,key=lambda time:abs(time-target['time']))
        bar_index = max((i for i,bar in enumerate(chart['bars']) if bar['start'] <= nearest+.001),default=0)
        bar = chart['bars'][bar_index]
        beat_number = sum(bar['start']-.001 <= time <= nearest+.001 for time in beats)
        beat_rows.append({**target,'detected_time':nearest,'error_ms':round(1000*abs(nearest-target['time']),2),
            'detected_bar':bar.get('number',bar_index+1),'detected_beat':beat_number})
    errors = [row['error_ms'] for row in beat_rows]
    return {'title':reference['title'],'source_url':reference['source_url'],'settings':chart['analysis_engine']['options'],
        'tempo':chart['tempo'],'key':chart['key'],'chords':splits,'windows':rows,
        'beats':{'annotated_attacks':len(errors),'median_error_ms':round(statistics.median(errors),2),
            'max_error_ms':max(errors),'within_50ms':sum(value<=50 for value in errors),
            'correct_bar_and_beat':sum(row['bar']==row['detected_bar'] and row['beat']==row['detected_beat'] for row in beat_rows),'rows':beat_rows},
        'event_count_first_45s':sum(event['start']<45 for event in events),
        'limitations':'Selected windows and attacked beats only; timing uncertainty about 40 ms. Family accepts unprinted extensions but requires a printed seventh. Exact includes extensions and inversion. Not full-song accuracy or calibrated confidence.'}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--chart',type=Path,required=True)
    parser.add_argument('--reference',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    chart=json.loads(args.chart.read_text(encoding='utf-8'))
    if 'chart' in chart: chart=chart['chart']
    result=evaluate(chart,json.loads(args.reference.read_text(encoding='utf-8')))
    args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({key:result[key] for key in ('chords','beats','event_count_first_45s')}))


if __name__=='__main__': main()
