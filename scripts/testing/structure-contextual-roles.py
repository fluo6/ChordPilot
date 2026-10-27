"""Audio-derived direct/sequence recurrence for uncertain native functional roles."""
import numpy as np

CLASS_IDS = {'intro':0,'verse':1,'chorus':2,'bridge':3,'inst':4,'outro':5,'silence':6,'pre-chorus':26}
ROLES = {'inst':'instrumental','pre-chorus':'pre_chorus','silence':None}
VOCAL = {'verse','chorus','pre-chorus','bridge'}


def _nearest(matrix, windows=False):
    result=[]
    for i in range(len(matrix)):
        peers=[j for j in range(len(matrix)) if (abs(i-j)>1 if windows else i!=j)]
        if not peers:
            result.append(None)
            continue
        minimum=min(matrix[i,j] for j in peers)
        tied=[j for j in peers if abs(matrix[i,j]-minimum)<=1e-12]
        result.append(tied[0] if len(tied)==1 else None)
    return result


def _reciprocal(neighbors, i):
    if not neighbors or i>=len(neighbors[0]):return None
    j=neighbors[0][i]
    return j if j is not None and all(v[i]==j and v[j]==i for v in neighbors) else None


def refine(rows, probabilities, views):
    """Keep native occurrences; original evidence is never updated by inferred roles.

    Successor context is a two-occurrence acoustic match, not a fixed song form.
    All views are correlated ablations; scores remain uncalibrated hypotheses.
    """
    p=np.asarray(probabilities,dtype=np.float64);n=len(rows)
    if (not n or p.ndim!=2 or p.shape[0]!=n or p.shape[1]<27
            or not np.isfinite(p).all() or np.any(p<0)
            or not np.allclose(p.sum(1),1,rtol=0,atol=1e-6)):
        raise ValueError('Expected normalized finite original posteriors.')
    for r in rows:
        if (r['label'] not in CLASS_IDS or not np.isfinite([r['start'],r['end']]).all()
                or r['start']<0 or r['end']<=r['start']):
            raise ValueError('Invalid native occurrence.')
    if any(abs(a['end']-b['start'])>1e-6 for a,b in zip(rows[:-1],rows[1:])):
        raise ValueError('Context requires chronological contiguous occurrences.')
    if len(views)!=8:raise ValueError('All eight feature views are required.')
    matrices=[]
    for value in views.values():
        d=np.asarray(value,dtype=np.float64)
        if (d.shape!=(n,n) or not np.isfinite(d).all() or np.any(d<0)
                or not np.allclose(d,d.T,rtol=0,atol=1e-12)
                or not np.allclose(np.diag(d),0,rtol=0,atol=1e-12)):
            raise ValueError('Invalid acoustic distances.')
        matrices.append(d)
    direct=[_nearest(d) for d in matrices]
    windows=[_nearest((d[:-1,:-1]+d[1:,1:])/2,windows=True) for d in matrices]

    def margin(q):
        top=np.sort(q)[-2:];return float(top[1]-top[0])

    def donor_supported(j):
        return (j is not None and rows[j]['label'] in VOCAL and p[j].max()>.5
                and p[j].argmax()==CLASS_IDS[rows[j]['label']])

    result=[]
    for i,row in enumerate(rows):
        label=row['label']
        decision={'basis':'native','donor_index':None,'proposals':[],
                  'native_class_probability':float(p[i,CLASS_IDS[label]]),
                  'native_max_probability':float(p[i].max()),'native_margin':margin(p[i])}
        if label in VOCAL and p[i].max()<.5:
            routes=[]
            j=_reciprocal(direct,i)
            if donor_supported(j):routes.append(('direct_recurrence',j))
            j=_reciprocal(windows,i)
            if donor_supported(j):
                a,b=i+1,j+1
                strong=(p[a].max()>=.8 and p[b].max()>=.8
                        and rows[a]['label']==rows[b]['label']
                        and p[a].argmax()==p[b].argmax()==CLASS_IDS[rows[a]['label']])
                repeated=_reciprocal(direct,a)==b
                ordered=all(d[i,j]+d[a,b]<d[i,b]+d[a,j]-1e-12 for d in matrices)
                if strong and repeated and ordered:routes.append(('successor_context',j))
            for basis,j in routes:
                pooled=(p[i]+p[j])/2
                winners=np.flatnonzero(np.abs(pooled-pooled.max())<=1e-12)
                proposed=rows[j]['label']
                if len(winners)==1 and winners[0]==CLASS_IDS[proposed]:
                    decision['proposals'].append({'basis':basis,'donor_index':j,'proposed_label':proposed,
                        'donor_class_probability':float(p[j,CLASS_IDS[proposed]]),
                        'pooled_class_score':float(pooled[CLASS_IDS[proposed]]),'pooled_margin':margin(pooled)})
            proposals=decision['proposals']
            labels={proposal['proposed_label'] for proposal in proposals}
            if len(labels)>1:
                decision['proposal_status']='withheld_route_conflict'
            elif proposals and proposals[0]['proposed_label']!=label:
                label=proposals[0]['proposed_label']
                decision.update(proposals[0]);decision['proposal_status']='applied'
        result.append({**row,'native_label':row['label'],'label':label,
                       'role':ROLES.get(label,label),'decision':decision})
    return result
