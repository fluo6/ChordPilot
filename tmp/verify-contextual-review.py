"""Presentation integrity and development feedback evaluation, never inference."""
from pathlib import Path
import hashlib
import json

ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'outputs/song-structure'
OUT=BASE/'contextual-role-candidate'
REVIEW=BASE/'overjoyed-benchmark/review'
read=lambda p:json.loads(p.read_text(encoding='utf-8'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
before=read(OUT/'before-review.json');current=read(REVIEW/'current-manifest.json')
assert len(before['tracks'])==len(current['tracks'])==5
for old,track in zip(before['tracks'],current['tracks']):
    assert {**track,'variants':[v for v in track['variants'] if v['id']!='contextual-recurrence']}==old
    candidates=[v for v in track['variants'] if v['id']=='contextual-recurrence'];assert len(candidates)==1
    candidate=candidates[0];path=OUT/(track['id']+'.json');report=read(path)
    assert sha(path)==sha(REVIEW/candidate['raw'])
    assert [{k:v for k,v in row.items() if k!='start_bar'} for row in candidate['segments']]==report['segments']
    assert report['summary']['boundaries_unchanged'] and report['summary']['independent_accuracy'] is None
html=(REVIEW/'index.html').read_text(encoding='utf-8')
embedded=html.split('<script id="data" type="application/json">',1)[1].split('</script>',1)[0]
assert json.loads(embedded)==current
# Supplied sequence is deliberately confined to this evaluation script.
expected=['intro','verse','pre_chorus','chorus','chorus','verse','instrumental',
          'pre_chorus','chorus','chorus','verse','outro','unclassified']
report=read(OUT/'waste-of-time.json');actual=[r['role'] or 'unclassified' for r in report['segments']]
result={'source':'user listening feedback; development evaluation only','expected':expected,'actual':actual,
        'sequence_agreement':actual==expected,'boundaries_independently_evaluated':False,
        'independent_accuracy_established':False,'old_review_variants_unchanged':True}
(OUT/'development-feedback-evaluation.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
assert actual==expected
print(json.dumps(result,indent=2))
