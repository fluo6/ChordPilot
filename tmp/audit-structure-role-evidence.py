"""Read-only model evidence audit; no role changes or reference inputs.

Hypothesis: boundary contamination or a second model can resolve abstentions.
Freeze retained segments; compare full intervals with their central 80 percent.
Different model vocabularies remain separate. Scores are not calibrated accuracy.
"""
import ast
import hashlib
import json
from pathlib import Path
import sys

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'outputs/song-structure'
OUT = BASE / 'role-evidence-audit'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def literal_assignment(path, name):
    for node in ast.parse(path.read_text(encoding='utf-8')).body:
        if isinstance(node, ast.Assign) and any(
                isinstance(t, ast.Name) and t.id == name for t in node.targets):
            return ast.literal_eval(node.value)
    raise ValueError('Missing label map: ' + name)


def interval_mean(probabilities, fps, start, end):
    """Integrate uniform frame bins, including partial edge-frame exposure."""
    p = np.asarray(probabilities)
    if (p.ndim != 2 or not np.isfinite(p).all() or (p < 0).any()
            or not np.allclose(p.sum(axis=1), 1, atol=1e-5)
            or not np.isfinite([fps, start, end]).all() or fps <= 0
            or not 0 <= start < end <= len(p) / fps):
        raise ValueError('Invalid probability stream or interval outside its coverage')
    left = int(np.floor(start * fps))
    right = min(len(p), int(np.ceil(end * fps)))
    edges = np.arange(left, right) / fps
    weights = np.maximum(0, np.minimum(edges + 1 / fps, end) - np.maximum(edges, start))
    return (p[left:right] * weights[:, None]).sum(axis=0) / weights.sum()


def summary(p, names):
    order = np.argsort(-p, kind='stable')[:3]
    return {'winner': names[int(order[0])], 'score': float(p[order[0]]),
            'margin': float(p[order[0]] - p[order[1]]),
            'top3': [{'role': names[int(i)], 'score': float(p[i])} for i in order]}


def audit(slug):
    paths = {
        'retained': BASE / 'songformer-experiment' / (slug + '.consensus-v3.json'),
        'songformer_logits': BASE / 'songformer-experiment' / (slug + '.logits-0.npz'),
        'songformer_raw': BASE / 'songformer-experiment' / (slug + '.raw.json'),
        'allinone_activations': BASE / 'neural-functional-experiment' / (slug + '.activations.npz'),
        'allinone_provenance': BASE / 'neural-functional-experiment' / (slug + '.provenance.json'),
        'media': BASE / 'model-comparison/media' / (slug + '.mp3'),
        'songformer_labels': ROOT / 'tmp/songformer-adapted/dataset/label2id.py',
        'allinone_labels': ROOT / 'tmp/structure-neural-deps/allin1_infer/config.py',
    }
    before = {k: sha(v) for k, v in paths.items()}
    retained = read(paths['retained'])
    native = read(paths['songformer_raw'])
    meta = read(paths['allinone_provenance'])
    assert retained['source_hash'] == native['source_hash'] == meta['source_hash'] == before['media']
    sf_names = {v: k for k, v in literal_assignment(paths['songformer_labels'], 'LABEL_TO_ID').items()}
    allowed = literal_assignment(paths['songformer_labels'], 'DATASET_ID_ALLOWED_LABEL_IDS')[5]
    aio_names = dict(enumerate(literal_assignment(paths['allinone_labels'], 'HARMONIX_LABELS')))
    with np.load(paths['songformer_logits']) as cache:
        logits = cache['function_logits'][0].astype(float)
    probability = np.exp(logits - logits.max(axis=1, keepdims=True))
    probability /= probability.sum(axis=1, keepdims=True)
    # The checkpoint returns 128 columns but only the selected dataset's eight
    # labels are active. Fail if an unexpected class obtains probability mass.
    assert np.max(np.delete(probability, allowed, axis=1)) < 1e-8
    with np.load(paths['allinone_activations']) as cache:
        aio = cache['label'].T.astype(float)
    assert abs(len(probability) / 8.333 - retained['duration']) <= 1 / 8.333
    assert abs(len(aio) / 100 - retained['duration']) <= .02
    rows = []
    for segment in retained['fine_segments']:
        start, end = segment['start'], segment['end']
        trim = (end - start) * .1
        # Author frame rounding can leave less than one frame at the recording
        # end uncovered. Do not extrapolate that frame or silently claim support.
        sf_end = min(end, len(probability) / 8.333)
        sf = interval_mean(probability, 8.333, start, sf_end)
        core = interval_mean(probability, 8.333, start + trim, end - trim)
        other = interval_mean(aio, 100, start, end)
        item = {k: segment[k] for k in ('start', 'end', 'group', 'role')}
        item.update(songformer_scored_end=sf_end, songformer_uncovered_seconds=end-sf_end,
                    songformer=summary(sf, sf_names), songformer_core=summary(core, sf_names),
                    allinone=summary(other, aio_names),
                    pre_chorus_score=float(sf[26]), pre_chorus_core_score=float(core[26]))
        item['winner_agreement'] = item['songformer']['winner'] == item['allinone']['winner']
        item['both_strong_agreement'] = (item['winner_agreement']
                                        and min(item['songformer']['score'], item['allinone']['score']) >= .8)
        item['allinone_strong_agreement'] = item['winner_agreement'] and item['allinone']['score'] >= .8
        rows.append(item)
    assert before == {k: sha(v) for k, v in paths.items()}
    unknown = [r for r in rows if r['role'] is None]
    report = {
        'song': slug, 'source_hash': retained['source_hash'],
        'inputs_sha256': before, 'inputs_unchanged': True,
        'hypothesis': 'Boundary averaging or cross-model agreement could explain weak occurrence evidence.',
        'method': 'Retained fine intervals; duration-weighted frame means; central 80% as a fixed sensitivity diagnostic, not a candidate decoder.',
        'vocabularies': {'songformer': [sf_names[i] for i in allowed], 'allinone': list(aio_names.values())},
        'accuracy_status': 'Not measured. Agreement, score and coverage are not accuracy. No annotations or sessions read.',
        'unknown_seconds': sum(r['end'] - r['start'] for r in unknown),
        'unknown_core_crosses_08': [r['start'] for r in unknown if r['songformer_core']['score'] >= .8],
        'unknown_both_strong_agreement': [r['start'] for r in unknown if r['both_strong_agreement']],
        'unknown_allinone_strong_agreement': [r['start'] for r in unknown if r['allinone_strong_agreement']],
        'rows': rows,
    }
    OUT.mkdir(exist_ok=True)
    (OUT / (slug + '.json')).write_text(json.dumps(report, indent=2, allow_nan=False) + '\n', encoding='utf-8')
    return report


if __name__ == '__main__':
    for slug in sys.argv[1:]:
        report = audit(slug)
        print(json.dumps({k: v for k, v in report.items() if k not in ('inputs_sha256', 'rows', 'vocabularies')}))
