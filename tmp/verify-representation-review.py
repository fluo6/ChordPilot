"""Verify the presentation refresh without weakening historical integrity checks."""
import hashlib
import json
from pathlib import Path
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'outputs/song-structure/representation-stages'
REVIEW = ROOT / 'outputs/song-structure/overjoyed-benchmark/review'
read = lambda p: json.loads(p.read_text(encoding='utf-8'))
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
baseline = read(OUT / 'integrity-baseline.json')
assert all(sha(Path(path)) == digest for path, digest in baseline.items()), 'Protected input changed'
retained = read(REVIEW / 'manifest.json')
expanded = read(REVIEW / 'representation-manifest.json')
assert retained == read(OUT / 'stage-3-before-manifest.json')
assert len(retained['tracks']) == len(expanded['tracks']) == 5
for original, track in zip(retained['tracks'], expanded['tracks']):
    assert original == {k: v for k, v in track.items() if k != 'representation'}
    evidence = track['representation']
    report_path = OUT / 'recurrence' / (track['id'] + '.json')
    report = read(report_path)
    assert sha(report_path) == sha(REVIEW / evidence['raw'])
    assert evidence['pairs'] == report['pairs']
    assert evidence['occurrences'] == report['occurrences']
    assert evidence['unanimous'] == report['summary']['unanimous_reciprocal_pairs']
    assert report['selected_partition'] is None and report['independent_accuracy'] is None
assert sha(REVIEW / 'structure-representation-review.js') == sha(ROOT / 'scripts/testing/structure-representation-review.js')
html = (REVIEW / 'index.html').read_text(encoding='utf-8')
embedded = html.split('<script id="data" type="application/json">', 1)[1].split('</script>', 1)[0]
current_path = REVIEW / 'current-manifest.json'
current = read(current_path) if current_path.exists() else expanded
assert json.loads(embedded) == current
assert len(current['tracks']) == len(expanded['tracks'])
for original, track in zip(expanded['tracks'], current['tracks']):
    assert original == {**track, 'variants': [v for v in track['variants'] if v['id'] not in ('native-recurrence','contextual-recurrence')]}
    for candidate in [v for v in track['variants'] if v['id'] in ('native-recurrence','contextual-recurrence')]:
        folder = 'contextual-role-candidate' if candidate['id']=='contextual-recurrence' else 'native-recurrence-candidate'
        source = ROOT / 'outputs/song-structure' / folder / (track['id'] + '.json')
        assert sha(source) == sha(REVIEW / candidate['raw'])
        assert [{k:v for k,v in r.items() if k != 'start_bar'} for r in candidate['segments']] == read(source)['segments']
assert 'for(const row of el(\'rows\').closest(\'table\')' in html
assert 'CPRepresentationReview.saveNaming' in html and 'CPRepresentationReview.loadNaming' in html
result = {'verified_at': datetime.now(timezone.utc).isoformat(), 'protected_files_unchanged': len(baseline),
          'retained_variants_unchanged': True, 'original_sessions_updated': False,
          'promotion': 'none; independent musical accuracy not established',
          'evidence_tracks': len(expanded['tracks']),
          'review_artifacts': {p.name: sha(p) for p in [REVIEW / 'manifest.json',
               REVIEW / 'representation-manifest.json', REVIEW / 'index.html', REVIEW / 'structure-representation-review.js']}}
destination = (ROOT / 'outputs/song-structure/native-recurrence-candidate/representation-review-verification.json'
               if current != expanded else OUT / 'stage-3-verification.json')
destination.write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
