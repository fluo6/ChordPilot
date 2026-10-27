"""Cache-only native occurrence candidate. No user annotations in inference."""
from pathlib import Path
import hashlib
import importlib.util
import json
import os
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tmp/structure-neural-deps'))
# Standalone cache runner: fix reduction order before NumPy/BLAS initialize.
for variable in ('OPENBLAS_NUM_THREADS', 'OMP_NUM_THREADS', 'MKL_NUM_THREADS'):
    os.environ[variable] = '1'
import numpy as np

BASE = ROOT / 'outputs/song-structure'
OUT = BASE / 'additional-song-candidates'
OUT.mkdir(exist_ok=True)
read = lambda p: json.loads(p.read_text(encoding='utf-8'))
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


rec = load('recurrence', 'scripts/testing/structure-representation-recurrence.py')
native = load('native', 'scripts/testing/structure-contextual-roles.py')
protected = read(BASE / 'representation-stages/integrity-baseline.json')
for path, digest in protected.items():
    assert sha(Path(path)) == digest, 'Protected input changed: ' + path
blocked = True


def audit(event, args):
    if blocked and event == 'open' and isinstance(args[0], (str, bytes)):
        path = str(args[0]).replace('\\', '/').lower()
        if ('structure-references/' in path or path.endswith('.chordpilot-session.json')
                or '/docs/' in path or 'user-feedback' in path):
            raise AssertionError('Evaluation references and sessions are not inference inputs.')


sys.addaudithook(audit)
verify = '--verify' in sys.argv
summaries = []
for slug in [s for s in sys.argv[1:] if not s.startswith('--')]:
    assert slug and all(c.isalnum() or c == '-' for c in slug)
    source_path = BASE / 'songformer-experiment' / (slug + '.raw.json')
    source = read(source_path)
    rows = source['segments']
    assert rows[0]['start'] == 0
    assert all(a['end'] == b['start'] for a, b in zip(rows[:-1], rows[1:]))
    assert abs(rows[-1]['end'] - source['duration']) < 1/8.333
    meta_path = BASE / 'representation-stages/features' / (slug + '.json')
    meta = read(meta_path)
    media = BASE / 'model-comparison/media' / (slug + '.mp3')
    assert meta['source_hash'] == source['source_hash'] == sha(media)
    assert meta['checkpoint_sha256'] == source['checkpoint']['sha256']
    assert meta['duration'] == source['duration'] and len(meta['chunks']) == 1
    chunk = meta['chunks'][0]
    assert chunk['start_seconds'] == 0 and chunk['fps'] == 25
    expected_streams = [('short_musicfm', [0,1024]), ('short_muq', [1024,2048]),
                        ('long_musicfm', [2048,3072]), ('long_muq', [3072,4096])]
    assert [(s['name'], s['columns']) for s in chunk['streams']] == expected_streams
    feature_path = BASE / 'representation-stages/features' / chunk['file']
    logit_path = BASE / 'representation-stages/features' / chunk['head_logits_file']
    assert sha(feature_path) == chunk['sha256']
    assert sha(logit_path) == chunk['head_logits_sha256']
    with np.load(feature_path, allow_pickle=False) as saved:
        embeddings = saved['embeddings']
    assert list(embeddings.shape) == chunk['shape'] and embeddings.dtype == np.float32
    with np.load(logit_path, allow_pickle=False) as saved:
        logits = saved['function_logits'][0].astype(np.float64)
    assert abs(len(logits)/8.333 - source['duration']) < 1/8.333
    assert not np.isnan(logits).any() and not np.isposinf(logits).any()
    probabilities = np.exp(logits - logits.max(axis=1, keepdims=True))
    probabilities /= probabilities.sum(axis=1, keepdims=True)
    pooled, posterior_coverage = rec.pool(probabilities, rows, fps=8.333, bins=1)
    p = pooled[:, 0, :]
    durations = [r['end'] - r['start'] for r in rows]
    matrices = {}
    coverage = None
    for stream in chunk['streams']:
        values = embeddings[:, slice(*stream['columns'])]
        for normalization in ('raw', 'centered'):
            frames = values if normalization == 'raw' else rec.center(values, 25, source['duration'])
            descriptors, covered = rec.pool(frames, rows, fps=25)
            if coverage is None: coverage = covered
            np.testing.assert_array_equal(coverage, covered)
            matrices[stream['name'] + '_' + normalization] = rec.distances(descriptors, durations)
    result = native.refine(rows, p, matrices)
    assert [(r['start'], r['end']) for r in result] == [(r['start'], r['end']) for r in rows]
    evidence = {name: rec.summarize(matrix) for name, matrix in matrices.items()}
    for i, row in enumerate(result):
        row['original_role_scores'] = {name:float(p[i,cls]) for name,cls in native.CLASS_IDS.items()}
        row['feature_coverage'] = float(coverage[i])
        row['posterior_coverage'] = float(posterior_coverage[i])
    changes = [{'index': i, 'start': r['start'], 'end': r['end'],
                'from': r['native_label'], 'to': r['label'], **r['decision']}
               for i, r in enumerate(result) if r['label'] != r['native_label']]
    summary = {'song': slug, 'occurrences': len(rows), 'changes': changes,
               'boundaries_unchanged': True, 'independent_accuracy': None}
    report = {'engine': 'songformer-contextual-role-candidate-v2',
              'status': 'experimental_not_validated', 'duration': source['duration'],
              'source_hash': source['source_hash'], 'segments': result, 'summary': summary,
              'evidence': evidence,
              'inputs': {str(path.relative_to(ROOT)).replace('\\', '/'): sha(path)
                         for path in [source_path, meta_path, feature_path, logit_path]},
              'code': {str(path.relative_to(ROOT)).replace('\\', '/'): sha(path)
                       for path in [Path(__file__), Path(native.__file__), Path(rec.__file__)]},
              'parameters': {'blas_threads': 1, 'numpy_version': np.__version__,
                             'posterior_fps': 8.333, 'posterior_pooling': 'fractional frame overlap',
                             'descriptor_bins': 16, 'target_max_below': .5, 'donor_max_above': .5,
                             'all_views_unique_reciprocal': True, 'pooling': 'equal original posteriors',
                             'successor_anchor_min': .8, 'context_occurrences': 2, 'no_cascading': True, 'native_occurrences_unchanged': True},
              'limitations': ['Related SSL views are not independent judges.',
                              'Nearest-neighbor agreement does not prove melody identity or role.',
                              'All displayed roles remain model hypotheses; confidence is uncalibrated.',
                              'No recurrence partition or letters inferred.',
                              'No independent exact-recording accuracy established.']}
    report_path = OUT / (slug + '.json')
    array_path = OUT / (slug + '.npz')
    arrays = {**matrices, 'native_probabilities': p}
    if verify:
        assert read(report_path) == report, slug + ': report mismatch'
        with np.load(array_path, allow_pickle=False) as previous:
            assert set(previous.files) == set(arrays)
            for key, value in arrays.items(): np.testing.assert_array_equal(previous[key], value)
    else:
        report_path.write_text(json.dumps(report, indent=2, allow_nan=False)+'\n', encoding='utf-8')
        np.savez_compressed(array_path, **arrays)
    summaries.append(summary)
    print(json.dumps(summary), flush=True)
    del embeddings

blocked = False
assert all(sha(Path(path)) == digest for path, digest in protected.items())
summary = {'tracks': summaries, 'protected_files_unchanged': len(protected),
           'sessions_updated': False, 'accuracy_established': False}
if verify:
    assert read(OUT / (slug + '.summary.json')) == summary
    print('EXACT RECOMPUTATION VERIFIED', flush=True)
else:
    (OUT / (slug + '.summary.json')).write_text(json.dumps(summary, indent=2)+'\n', encoding='utf-8')
