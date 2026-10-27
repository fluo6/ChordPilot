"""Lossless cache of the pinned SongFormer wrapper's four aligned streams.

The wrapper concatenates four layer-10 1024-dimensional representations at 25 Hz.
It trims streams to the shortest length before the structural head. This utility
records that exact tensor, not interpolated or normalized substitutes.
"""
from pathlib import Path
import hashlib
import numpy as np


def compare_logits(values, previous):
    values, previous = np.asarray(values), np.asarray(previous)
    if (values.shape != previous.shape or np.isnan(values).any()
            or np.isnan(previous).any() or np.isposinf(values).any()
            or np.isposinf(previous).any()
            or not np.array_equal(np.isneginf(values), np.isneginf(previous))):
        raise ValueError('Invalid logits or changed label mask')
    finite = np.isfinite(values)
    if not finite.any():
        raise ValueError('No supported finite labels')
    return {'bit_identical': bool(np.array_equal(values, previous)),
            'max_absolute_difference': float(np.max(np.abs(values[finite] - previous[finite]))),
            'within_float_tolerance': bool(np.allclose(values, previous, rtol=1e-5, atol=1e-5))}


def save_features(path, embeddings, duration, start_seconds):
    values = np.asarray(embeddings)
    if (values.dtype != np.float32 or values.ndim != 3 or values.shape[0] != 1
            or values.shape[2] != 4096 or not values.shape[1]
            or not np.isfinite(values).all()
            or not np.isfinite([duration, start_seconds]).all()
            or duration <= 0 or start_seconds < 0):
        raise ValueError('Invalid native feature tensor or timing')
    coverage = values.shape[1] / 25
    if abs(coverage - duration) > .2 or coverage > duration + .04:
        raise ValueError('Features do not cover the source chunk within frame rounding')
    streams = []
    for i, name in enumerate(('short_musicfm', 'short_muq', 'long_musicfm', 'long_muq')):
        left, right = i * 1024, (i + 1) * 1024
        stream = values[0, :, left:right]
        if not np.any(stream):
            raise ValueError('Empty representation stream')
        streams.append({'name': name, 'columns': [left, right], 'layer': 10,
                        'context_seconds': 30 if i < 2 else 420})
    path = Path(path)
    np.savez_compressed(path, embeddings=values[0])
    with np.load(path, allow_pickle=False) as saved:
        if not np.array_equal(saved['embeddings'], values[0]):
            raise ValueError('Feature cache did not round-trip exactly')
    return {'file': path.name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
            'shape': list(values[0].shape), 'dtype': 'float32', 'fps': 25,
            'start_seconds': start_seconds, 'duration_seconds': duration,
            'nominal_feature_end_seconds': start_seconds + coverage,
            'uncovered_seconds': max(0, duration - coverage),
            'padded_seconds': max(0, coverage - duration), 'streams': streams,
            'timing_note': 'Nominal 25 Hz bins; no interpolation or tail extrapolation.'}
