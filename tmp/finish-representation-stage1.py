"""Publish a compact checkpoint only after independently verifying every cache."""
from pathlib import Path
import json
import subprocess
import sys
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'outputs/song-structure/representation-stages'
subprocess.run([sys.executable, str(ROOT / 'tmp/verify-representation-capture.py')], check=True)
read = lambda p: json.loads(p.read_text(encoding='utf-8'))
verification = read(OUT / 'stage-1-verification.json')
assert len(verification['tracks']) == 5 and verification['protected_files_unchanged'] == 27
tests = (OUT / 'structure-tests.log').read_text(encoding='utf-8')
naming = (OUT / 'naming-tests.log').read_text(encoding='utf-8')
assert 'Ran 35 tests' in tests and '\nOK' in tests
assert 'pass 20' in naming and 'fail 0' in naming
checkpoint = ROOT / 'docs/superpowers/validation/2026-10-26-representation-stage-1.md'
rows = '\n'.join('| {song} | {frames} | {head_logits_bit_identical} | {uncovered_seconds:.5f} |'.format(**t)
                 for t in verification['tracks'])
checkpoint.write_text('''# Representation stage 1 — compact checkpoint

## Outcome

Captured all four native layer-10 MuQ/MusicFM streams for all five recordings.
Artifacts: `outputs/song-structure/representation-stages/features/`.
Each float32 cache has 4096 columns: short MusicFM, short MuQ, long MusicFM,
long MuQ (1024 each), nominal 25 Hz. The author wrapper trims to its shortest
stream; no interpolation, normalization or extrapolation was introduced.

| Recording | Frames | Head logits bit-identical | Uncovered tail seconds |
|---|---:|---|---:|
''' + rows + '''

The model's decoded native predictions match their previous results on all five
recordings. Feature arrays round-trip exactly. The verifier checks source audio,
code and cache hashes, shapes, values, stream layout and temporal coverage.
All 27 protected files, including five original sessions and the retained fine
predictions, are unchanged. No model weights, boundaries, grouping, roles,
application behavior or listening comparison changed.

## Validation and repaired issue

35 Python structure tests and 20 JavaScript naming tests passed. The initial
capture verifier incorrectly required every head logit to be finite, while the
author masks 120 unsupported labels with negative infinity. Overjoyed's captured
logits were already bit-identical to the prior cache. A regression test exposed
the missing mask-aware comparison; the fix permits identical negative-infinity
masks and rejects NaN, positive infinity and changed masks. Extraction was then
rerun from audio, preserving the first failed log and script for audit.

## Interpretation limits

These are general musical SSL representations, not verified melody embeddings.
Capturing valid features does not establish grouping or role accuracy. Native
25 Hz frame bins describe model timing; no claim of sample-accurate semantic
alignment is made. Independent exact-recording musical evaluation is still absent.

## Next stage (scheduled, not executed here)

Read the queue and the three-stage plan. Compare recurrence on frozen fine
boundaries across all five songs, beginning with Overjoyed. Fix the procedure
before inspecting desired labels; retain separate stream ablations and compare
against chroma/texture. No tuning to provisional reference labels, model-role
agreement, supplied answers, song names or desired section counts. Keep function
separate from recurrence. Promote nothing without supporting evaluation.

The old five-song schedule remains closed. The new automation
`chordpilot-richer-audio-stages` schedules stages 2 and 3 at 150-minute intervals.
Delete it after stage 3 or a terminal blocker. Compact checkpoints substitute
for a forced context-compaction operation, which is unavailable to this agent.

## Reproduction

- `C:/Python39/python.exe tmp/capture-structure-representations.py overjoyed i-love-you-3000 waste-of-time ballad liangbo`
- `C:/Python39/python.exe tmp/verify-representation-capture.py`
- `C:/Python39/python.exe -m unittest discover -s tests/python -p "test_structure*.py"`
- `node --test tests/js/song-structure.test.js`

Use `stage-1-verification.json` and each feature report for full provenance.
''', encoding='utf-8')
queue_path = OUT / 'queue.json'
queue = read(queue_path)
assert queue['stage_index'] == 0 and queue['stages'][0]['status'] == 'running'
queue['stages'][0].update(status='complete', completed_at=datetime.now(timezone.utc).isoformat(),
                         verification='outputs/song-structure/representation-stages/stage-1-verification.json')
queue['stage_index'] = 1
queue['status'] = 'waiting_for_schedule'
queue['latest_checkpoint'] = str(checkpoint.relative_to(ROOT)).replace('\\', '/')
queue_path.write_text(json.dumps(queue, indent=2) + '\n')
assert read(queue_path) == queue
print('Stage 1 verified and checkpoint saved; stage 2 remains scheduled.')
