"""Recompute chords from saved audio/stems and audio-derived beats, without reference labels."""
import argparse
import copy
import datetime
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'backend'))
import numpy as np
from chordpilot_analysis import attach_timed_chord_events
from chordpilot_audio import load_audio
from chordpilot_common import normalize_analysis_options


def write_session(chart, path):
    source = Path(chart['source_path'])
    options = chart['analysis_engine']['options']
    session = {'app':'ChordPilot','version':1,'saved_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'audio':{'path':str(source),'name':source.name,'title':chart['title'],'extension':source.suffix[1:].upper(),
                 'size':source.stat().st_size,'url':source.as_uri(),'exists':True},
        'chart':chart,'studies':[],'analysis':{'mode':'high-quality','options':options},
        'ui':{'selectedIndex':min(1,len(chart['bars'])-1),'selectedChordEventIndex':0,'activeIndex':min(1,len(chart['bars'])-1),'editorPanel':'table',
              'barsPerLine':2,'chartAutoFollow':True,'currentTime':chart['bars'][1]['start'] if len(chart['bars'])>1 else 0}}
    path.write_text(json.dumps(session,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--chart', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--session', type=Path, help='Also save an openable session containing exactly this audio-generated chart.')
    parser.add_argument('--stability', choices=['detailed','balanced','sustained'], default='balanced')
    parser.add_argument('--grid', choices=['beat','half_beat'], default='beat')
    parser.add_argument('--tail-reduction', type=float, default=.2)
    parser.add_argument('--overtones', type=float, help='Optional overtone-weighting experiment; otherwise preserve the saved value.')
    parser.add_argument('--source', choices=['other','full_mix'], default='other')
    parser.add_argument('--until', type=float, help='Shorten to a measured bar boundary for a focused experiment.')
    args = parser.parse_args()
    chart = copy.deepcopy(json.loads(args.chart.read_text(encoding='utf-8')))
    options = normalize_analysis_options({**chart['analysis_engine']['options'], 'chord_grid':args.grid,
        'chord_stability':args.stability, 'tail_reduction':args.tail_reduction, 'chord_source':args.source})
    if args.overtones is not None:
        options = normalize_analysis_options({**options,'overtone_weighting':args.overtones})
    paths = {stem['name']:stem['path'] for stem in chart['stems']['stems']}
    audio, sr = load_audio(Path(chart['source_path'] if args.source=='full_mix' else paths['other']))
    bass, bass_sr = load_audio(Path(paths['bass']))
    if args.until:
        end = next((bar['start'] for bar in chart['bars'] if bar['start'] >= args.until), chart['duration'])
        chart['bars'] = [bar for bar in chart['bars'] if bar['start'] < end]
        audio, bass = audio[:round(end*sr)], bass[:round(end*bass_sr)]
        chart['duration'] = end
        chart['beat_times'] = [beat for beat in chart['beat_times'] if beat < end]
    attach_timed_chord_events(chart['bars'],audio,sr,chart['tempo'],chart['time_signature'],chart['beat_times'],
        np,options,'full mix (explicit)' if args.source=='full_mix' else 'other/accompaniment stem',bass,bass_sr,chart['key'])
    chart['analysis_engine']['options'] = options
    chart['analysis_engine']['benchmark_provenance'] = 'Chords recomputed from audio; existing audio-derived key, beats and independent bass events retained. No reference labels supplied.'
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(chart,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    if args.session:
        write_session(chart,args.session)
    print(f'Saved {len(chart["bars"])} bars to {args.output}')


if __name__ == '__main__':
    main()
