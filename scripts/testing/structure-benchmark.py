"""Evaluate source-time structure without feeding reference labels to inference."""
from __future__ import annotations

import argparse
import json
import sys
import time
import tracemalloc
from collections import defaultdict
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[2] / 'backend'))
from chordpilot_structure import validate_segments, analyze_structure, STRUCTURE_VERSION


def _scores(matched, predicted, reference):
    precision = matched / predicted if predicted else float(not reference)
    recall = matched / reference if reference else float(not predicted)
    return {'precision':precision,'recall':recall,'f1':2*precision*recall/(precision+recall) if precision+recall else 0.}


def boundary_metrics(reference, prediction, tolerance):
    ref, pred = sorted(reference)[1:-1], sorted(prediction)[1:-1]
    i = j = matched = 0
    while i < len(ref) and j < len(pred):
        if abs(ref[i]-pred[j]) <= tolerance:
            matched+=1;i+=1;j+=1
        elif pred[j] < ref[i]:j+=1
        else:i+=1
    return {**_scores(matched,len(pred),len(ref)), 'matched':matched,'reference':len(ref),'predicted':len(pred)}


def group_metrics(reference,prediction):
    # Continuous duration-weighted pairwise agreement. No letter alignment or
    # fixed-rate sampling is needed; unknown groups are distinct occurrences.
    cells, ref_total, pred_total = defaultdict(float), defaultdict(float), defaultdict(float)
    for i, left in enumerate(reference):
        for j, right in enumerate(prediction):
            overlap = max(0.,min(left['end'],right['end'])-max(left['start'],right['start']))
            if overlap:
                a = left.get('group') or ('unknown-reference',i)
                b = right.get('group') or ('unknown-prediction',j)
                cells[a,b]+=overlap;ref_total[a]+=overlap;pred_total[b]+=overlap
    return _scores(sum(value**2 for value in cells.values()),sum(value**2 for value in pred_total.values()),sum(value**2 for value in ref_total.values()))


def role_metrics(reference,prediction):
    """Duration agreement with explicit abstention coverage; groups are not roles."""
    known={'intro','verse','pre_chorus','chorus','post_chorus','bridge','solo','instrumental','breakdown','outro','start','end','break','silence'}
    def role(row):
        value=row.get('role') if 'role' in row else row.get('label')
        value=value.replace('-','_') if isinstance(value,str) else value
        value='instrumental' if value=='inst' else value
        return value if value in known else None
    total=covered=correct=0.
    confusion=defaultdict(float)
    for left in reference:
        expected=role(left)
        if expected is None:continue
        total+=left['end']-left['start']
        for right in prediction:
            overlap=max(0.,min(left['end'],right['end'])-max(left['start'],right['start']))
            if not overlap:continue
            predicted=role(right)
            covered+=overlap if predicted is not None else 0.
            correct+=overlap if predicted==expected else 0.
            confusion[expected,predicted or 'unknown']+=overlap
    return {'reference_seconds':total,'covered_seconds':covered,'correct_seconds':correct,
            'duration_accuracy':correct/total if total else None,
            'coverage':covered/total if total else None,
            'covered_accuracy':correct/covered if covered else None,
            'confusion_seconds':[{'reference':a,'predicted':b,'seconds':value} for (a,b),value in sorted(confusion.items())]}


def _source_hash(value):
    value=value.get('chart',value.get('prediction',value))
    return value.get('source_hash') or value.get('structure',value).get('analysis',{}).get('source_hash')


def _document(value):
    value=value.get('chart',value.get('prediction',value))
    structure = value.get('structure',value)
    if 'analysis' in structure:
        # Evaluate automatic predictions even when a saved manual overlay exists.
        return {'duration':value.get('duration',structure.get('analysis',{}).get('segments',[{}])[-1].get('end',0)
                                  if structure.get('analysis',{}).get('segments') else 0),
                'segments':structure.get('analysis',{}).get('segments',[])}
    return value


def evaluate(reference,prediction):
    ref_hash,pred_hash=_source_hash(reference),_source_hash(prediction)
    if ref_hash and pred_hash and ref_hash!=pred_hash:
        raise ValueError('Recording content hashes must match; do not compare different recordings.')
    reference_status=reference.get('annotation_status','unspecified')
    original=prediction.get('chart',prediction)
    bar_starts=reference.get('bar_starts') or [bar.get('start') for bar in original.get('bars',[])]
    reference,prediction = _document(reference),_document(prediction)
    duration = reference.get('duration')
    if prediction.get('duration') != duration:raise ValueError('Recording durations must match; do not silently rescale references.')
    for document in (reference,prediction):
        rows=[{**row,'id':row.get('id',str(i))} for i,row in enumerate(document.get('segments',[]))]
        if not validate_segments(rows,duration):raise ValueError('Reference and prediction must be valid complete source-time partitions.')
    ref,pred=reference['segments'],prediction['segments']
    boundaries=lambda rows: [row['start'] for row in rows]+([duration] if rows else [])
    baseline=[{'start':0,'end':duration,'group':'A'}] if duration else []
    legacy=None
    if bar_starts and all(isinstance(value,(int,float)) for value in bar_starts):
        # Historical baseline exists only in the evaluator, never in inference.
        index=0;cuts=[0.];lengths=(4,8,8,8,8,8,8,4)
        while index<len(bar_starts):
            for length in lengths:
                index+=length
                if index<len(bar_starts) and 0<bar_starts[index]<duration:cuts.append(bar_starts[index])
        cuts.append(duration)
        legacy={str(t):boundary_metrics(boundaries(ref),cuts,t) for t in (.5,3.)}
    return {'duration':duration,'segments':{'reference':len(ref),'predicted':len(pred)},
            'boundaries':{str(t):boundary_metrics(boundaries(ref),boundaries(pred),t) for t in (.5,3.)},
            'groups':group_metrics(ref,pred),'one_group_baseline':group_metrics(ref,baseline),
            'roles':role_metrics(ref,pred),'reference_status':reference_status,
            'recording_identity':'content hash matched' if ref_hash and pred_hash else 'not verified by both content hashes',
            'legacy_template_boundaries':legacy if legacy is not None else 'Unavailable: no bar grid supplied.'}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--reference',type=Path)
    parser.add_argument('--prediction',type=Path)
    parser.add_argument('--audio',type=Path)
    parser.add_argument('--grid',type=Path,help='Existing chart or {duration,bars}; labels are ignored by inference.')
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    if bool(args.audio)==bool(args.prediction):parser.error('Supply exactly one of --audio or --prediction.')
    report={'algorithm':STRUCTURE_VERSION,'semantic_accuracy':'See evaluation.roles when a role-annotated reference is supplied.'}
    if args.audio:
        grid=json.loads(args.grid.read_text(encoding='utf-8-sig')) if args.grid else {}
        grid=grid.get('chart',grid)
        tracemalloc.start();started=time.perf_counter()
        prediction=analyze_structure(args.audio,grid)
        report['elapsed_seconds']=time.perf_counter()-started
        report['peak_traced_bytes']=tracemalloc.get_traced_memory()[1];tracemalloc.stop()
        report['memory_measurement']='Python traced allocations, not total process RSS or GPU memory.'
        report['prediction']=prediction
    else:
        prediction=json.loads(args.prediction.read_text(encoding='utf-8-sig'))
        value=prediction.get('chart',prediction.get('prediction',prediction))
        report['algorithm']=value.get('engine') or value.get('structure',value).get('analysis',{}).get('engine') or 'saved prediction; engine unspecified'
    if args.reference:
        evaluated={'duration':prediction['analysis']['segments'][-1]['end'] if prediction.get('analysis',{}).get('segments') else 0,
                   'structure':prediction,'bars':grid.get('bars',[])} if args.audio else prediction
        report['evaluation']=evaluate(json.loads(args.reference.read_text(encoding='utf-8-sig')),evaluated)
    else:report['evaluation']='No independent reference supplied; this is a smoke run, not accuracy evidence.'
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(report,indent=2,allow_nan=False),encoding='utf8')
    print(json.dumps({key:value for key,value in report.items() if key!='prediction'},indent=2))


if __name__=='__main__':main()
