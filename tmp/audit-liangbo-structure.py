"""Run-four audit of the frozen weak-self-repeat candidate; no new tuning."""
import contextlib
import hashlib
import io
import json
from pathlib import Path
import sys
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'outputs/song-structure'
OUT=BASE/'calibration-run-4'
OUT.mkdir(exist_ok=True)
read=lambda p:json.loads(p.read_text())
# Reuse the exact prior experiment, changing artifact destination only.
runner=ROOT/'tmp/calibrate-weak-self-repeat.py'
code=runner.read_text()
assert code.count('calibration-run-3')==2
code=code.replace('calibration-run-3','calibration-run-4')
(OUT/'reproduction-driver.py.txt').write_text(code)
old_hashes={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in (BASE/'calibration-run-3').glob('*.json')}
log=io.StringIO()
with contextlib.redirect_stdout(log):
    exec(compile(code,str(runner),'exec'),{'__file__':str(runner),'__name__':'__main__'})
(OUT/'candidate-regressions.log').write_text(log.getvalue())
assert old_hashes=={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in (BASE/'calibration-run-3').glob('*.json')}
for slug in ['ballad','i-love-you-3000','waste-of-time','liangbo','overjoyed']:
    assert read(OUT/(slug+'.weak-self-repeat.json'))==read(BASE/'calibration-run-3'/(slug+'.weak-self-repeat.json'))

before=read(BASE/'songformer-experiment/liangbo.consensus-v3.json')
after=read(OUT/'liangbo.weak-self-repeat.json')
z=np.load(BASE/'songformer-experiment/liangbo.logits-0.npz')['function_logits'][0]
p=np.exp(z-z.max(axis=1,keepdims=True));p/=p.sum(axis=1,keepdims=True)
names={0:'intro',1:'verse',2:'chorus',3:'bridge',4:'instrumental',5:'outro',6:'silence',26:'pre_chorus'}
fine=[]
for r in after['fine_segments']:
    q=p[int(r['start']*8.333):max(int(r['start']*8.333)+1,int(r['end']*8.333))].mean(axis=0)
    ranking=q.argsort()[-3:][::-1]
    fine.append({'start':r['start'],'end':r['end'],'group':r['group'],'role':r['role'],
        'native_label':r['native_label'],'boundary':r['boundary_evidence'],
        'role_evidence':r['role_evidence'],
        'top_roles':[{'role':names.get(int(i),str(i)),'score':float(q[i])} for i in ranking]})
removed=[]
for r in before['segments'][1:]:
    if r['start'] in {s['start'] for s in after['segments']}:continue
    i=next(i for i,f in enumerate(fine) if f['start']==r['start'])
    left,right=fine[i-1],fine[i]
    assert left['group']==right['group'] and left['role']==right['role'] and right['role']
    assert right['boundary']['score']<.5
    removed.append({'time':r['start'],'left':left,'right':right})

families=[]
for group in sorted({r['group'] for r in before['segments']}):
    rows=[r for r in before['segments'] if r['group']==group]
    roles=sorted({r['role'] for r in rows if r['role']})
    families.append({'group':group,'accepted_roles':roles,'multiple_functions':len(roles)>1,
        'spans':[{'start':r['start'],'end':r['end'],'role':r['role']} for r in rows]})
unknowns=[r for r in before['segments'] if r['role'] is None]
report={'target':'liangbo','new_inference_changes':False,'prior_candidate_reproduced_on_five_caches':True,
    'previous_run_artifacts_unchanged':True,'before_sections':len(before['segments']),
    'candidate_sections':len(after['segments']),'unknown_intervals':len(unknowns),
    'unknown_seconds':sum(r['end']-r['start'] for r in unknowns),
    'removed_boundaries':removed,'content_families':families,'fine_diagnostics':fine,
    'conclusion':'Three weak self-repeat cuts pass internal checks, but role uncertainty and harmonic aliasing remain. Do not promote or overwrite originals without stronger musical evaluation.',
    'accuracy':'Not measured. No independently verified full-recording annotation.'}
(OUT/'liangbo-diagnostics.json').write_text(json.dumps(report,indent=2,allow_nan=False)+'\n')
print(json.dumps({k:v for k,v in report.items() if k not in ('fine_diagnostics','content_families','removed_boundaries')},indent=2))
print('Removed:',[(round(r['time'],2),r['right']['role'],round(r['right']['boundary']['score'],4)) for r in removed])
print('Cross-function content families:',[(f['group'],f['accepted_roles']) for f in families if f['multiple_functions']])
