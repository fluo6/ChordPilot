"""Reference-free content consensus on fine SongFormer segments; research only."""
import pathlib,sys,json,importlib.util
import numpy as np
ROOT=pathlib.Path(__file__).resolve().parents[1]
base=ROOT/'outputs/song-structure/songformer-experiment'
slug=sys.argv[1] if len(sys.argv)>1 else 'overjoyed'
d=json.loads((base/(slug+'.window-6.0.json')).read_text())
features=np.load(ROOT/('outputs/song-structure/overjoyed-benchmark/content/'+slug+'/features.npz'))
beat=np.load(ROOT/'outputs/song-structure/neural-functional-experiment'/(slug+'.activations.npz'))
beat_meta=json.loads((ROOT/'outputs/song-structure/neural-functional-experiment'/(slug+'.provenance.json')).read_text())
if str(features['source_hash'])!=d['source_hash'] or beat_meta['source_hash']!=d['source_hash']:
    raise ValueError('Feature/model inputs belong to different recordings.')
spec=importlib.util.spec_from_file_location('decoder',ROOT/'scripts/testing/structure-decoder-experiment.py')
decoder=importlib.util.module_from_spec(spec);spec.loader.exec_module(decoder)
period=decoder.beat_period(beat['beat'])
idx=decoder.peaks(beat['downbeat'],round(period*100*1.5))
grid=idx[beat['downbeat'][idx]>=.19]/100
cuts=[0.]
for row in d['segments'][1:]:
    native=row['start'];nearest=grid[np.argmin(abs(grid-native))]
    cut=float(nearest) if abs(nearest-native)<=1.5*period else native
    if not cuts[-1]<cut<d['duration']:raise ValueError('Meter refinement collapsed or inverted a section; retain native result instead.')
    cuts.append(cut)
cuts.append(d['duration'])
rows=[{'start':left,'end':right,'native_label':r['label']} for left,right,r in zip(cuts[:-1],cuts[1:],d['segments'])]
C=10**(features['cqt']/20)
C=C.reshape(7,36,-1).sum(axis=0).T
C/=np.maximum(np.linalg.norm(C,axis=1,keepdims=True),1e-8)
times=(features['times'][:-1]+features['times'][1:])/2
desc=[]
texture=features['mfcc'][1:].T
texture/=np.maximum(np.linalg.norm(texture,axis=1,keepdims=True),1e-8)
def describe(row):
    positions=row['start']+(np.arange(16)+.5)*(row['end']-row['start'])/16
    def sample(values):
        v=np.stack([np.interp(positions,times,values[:,j]) for j in range(values.shape[1])],axis=1)
        return v/np.maximum(np.linalg.norm(v,axis=1,keepdims=True),1e-8)
    return sample(C),sample(texture)
def content_distance(left,right,length_ratio=1.,warp=False):
    a,ta=left;b,tb=right
    if float(1-(ta*tb).sum(axis=1).mean())>.3:return 1.
    distances=[]
    for shift in range(12):
        rolled=np.roll(b,shift*3,axis=1)
        if warp:
            cost=np.maximum(0,1-a@rolled.T)
            dp=np.full((17,17),np.inf);dp[0,0]=0
            for i in range(16):
                for j in range(16):dp[i+1,j+1]=cost[i,j]+min(dp[i,j],dp[i,j+1],dp[i+1,j])
            distances.append(float(dp[-1,-1]/16))
        else:distances.append(float(1-(a*rolled).sum(axis=1).mean()))
    return min(distances)+.1*abs(np.log(length_ratio))
# Counterexamples: common harmony alone and reversed musical order are not repeats.
toy=np.eye(36)[[0,3,9,15]*4];t=np.tile([1.,0],(16,1))
assert content_distance((toy,t),(toy,np.tile([0.,1],(16,1))))>.12
assert content_distance((toy,t),(toy[::-1],t),warp=True)>.12
for r in rows:
    desc.append(describe(r))
distance=np.zeros((len(rows),len(rows)))
for i,left in enumerate(desc):
    for j,right in enumerate(desc[:i]):
        ratio=(rows[i]['end']-rows[i]['start'])/(rows[j]['end']-rows[j]['start'])
        distance[i,j]=distance[j,i]=content_distance(left,right,ratio)
threshold=.12
clusters=[]
for i,r in enumerate(rows):
    match=next((c for c in clusters if all(distance[i,j]<=threshold for j in c)),None)
    if match is None:match=[];clusters.append(match)
    match.append(i)
    r['group']=chr(65+clusters.index(match))
log=np.load(base/(slug+'.logits-0.npz'))['function_logits'][0]
if abs(len(log)/8.333-d['duration'])>1/8.333:
    raise ValueError('Cached logits do not cover this recording; reject a cross-song cache mismatch.')
p=np.exp(log-np.max(log,axis=1,keepdims=True));p/=p.sum(axis=1,keepdims=True)
if not np.isfinite(p).all():raise ValueError('Model label activations contain invalid probabilities.')
prob=[p[int(r['start']*8.333):max(int(r['start']*8.333)+1,int(r['end']*8.333))].mean(axis=0) for r in rows]
names={0:'intro',1:'verse',2:'chorus',3:'bridge',4:'instrumental',5:'outro',6:'silence',26:'pre_chorus'}
spec=importlib.util.spec_from_file_location('role_consensus',ROOT/'scripts/testing/structure-role-consensus.py')
role_consensus=importlib.util.module_from_spec(spec);spec.loader.exec_module(role_consensus)
decisions=role_consensus.consensus_roles(prob,clusters,
    [r['native_label'] in ('verse','chorus','pre-chorus','bridge') for r in rows])
for r,decision in zip(rows,decisions):
    r['role']=names[decision['class_id']] if decision['class_id'] is not None else None
    r['model_probability']=decision['score']
    r['role_evidence']=[{'start':r['start'],'end':r['end'],**decision}]
# A recurring content group that starts an accepted role can mark subsequent
# occurrences, even when the adjacent occurrence has the same role.
anchors={(r['group'],r['role']) for i,r in enumerate(rows) if r['role'] and (i==0 or rows[i-1]['role']!=r['role'])}
merged=[]
for r in rows:
    if (merged and r['role'] and merged[-1]['role']==r['role']
            and (r['group'],r['role']) not in anchors):
        merged[-1]['end']=r['end'];merged[-1]['content_groups'].append(r['group'])
        merged[-1]['role_evidence'].extend(r['role_evidence'])
        merged[-1]['model_probability']=min(merged[-1]['model_probability'],r['model_probability'])
    else:merged.append({**r,'content_groups':[r['group']],'role_evidence':list(r['role_evidence'])})
# Musical-form view attaches native terminal silence/padding to the preceding
# occurrence; retain the exact native intervals separately for playback/audit.
if len(merged)>1 and merged[-1]['native_label']=='silence':
    merged[-2]['end']=merged[-1]['end'];merged[-2]['content_groups']+=merged[-1]['content_groups']
    merged[-2]['role_evidence'].extend(merged[-1]['role_evidence']);merged.pop()
families=[];coarse=[describe(r) for r in merged]
for i,r in enumerate(merged):
    r['id']='c'+str(i+1)
    match=next((family for family in families if all(content_distance(coarse[i],coarse[j],
               (r['end']-r['start'])/(merged[j]['end']-merged[j]['start']),warp=True)<=threshold for j in family)),None)
    if match is None:match=[];families.append(match)
    match.append(i);r['group']=chr(65+families.index(match))
result={'engine':'songformer-content-consensus-experiment-v3','duration':d['duration'],'source_hash':d['source_hash'],
        'parameters':{'content_distance':threshold,'texture_veto':.3,'role_acceptance':.8,'source_time_refinement':'nearest independent audio-model downbeat within 1.5 beat periods','beat_period':period,'terminal_silence_policy':'Attach to preceding musical occurrence; exact native rows retained.','coarse_groups':'Complete-link DTW with global semitone transposition, duration penalty and texture veto.'},
        'inputs':'Audio-derived CQT sequences, SongFormer logits and All-In-One downbeat activations only; no reference/chart/answers.',
        'segments':merged,'fine_segments':rows,'distance_matrix':distance.tolist(),'raw_prediction':slug+'.window-6.0.json'}
result['parameters']['role_consensus']='Preserve strong occurrence evidence; pool only content peers with the same winning role. Never average conflicting roles.'
out=base/(slug+'.consensus-v3.json');out.write_text(json.dumps(result,indent=2,allow_nan=False)+'\n')
print('FINE',[(i+1,round(r['start'],2),r['group'],r['role'],round(r['model_probability'],2)) for i,r in enumerate(rows)])
print('MERGED',[(round(r['start'],2),round(r['end'],2),r['group'],r['role'],r['content_groups']) for r in merged])
