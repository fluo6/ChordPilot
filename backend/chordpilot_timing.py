from __future__ import annotations

from typing import Any
from bisect import bisect_left, bisect_right


def observed_guide_tones(chroma: Any, root: int) -> list[int]:
    guides = []
    for intervals in [(3, 4), (10, 11)]:
        choices = sorted(((float(chroma[(root + interval) % 12]), (root + interval) % 12) for interval in intervals), reverse=True)
        if choices[0][0] >= .06 and choices[0][0] - choices[1][0] >= .02:
            guides.append(choices[0][1])
    return guides if len(guides) == 2 else []


def analysis_cell_bounds(start: float, end: float, beats: list[float], grid: str,
                         beats_per_bar: int, tempo: float) -> list[tuple[float, float]]:
    start, end = float(start), float(end)
    if end <= start:
        return []
    beat_period = 60.0 / max(float(tempo), 1.0)
    valid = sorted({float(value) for value in beats if start < float(value) < end})
    observed = [start, *valid, end]
    beat_grid: list[float] = [start]
    for left, right in zip(observed, observed[1:]):
        gap = right - left
        count = max(1, round(gap / beat_period))
        if not valid and gap > beat_period * 1.25:
            point = left + beat_period
            while point < right - 1e-6:
                beat_grid.append(point)
                point += beat_period
        elif count > 1 and gap > beat_period * 1.4:
            beat_grid.extend(left + gap * index / count for index in range(1, count))
        beat_grid.append(right)
    beat_grid[-1] = end
    if grid == "half_bar":
        half_beat = max(0.5, float(beats_per_bar) / 2)
        whole = int(half_beat)
        fraction = half_beat - whole
        split_index = min(len(beat_grid) - 1, whole)
        split = beat_grid[split_index]
        if fraction and split_index + 1 < len(beat_grid):
            split += (beat_grid[split_index + 1] - split) * fraction
        boundaries = [start, split, end]
    else:
        boundaries = beat_grid
        if grid == "half_beat":
            boundaries = [point for left, right in zip(beat_grid, beat_grid[1:]) for point in (left, (left + right) / 2)] + [end]
    # Stored events use milliseconds; collapse near-duplicate beat/end points.
    precise = [start]
    for point in boundaries[1:-1]:
        if round(point, 3) > round(precise[-1], 3):
            precise.append(point)
    if round(end, 3) == round(precise[-1], 3):
        precise[-1] = end
    else:
        precise.append(end)
    return [(round(left, 6), round(right, 6)) for left, right in zip(precise, precise[1:]) if right - left > 1e-6]


def stabilize_chord_cells(cells: list[dict[str, Any]], np: Any, options: dict[str, Any]) -> None:
    """Choose a coherent sequence without imposing a minimum chord duration."""
    from chordpilot_chords import parse_candidate_symbol, chord_tones_for_candidate, score_chord_candidate, rank_chord_candidates
    from chordpilot_common import CHORD_QUALITIES
    mode = options.get('chord_stability', 'detailed')
    if mode == 'detailed' or not cells:
        return
    penalty = .8 if mode == 'balanced' else 1.6
    complexity = .35 if mode == 'balanced' else .7
    beat_period = max(.01, float(options.get('beat_period', .5)))
    bar_duration = beat_period * int(options.get('beats_per_bar', 4))
    radius = bar_duration * (1 if mode == 'balanced' else 2)
    centers = [(cell['start'] + cell['end']) / 2 for cell in cells]
    parsed, context_choices = {}, {}
    anchors = []
    harmonic_anchors = []
    for cell_index, cell in enumerate(cells):
        candidate = parse_candidate_symbol(cell['chord'])
        parsed[cell['chord']] = candidate
        core = []
        if candidate:
            quality = CHORD_QUALITIES[candidate['quality']]
            if quality['third'] is not None and quality['fifth'] is not None:
                core = [candidate['root'], (candidate['root'] + quality['third']) % 12, (candidate['root'] + quality['fifth']) % 12]
        chroma = cell['_chroma'] / (float(cell['_chroma'].sum()) or 1)
        anchors.append(candidate['root'] if core and sum(float(chroma[pc]) for pc in core) >= .75 and all(float(chroma[pc]) >= .1 for pc in core) else None)
        reference = cell.get('bass_reference') or {}
        root = None
        anchor_candidate = candidate
        if candidate and reference.get('origin') == 'accompaniment' and reference.get('confidence', 0) >= .62:
            measured_root = reference.get('pitch_class')
            if candidate['root'] != measured_root:
                # Equivalent slash voicings must not hide a supported root change.
                # Only use a root candidate close to the local winner; a genuine
                # inversion with much stronger evidence keeps its original root.
                anchor_candidate = None
                pitches = cell.get('evidence', {}).get('detected_pitches')
                measured = chroma
                if pitches:
                    measured = np.zeros(12)
                    for pitch in pitches:
                        measured[pitch['midi'] % 12] += pitch['strength']
                    measured /= float(measured.sum()) or 1
                retained = {pc for pc in chord_tones_for_candidate(candidate) if float(measured[pc]) >= .06}
                for item in cell['_ranked']:
                    if item['raw_score'] < cell['_ranked'][0]['raw_score'] - .35:
                        break
                    possible = parse_candidate_symbol(item['chord'])
                    if possible and possible['root'] == measured_root and retained.issubset(chord_tones_for_candidate(possible)):
                        anchor_candidate = possible
                        break
            if anchor_candidate:
                root = measured_root
        elif candidate and not reference and float(chroma[candidate['root']]) >= .045:
            nearby = cells[max(0, cell_index - 1):cell_index] + cells[cell_index + 1:cell_index + 2]
            if any((neighbor.get('bass_reference') or {}).get('origin') == 'accompaniment'
                and (neighbor.get('bass_reference') or {}).get('pitch_class') == candidate['root']
                and (parse_candidate_symbol(neighbor['chord']) or {}).get('root') == candidate['root'] for neighbor in nearby):
                root = candidate['root']
        guides = observed_guide_tones(chroma, root) if root is not None else []
        if root is not None and not guides and reference.get('origin') == 'accompaniment':
            thirds = sorted(((float(chroma[(root + interval) % 12]), (root + interval) % 12) for interval in (3, 4)), reverse=True)
            seventh = max((root + 10) % 12, (root + 11) % 12, key=lambda pc: chroma[pc])
            if thirds[0][0] >= .06 and thirds[0][0] - thirds[1][0] >= .02 and float(chroma[seventh]) >= .06:
                guides = [thirds[0][1], seventh]
        harmonic_anchors.append((root, chord_tones_for_candidate(anchor_candidate) | set(guides)) if anchor_candidate and guides else None)
    boundaries = [0]
    region_roots = [None]
    previous_anchor = None
    # Guitar roots may appear only at attacks. Two matching guide-tone observations
    # mark a harmonic change; nested pitch sets remain one arpeggiated harmony.
    if any((cell.get('bass_reference') or {}).get('origin') == 'accompaniment' for cell in cells):
        for index in range(len(cells) - 1):
            current, following = harmonic_anchors[index:index + 2]
            if not current or not following or current[0] != following[0]:
                continue
            if previous_anchor and current[0] != previous_anchor[0]:
                nested = current[1].issubset(previous_anchor[1]) or previous_anchor[1].issubset(current[1])
                reference = cells[index].get('bass_reference') or {}
                if nested and float(reference.get('confidence', 0)) < .8:
                    continue
                boundaries.append(index)
                region_roots.append(current[0])
            elif previous_anchor is None:
                region_roots[0] = current[0]
            previous_anchor = current
    boundaries.append(len(cells))
    sparse_bass_regions = []
    for start, end in zip(boundaries, boundaries[1:]):
        independent_bass = sum((cell.get('bass_reference') or {}).get('origin') == 'bass'
            and float((cell.get('bass_reference') or {}).get('confidence', 0)) >= .62
            for cell in cells[start:end])
        sparse_bass_regions.append(independent_bass < .2 * (end - start))
    costs, parents = {}, []
    for index, cell in enumerate(cells):
        cell.setdefault('detected_chord', cell['chord'])
        left = bisect_left(centers, centers[index] - radius)
        right = bisect_right(centers, centers[index] + radius)
        region = bisect_right(boundaries, index) - 1
        left, right = max(left, boundaries[region]), min(right, boundaries[region + 1])
        neighbors = cells[left:right]
        context = np.mean([item['_chroma'] for item in neighbors], axis=0)
        context /= float(context.sum()) or 1
        ranked = {item['chord']: item for item in cell['_ranked']}
        symbols = {item['chord'] for item in cell['_ranked'][:8]} | {item['detected_chord'] for item in neighbors if 'detected_chord' in item} | {item['chord'] for item in neighbors}
        context_block = (region, int((centers[index] - cells[0]['start']) / bar_duration))
        if context_block not in context_choices:
            contextual_ranks, _ = rank_chord_candidates(context, options.get('key', 'C'), None, None, None, np, options)
            context_choices[context_block] = {item['chord'] for item in contextual_ranks[:3]}
        symbols |= context_choices[context_block]
        # Do not borrow neighboring chord tones into an already clear chord.
        clear_change = anchors[index] is not None and any(root is not None and root != anchors[index] for root in anchors[left:right])
        if clear_change:
            symbols = {cell['detected_chord']}
        if cell['detected_chord'] == 'N.C.':
            symbols = {'N.C.'}
        bass = cell.get('bass_reference') or {}
        clear_bass = float(bass.get('confidence', 0)) >= .62
        # Protect observed third/seventh guide tones before borrowing neighboring voicings.
        # A low accompaniment note can be a chord tone in an inversion, so bind guides
        # only when the local winner agrees that it is the harmonic root.
        guide_tones = []
        local_candidate = parsed.get(cell['detected_chord'])
        if clear_bass and local_candidate and CHORD_QUALITIES[local_candidate['quality']]['third'] is not None and local_candidate['root'] == bass.get('pitch_class'):
            chroma = cell['_chroma'] / (float(cell['_chroma'].sum()) or 1)
            root = local_candidate['root']
            guide_tones = observed_guide_tones(chroma, root)
        previous_bass = cells[index - 1].get('bass_reference') or {} if index else {}
        bass_change = clear_bass and float(previous_bass.get('confidence', 0)) >= .62 and bass.get('pitch_class') != previous_bass.get('pitch_class')
        scores, links = {}, {}
        for symbol in sorted(symbols):
            if symbol not in ranked:
                continue
            if symbol not in parsed:
                parsed[symbol] = parse_candidate_symbol(symbol)
            candidate = parsed[symbol]
            if guide_tones and candidate and symbol != cell['detected_chord'] and not set(guide_tones).issubset(chord_tones_for_candidate(candidate)):
                continue
            if clear_bass and candidate and symbol != cell['detected_chord']:
                compatible = bass.get('pitch_class') in {candidate['root'], candidate['bass']}
                if bass.get('origin') == 'accompaniment':
                    compatible |= bass.get('pitch_class') in chord_tones_for_candidate(candidate)
                if not compatible:
                    continue
            emission = ranked[symbol]['raw_score']
            if candidate:
                emission += .8 * float(context[candidate['root']])
                contextual = score_chord_candidate(candidate, context, options.get('key', 'C'), None, None, bass if clear_bass else None, np, options)['raw_score']
                context_weight = .15 if mode == 'balanced' else .4
                emission = emission * (1 - context_weight) + contextual * context_weight
                if candidate['root'] == region_roots[region] and (not sparse_bass_regions[region]
                    or clear_bass and bass.get('pitch_class') == candidate['root']):
                    # An early anchor cannot claim later cells in a bass-sparse
                    # section without a local measurement, even in a short region.
                    emission += penalty
                if not clear_bass:
                    emission -= complexity * max(0, len(chord_tones_for_candidate(candidate)) - 5)
            emission *= (cell['end'] - cell['start']) / beat_period
            if not costs:
                scores[symbol], links[symbol] = emission, None
                continue
            def transition(previous):
                if previous == symbol:
                    return 0
                if bass_change or previous == 'N.C.' or symbol == 'N.C.':
                    return .05
                former = parsed.get(previous)
                same_family = False
                if candidate and former and candidate['root'] == former['root'] and candidate['bass'] == former['bass']:
                    current_quality = CHORD_QUALITIES[candidate['quality']]
                    former_quality = CHORD_QUALITIES[former['quality']]
                    same_family = (current_quality['third'] == former_quality['third']
                        and current_quality.get('suspension') == former_quality.get('suspension')
                        and (10 in current_quality['intervals'], 11 in current_quality['intervals']) == (10 in former_quality['intervals'], 11 in former_quality['intervals']))
                return penalty * (.55 if same_family else 1)
            best_previous = max(costs, key=lambda previous: costs[previous] - transition(previous))
            scores[symbol] = emission + costs[best_previous] - transition(best_previous)
            links[symbol] = best_previous
        costs = scores
        parents.append(links)
    symbol = max(costs, key=costs.get)
    for index in range(len(cells) - 1, -1, -1):
        cell = cells[index]
        cell['chord'] = symbol
        region = bisect_right(boundaries, index) - 1
        cell['_stability'] = {'mode': mode, 'detected_chord': cell['detected_chord'], 'selected_chord': symbol,
            'context_range': [cells[boundaries[region]]['start'], cells[boundaries[region + 1] - 1]['end']]}
        symbol = parents[index][symbol]


def group_chord_cells(cells: list[dict[str, Any]], np: Any = None,
                      options: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    from chordpilot_chords import parse_candidate_symbol
    options = options or {}
    grouped = [dict(cell, detected_chord=cell.get("detected_chord", cell.get("chord"))) for cell in cells]
    for index in range(1, len(grouped) - 1):
        left, middle, right = grouped[index - 1:index + 2]
        alternative = next((item for item in middle.get("alternatives", []) if item.get("chord") == left.get("chord")), None)
        winning = next((item for item in middle.get("alternatives", []) if item.get("chord") == middle.get("chord")), None)
        basses = [item.get("bass_reference") or {} for item in (left, middle, right)]
        supported_bass_change = (all(float(bass.get("confidence", 0)) >= .62 for bass in basses)
            and basses[0].get("pitch_class") == basses[2].get("pitch_class") != basses[1].get("pitch_class"))
        # An isolated added ninth between identical triads is usually melody.
        # Keep the original cell detection for inspection; fixed grids stay exact.
        middle_candidate = parse_candidate_symbol(middle.get("chord", ""))
        neighbor_candidate = parse_candidate_symbol(left.get("chord", ""))
        passing_ninth = bool(middle_candidate and neighbor_candidate
            and middle_candidate["quality"] in {"add9", "madd9"}
            and neighbor_candidate["quality"] == ("m" if middle_candidate["quality"] == "madd9" else "")
            and middle_candidate["root"] == neighbor_candidate["root"]
            and middle_candidate["bass"] == neighbor_candidate["bass"])
        if passing_ninth:
            chroma = middle.get("_chroma")
            root = middle_candidate["root"]
            third = 3 if middle_candidate["quality"] == "madd9" else 4
            passing_ninth = bool(chroma is not None
                and float(middle["end"]) - float(middle["start"]) <= float(options.get("beat_period", 0)) * 1.05
                and float(chroma[(root + 2) % 12]) < 0.8 * min(float(chroma[(root + third) % 12]), float(chroma[(root + 7) % 12])))
        if (left.get("chord") == right.get("chord") and middle.get("chord") != left.get("chord")
                and not supported_bass_change
                and middle.get("chord") != "N.C." and left.get("chord") != "N.C."
                and (passing_ninth or (float(middle.get("confidence", 0)) < 0.55 and alternative and winning
                and float(alternative.get("score", 0)) >= float(winning.get("score", 0)) - 0.05))):
            middle["chord"] = left["chord"]
    result: list[dict[str, Any]] = []
    for cell in grouped:
        if result and result[-1].get("chord") == cell.get("chord") and abs(float(result[-1]["end"]) - float(cell["start"])) < 1e-5:
            left_duration = float(result[-1]["end"]) - float(result[-1]["start"])
            right_duration = float(cell["end"]) - float(cell["start"])
            if np is not None and "_chroma" in result[-1] and "_chroma" in cell:
                total = left_duration + right_duration
                result[-1]["_chroma"] = (result[-1]["_chroma"] * left_duration + cell["_chroma"] * right_duration) / total
                if float(result[-1]["_chroma"].sum()) > 0:
                    result[-1]["_chroma"] /= result[-1]["_chroma"].sum()
            result[-1]["end"] = cell["end"]
            result[-1].setdefault("cells", []).append(cell)
        else:
            cell.setdefault("cells", [cell.copy()])
            result.append(cell)
    return result
