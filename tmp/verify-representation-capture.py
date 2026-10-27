"""Independent artifact and protected-file validation after serial extraction."""
from pathlib import Path
import json
import hashlib
from datetime import datetime, timezone
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'outputs/song-structure/representation-stages'
read = lambda p: json.loads(p.read_text(encoding='utf-8'))
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
baseline = read(OUT / 'integrity-baseline.json')
assert all(sha(Path(p)) == expected for p, expected in baseline.items())
queue = read(OUT / 'queue.json')
tracks = []
for slug in queue['songs']:
    report = read(OUT / 'features' / (slug + '.json'))
    assert report['native_prediction_unchanged'] and report['all_head_logits_within_tolerance']
    assert report['source_hash'] == sha(ROOT / 'outputs/song-structure/model-comparison/media' / (slug + '.mp3'))
    assert report['retained_prediction_sha256'] == sha(ROOT / 'outputs/song-structure/songformer-experiment' / (slug + '.consensus-v3.json'))
    assert all(sha(ROOT / p) == digest for p, digest in report['source_code_sha256'].items())
    end = 0
    frames = 0
    bit_identical = True
    for chunk in report['chunks']:
        assert chunk['start_seconds'] == end
        end += chunk['duration_seconds']
        path = OUT / 'features' / chunk['file']
        assert sha(path) == chunk['sha256']
        with np.load(path, allow_pickle=False) as saved:
            values = saved['embeddings']
            assert values.dtype == np.float32 and list(values.shape) == chunk['shape']
            assert np.isfinite(values).all() and values.shape[1] == 4096
            assert chunk['fps'] == 25
            for stream in chunk['streams']:
                part = values[:, slice(*stream['columns'])]
                assert part.shape[1] == 1024 and np.any(part)
            frames += len(values)
        assert sha(OUT / 'features' / chunk['head_logits_file']) == chunk['head_logits_sha256']
        with np.load(OUT / 'features' / chunk['head_logits_file']) as new, np.load(
                ROOT / 'outputs/song-structure/songformer-experiment' / chunk['head_logits_file']) as old:
            for key in old.files:
                assert np.allclose(old[key], new[key], rtol=1e-5, atol=1e-5)
                bit_identical = bit_identical and np.array_equal(old[key], new[key])
    assert abs(end - report['duration']) < 1e-9
    tracks.append({'song': slug, 'frames': frames, 'dimensions': 4096,
                   'head_logits_bit_identical': bool(bit_identical),
                   'elapsed_seconds': report['elapsed_seconds'],
                   'uncovered_seconds': sum(c['uncovered_seconds'] for c in report['chunks']),
                   'padded_seconds': sum(c['padded_seconds'] for c in report['chunks'])})
result = {'verified_at': datetime.now(timezone.utc).isoformat(), 'tracks': tracks,
          'protected_files_unchanged': len(baseline), 'model_weights_changed': False,
          'retained_boundaries_changed': False, 'original_sessions_updated': False,
          'musical_accuracy_established': False}
(OUT / 'stage-1-verification.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
