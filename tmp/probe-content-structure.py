"""Throwaway, reference-free Laplacian content-segmentation probe.

Based on McFee/Ellis 2014 and Brian McFee's ISC-licensed librosa example.
Uses installed libraries. No reference annotations or saved chart are loaded.
"""
import os,pathlib,sys,json,hashlib,time,subprocess

ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tmp/structure-neural-deps'))
os.environ['NUMBA_CACHE_DIR']=str(ROOT/'tmp/structure-model-cache/numba')
os.environ['OMP_NUM_THREADS']='6'
os.environ['OPENBLAS_NUM_THREADS']='6'
os.environ['MKL_NUM_THREADS']='6'
import numpy as np
import scipy.linalg,scipy.ndimage,scipy.sparse.csgraph
import sklearn.cluster,sklearn.metrics
import librosa
from threadpoolctl import threadpool_limits
threadpool_limits(6)

slug=sys.argv[1]
out=ROOT/'outputs/song-structure/overjoyed-benchmark/content'/slug
out.mkdir(parents=True,exist_ok=True)
audio=ROOT/'outputs/song-structure/model-comparison/media'/(slug+'.mp3')
activation=ROOT/'outputs/song-structure/neural-functional-experiment'/(slug+'.activations.npz')
source_hash=hashlib.sha256(audio.read_bytes()).hexdigest()
activation_meta=json.loads(activation.with_name(slug+'.provenance.json').read_text())
assert activation_meta['source_hash']==source_hash,'Beat cache belongs to another recording'
sys.path.insert(0,str(ROOT/'scripts/testing'))
import importlib.util
spec=importlib.util.spec_from_file_location('decoder',ROOT/'scripts/testing/structure-decoder-experiment.py')
decoder=importlib.util.module_from_spec(spec);spec.loader.exec_module(decoder)
started=time.perf_counter()
features=out/'features.npz'
cached_identity=None
if features.exists():
    with np.load(features,allow_pickle=False) as existing:
        cached_identity=str(existing['source_hash']) if 'source_hash' in existing else None
if cached_identity!=source_hash:
    decoded=out/'audio.wav'
    subprocess.run([str(ROOT/'node_modules/ffmpeg-static/ffmpeg.exe'),'-v','error','-y','-i',str(audio),'-ac','1','-ar','22050',str(decoded)],check=True)
    y,sr=librosa.load(decoded,sr=None)
    duration=len(y)/sr
    arrays=np.load(activation)
    # Local model beat peaks, not the app's potentially edited grid.
    period=decoder.beat_period(arrays['beat'])
    beats=decoder.peaks(arrays['beat'],round(period*100*.4))
    beats=beats[arrays['beat'][beats]>.19]/100
    beat_frames=np.unique(np.r_[0,librosa.time_to_frames(beats,sr=sr)])
    if len(beat_frames)>2048:raise ValueError('Probe limited to 2048 beat bins.')
    print(slug,'CQT/MFCC',len(beat_frames),'beat bins',flush=True)
    cqt=librosa.amplitude_to_db(np.abs(librosa.cqt(y=y,sr=sr,bins_per_octave=36,n_bins=252)),ref=np.max)
    mfcc=librosa.feature.mfcc(y=y,sr=sr)
    sync_c=librosa.util.sync(cqt,beat_frames,aggregate=np.median)
    sync_m=librosa.util.sync(mfcc,beat_frames)
    times=np.r_[librosa.frames_to_time(beat_frames,sr=sr),duration]
    assert sync_c.shape[1]==sync_m.shape[1]==len(times)-1
    np.savez_compressed(features,cqt=sync_c,mfcc=sync_m,times=times,duration=duration,source_hash=np.asarray(source_hash))
else:
    print(slug,'cached features',flush=True)
cached=np.load(features)
if '--features-only' in sys.argv:
    print(slug,'FEATURES ONLY complete',flush=True);sys.exit(0)
C,M,times=cached['cqt'],cached['mfcc'],cached['times']
duration=float(cached['duration'])
R=librosa.segment.recurrence_matrix(C,width=3,mode='affinity',sym=True)
Rf=librosa.segment.timelag_filter(scipy.ndimage.median_filter)(R,size=(1,7))
distance=np.sum(np.diff(M,axis=1)**2,axis=0)
path=np.exp(-distance/max(float(np.median(distance)),1e-12))
Rp=np.diag(path,1)+np.diag(path,-1)
dp,dr=Rp.sum(axis=1),Rf.sum(axis=1)
mu=float(dp.dot(dp+dr)/max(np.sum((dp+dr)**2),1e-12))
A=mu*Rf+(1-mu)*Rp
values,vectors=scipy.linalg.eigh(scipy.sparse.csgraph.laplacian(A,normed=True))
vectors=scipy.ndimage.median_filter(vectors,size=(9,1))
norm=np.sqrt(np.cumsum(vectors**2,axis=1))
arrays=np.load(activation)
variants=[]
for k in range(2,min(9,len(times)-1)):
    X=vectors[:,:k]/np.maximum(norm[:,k-1:k],1e-12)
    ids=sklearn.cluster.KMeans(n_clusters=k,n_init=20,random_state=0).fit_predict(X)
    # Data-only choice; no benchmark labels, section count or timestamps.
    silhouette=float(sklearn.metrics.silhouette_score(X,ids))
    starts=np.r_[0,np.flatnonzero(np.diff(ids)!=0)+1]
    ends=np.r_[starts[1:],len(ids)]
    letters={};rows=[]
    for left,right in zip(starts,ends):
        group=letters.setdefault(int(ids[left]),chr(65+len(letters)))
        t0,t1=float(times[left]),float(times[right])
        p=arrays['label'][:,int(t0*100):max(int(t0*100)+1,int(t1*100))].mean(axis=1)
        label=decoder.LABELS[int(p.argmax())]
        # Uncalibrated scores; uncertain semantics stay unknown, not guessed.
        role=('instrumental' if label=='inst' else label) if float(p.max())>=.8 and label not in ('start','end','break') else None
        rows.append({'id':'s'+str(len(rows)+1),'start':t0,'end':t1,'group':group,'role':role,
                     'evidence':{'label_candidate':label,'mean_model_probability':float(p.max())}})
    result={'engine':'laplacian-content-experiment-v1','source_hash':hashlib.sha256(audio.read_bytes()).hexdigest(),
            'duration':duration,'parameters':{'clusters':k,'silhouette':silhouette,'selection':'maximum silhouette in normalized eigenvector space; no reference access','semantic_acceptance':.8},
            'inputs':'Full mix CQT/MFCC and cached model beat/label activations only. No chart, reference or manual labels.',
            'segments':rows}
    (out/('k'+str(k)+'.json')).write_text(json.dumps(result,indent=2)+'\n')
    variants.append(result)
selected=max(variants,key=lambda v:v['parameters']['silhouette'])
(out/'selected.json').write_text(json.dumps(selected,indent=2)+'\n')
(out/'summary.json').write_text(json.dumps({'elapsed_seconds':time.perf_counter()-started,'selected_k':selected['parameters']['clusters'],'variants':[{'k':v['parameters']['clusters'],'silhouette':v['parameters']['silhouette'],'segments':len(v['segments'])} for v in variants]},indent=2)+'\n')
print(slug,'SELECTED',selected['parameters'],[(round(r['start'],2),round(r['end'],2),r['group'],r['role']) for r in selected['segments']],flush=True)
