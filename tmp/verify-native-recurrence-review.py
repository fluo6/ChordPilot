"""Verify candidate presentation and preservation of historical variants."""
from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'outputs/song-structure'
REVIEW = BASE / 'overjoyed-benchmark/review'
read = lambda p: json.loads(p.read_text(encoding='utf-8'))
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
historical = read(REVIEW / 'representation-manifest.json')
current = read(REVIEW / 'current-manifest.json')
assert len(current['tracks']) == len(historical['tracks']) == 5
for prior, track in zip(historical['tracks'], current['tracks']):
    candidates = [v for v in track['variants'] if v['id'] == 'native-recurrence']
    assert len(candidates) == 1
    candidate = candidates[0]
    stripped = {**track, 'variants': [v for v in track['variants'] if v['id'] not in ('native-recurrence','contextual-recurrence')]}
    assert stripped == prior, 'Historical variant/evidence changed'
    path = BASE / 'native-recurrence-candidate' / (track['id'] + '.json')
    report = read(path)
    assert sha(path) == sha(REVIEW / candidate['raw'])
    assert [{k:v for k,v in r.items() if k != 'start_bar'} for r in candidate['segments']] == report['segments']
    source = read(BASE / 'songformer-experiment' / (track['id'] + '.raw.json'))
    assert [(r['start'], r['end']) for r in candidate['segments']] == [(r['start'], r['end']) for r in source['segments']]
    assert all('group' not in r for r in candidate['segments'])
    assert 'hypotheses' in candidate['description']
html = (REVIEW / 'index.html').read_text(encoding='utf-8')
embedded = html.split('<script id="data" type="application/json">', 1)[1].split('</script>', 1)[0]
assert json.loads(embedded) == current
assert "get('method')" in html
baseline = read(BASE / 'representation-stages/integrity-baseline.json')
assert all(sha(Path(path)) == digest for path,digest in baseline.items())
result = {'tracks': 5, 'historical_variants_unchanged': True,
          'protected_files_unchanged': len(baseline), 'native_boundaries_unchanged': True,
          'manual_role_corrections': False, 'sessions_updated': False,
          'current_manifest_sha256': sha(REVIEW / 'current-manifest.json')}
(BASE / 'native-recurrence-candidate/review-verification.json').write_text(json.dumps(result, indent=2)+'\n')
print(json.dumps(result, indent=2))
