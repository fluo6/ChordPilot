"""Freeze integrity baselines and initialize the approved bounded stage queue."""
from pathlib import Path
import json
import hashlib
from datetime import datetime, timezone, timedelta

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'outputs/song-structure'
OUT = BASE / 'representation-stages'
OUT.mkdir(exist_ok=True)
read = lambda p: json.loads(p.read_text(encoding='utf-8'))
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
slugs = ['overjoyed', 'i-love-you-3000', 'waste-of-time', 'ballad', 'liangbo']
protected = {}
for slug in slugs:
    for suffix in ('.consensus-v3.json', '.raw.json', '.logits-0.npz'):
        p = BASE / 'songformer-experiment' / (slug + suffix)
        protected[str(p)] = sha(p)
    p = BASE / 'model-comparison/media' / (slug + '.mp3')
    protected[str(p)] = sha(p)
for entry in read(BASE / 'semantic-session-update/manifest.json')['tracks']:
    if entry['id'] == 'overjoyed':
        entry = read(BASE / 'overjoyed-benchmark/session-update/manifest.json')
    p = Path(entry['target'])
    protected[str(p)] = sha(p)
    assert protected[str(p)] == entry['after_sha256']
for p in [BASE / 'calibration-queue.json', BASE / 'overjoyed-benchmark/review/manifest.json']:
    protected[str(p)] = sha(p)
queue_path = OUT / 'queue.json'
assert not queue_path.exists(), 'Do not reset an existing queue'
now = datetime.now(timezone.utc)
queue = {'schema_version': 1, 'automation_id': 'chordpilot-richer-audio-stages',
    'status': 'running', 'stage_index': 0, 'minimum_start_spacing_minutes': 150,
    'created_at': now.isoformat(), 'last_started_at': now.isoformat(),
    'next_not_before': (now + timedelta(minutes=150)).isoformat(), 'songs': slugs,
    'stages': [{'name': 'Capture pinned audio representations', 'status': 'running'},
               {'name': 'Evaluate recurrence on frozen boundaries', 'status': 'pending'},
               {'name': 'Promotion decision and listening comparison', 'status': 'pending'}],
    'plan': 'docs/superpowers/plans/2026-10-26-structure-representation-stages.md',
    'latest_checkpoint': 'docs/superpowers/validation/2026-10-26-role-evidence-audit.md'}
(OUT / 'integrity-baseline.json').write_text(json.dumps(protected, indent=2) + '\n')
queue_path.write_text(json.dumps(queue, indent=2) + '\n')
print('Frozen', len(protected), 'files. Next stage no earlier than', queue['next_not_before'])
