"""Reproduce v3 with annotation/session reads forbidden, then evaluate separately."""
import contextlib
import hashlib
import importlib.util
import io
import json
import pathlib
import runpy
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
BASE = ROOT / 'outputs/song-structure/songformer-experiment'
sys.path.insert(0, str(ROOT / 'backend'))
from chordpilot_structure import validate_segments

blocked = False
opened = set()
def audit(event, args):
    if not blocked or event != 'open' or not isinstance(args[0], (str, bytes)):
        return
    name = str(args[0]).replace('\\', '/').lower()
    if 'structure-references/' in name or name.endswith('.chordpilot-session.json'):
        raise AssertionError('Inference attempted to read a reference or saved session')
    if name.endswith(('.npz', '.json')):
        opened.add(name)
sys.addaudithook(audit)

reports = []
for slug in ['overjoyed', 'i-love-you-3000', 'waste-of-time', 'ballad', 'liangbo']:
    sys.argv = ['probe-structure-consensus.py', slug]
    blocked = True
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            runpy.run_path(str(ROOT / 'tmp/probe-structure-consensus.py'), run_name='__main__')
    finally:
        blocked = False
    new = json.loads((BASE / (slug + '.consensus-v3.json')).read_text())
    source = ROOT / 'outputs/song-structure/model-comparison/media' / (slug + '.mp3')
    assert hashlib.sha256(source.read_bytes()).hexdigest() == new['source_hash']
    assert validate_segments(new['segments'], new['duration'])
    fine = new['fine_segments']
    assert all(a['end'] == b['start'] for a, b in zip(fine, fine[1:]))
    assert fine[0]['start'] == 0 and fine[-1]['end'] == new['duration']
    for row in new['segments']:
        evidence = row['role_evidence']
        assert evidence[0]['start'] == row['start'] and evidence[-1]['end'] == row['end']
        assert all(a['end'] == b['start'] for a, b in zip(evidence, evidence[1:]))
    coverage = lambda d: sum(r['end']-r['start'] for r in d['segments'] if r['role']) / d['duration']
    report = {'track': slug, 'segments': len(new['segments']), 'role_coverage': coverage(new),
              'source_hash': new['source_hash'], 'partition_valid': True,
              'accuracy': 'Not measured: no independently verified reference.'}
    old_path = BASE / (slug + '.consensus-v2.json')
    if old_path.exists():
        old = json.loads(old_path.read_text())
        layout = lambda d: [(r['start'], r['end'], r['group'], r['role']) for r in d['segments']]
        report.update(previous_coverage=coverage(old), layout_unchanged=layout(old) == layout(new))
    reports.append(report)

spec = importlib.util.spec_from_file_location('benchmark', ROOT/'scripts/testing/structure-benchmark.py')
benchmark = importlib.util.module_from_spec(spec); spec.loader.exec_module(benchmark)
reference = json.loads((ROOT/'tests/fixtures/structure-references/overjoyed.development.json').read_text())
old = json.loads((BASE/'overjoyed.consensus-v2.json').read_text())
new = json.loads((BASE/'overjoyed.consensus-v3.json').read_text())
assert benchmark.evaluate(reference, old) == benchmark.evaluate(reference, new)
original_manifest = json.loads((ROOT/'outputs/song-structure/overjoyed-benchmark/session-update/manifest.json').read_text())
assert hashlib.sha256(pathlib.Path(original_manifest['target']).read_bytes()).hexdigest() == original_manifest['after_sha256']
sources = ['scripts/testing/structure-role-consensus.py', 'tmp/probe-structure-consensus.py']
result = {'tracks': reports, 'reference_reads_blocked_during_inference': True,
          'opened_inference_data': sorted(opened), 'overjoyed_metrics_unchanged': True,
          'original_overjoyed_session_unchanged': True,
          'pipeline_sha256': {p: hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in sources}}
(BASE/'v3-verification.json').write_text(json.dumps(result, indent=2, allow_nan=False)+'\n')
print(json.dumps({k:v for k,v in result.items() if k != 'opened_inference_data'}, indent=2))
