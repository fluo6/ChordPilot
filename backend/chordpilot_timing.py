from __future__ import annotations

from typing import Any


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
