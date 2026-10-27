"""Advance only after exact recomputation, test evidence and input verification."""
from pathlib import Path
import hashlib
import json
from datetime import datetime, timezone, timedelta

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'outputs/song-structure/representation-stages'
read = lambda p: json.loads(p.read_text(encoding='utf-8'))
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
verification = read(OUT / 'stage-2-verification.json')
assert verification['recomputed_exactly'] and len(verification['tracks']) == 5
assert verification['protected_files_unchanged'] == 27
assert not verification['independent_accuracy_established']
assert not verification['original_sessions_updated'] and verification['selected_partition'] is None
assert all(sha(ROOT / name) == digest for name, digest in verification['artifacts'].items())
assert all(sha(Path(name)) == digest for name, digest in read(OUT / 'integrity-baseline.json').items())
for path in (OUT / 'recurrence').glob('*.json'):
    report = read(path)
    assert report['helper_sha256'] == sha(ROOT / 'scripts/testing/structure-representation-recurrence.py')
    assert report['runner_sha256'] == sha(ROOT / 'tmp/evaluate-structure-representations.py')
    assert report['protocol_sha256'] == sha(ROOT / 'docs/superpowers/validation/2026-10-26-representation-stage-2-protocol.md')
    assert all(sha(ROOT / name) == digest for name, digest in report['inputs'].items())
tests = (OUT / 'stage-2-structure-tests.log').read_text(encoding='utf-8')
naming = (OUT / 'stage-2-naming-tests.log').read_text(encoding='utf-8')
assert 'Ran 40 tests' in tests and '\nOK' in tests
assert 'pass 20' in naming and 'fail 0' in naming
assert 'STAGE 2 EXACT RECOMPUTATION VERIFIED' in (OUT / 'stage-2-recompute.log').read_text()
queue_path = OUT / 'queue.json'
q = read(queue_path)
assert q['stage_index'] == 1 and q['stages'][1]['status'] == 'running'
started = datetime.fromisoformat('2026-10-26T14:56:33+00:00')
q['stages'][1]['ledger_written_at'] = q['stages'][1]['started_at']
q['stages'][1].update(status='complete_with_unresolved_results', started_at=started.isoformat(),
                       completed_at=datetime.now(timezone.utc).isoformat(),
                       verification='outputs/song-structure/representation-stages/stage-2-verification.json',
                       selected_partition=None, musical_accuracy_established=False)
q.update(stage_index=2, status='waiting_for_schedule', last_started_at=started.isoformat(),
         next_not_before=(started+timedelta(minutes=150)).isoformat(),
         latest_checkpoint='docs/superpowers/validation/2026-10-26-representation-stage-2.md',
         stage_start_note='Stage 2: first measured UTC tool time; ledger written after protocol/test setup.')
checkpoint = ROOT / q['latest_checkpoint']
assert checkpoint.exists()
temporary = queue_path.with_suffix('.tmp')
temporary.write_text(json.dumps(q, indent=2) + '\n')
temporary.replace(queue_path)
assert read(queue_path) == q
print('Stage 2 verified; checkpoint saved; stage 3 pending no earlier than ' + q['next_not_before'])
