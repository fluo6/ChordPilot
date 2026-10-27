"""Final bounded calibration audit; frozen inference, evaluation afterwards."""
import contextlib
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT/'outputs/song-structure'
OUT = BASE/'calibration-run-5'
OUT.mkdir(exist_ok=True)
read = lambda p: json.loads(p.read_text(encoding='utf-8'))
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
retained = {p.name: sha(p) for p in (BASE/'songformer-experiment').glob('*.consensus-v3.json')}
prior = {p.name: sha(p) for p in (BASE/'calibration-run-4').glob('*.json')}
for command, name in [
    ([sys.executable, '-m', 'unittest', 'discover', '-s', 'tests/python', '-p', 'test_structure*.py'], 'structure-tests.log'),
    (['node', '--test', 'tests/js/song-structure.test.js'], 'naming-tests.log'),
    ([sys.executable, 'tmp/verify-structure-v3.py'], 'cached-regression.log'),
]:
    result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True)
    (OUT/name).write_text(result.stdout+result.stderr, encoding='utf-8')
    assert result.returncode == 0, name
    print(name, 'PASS', flush=True)
assert retained == {p.name: sha(p) for p in (BASE/'songformer-experiment').glob('*.consensus-v3.json')}
runner = ROOT/'tmp/calibrate-weak-self-repeat.py'
code = runner.read_text()
assert code.count('calibration-run-3') == 2
code = code.replace('calibration-run-3', 'calibration-run-5')
(OUT/'reproduction-driver.py.txt').write_text(code)
log = io.StringIO()
with contextlib.redirect_stdout(log):
    exec(compile(code, str(runner), 'exec'), {'__file__': str(runner), '__name__': '__main__'})
(OUT/'candidate-regressions.log').write_text(log.getvalue())
assert prior == {p.name: sha(p) for p in (BASE/'calibration-run-4').glob('*.json')}
for slug in ['overjoyed', 'i-love-you-3000', 'waste-of-time', 'ballad', 'liangbo']:
    assert read(OUT/(slug+'.weak-self-repeat.json')) == read(BASE/'calibration-run-4'/(slug+'.weak-self-repeat.json'))
before = read(BASE/'songformer-experiment/overjoyed.consensus-v3.json')
after = read(OUT/'overjoyed.weak-self-repeat.json')
layout = lambda d: [(r['start'], r['end'], r['group'], r['role']) for r in d['segments']]
assert layout(before) == layout(after)
unknowns = [r for r in before['segments'] if not r['role']]
report = read(OUT/'weak-self-repeat-report.json')
assert report['overjoyed_before'] == report['overjoyed_candidate']
originals = []
for entry in read(BASE/'semantic-session-update/manifest.json')['tracks']:
    if entry['id'] == 'overjoyed':
        entry = {**read(BASE/'overjoyed-benchmark/session-update/manifest.json'), 'id':'overjoyed'}
    actual = sha(Path(entry['target']))
    assert actual == entry['after_sha256'], entry['id']
    originals.append({'song': entry['id'], 'sha256': actual, 'unchanged': True})
diagnostics = {
    'target':'overjoyed', 'new_inference_changes':False,
    'retained_five_caches_byte_identical':True, 'prior_candidate_reproduced_on_five_caches':True,
    'previous_run_artifacts_unchanged':True, 'layout_unchanged':True,
    'sections':len(before['segments']), 'groups':len({r['group'] for r in before['segments']}),
    'group_sequence':[r['group'] for r in before['segments']],
    'unknown_seconds':sum(r['end']-r['start'] for r in unknowns),
    'unknown_intervals':unknowns, 'provisional_metrics':report['overjoyed_before'],
    'original_sessions':originals,
    'reference_sha256':sha(ROOT/'tests/fixtures/structure-references/overjoyed.development.json'),
    'accuracy_status':'Agreement with provisional development reference only; not independently measured musical accuracy.',
    'decision':'No promotion or original-session overwrite. Bounded pass complete; unresolved roles and content identity remain.'
}
(OUT/'overjoyed-diagnostics.json').write_text(json.dumps(diagnostics, indent=2, allow_nan=False)+'\n')
print(json.dumps({k:v for k,v in diagnostics.items() if k not in ('unknown_intervals','original_sessions')}, indent=2))
