"""Isolated pretrained-model probe. No section answers or grids enter inference."""
import os
import pathlib
import sys
import subprocess

sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tmp/structure-neural-deps'))
os.environ['HF_HOME']=str(ROOT/'tmp/structure-model-cache')
os.environ['TORCH_HOME']=str(ROOT/'tmp/structure-model-cache/torch')
os.environ['HF_HUB_DISABLE_XET']='1'
os.environ['NUMBA_CACHE_DIR']=str(ROOT/'tmp/structure-model-cache/numba')
os.environ['TORCH_FORCE_WEIGHTS_ONLY_LOAD']='1'
os.environ['HF_HUB_DISABLE_SYMLINKS_WARNING']='1'
os.environ['HF_HUB_OFFLINE']='1'  # All eight author checkpoints are now cached.
os.environ['PATH']=str(ROOT/'node_modules/ffmpeg-static')+os.pathsep+str(ROOT/'Tools')+os.pathsep+os.environ['PATH']

import hashlib
import importlib.metadata
import json
import time
from dataclasses import asdict
import numpy as np
import torch
from allin1_infer.spectrogram import extract_spectrograms
from allin1_infer.models import load_pretrained_model
from allin1_infer.helpers import run_inference, compute_activations
from allin1_infer.postprocessing.functional import postprocess_functional_structure
from allin1_infer.demix import demix

OUT=ROOT/'outputs/song-structure'/os.environ.get('STRUCTURE_OUTPUT_SUBDIR','neural-experiment')
OUT.mkdir(exist_ok=True)
torch.set_num_threads(6)
model_name=os.environ.get('STRUCTURE_MODEL','harmonix-all')
started=time.perf_counter()
print('Loading '+model_name,flush=True)
model=load_pretrained_model(model_name,device='cuda')
print('Model ready in %.2fs'%(time.perf_counter()-started),flush=True)
slugs=sys.argv[1:] or ['waste-of-time']
for slug in slugs:
    session_path=ROOT/'outputs/song-structure/algorithm-only-2026-10-25'/(slug+'.chordpilot-session.json')
    session=json.loads(session_path.read_text(encoding='utf-8'))
    chart=session['chart']
    stems={s['name']:pathlib.Path(s['path']) for s in chart['stems']['stems']}
    assert set(stems)=={'bass','drums','other','vocals'}
    assert len({p.parent for p in stems.values()})==1
    assert all(p.is_file() for p in stems.values())
    source=pathlib.Path(chart['source_path'])
    started=time.perf_counter()
    if os.environ.get('STRUCTURE_RESEPARATE')=='1':
        decoded=OUT/'audio'/(slug+'.wav')
        decoded.parent.mkdir(exist_ok=True)
        if not decoded.exists():
            subprocess.run([str(ROOT/'node_modules/ffmpeg-static/ffmpeg.exe'),'-y','-v','error','-i',str(source),'-ar','44100','-ac','2','-c:a','pcm_s16le',str(decoded)],check=True)
        os.environ.pop('TORCH_FORCE_WEIGHTS_ONLY_LOAD',None)  # Trusted, existing Meta Demucs checkpoint contains constructor metadata.
        stem_dir=demix([decoded],OUT/'demix','cuda')[0]
        os.environ['TORCH_FORCE_WEIGHTS_ONLY_LOAD']='1'
        stems={name:stem_dir/(name+'.wav') for name in ('bass','drums','other','vocals')}
        print(slug+': HTDemucs separation complete',flush=True)
    specs=extract_spectrograms([stems['bass'].parent],OUT/'spec'/slug,multiprocess=False)
    torch.cuda.reset_peak_memory_stats()
    with torch.inference_mode():
        if os.environ.get('STRUCTURE_FUNCTIONAL_ONLY')=='1':
            tensor=torch.from_numpy(np.load(specs[0])).unsqueeze(0).to('cuda')
            logits=model(tensor)
            torch.cuda.synchronize()
            print(slug+': functional forward complete',flush=True)
            raw={'path':str(source),'segments':[asdict(s) for s in postprocess_functional_structure(logits,model.cfg)],'activation_fps':float(model.cfg.fps)}
            activations=compute_activations(logits)
        else:
            result=run_inference(source,specs[0],model,'cuda',include_activations=True,include_embeddings=False)
            raw=asdict(result)
            activations=raw.pop('activations')
            raw['path']=str(raw['path'])
            raw.pop('embeddings',None)
    torch.cuda.synchronize()
    elapsed=time.perf_counter()-started
    np.savez_compressed(OUT/(slug+'.activations.npz'),**activations)
    (OUT/(slug+'.raw.json')).write_text(json.dumps(raw,indent=2,allow_nan=False),encoding='utf-8')
    meta={'engine':'allin1-infer','package_version':importlib.metadata.version('all-in-one-infer'),'model':model_name,'inputs':'Audio stems only. No bar grid, saved section labels, user boundaries, lyrics or web text.','separation':chart['stems']['engine'],'separation_note':'Existing MDX-extra stems reused; model was trained with HTDemucs. Treat this as a feasibility probe, not a matched-preprocessing quality benchmark.','source_hash':hashlib.sha256(source.read_bytes()).hexdigest(),'elapsed_seconds':elapsed,'peak_cuda_allocated_bytes':torch.cuda.max_memory_allocated(),'spectrogram_shape':list(np.load(specs[0],mmap_mode='r').shape),'stem_files':{name:str(p) for name,p in stems.items()},'segments':raw['segments']}
    if os.environ.get('STRUCTURE_RESEPARATE')=='1':meta.update(separation='HTDemucs',separation_note='Default HTDemucs, overlap .25, fp32; unchanged upstream model/functional decoder.')
    (OUT/(slug+'.provenance.json')).write_text(json.dumps(meta,indent=2,allow_nan=False),encoding='utf-8')
    print(json.dumps({'song':slug,'elapsed':elapsed,'segments':raw['segments']},ensure_ascii=True),flush=True)
