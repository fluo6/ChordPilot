"""Keep functional roles separate from harmonic recurrence (experiment only)."""
import numpy as np


def consensus_roles(probabilities, clusters, eligible, threshold=0.8):
    """Preserve strong occurrences; pool only peers with agreeing winners.

    Scores are uncalibrated model outputs, not correctness probabilities.
    Clusters describe audio similarity, never a guarantee of equal function.
    """
    p = np.asarray(probabilities, dtype=float)
    if (p.ndim != 2 or not all(p.shape) or not np.isfinite(p).all()
            or (p < 0).any() or not np.allclose(p.sum(axis=1), 1)
            or len(eligible) != len(p) or not np.isfinite(threshold)
            or not 0.5 < threshold <= 1):
        raise ValueError('Expected normalized finite probabilities and aligned eligibility.')
    members = [i for cluster in clusters for i in cluster]
    if any(not isinstance(i, (int, np.integer)) for i in members) or sorted(members) != list(range(len(p))):
        raise ValueError('Content clusters must partition the occurrence indices exactly once.')
    winners = p.argmax(axis=1)
    decisions = []
    for i, q in enumerate(p):
        accepted = q.max() >= threshold
        decisions.append({'class_id': int(winners[i]) if accepted else None,
                          'score': float(q.max()),
                          'occurrence_score': float(q.max()),
                          'basis': 'occurrence' if accepted else 'abstained',
                          'support_indices': [i]})
    for cluster in clusters:
        peers = [i for i in cluster if eligible[i]]
        if len(peers) < 2 or len(set(winners[peers])) != 1:
            continue
        pooled = p[peers].mean(axis=0)
        if pooled.max() < threshold:
            continue
        for i in peers:
            if decisions[i]['class_id'] is None:
                decisions[i].update(class_id=int(pooled.argmax()), score=float(pooled.max()),
                                    basis='compatible_recurrence', support_indices=peers.copy())
    return decisions
