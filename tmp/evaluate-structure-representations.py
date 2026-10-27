"""Execute the frozen stage-2 protocol; never modifies inference or sessions."""
from pathlib import Path
import hashlib
import importlib.util
import json
import sys
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tmp/structure-neural-deps'))
import numpy as np
import scipy

OUT = ROOT / 'outputs/song-structure/representation-stages'
TARGET = OUT / 'recurrence'
TARGET.mkdir(exist_ok=True)
read = lambda p: json.loads(p.read_text(encoding='utf-8'))
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
helper = ROOT / 'scripts/testing/structure-representation-recurrence.py'
spec = importlib.util.spec_from_file_location('recurrence', helper)
recurrence = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recurrence)
protocol = ROOT / 'docs/superpowers/validation/2026-10-26-representation-stage-2-protocol.md'
verify = '--verify' in sys.argv
protected = read(OUT / 'integrity-baseline.json')
assert all(sha(Path(path)) == digest for path, digest in protected.items())
blocked = True


def audit(event, args):
    if blocked and event == 'open' and isinstance(args[0], (str, bytes)):
        name = str(args[0]).replace('\\', '/').lower()
        if 'structure-references/' in name or name.endswith('.chordpilot-session.json'):
            raise AssertionError('Reference/session access during comparison is prohibited.')


sys.addaudithook(audit)
tracks = []
for slug in read(OUT / 'queue.json')['songs']:
    retained_path = ROOT / 'outputs/song-structure/songformer-experiment' / (slug + '.consensus-v3.json')
    retained = read(retained_path)
    metadata_path = OUT / 'features' / (slug + '.json')
    metadata = read(metadata_path)
    assert metadata['source_hash'] == retained['source_hash']
    assert metadata['retained_prediction_sha256'] == sha(retained_path)
    assert metadata['source_hash'] == sha(ROOT / 'outputs/song-structure/model-comparison/media' / (slug + '.mp3'))
    assert len(metadata['chunks']) == 1, 'Multi-chunk timing needs a separate validated procedure.'
    chunk = metadata['chunks'][0]
    assert chunk['start_seconds'] == 0 and chunk['duration_seconds'] == retained['duration']
    feature_path = OUT / 'features' / chunk['file']
    assert sha(feature_path) == chunk['sha256']
    with np.load(feature_path, allow_pickle=False) as saved:
        embeddings = saved['embeddings']
    assert list(embeddings.shape) == chunk['shape'] and embeddings.dtype == np.float32
    assert np.isfinite(embeddings).all()
    # Only timing enters the representation calculation. Metadata is joined later.
    rows = [{'start': r['start'], 'end': r['end']} for r in retained['fine_segments']]
    assert rows[0]['start'] == 0 and rows[-1]['end'] == retained['duration']
    assert all(a['end'] == b['start'] for a, b in zip(rows[:-1], rows[1:]))
    durations = np.array([r['end'] - r['start'] for r in rows])
    matrices = {}
    coverage = None
    for stream in chunk['streams']:
        values = embeddings[:, slice(*stream['columns'])]
        for normalization in ('raw', 'centered'):
            source = values if normalization == 'raw' else recurrence.center(values, chunk['fps'], retained['duration'])
            descriptors, covered = recurrence.pool(source, rows, chunk['fps'])
            if coverage is None:
                coverage = covered
            np.testing.assert_array_equal(coverage, covered)
            matrices[stream['name'] + '_' + normalization] = recurrence.distances(descriptors, durations)
    baseline = np.asarray(retained['distance_matrix'])
    assert baseline.shape == (len(rows), len(rows))
    matrices['chroma_texture_baseline'] = baseline
    evidence = {name: recurrence.summarize(matrix) for name, matrix in matrices.items()}
    agreement = {}
    for normalization in ('raw', 'centered'):
        sets = [set(map(tuple, evidence[s['name'] + '_' + normalization]['reciprocal_pairs']))
                for s in chunk['streams']]
        agreement[normalization] = [list(pair) for pair in sorted(set.intersection(*sets))]

    # Evaluation-only joins: these fields never influence distances or hierarchy.
    annotated = [{'index': i, **row, 'baseline_group': retained['fine_segments'][i]['group'],
                  'retained_role': retained['fine_segments'][i]['role'],
                  'coverage': float(coverage[i])} for i, row in enumerate(rows)]
    pairs = []
    for i in range(len(rows)):
        for j in range(i + 1, len(rows)):
            same_group = annotated[i]['baseline_group'] == annotated[j]['baseline_group']
            role_i, role_j = annotated[i]['retained_role'], annotated[j]['retained_role']
            pairs.append({'i': i, 'j': j, 'baseline_same_group': same_group,
                          'different_accepted_roles': bool(role_i and role_j and role_i != role_j),
                          'distances': {name: float(matrix[i, j]) for name, matrix in matrices.items()},
                          'ranks': {name: [data['ranks'][i][j], data['ranks'][j][i]] for name, data in evidence.items()}})
    same = [p for p in pairs if p['baseline_same_group']]
    summary = {'song': slug, 'fine_occurrences': len(rows),
               'baseline_fine_groups': len({r['baseline_group'] for r in annotated}),
               'baseline_same_group_pairs': len(same),
               'baseline_same_group_different_role_pairs': sum(p['different_accepted_roles'] for p in same),
               'unanimous_reciprocal_pairs': agreement,
               'minimum_occurrence_feature_coverage': float(min(coverage)),
               'views': {name: {'reciprocal_pair_count': len(data['reciprocal_pairs']),
                                'same_baseline_group_reciprocal_pairs': sum(
                                    annotated[i]['baseline_group'] == annotated[j]['baseline_group']
                                    for i, j in data['reciprocal_pairs']),
                                'nearest_set_agrees_with_baseline_count': sum(
                                    set(a) == set(b) for a, b in zip(data['nearest'], evidence['chroma_texture_baseline']['nearest']))}
                         for name, data in evidence.items()}}
    report = {'schema_version': 1, 'status': 'experimental_not_validated',
              'protocol_sha256': sha(protocol), 'helper_sha256': sha(helper),
              'runner_sha256': sha(Path(__file__)),
              'inputs': {str(p.relative_to(ROOT)).replace('\\', '/'): sha(p)
                         for p in [retained_path, metadata_path, feature_path]},
              'environment': {'numpy': np.__version__, 'scipy': scipy.__version__},
              'source_hash': retained['source_hash'], 'summary': summary,
              'occurrences': annotated, 'evidence': evidence, 'pairs': pairs,
              'boundaries_roles_unchanged': True, 'selected_partition': None,
              'independent_accuracy': None,
              'limitations': ['No independent exact-recording annotations.',
                             'General SSL embeddings do not establish melody identity.',
                             'Nearest neighbors exist even for unique sections.',
                             'No cut selected from full complete-link hierarchies.',
                             'No pitch invariance or role inference added.',
                             'Raw/centered and short/long are ablations, not independent judges.']}
    report_path = TARGET / (slug + '.json')
    matrix_path = TARGET / (slug + '.npz')
    if verify:
        assert read(report_path) == report, slug + ': report did not reproduce'
        with np.load(matrix_path, allow_pickle=False) as previous:
            assert set(previous.files) == set(matrices)
            for name, matrix in matrices.items():
                np.testing.assert_array_equal(previous[name], matrix)
    else:
        report_path.write_text(json.dumps(report, indent=2, allow_nan=False) + '\n', encoding='utf-8')
        np.savez_compressed(matrix_path, **matrices)
    tracks.append(summary)
    print(json.dumps(summary), flush=True)
    del embeddings

blocked = False
assert all(sha(Path(path)) == digest for path, digest in protected.items())
result = {'verified_at': datetime.now(timezone.utc).isoformat(), 'recomputed_exactly': verify,
          'protected_files_unchanged': len(protected), 'independent_accuracy_established': False,
          'original_sessions_updated': False, 'selected_partition': None, 'tracks': tracks,
          'artifacts': {str(p.relative_to(ROOT)).replace('\\', '/'): sha(p)
                        for p in sorted(TARGET.glob('*')) if p.suffix in ('.json', '.npz')}}
name = 'stage-2-verification.json' if verify else 'stage-2-comparison.json'
(OUT / name).write_text(json.dumps(result, indent=2, allow_nan=False) + '\n', encoding='utf-8')
print('STAGE 2 EXACT RECOMPUTATION VERIFIED' if verify else 'STAGE 2 COMPARISONS SAVED', flush=True)
