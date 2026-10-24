"""Read-only signal diagnostics. These are not annotated transcription accuracy."""
import argparse
import hashlib
import json
import sys
from collections import Counter
from pathlib import Path

import numpy as np
from scipy import signal
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'backend'))
from chordpilot_audio import load_audio
from chordpilot_bass import periodic_bass_pitch


def transient_evidence(audio,sr):
    _,times,stft=signal.stft(audio,fs=sr,nperseg=512,noverlap=402,boundary='zeros')
    magnitude=np.abs(stft)
    flux=np.maximum(0,np.diff(magnitude,axis=1,prepend=magnitude[:,:1])).sum(axis=0)
    flux/=max(float(flux.max()),1e-12)
    peaks,_=signal.find_peaks(flux,prominence=.08,distance=max(1,round(.07*sr/110)))
    return times,flux,times[peaks]


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--session',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--bars',type=int,default=12)
    args=parser.parse_args()
    original=args.session.read_bytes();session=json.loads(original.decode('utf-8-sig'));chart=session['chart']
    bars=chart['bars'][:args.bars];end=chart['bars'][len(bars)]['start'] if len(chart['bars'])>len(bars) else chart['duration']
    paths={stem['name']:Path(stem['path']) for stem in chart['stems']['stems']}
    audio={}
    for name in ['bass','drums','other']:
        x,sr=load_audio(paths[name]);audio[name]=x[:round(end*sr)]
    times,flux,peaks=transient_evidence(audio['drums'],sr)
    hits=[dict(hit) for hit in chart.get('drums',{}).get('events',[]) if bars[0]['start']<=hit['time']<end]
    for hit in hits:
        nearest=min(peaks,key=lambda t:abs(t-hit['time']),default=None)
        hit['nearest_flux_peak_ms']=round(float(nearest-hit['time'])*1000,1) if nearest is not None else None
    bass=[];rows=[]
    for i,bar in enumerate(bars):
        stop=bars[i+1]['start'] if i+1<len(bars) else end
        notes=[]
        for note in bar.get('bass_events',[]):
            item=dict(note);duration=note['end']-note['start']
            chunk=audio['bass'][round(note['start']*sr):round(note['end']*sr)]
            pitch=periodic_bass_pitch(chunk,sr,np,minimum_duration=.06)
            item['whole_event_periodicity_midi']=pitch[0] if pitch else None
            item['duration_ms']=round(duration*1000,1)
            item['review_flags']=(['short event (<120 ms)'] if duration<.12 else [])
            if pitch and pitch[0]!=note['midi']:item['review_flags'].append('whole-event pitch differs')
            notes.append(item);bass.append(item)
        rows.append({'bar':bar.get('number',i+1),'start':bar['start'],'end':stop,
            'chords':[{'start':e['start'],'end':e['end'],'chord':e['chord'],
                'alternatives':[{'chord':a['chord'],'raw_score':a.get('raw_score')}for a in e.get('alternatives',[])[:3]],
                'cell_detections':[{'start':c.get('start'),'end':c.get('end'),'chord':c.get('debug',{}).get('detected_chord',c.get('chord'))} for c in e.get('debug',{}).get('cells',[])]}
                for e in bar.get('chord_events',[])],
            'bass_events':notes,'bass_sounding_seconds':round(sum(n['end']-n['start']for n in notes),3),
            'drum_counts':dict(Counter(h['instrument']for h in hits if bar['start']<=h['time']<stop))})
    distances=[abs(h['nearest_flux_peak_ms'])for h in hits if h['nearest_flux_peak_ms']is not None]
    report={'session':str(args.session),'sha256':hashlib.sha256(original).hexdigest(),
        'warning':'Read-only DSP checks, not human-verified notes or kit classes. Flux support cannot validate instrument identity. Whole-event YIN is the same estimator, not independent ground truth.',
        'drum_model':chart.get('drums',{}).get('model'),'range':[bars[0]['start'],end],
        'drum_hits':len(hits),'drum_counts':dict(Counter(h['instrument']for h in hits)),
        'flux_parameters':{'frame':512,'hop':110,'peak_prominence_relative_to_global_max':.08,'minimum_peak_separation_s':.07},
        'hits_with_flux_peak_within_80ms':sum(d<=80 for d in distances),'median_nearest_flux_peak_ms':round(float(np.median(distances)),1) if distances else None,
        'bass_events':len(bass),'short_bass_events':sum(n['duration_ms']<120 for n in bass),
        'bars':rows,'drum_evidence':hits}
    args.output.mkdir(parents=True,exist_ok=True)
    (args.output/'audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
    fig,axes=plt.subplots(3,1,figsize=(16,8),sharex=True,layout='constrained')
    axes[0].plot(times,flux,color='#555',lw=.8,label='Drum-stem spectral flux')
    colors={'kick':'#bb5533','snare':'#a24baa','hihat':'#267e9c','tom':'#827820','cymbal':'#34864a'}
    for instrument in colors:
        group=[h for h in hits if h['instrument']==instrument]
        axes[0].scatter([h['time']for h in group],[.12+.16*list(colors).index(instrument)]*len(group),s=14,label=f'{instrument} (inferred)',color=colors[instrument])
    axes[0].legend(ncol=3,fontsize=8);axes[0].set_ylabel('Transient evidence')
    for n in bass:
        axes[1].plot([n['start'],n['end']],[n['midi']]*2,lw=3,color='#ba6940' if n['review_flags']else '#258479')
    axes[1].set_ylabel('Bass MIDI');axes[1].grid(axis='y',alpha=.2)
    t=np.arange(0,len(audio['other']),220)/sr
    amp=[np.sqrt(np.mean(audio['other'][i:i+220]**2))for i in range(0,len(audio['other']),220)]
    axes[2].plot(t,amp,lw=.7,color='#555');axes[2].set_ylabel('Other stem RMS');axes[2].set_xlabel('Original audio time (s)')
    for row in rows:
        for ax in axes:ax.axvline(row['start'],color='#aaa',lw=.6)
        axes[2].text(row['start']+.05,max(amp)*.85,str(row['bar']),fontsize=8)
    fig.suptitle('Overjoyed: recording evidence and unverified detector events (bars 1–12)')
    fig.savefig(args.output/'signal-audit.png',dpi=145);plt.close(fig)
    assert args.session.read_bytes()==original,'Source session changed during audit'
    print(json.dumps({key:value for key,value in report.items()if key not in ['bars','drum_evidence']},ensure_ascii=True))

if __name__=='__main__':main()
