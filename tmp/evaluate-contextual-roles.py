"""Apply contextual role hypotheses to independently reproduced audio caches."""
from pathlib import Path
import hashlib
import importlib.util
import json
import os
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tmp/structure-neural-deps'))
for variable in ('OPENBLAS_NUM_THREADS','OMP_NUM_THREADS','MKL_NUM_THREADS'):os.environ[variable]='1'
import numpy as np

BASE=ROOT/'outputs/song-structure'
OUT=BASE/'contextual-role-candidate';OUT.mkdir(exist_ok=True)
CACHE=BASE/'native-recurrence-candidate'
read=lambda p:json.loads(p.read_text(encoding='utf-8'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
pin_path=OUT/'inputs.json'
if '--pin' in sys.argv:
    if pin_path.exists():raise RuntimeError('Input pins already exist; do not silently replace them.')
    subprocess.run([sys.executable,str(ROOT/'tmp/evaluate-native-recurrence.py'),'--verify'],check=True)
    pins={}
    songs=[r['song'] for r in read(CACHE/'summary.json')['tracks']]
    for slug in songs:
        paths=[CACHE/(slug+'.json'),CACHE/(slug+'.npz')]
        report=read(paths[0])
        for name,digest in {**report['inputs'],**report['code']}.items():
            path=ROOT/name;assert sha(path)==digest;paths.append(path)
        for path in paths:pins[str(path.relative_to(ROOT)).replace('\\','/')]=sha(path)
    pin_path.write_text(json.dumps({'songs':songs,'sha256':pins},indent=2)+'\n',encoding='utf-8')
    (OUT/'before-review.json').write_bytes((BASE/'overjoyed-benchmark/review/current-manifest.json').read_bytes())
pins=read(pin_path)
assert all(sha(ROOT/name)==digest for name,digest in pins['sha256'].items()),'Pinned cache changed'
protected=read(BASE/'representation-stages/integrity-baseline.json')
assert all(sha(Path(name))==digest for name,digest in protected.items()),'Protected original changed'

blocked=True
def audit(event,args):
    if blocked and event=='open' and isinstance(args[0],(str,bytes)):
        name=str(args[0]).replace('\\','/').lower()
        if ('/docs/' in name or 'structure-references/' in name or 'feedback' in name
                or name.endswith('.chordpilot-session.json') or 'before-review' in name):
            raise AssertionError('Evaluation/session data are not inference inputs.')
sys.addaudithook(audit)
helper=ROOT/'scripts/testing/structure-contextual-roles.py'
spec=importlib.util.spec_from_file_location('contextual',helper)
contextual=importlib.util.module_from_spec(spec);spec.loader.exec_module(contextual)
verify='--verify' in sys.argv
summaries=[]
for slug in pins['songs']:
    source_path=BASE/'songformer-experiment'/(slug+'.raw.json')
    source=read(source_path);rows=source['segments']
    cache_path=CACHE/(slug+'.npz')
    with np.load(cache_path,allow_pickle=False) as saved:
        p=saved['native_probabilities']
        views={key:saved[key] for key in saved.files if key!='native_probabilities'}
    assert set(views)=={f'{stream}_{norm}' for stream in ('short_musicfm','short_muq','long_musicfm','long_muq') for norm in ('raw','centered')}
    results=contextual.refine(rows,p,views)
    assert [(r['start'],r['end']) for r in results]==[(r['start'],r['end']) for r in rows]
    assert all(r['label']==rows[i]['label'] for i,r in enumerate(results) if p[i].max()>=.5)
    changes=[{'index':i,'start':r['start'],'end':r['end'],'from':r['native_label'],'to':r['label'],**r['decision']}
             for i,r in enumerate(results) if r['label']!=r['native_label']]
    summary={'song':slug,'occurrences':len(rows),'changes':changes,'boundaries_unchanged':True,'independent_accuracy':None}
    report={'engine':'songformer-contextual-role-candidate-v2','status':'development_candidate_not_independently_validated',
            'source_hash':source['source_hash'],'duration':source['duration'],'segments':results,'summary':summary,
            'input_pins_sha256':sha(pin_path),'input_cache_sha256':sha(cache_path),'native_prediction_sha256':sha(source_path),
            'code_sha256':{str(path.relative_to(ROOT)).replace('\\','/'):sha(path) for path in (helper,Path(__file__))},
            'parameters':{'target_max_below':.5,'donor_max_above':.5,'successor_anchor_min':.8,
                          'context_occurrences':2,'all_eight_views_unique_reciprocal':True,'overlapping_windows':False,
                          'require_order_better_than_swapped':True,'pooling':'equal original posteriors',
                          'cross_class_margin_veto':False,'no_cascading':True},
            'limitations':['Full-mix SSL similarity does not isolate lead-vocal melody.',
                          'Development listening feedback motivated the rule; not independent evaluation.',
                          'No fixed Verse/Chorus form or expected sequence enters inference.',
                          'Role scores are uncalibrated; no recurrence partition inferred.']}
    path=OUT/(slug+'.json')
    if verify:assert read(path)==report,slug+': report did not reproduce'
    else:path.write_text(json.dumps(report,indent=2,allow_nan=False)+'\n',encoding='utf-8')
    summaries.append(summary);print(json.dumps(summary),flush=True)
blocked=False
assert all(sha(Path(name))==digest for name,digest in protected.items())
assert all(sha(ROOT/name)==digest for name,digest in pins['sha256'].items())
summary={'tracks':summaries,'protected_files_unchanged':len(protected),'pinned_inputs_unchanged':len(pins['sha256']),
         'original_sessions_updated':False,'independent_accuracy_established':False}
if verify:
    assert read(OUT/'summary.json')==summary
    print('EXACT CONTEXTUAL RECOMPUTATION VERIFIED')
else:(OUT/'summary.json').write_text(json.dumps(summary,indent=2)+'\n',encoding='utf-8')
