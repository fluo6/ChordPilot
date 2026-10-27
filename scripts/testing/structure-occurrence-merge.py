"""Experimental coarse occurrences; fine observations remain unchanged."""
from copy import deepcopy
from math import isfinite


def merge_occurrences(rows, boundary_scores, threshold=0.5):
    """Relax recurrence anchors only for weak, same-content self-repeats.

    Scores are model outputs, not calibrated correctness probabilities. This
    augments the existing accepted-role merge, without changing role decisions.
    """
    if (len(rows) != len(boundary_scores) or not isfinite(threshold)
            or not 0 < threshold <= 1
            or any(not isfinite(p) or not 0 <= p <= 1 for p in boundary_scores)):
        raise ValueError('Expected aligned finite boundary scores in [0, 1].')
    anchors = {(r['group'], r['role']) for i, r in enumerate(rows)
               if r['role'] and (i == 0 or rows[i-1]['role'] != r['role'])}
    merged = []
    for i, source in enumerate(rows):
        r = deepcopy(source)
        weak_self_repeat = (i > 0 and rows[i-1]['group'] == r['group']
                            and boundary_scores[i] < threshold)
        preserve_anchor = (r['group'], r['role']) in anchors and not weak_self_repeat
        if merged and r['role'] and merged[-1]['role'] == r['role'] and not preserve_anchor:
            merged[-1]['end'] = r['end']
            merged[-1]['content_groups'].append(r['group'])
            merged[-1]['role_evidence'].extend(r['role_evidence'])
            merged[-1]['model_probability'] = min(merged[-1]['model_probability'], r['model_probability'])
        else:
            merged.append({**r, 'content_groups':[r['group']]})
    return merged
