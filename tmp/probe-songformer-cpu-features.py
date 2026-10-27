"""Isolated pinned SongFormer inference; audio only, no benchmark answers."""
import os,pathlib,sys,json,time,hashlib,subprocess,functools

ROOT=pathlib.Path(__file__).resolve().parents[1]
for folder in ['tmp/structure-neural-deps','tmp/songformer-deps','tmp/songformer-adapted']:
    sys.path.insert(0,str(ROOT/folder))
os.environ['SONGFORMER_LOCAL_DIR']=str(ROOT/'tmp/songformer-adapted')
os.environ['HF_HOME']=str(ROOT/'tmp/structure-model-cache')
os.environ['HF_HUB_OFFLINE']='1'
os.environ['TRANSFORMERS_OFFLINE']='1'
os.environ['NUMBA_CACHE_DIR']=str(ROOT/'tmp/structure-model-cache/numba')
os.environ['OMP_NUM_THREADS']='6'
os.environ['PATH']=str(ROOT/'node_modules/ffmpeg-static')+os.pathsep+os.environ['PATH']
sys.stdout.reconfigure(encoding='utf-8');sys.stderr.reconfigure(encoding='utf-8')
import torch
torch.set_num_threads(6)
print('Importing inspected local SongFormer',flush=True)
from configuration_songformer import SongFormerConfig
from modeling_songformer import SongFormerModel
import importlib.util
import numpy as np
spec=importlib.util.spec_from_file_location("capture",ROOT/"scripts/testing/structure-feature-capture.py")
capture=importlib.util.module_from_spec(spec);spec.loader.exec_module(capture)
features_out=ROOT/"outputs/song-structure/representation-stages/features"
features_out.mkdir(parents=True,exist_ok=True)
feature_chunks=[]
import soundfile as sf

if '--import-only' in sys.argv:
    print('IMPORT OK',flush=True);sys.exit(0)
if '--construct-only' in sys.argv:
    config=SongFormerConfig.from_pretrained(str(ROOT/'tmp/songformer-adapted'),local_files_only=True)
    model=SongFormerModel(config)
    print('CONSTRUCTOR OK; parameters',sum(p.numel() for p in model.parameters()),flush=True);sys.exit(0)
source=ROOT/'tmp/songformer-inspect/model.safetensors'
verification=json.loads(source.with_name('weights-verification.json').read_text())
assert source.stat().st_size==verification['bytes']
linked=ROOT/'tmp/songformer-adapted/model.safetensors'
if not linked.exists():os.link(source,linked)
started=time.perf_counter()
config=SongFormerConfig.from_pretrained(str(linked.parent),local_files_only=True)
print('Loading safetensors; offline, fp32',flush=True)
model,loading_info=SongFormerModel.from_pretrained(str(linked.parent),config=config,local_files_only=True,
                                                low_cpu_mem_usage=False,output_loading_info=True)
print('Checkpoint loading info',loading_info,flush=True)
assert not any(loading_info.get(k) for k in ('missing_keys','unexpected_keys','mismatched_keys','error_msgs'))
model.to('cpu').eval()
print('Model loaded in',round(time.perf_counter()-started,2),'seconds',flush=True)
captured=[]
original_infer=model.songformer.infer
def capture_infer(*args,**kwargs):
    chunk_index=len(feature_chunks)
    start=chunk_index*config.hop_size
    duration=len(audio)/sr
    item=capture.save_features(features_out/(slug+".features-"+str(chunk_index)+".npz"),kwargs["input_embeddings"].detach().cpu().numpy().copy(),min(duration-start,config.win_size),start)
    value=original_infer(*args,**kwargs)
    feature_chunks.append(item)
    if kwargs.get('with_logits'):
        captured.append({k:v.detach().cpu().numpy() for k,v in value[1].items()})
    return value
model.songformer.infer=capture_infer
def instrument(owner,method,name):
    original=getattr(owner,method)
    @functools.wraps(original)
    def wrapped(*args,**kwargs):
        t=time.perf_counter();print(name,'input',list(args[0].shape),flush=True)
        result=original(*args,**kwargs)
        print(name,'done',round(time.perf_counter()-t,2),'seconds',flush=True)
        return result
    setattr(owner,method,wrapped)
instrument(model.muq,'forward','MuQ')
instrument(model.musicfm,'get_predictions','MusicFM')
out=ROOT/'outputs/song-structure/songformer-experiment';out.mkdir(exist_ok=True)
for slug in sys.argv[1:] or ['overjoyed']:
    path=ROOT/'outputs/song-structure/model-comparison/media'/(slug+'.mp3')
    source_digest=hashlib.sha256(path.read_bytes()).hexdigest()
    decoded=out/(slug+'.wav')
    # Decoding is cheap: regenerate instead of trusting a same-named stale WAV.
    subprocess.run([str(ROOT/'node_modules/ffmpeg-static/ffmpeg.exe'),'-v','error','-y','-i',str(path),'-ac','1','-ar','24000',str(decoded)],check=True)
    audio,sr=sf.read(decoded,dtype='float32');assert sr==24000
    feature_chunks.clear();captured.clear();started=time.perf_counter()
    with torch.inference_mode():raw=model(audio)
    pass
    assert hashlib.sha256(path.read_bytes()).hexdigest()==source_digest,'Source changed during inference'
    result={'engine':'songformer-author-pinned','source_hash':source_digest,
            'duration':len(audio)/sr,'segments':raw,'checkpoint':verification,
            'inputs':'Decoded full mix only. No references, saved chart, lyrics, title or manual answers.',
            'preprocessing':'FFmpeg mono 24kHz PCM16 -> float32; unchanged author fp32 feature/model/decoder.',
            'elapsed_seconds':time.perf_counter()-started,'peak_cuda_allocated_bytes':0}
    (out/(slug+'.raw.json')).write_text(json.dumps(result,indent=2,allow_nan=False)+'\n',encoding='utf-8')
    for i,logits in enumerate(captured):np.savez_compressed(out/(slug+'.logits-'+str(i)+'.npz'),**logits)
    chunks=[]
    for i,item in enumerate(feature_chunks):
        target=features_out/(slug+'.logits-'+str(i)+'.npz')
        np.savez_compressed(target,**captured[i])
        item.update(head_logits_file=target.name,head_logits_sha256=hashlib.sha256(target.read_bytes()).hexdigest())
        chunks.append(item)
    metadata={'schema_version':1,'source_hash':source_digest,'duration':len(audio)/sr,
        'checkpoint_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'chunks':chunks,
        'inference_inputs':'Full-mix audio only. No sections, reference annotations, lyrics or expected roles.',
        'runner_sha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest()}
    (features_out/(slug+'.json')).write_text(json.dumps(metadata,indent=2)+'\n',encoding='utf-8')
    print(slug,'RESULT',raw,flush=True)
