"""Experimental native-occurrence role assistance; no labels/times from references."""
import numpy as np

CLASS_IDS = {'intro': 0, 'verse': 1, 'chorus': 2, 'bridge': 3,
             'inst': 4, 'outro': 5, 'silence': 6, 'pre-chorus': 26}
ROLES = {'inst': 'instrumental', 'pre-chorus': 'pre_chorus', 'silence': None}
VOCAL = {'verse', 'chorus', 'pre-chorus', 'bridge'}


def refine(rows, probabilities, views):
    """Preserve native occurrences; expose conservative, non-cascading role hypotheses.

    The eight views are related feature ablations, not independent classifiers.
    Original scores and the donor are retained for inspection, not calibrated
    into a claim of musical accuracy. No recurrence group is inferred here.
    """
    p = np.asarray(probabilities, dtype=np.float64)
    n = len(rows)
    if (not n or p.ndim != 2 or p.shape[0] != n or p.shape[1] < 27
            or not np.isfinite(p).all() or np.any(p < 0)
            or not np.allclose(p.sum(axis=1), 1, rtol=0, atol=1e-6)):
        raise ValueError('Expected normalized finite original class probabilities.')
    for r in rows:
        if (r['label'] not in CLASS_IDS or not np.isfinite([r['start'], r['end']]).all()
                or r['start'] < 0 or r['end'] <= r['start']):
            raise ValueError('Invalid native occurrence.')
    if len(views) != 8:
        raise ValueError('All eight raw/centered short/long feature views are required.')
    neighbors = []
    for matrix in views.values():
        d = np.asarray(matrix, dtype=np.float64)
        if (d.shape != (n, n) or not np.isfinite(d).all() or np.any(d < 0)
                or not np.allclose(d, d.T, rtol=0, atol=1e-12)
                or not np.allclose(np.diag(d), 0, rtol=0, atol=1e-12)):
            raise ValueError('Invalid acoustic distance view.')
        nearest = []
        for i in range(n):
            peers = [j for j in range(n) if i != j]
            if not peers:
                nearest.append(None)
                continue
            minimum = min(d[i, j] for j in peers)
            tied = [j for j in peers if abs(d[i, j] - minimum) <= 1e-12]
            nearest.append(tied[0] if len(tied) == 1 else None)
        neighbors.append(nearest)

    def margin(q):
        top = np.sort(q)[-2:]
        return float(top[1] - top[0])

    result = []
    for i, row in enumerate(rows):
        native_label = row['label']
        label = native_label
        decision = {'basis': 'native', 'donor_index': None,
                    'native_class_probability': float(p[i, CLASS_IDS[native_label]]),
                    'native_max_probability': float(p[i].max()),
                    'native_margin': margin(p[i]),
                    'no_class_majority': bool(p[i].max() < .5)}
        j = neighbors[0][i]
        reciprocal = j is not None and all(v[i] == j and v[j] == i for v in neighbors)
        if (reciprocal and native_label in VOCAL and rows[j]['label'] in VOCAL
                and p[i].max() < .5 and p[j].max() > .5
                and p[j].argmax() == CLASS_IDS[rows[j]['label']]):
            pooled = (p[i] + p[j]) / 2
            proposed = rows[j]['label']
            decision.update(donor_index=j, proposed_label=proposed,
                            pooled_class_score=float(pooled[CLASS_IDS[proposed]]),
                            pooled_margin=margin(pooled),
                            donor_class_probability=float(p[j, CLASS_IDS[proposed]]),
                            proposal_status='withheld_pooled_winner_disagrees')
            if pooled.argmax() == CLASS_IDS[proposed]:
                decision['proposal_status'] = ('already_same_native_label' if proposed == native_label
                                               else 'withheld_margin_not_improved')
            if (pooled.argmax() == CLASS_IDS[proposed] and proposed != native_label
                    and margin(pooled) > margin(p[i])):
                label = proposed
                decision.update(basis='reciprocal_audio_consensus', proposal_status='applied')
        result.append({**row, 'native_label': native_label, 'label': label,
                       'role': ROLES.get(label, label), 'decision': decision})
    return result
