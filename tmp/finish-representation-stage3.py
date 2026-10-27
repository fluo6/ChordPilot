"""Finish the bounded pass; automation deletion is confirmed by the app tool."""
from pathlib import Path
import json
import subprocess
import sys
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'outputs/song-structure/representation-stages'
read = lambda p: json.loads(p.read_text(encoding='utf-8'))
subprocess.run([sys.executable, str(ROOT / 'tmp/verify-representation-review.py')], check=True)
v = read(OUT / 'stage-3-verification.json')
assert v['protected_files_unchanged'] == 27 and v['retained_variants_unchanged']
assert len(read(ROOT / 'outputs/song-structure/songformer-experiment/v3-verification.json')['tracks']) == 5
assert read(OUT / 'stage-2-verification.json')['recomputed_exactly']
assert read(OUT / 'stage-1-verification.json')['protected_files_unchanged'] == 27
assert 'STAGE 2 EXACT RECOMPUTATION VERIFIED' in (OUT / 'stage-3-recompute.log').read_text()
tests = (OUT / 'stage-3-structure-tests.log').read_text(encoding='utf-8')
naming = (OUT / 'stage-3-naming-tests.log').read_text(encoding='utf-8')
assert 'Ran 40 tests' in tests and '\nOK' in tests
assert 'pass 23' in naming and 'fail 0' in naming
browser = read(OUT / 'stage-3-browser-verification.json')
assert len(browser['tracks']) == 5 and browser['naming_groups_persisted_after_reload']
assert (ROOT / browser['screenshot']).exists()
path = OUT / 'queue.json';q = read(path)
assert q['stage_index'] == 2 and q['stages'][2]['status'] == 'running'
completed = datetime.now(timezone.utc).isoformat()
q['stages'][2].update(status='complete_with_unresolved_results', completed_at=completed,
    verification='outputs/song-structure/representation-stages/stage-3-verification.json',
    promotion='none', original_sessions_updated=False)
q.update(stage_index=3, status='completed_with_unresolved_results', completed_at=completed,
    next_not_before=None, latest_checkpoint='docs/superpowers/validation/2026-10-26-representation-stage-3.md',
    automation_deletion='pending_app_tool')
temp=path.with_suffix('.tmp');temp.write_text(json.dumps(q,indent=2)+'\n');temp.replace(path)
assert read(path)==q
print('Three-stage pass complete with unresolved accuracy; delete the automation now.')
