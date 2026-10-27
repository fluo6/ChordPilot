"""Reference-free decoder experiment on cached All-In-One audio activations.

No reference, chart, song title or saved label argument is accepted. This is an
evaluation candidate, not the application's production detector.
"""
import argparse
import json
from pathlib import Path

import numpy as np


LABELS=('start','end','intro','outro','break','bridge','inst','solo','verse','chorus')


def peaks(values,window):
    padded=np.pad(values,(window,window))
    maximum=np.lib.stride_tricks.sliding_window_view(padded,2*window+1).max(axis=1)
    return np.flatnonzero((values==maximum)&(values>0))


def decode(section,labels,duration,*,fps=100,window_seconds=12,edge_guard_seconds=0):
    section=np.asarray(section);labels=np.asarray(labels)
    if (section.ndim!=1 or not len(section) or labels.shape!=(len(LABELS),len(section))
            or not np.isfinite(section).all() or not np.isfinite(labels).all()
            or not np.isfinite([duration,fps,window_seconds,edge_guard_seconds]).all()
            or min(duration,fps,window_seconds)<=0
            or edge_guard_seconds<0
            or not (len(section)-1)/fps<=duration<=len(section)/fps):
        raise ValueError('Expected finite aligned activations covering the recording at the supplied fps.')
    candidates=section.copy()
    if edge_guard_seconds:
        # Recording edges are already forced boundaries, not internal competitors.
        candidates[:int(np.ceil(edge_guard_seconds*fps))]=0
        candidates[int(np.ceil((duration-edge_guard_seconds)*fps)):]=0
    cuts=peaks(candidates,max(1,round(window_seconds*fps)))
    cuts=np.unique(np.r_[0,cuts[cuts>0],len(section)])
    rows=[]
    for left,right in zip(cuts[:-1],cuts[1:]):
        start=left/fps;end=min(right/fps,duration)
        if end<=start:continue
        rows.append({'start':start,'end':end,'label':LABELS[int(labels[:,left:right].mean(axis=1).argmax())]})
    return rows


def beat_period(activation,fps=100):
    indices=peaks(np.asarray(activation),max(1,round(.2*fps)))
    indices=indices[np.asarray(activation)[indices]>=.19]
    intervals=np.diff(indices)/fps
    plausible=intervals[(intervals>=.3)&(intervals<=1.5)]
    if len(plausible)<4:raise ValueError('Insufficient beat evidence for a beat-scaled window.')
    return float(np.median(plausible))


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--activations',type=Path,required=True)
    parser.add_argument('--duration',type=float,required=True)
    parser.add_argument('--source-hash',required=True)
    parser.add_argument('--window-seconds',type=float)
    parser.add_argument('--edge-guard-beats',type=float,default=0)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    with np.load(args.activations,allow_pickle=False) as arrays:
        period=beat_period(arrays['beat'])
        window=args.window_seconds if args.window_seconds is not None else 4*period
        result={'engine':'allinone-decoder-window-experiment-v1','source_hash':args.source_hash,
                'duration':args.duration,'inputs':'Cached audio model activations only; no reference or chart.',
                'parameters':{'fps':100,'window_seconds':window,'beat_period_seconds':period,
                              'edge_guard_seconds':args.edge_guard_beats*period,
                              'label_rule':'Unchanged mean probability argmax per decoded interval.'},
                'segments':decode(arrays['segment'],arrays['label'],args.duration,window_seconds=window,
                                  edge_guard_seconds=args.edge_guard_beats*period)}
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(result,indent=2,allow_nan=False)+'\n',encoding='utf-8')
    print(json.dumps({'output':str(args.output),'parameters':result['parameters'],'segments':result['segments']}))


if __name__=='__main__':main()
