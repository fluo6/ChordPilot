"""Evaluate a tutorial and original recording separately against selected reference labels."""
import argparse
import importlib.util
import json
from pathlib import Path
import statistics

spec=importlib.util.spec_from_file_location('timed_chord_metrics',Path(__file__).with_name('timed-chord-benchmark.py'))
chords=importlib.util.module_from_spec(spec)
spec.loader.exec_module(chords)


def bass_metrics(reference, events, tolerance=.18):
    targets=reference['bass_events']
    selected=[(i,event) for i,event in enumerate(events) if any(a<=event['start']<b for a,b in reference['bass_windows'])]
    used_targets,used_events=set(),set()
    matches=[]
    # Per pitch, an optimal time-ordered matching maximizes attack count before
    # minimizing distance. Nearest-pair greedy matching can strand valid pairs.
    for midi in sorted({target['midi'] for target in targets}):
        expected=sorted((target['time'],i) for i,target in enumerate(targets) if target['midi']==midi)
        detected=sorted((event['start'],j) for j,event in selected if event['midi']==midi)
        scores=[[(0,0.)]*(len(detected)+1) for _ in range(len(expected)+1)]
        moves={}
        for a,(time,i) in enumerate(expected,1):
            for b,(onset,j) in enumerate(detected,1):
                choices=[(scores[a-1][b],(a-1,b)),(scores[a][b-1],(a,b-1))]
                error=abs(time-onset)
                if error<=tolerance:
                    count,cost=scores[a-1][b-1]
                    choices.append(((count+1,cost-error),(a-1,b-1)))
                scores[a][b],moves[a,b]=max(choices,key=lambda choice:choice[0])
        a,b=len(expected),len(detected)
        while a and b:
            previous=moves[a,b]
            if previous==(a-1,b-1):
                time,i=expected[a-1];onset,j=detected[b-1]
                used_targets.add(i);used_events.add(j)
                matches.append({'reference':targets[i],'detected':events[j],'cursor_distance_ms':round(abs(time-onset)*1000,2)})
            a,b=previous
    missed=[target for i,target in enumerate(targets) if i not in used_targets]
    unmatched=[event for j,event in selected if j not in used_events]
    octave=sum(any(event['midi']!=target['midi'] and event['midi']%12==target['midi']%12
                   and abs(event['start']-target['time'])<=tolerance for event in unmatched) for target in missed)
    return {'expected':len(targets),'matched':len(matches),'missed':len(missed),
        'unmatched_detections':len(unmatched),'octave_errors':octave,
        'note_recall_percent':round(100*len(matches)/len(targets),2) if targets else None,
        'note_precision_percent':round(100*len(matches)/len(selected),2) if selected else None,
        'by_kind':{kind:{'expected':sum(t['kind']==kind for t in targets),'matched':sum(m['reference']['kind']==kind for m in matches)} for kind in sorted({t['kind']for t in targets})},
        'median_cursor_distance_ms':round(statistics.median(m['cursor_distance_ms'] for m in matches),2) if matches else None,
        'intro_false_attacks':sum(any(w['start']<=event['start']<w['end'] for w in reference['bass_silence']) for event in events),
        'unmatched_attacks_near_ghosts':sum(any(abs(event['start']-ghost['time'])<.10 for ghost in reference['ghost_events']) for event in unmatched),
        'matches':sorted(matches,key=lambda row:row['reference']['time']),'missed_notes':missed,'unmatched_notes':unmatched}


def chord_metrics(chart,reference):
    events=[event for bar in chart['bars'] for event in bar['chord_events']]
    totals={name:0. for name in ('root','family','exact','bass')}
    rows=[]
    duration=0.
    for window in reference['chord_windows']:
        length=window['end']-window['start'];duration+=length
        values={key:0. for key in totals};found=[]
        for event in events:
            overlap=max(0.,min(event['end'],window['end'])-max(event['start'],window['start']))
            if not overlap:continue
            found.append({'chord':event['chord'],'seconds':round(overlap,3)})
            for key,correct in chords.agreement(window['chord'],event['chord']).items():values[key]+=overlap*correct
        for key in totals:totals[key]+=values[key]
        rows.append({**window,'detected':found,**{key+'_percent':round(100*value/length,2)for key,value in values.items()}})
    return {'windows':len(rows),'seconds':round(duration,3),**{key+'_percent':round(100*value/duration,2)for key,value in totals.items()},'rows':rows}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--reference',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    for name in ('tutorial','original'):
        parser.add_argument('--'+name+'-bass',type=Path,required=True)
        parser.add_argument('--'+name+'-chart',type=Path,required=True)
    parser.add_argument('--onset-tolerance',type=float,default=.18)
    args=parser.parse_args();ref=json.loads(args.reference.read_text())
    report={'reference':ref['title'],'onset_tolerance_seconds':args.onset_tolerance,
        'limitation':'Selected TAB attacks only. Matching is one-to-one; cursor distance is not independently annotated acoustic-onset error. Original performance may differ from cover.'}
    for name in ('tutorial','original'):
        bass=json.loads(getattr(args,name+'_bass').read_text())['events']
        chart=json.loads(getattr(args,name+'_chart').read_text(encoding='utf8'))
        report[name]={'analysis':chart.get('analysis_engine',{}),
                      'bass':bass_metrics(ref,bass,args.onset_tolerance),'chords':chord_metrics(chart,ref)}
    args.output.write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({name:{'bass':{k:v for k,v in report[name]['bass'].items()if k not in ('matches','missed_notes','unmatched_notes')},
        'chords':{k:v for k,v in report[name]['chords'].items()if k!='rows'}}for name in ('tutorial','original')}))


if __name__=='__main__':main()
