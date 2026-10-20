from __future__ import annotations

from chordpilot_common import *
from chordpilot_chords import parse_candidate_symbol

def bar_chord_events(chart: dict[str, Any], index: int) -> list[dict[str, Any]]:
    """Return valid complete timed events, or a non-mutating legacy bar view."""
    bars = chart.get("bars", [])
    if not 0 <= index < len(bars):
        return []
    bar = bars[index]
    try:
        start = float(bar.get("start", 0) or 0)
        if index + 1 < len(bars):
            end = float(bars[index + 1].get("start", start) or start)
        else:
            end = float(chart.get("duration") or 0)
            if end <= start:
                beats, _ = parse_time_signature(chart.get("time_signature", "4/4"))
                end = start + (60.0 / max(1, int(chart.get("tempo", 120) or 120))) * beats
    except (TypeError, ValueError, OverflowError):
        return []
    if not math.isfinite(start) or not math.isfinite(end):
        return []
    source = bar.get("chord_events")
    if isinstance(source, list) and source and end > start:
        events = []
        cursor = start
        for event in source:
            if not isinstance(event, dict):
                events = []
                break
            try:
                event_start = float(event.get("start", -1))
                event_end = float(event.get("end", -1))
            except (TypeError, ValueError, OverflowError):
                events = []
                break
            chord = event.get("chord")
            if (not math.isfinite(event_start) or not math.isfinite(event_end)
                    or abs(event_start - cursor) > 1e-6 or event_end <= event_start or event_end > end + 1e-6
                    or not isinstance(chord, str) or not chord.strip()
                    or ("alternatives" in event and not isinstance(event["alternatives"], list))):
                events = []
                break
            events.append(dict(event))
            cursor = event_end
        if events and abs(cursor - end) <= 1e-6:
            return events
    if end <= start:
        return []
    legacy = {"start": start, "end": end, "chord": bar.get("chord") or "N.C."}
    for key in ("confidence", "chord_confidence", "pitch_confidence", "alternatives", "evidence", "bass_reference", "debug"):
        if key in bar:
            legacy[key] = bar[key]
    return [legacy]

def has_valid_stored_events(chart: dict[str, Any], index: int) -> bool:
    bars = chart.get("bars", [])
    if not (0 <= index < len(bars)):
        return False
    bar = bars[index]
    source = bars[index].get("chord_events")
    if not isinstance(source, list) or not source:
        return False
    try:
        start = float(bar.get("start", 0) or 0)
        end = float(bars[index + 1].get("start", start) or start) if index + 1 < len(bars) else float(chart.get("duration") or 0)
        if end <= start:
            beats, _ = parse_time_signature(chart.get("time_signature", "4/4"))
            end = start + (60.0 / max(1, int(chart.get("tempo", 120) or 120))) * beats
        if not math.isfinite(start) or not math.isfinite(end) or end <= start:
            return False
        cursor = start
        for event in source:
            if not isinstance(event, dict):
                return False
            event_start = float(event["start"])
            event_end = float(event["end"])
            if (not math.isfinite(event_start) or not math.isfinite(event_end) or abs(event_start - cursor) > 1e-6
                    or event_end <= event_start or event_end > end + 1e-6
                    or not isinstance(event.get("chord"), str) or not event["chord"].strip()
                    or ("alternatives" in event and not isinstance(event["alternatives"], list))):
                return False
            cursor = event_end
        return abs(cursor - end) <= 1e-6
    except (KeyError, TypeError, ValueError, OverflowError):
        return False

def chart_bar_end(chart: dict[str, Any], index: int) -> float:
    events = bar_chord_events(chart, index)
    return float(events[-1]["end"]) if events else float(chart.get("duration", 0) or 0)

def event_offset_quarters(chart: dict[str, Any], bar_start: float, event_start: float) -> float:
    """Map original seconds to MusicXML quarter-note offsets, following beat_times when available."""
    _, denominator = parse_time_signature(chart.get("time_signature", "4/4"))
    beat_scale = 4.0 / max(1, denominator)
    beats = sorted({float(value) for value in chart.get("beat_times", [])
                    if isinstance(value, (int, float)) and math.isfinite(float(value))})
    if len(beats) >= 2:
        def beat_position(time: float) -> float:
            if time <= beats[0]:
                return (time - beats[0]) / (beats[1] - beats[0]) if beats[1] > beats[0] else 0.0
            for beat_index in range(1, len(beats)):
                if time <= beats[beat_index]:
                    span = beats[beat_index] - beats[beat_index - 1]
                    fraction = (time - beats[beat_index - 1]) / span if span > 0 else 0.0
                    return beat_index - 1 + fraction
            span = beats[-1] - beats[-2]
            return len(beats) - 1 + (time - beats[-1]) / span if span > 0 else len(beats) - 1
        return max(0.0, beat_position(event_start) - beat_position(bar_start)) * beat_scale
    tempo = max(1, int(chart.get("tempo", 120) or 120))
    return max(0.0, (event_start - bar_start) * tempo / 60.0 * beat_scale)

def display_beat_offset(chart: dict[str, Any], bar_start: float, event_start: float) -> str:
    _, denominator = parse_time_signature(chart.get("time_signature", "4/4"))
    units = event_offset_quarters(chart, bar_start, event_start) / (4.0 / max(1, denominator))
    return f"{units:.3g}"

def export_chart(chart_path: str, format_name: str, output_path: str) -> dict[str, Any]:
    chart = json.loads(Path(chart_path).read_text(encoding="utf8"))
    destination = Path(output_path)
    format_key = format_name.lower()

    if format_key == "txt":
        destination.write_text(render_txt(chart), encoding="utf8")
    elif format_key == "csv":
        write_csv(chart, destination)
    elif format_key == "json":
        destination.write_text(json.dumps(chart, indent=2), encoding="utf8")
    elif format_key == "musicxml":
        destination.write_text(render_musicxml(chart), encoding="utf8")
    else:
        raise ValueError(f"Unsupported export format: {format_name}")

    return {"ok": True, "path": str(destination), "format": format_key}

def render_txt(chart: dict[str, Any]) -> str:
    lines = [
        chart.get("title", "Untitled"),
        f"Key: {chart.get('key', 'C')}  Tempo: {chart.get('tempo', 120)}  Time: {chart.get('time_signature', '4/4')}",
        "",
    ]
    current_section = None
    for bar_index, bar in enumerate(chart.get("bars", [])):
        section = bar.get("section") or "Section"
        if section != current_section:
            current_section = section
            lines.extend(["", f"[{section}]"])
        repeat_start = "|:" if bar.get("repeat_start") else "|"
        repeat_end = f" x{bar.get('repeat_end')}" if bar.get("repeat_end") else ""
        lyric = f"  {bar.get('lyrics', '')}" if bar.get("lyrics") else ""
        if has_valid_stored_events(chart, bar_index):
            symbols = " / ".join(f"{display_beat_offset(chart, float(bar.get('start', 0) or 0), float(event['start']))}: {event['chord']}" for event in bar_chord_events(chart, bar_index))
        else:
            symbols = str(bar.get("chord", ""))
        lines.append(f"{repeat_start} {bar.get('number', ''):>3}  {symbols:<24} {repeat_end}{lyric}")
    lines.append("")
    return "\n".join(lines)

def write_csv(chart: dict[str, Any], destination: Path) -> None:
    has_timed_events = any(has_valid_stored_events(chart, index) for index, _ in enumerate(chart.get("bars", [])))
    fields = ["number", "section", "chord", "lyrics", "start"]
    if has_timed_events:
        fields.append("end")
    fields.extend(["repeat_start", "repeat_end", "notes", "confidence"])
    with destination.open("w", newline="", encoding="utf8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=fields,
        )
        writer.writeheader()
        for index, bar in enumerate(chart.get("bars", [])):
            if not has_timed_events:
                writer.writerow({key: bar.get(key, "") for key in writer.fieldnames})
                continue
            events = bar_chord_events(chart, index)
            timed = has_valid_stored_events(chart, index)
            for event in (events if timed else [{"chord": bar.get("chord", ""), "start": bar.get("start", ""), "end": "", "confidence": bar.get("confidence", "")} ]):
                row = {key: bar.get(key, "") for key in writer.fieldnames}
                row.update({"chord": event["chord"], "start": event["start"], "end": event["end"], "confidence": event.get("confidence", "")})
                writer.writerow(row)

def render_musicxml(chart: dict[str, Any]) -> str:
    score = ET.Element("score-partwise", version="3.1")
    movement = ET.SubElement(score, "movement-title")
    movement.text = chart.get("title", "Untitled")

    part_list = ET.SubElement(score, "part-list")
    score_part = ET.SubElement(part_list, "score-part", id="P1")
    part_name = ET.SubElement(score_part, "part-name")
    part_name.text = "Chord Chart"

    part = ET.SubElement(score, "part", id="P1")
    beats, beat_type = parse_time_signature(chart.get("time_signature", "4/4"))

    for index, bar in enumerate(chart.get("bars", []), start=1):
        measure = ET.SubElement(part, "measure", number=str(bar.get("number", index)))
        pickup = bar.get('pickup_beats')
        measure_beats = pickup if isinstance(pickup, int) and 0 < pickup < beats else beats
        if measure_beats < beats:
            measure.set('implicit', 'yes')
        if index == 1:
            attributes = ET.SubElement(measure, "attributes")
            ET.SubElement(attributes, "divisions").text = "96"
            key = ET.SubElement(attributes, "key")
            ET.SubElement(key, "fifths").text = str(key_to_fifths(chart.get("key", "C")))
            time = ET.SubElement(attributes, "time")
            ET.SubElement(time, "beats").text = str(beats)
            ET.SubElement(time, "beat-type").text = str(beat_type)
            clef = ET.SubElement(attributes, "clef")
            ET.SubElement(clef, "sign").text = "G"
            ET.SubElement(clef, "line").text = "2"

        events = bar_chord_events(chart, index - 1)
        for event in events:
            harmony = chord_to_harmony(event["chord"])
            offset = round(event_offset_quarters(chart, float(bar.get("start", 0) or 0), float(event["start"])) * 96)
            if offset:
                ET.SubElement(harmony, "offset").text = str(offset)
            measure.append(harmony)

        if bar.get("lyrics"):
            direction = ET.SubElement(measure, "direction", placement="above")
            direction_type = ET.SubElement(direction, "direction-type")
            ET.SubElement(direction_type, "words").text = str(bar.get("lyrics", ""))

        note = ET.SubElement(measure, "note")
        ET.SubElement(note, "rest")
        quarter_notes = measure_beats * 4 / max(1, beat_type)
        ET.SubElement(note, "duration").text = str(round(quarter_notes * 96))
        ET.SubElement(note, "type").text = 'half' if measure_beats < beats and quarter_notes == 3 else duration_type(round(quarter_notes))
        if measure_beats < beats and quarter_notes == 3:
            ET.SubElement(note, 'dot')

        if bar.get("repeat_start") or bar.get("repeat_end"):
            barline = ET.SubElement(measure, "barline", location="right")
            repeat = ET.SubElement(barline, "repeat")
            repeat.set("direction", "backward" if bar.get("repeat_end") else "forward")
            if bar.get("repeat_end"):
                repeat.set("times", str(bar.get("repeat_end")))

    ET.indent(score, space="  ")
    return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n" + ET.tostring(score, encoding="unicode")

def chord_to_harmony(symbol: str) -> ET.Element:
    if (symbol or "").strip().lower() in {"n.c.", "nc", "no chord", "no-chord"}:
        harmony = ET.Element("harmony")
        kind = ET.SubElement(harmony, "kind")
        kind.text = "none"
        kind.set("text", symbol or "N.C.")
        return harmony
    root_name, kind_text = parse_chord_symbol(symbol)
    harmony = ET.Element("harmony")
    root = ET.SubElement(harmony, "root")
    ET.SubElement(root, "root-step").text = root_name[0] if root_name else "C"
    if len(root_name) > 1 and root_name[1] in {"#", "b"}:
        ET.SubElement(root, "root-alter").text = "1" if root_name[1] == "#" else "-1"
    kind = ET.SubElement(harmony, "kind")
    kind.text = kind_text
    kind.set("text", symbol or "C")
    candidate = parse_candidate_symbol(symbol)
    if candidate and candidate["bass"] is not None:
        bass_name = PITCH_NAMES[candidate["bass"]]
        bass = ET.SubElement(harmony, "bass")
        ET.SubElement(bass, "bass-step").text = bass_name[0]
        if len(bass_name) > 1:
            ET.SubElement(bass, "bass-alter").text = "1" if bass_name[1] == "#" else "-1"
    if re.match(r"^[A-G][#b]?m?add9(?:/|$)", symbol or ""):
        degree = ET.SubElement(harmony, "degree")
        ET.SubElement(degree, "degree-value").text = "9"
        ET.SubElement(degree, "degree-alter").text = "0"
        ET.SubElement(degree, "degree-type").text = "add"
    alterations = {"6/9": [(9, 0)], "m6/9": [(9, 0)], "7#9": [(9, 1)],
        "7b5": [(5, -1)], "7#5": [(5, 1)], "7b9": [(9, -1)],
        "7#11": [(11, 1)], "maj7#11": [(11, 1)], "7b13": [(13, -1)],
        "9#11": [(11, 1)], "13#11": [(11, 1)], "13b9": [(9, -1)],
        "mmaj9": [(9, 0)], "7b9#11": [(9, -1), (11, 1)],
        "7#9#11": [(9, 1), (11, 1)]}
    for value, alteration in alterations.get(candidate["quality"], []) if candidate else []:
        degree = ET.SubElement(harmony, "degree")
        ET.SubElement(degree, "degree-value").text = str(value)
        ET.SubElement(degree, "degree-alter").text = str(alteration)
        ET.SubElement(degree, "degree-type").text = "alter" if value == 5 else "add"
    if candidate and candidate["quality"] in {"7sus4", "9sus4"}:
        kind.text = "suspended-fourth"
        for value, alteration in [(7, -1)] + ([(9, 0)] if candidate["quality"] == "9sus4" else []):
            degree = ET.SubElement(harmony, "degree")
            ET.SubElement(degree, "degree-value").text = str(value)
            ET.SubElement(degree, "degree-alter").text = str(alteration)
            ET.SubElement(degree, "degree-type").text = "add"
    return harmony

def parse_chord_symbol(symbol: str) -> tuple[str, str]:
    candidate = parse_candidate_symbol(symbol)
    if candidate:
        kinds = {"6": "major-sixth", "m6": "minor-sixth", "6/9": "major-sixth", "m6/9": "minor-sixth",
            "dim7": "diminished-seventh", "mmaj7": "major-minor", "m7b5": "half-diminished",
            "7b5": "dominant", "7#5": "dominant", "7b9": "dominant", "7#11": "dominant",
            "7b13": "dominant", "maj7#11": "major-seventh",
            "9#11": "dominant-ninth", "13#11": "dominant-13th", "13b9": "dominant-13th",
            "mmaj9": "major-minor", "7b9#11": "dominant", "7#9#11": "dominant"}
        if candidate['quality'] in kinds:
            return PITCH_NAMES[candidate['root']], kinds[candidate['quality']]
    clean = (symbol or "C").strip().split()[0].split("/")[0]
    if len(clean) >= 2 and clean[1] in {"#", "b"}:
        root = clean[:2]
        suffix = clean[2:]
    else:
        root = clean[:1] or "C"
        suffix = clean[1:]

    suffix_lower = suffix.lower()
    if suffix in {"M9", "M13"}:
        suffix_lower = "maj" + suffix[1:]
    extended_kinds = {"maj9": "major-ninth", "m9": "minor-ninth", "9": "dominant-ninth", "11": "dominant-11th", "m11": "minor-11th", "13": "dominant-13th", "maj13": "major-13th"}
    if suffix_lower in extended_kinds:
        return root, extended_kinds[suffix_lower]
    if suffix_lower.startswith("dim"):
        return root, "diminished"
    if suffix_lower.startswith("aug") or suffix_lower.startswith("+"):
        return root, "augmented"
    if suffix_lower.startswith("m") and not suffix_lower.startswith("maj"):
        if "7" in suffix_lower:
            return root, "minor-seventh"
        return root, "minor"
    if suffix_lower.startswith("maj7"):
        return root, "major-seventh"
    if "7" in suffix_lower:
        return root, "dominant"
    if suffix_lower.startswith("sus"):
        return root, "suspended-fourth"
    return root, "major"

def parse_time_signature(value: str) -> tuple[int, int]:
    try:
        beats, beat_type = str(value).split("/", 1)
        return int(beats), int(beat_type)
    except Exception:
        return 4, 4

def duration_type(beats: int) -> str:
    return "whole" if beats >= 4 else "half" if beats == 2 else "quarter"

def key_to_fifths(key: str) -> int:
    lookup = {
        "Cb": -7,
        "Gb": -6,
        "Db": -5,
        "Ab": -4,
        "Eb": -3,
        "Bb": -2,
        "F": -1,
        "C": 0,
        "G": 1,
        "D": 2,
        "A": 3,
        "E": 4,
        "B": 5,
        "F#": 6,
        "C#": 7,
    }
    return lookup.get(str(key).replace("m", ""), 0)
