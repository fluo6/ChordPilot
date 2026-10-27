"""Presentation-only extension of the existing five-song listening benchmark."""
from pathlib import Path
import hashlib,json,shutil
ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'outputs/song-structure'
OUT=BASE/'additional-song-candidates'
REVIEW=BASE/'overjoyed-benchmark/review'
read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
slug='forever-love'
source=read(BASE/'songformer-experiment'/(slug+'.raw.json'))
candidate=read(OUT/(slug+'.json'))
display=read(OUT/(slug+'-display.json'))
assert source['source_hash']==candidate['source_hash']==display['source_sha256']
assert hashlib.sha256(Path(display['session_path']).read_bytes()).hexdigest()==display['session_sha256']
variants=[]
for ident,title,filename,report in [
    ('native','SongFormer · native output',slug+'.raw.json',source),
    ('contextual-recurrence','Candidate · context-aware roles',slug+'.contextual-roles.json',candidate)]:
    rows=[]
    for row in report['segments']:
        r=dict(row)
        if ident=='native':
            r.update(native_label=r['label'],role={'silence':None,'inst':'instrumental','pre-chorus':'pre_chorus'}.get(r['label'],r['label']))
        r['start_bar']=min(range(len(display['bar_starts'])),key=lambda i:abs(display['bar_starts'][i]-r['start']))+1
        rows.append(r)
    (REVIEW/filename).write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    variants.append({'id':ident,'title':title,'raw':filename,'segments':rows,
        'description':str(len(rows))+' audio-derived occurrences. Frozen model and contextual rules; no bridge was inserted manually. CPU fp32 inference after GPU memory exhaustion. Roles and boundaries need listening review.',
        'provenance':'Full-mix audio only; no expected roles, lyric tags, reference timestamps or saved section labels in inference. Bar numbers are display hints on the saved bar grid. Full-mix features do not isolate vocal melody. Original session unchanged.'})
track={'id':slug,'title':'Forever Love','artist':'王力宏 Leehom Wang','duration':source['duration'],
       'media':'../../model-comparison/media/'+slug+'.mp3','variants':variants}
(OUT/'review-tracks.json').write_text(json.dumps({'tracks':[track]},indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
print(json.dumps({'sequence':[r['label'] for r in candidate['segments']], 'changes':candidate['summary']['changes']},ensure_ascii=False))
