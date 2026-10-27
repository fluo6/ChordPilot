"""Audio-only recurrence evidence; no label decoding or selected cluster cut."""
import numpy as np
from scipy.cluster.hierarchy import linkage
from scipy.spatial.distance import squareform


def pool(values, rows, fps=25, bins=16):
    values = np.asarray(values, dtype=np.float64)
    if (values.ndim != 2 or not values.size or not np.isfinite(values).all()
            or not np.isfinite(fps) or fps <= 0 or bins < 1):
        raise ValueError('Expected finite frame features and valid timing.')
    frame_left = np.arange(len(values)) / fps
    frame_right = frame_left + 1 / fps
    result, coverage = [], []
    for row in rows:
        start, end = float(row['start']), float(row['end'])
        if not np.isfinite([start, end]).all() or start < 0 or end <= start:
            raise ValueError('Invalid occurrence interval.')
        edges = np.linspace(start, end, bins + 1)
        pooled = []
        total = 0.
        for left, right in zip(edges[:-1], edges[1:]):
            weights = np.maximum(0, np.minimum(frame_right, right) - np.maximum(frame_left, left))
            mass = weights.sum()
            if mass <= 0:
                raise ValueError('A temporal bin has no captured frames; do not extrapolate.')
            present = weights > 0
            pooled.append(weights[present] @ values[present] / mass)
            total += mass
        result.append(pooled)
        coverage.append(total / (end - start))
    return np.asarray(result), np.asarray(coverage)


def center(values, fps, duration):
    values = np.asarray(values, dtype=np.float64)
    if values.ndim != 2 or not values.size or not np.isfinite(values).all():
        raise ValueError('Invalid frame features.')
    if not np.isfinite([fps, duration]).all() or fps <= 0 or duration <= 0:
        raise ValueError('Invalid recording timing.')
    weights = np.clip(duration - np.arange(len(values)) / fps, 0, 1 / fps)
    return values - weights @ values / weights.sum()


def distances(descriptors, durations):
    descriptors = np.asarray(descriptors, dtype=np.float64)
    durations = np.asarray(durations, dtype=np.float64)
    if (descriptors.ndim != 3 or not descriptors.size or not np.isfinite(descriptors).all()
            or durations.shape != (len(descriptors),) or not np.isfinite(durations).all()
            or np.any(durations <= 0)):
        raise ValueError('Invalid ordered descriptors or occurrence durations.')
    norms = np.linalg.norm(descriptors, axis=2, keepdims=True)
    normalized = descriptors / np.maximum(norms, 1e-12)
    similarity = np.einsum('ibd,jbd->ij', normalized, normalized) / descriptors.shape[1]
    result = np.clip(1 - similarity, 0, 2)
    result += .1 * np.abs(np.log(durations[:, None] / durations[None, :]))
    np.fill_diagonal(result, 0)
    return result


def summarize(matrix):
    matrix = np.asarray(matrix, dtype=np.float64)
    if (matrix.ndim != 2 or matrix.shape[0] != matrix.shape[1] or not matrix.size
            or not np.isfinite(matrix).all() or np.any(matrix < 0)
            or not np.allclose(matrix, matrix.T, rtol=0, atol=1e-12)
            or not np.allclose(np.diag(matrix), 0, rtol=0, atol=1e-12)):
        raise ValueError('Expected a finite symmetric distance matrix.')
    n = len(matrix)
    nearest, ranks = [], np.zeros((n, n), dtype=int)
    for i in range(n):
        peers = [j for j in range(n) if j != i]
        if not peers:
            nearest.append([])
            continue
        minimum = min(matrix[i, j] for j in peers)
        nearest.append([j for j in peers if abs(matrix[i, j] - minimum) <= 1e-12])
        for j in peers:
            ranks[i, j] = 1 + sum(matrix[i, k] < matrix[i, j] - 1e-12 for k in peers)
    return {'nearest': nearest, 'ranks': ranks.tolist(),
            'reciprocal_pairs': [[i, j] for i in range(n) for j in nearest[i]
                                 if i < j and i in nearest[j]],
            'linkage': linkage(squareform(matrix, checks=False), method='complete').tolist() if n > 1 else []}
