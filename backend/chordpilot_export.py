from chordpilot_common import *

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
    for bar in chart.get("bars", []):
        section = bar.get("section") or "Section"
        if section != current_section:
            current_section = section
            lines.extend(["", f"[{section}]"])
        repeat_start = "|:" if bar.get("repeat_start") else "|"
        repeat_end = f" x{bar.get('repeat_end')}" if bar.get("repeat_end") else ""
        lyric = f"  {bar.get('lyrics', '')}" if bar.get("lyrics") else ""
        lines.append(f"{repeat_start} {bar.get('number', ''):>3}  {bar.get('chord', ''):<12} {repeat_end}{lyric}")
    lines.append("")
    return "\n".join(lines)

def write_csv(chart: dict[str, Any], destination: Path) -> None:
    with destination.open("w", newline="", encoding="utf8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=["number", "section", "chord", "lyrics", "start", "repeat_start", "repeat_end", "notes", "confidence"],
        )
        writer.writeheader()
        for bar in chart.get("bars", []):
            writer.writerow({key: bar.get(key, "") for key in writer.fieldnames})

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
        if index == 1:
            attributes = ET.SubElement(measure, "attributes")
            ET.SubElement(attributes, "divisions").text = "1"
            key = ET.SubElement(attributes, "key")
            ET.SubElement(key, "fifths").text = str(key_to_fifths(chart.get("key", "C")))
            time = ET.SubElement(attributes, "time")
            ET.SubElement(time, "beats").text = str(beats)
            ET.SubElement(time, "beat-type").text = str(beat_type)
            clef = ET.SubElement(attributes, "clef")
            ET.SubElement(clef, "sign").text = "G"
            ET.SubElement(clef, "line").text = "2"

        harmony = chord_to_harmony(bar.get("chord", "C"))
        measure.append(harmony)

        if bar.get("lyrics"):
            direction = ET.SubElement(measure, "direction", placement="above")
            direction_type = ET.SubElement(direction, "direction-type")
            ET.SubElement(direction_type, "words").text = str(bar.get("lyrics", ""))

        note = ET.SubElement(measure, "note")
        ET.SubElement(note, "rest")
        ET.SubElement(note, "duration").text = str(beats)
        ET.SubElement(note, "type").text = duration_type(beats)

        if bar.get("repeat_start") or bar.get("repeat_end"):
            barline = ET.SubElement(measure, "barline", location="right")
            repeat = ET.SubElement(barline, "repeat")
            repeat.set("direction", "backward" if bar.get("repeat_end") else "forward")
            if bar.get("repeat_end"):
                repeat.set("times", str(bar.get("repeat_end")))

    ET.indent(score, space="  ")
    return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n" + ET.tostring(score, encoding="unicode")

def chord_to_harmony(symbol: str) -> ET.Element:
    root_name, kind_text = parse_chord_symbol(symbol)
    harmony = ET.Element("harmony")
    root = ET.SubElement(harmony, "root")
    ET.SubElement(root, "root-step").text = root_name[0] if root_name else "C"
    if len(root_name) > 1 and root_name[1] in {"#", "b"}:
        ET.SubElement(root, "root-alter").text = "1" if root_name[1] == "#" else "-1"
    kind = ET.SubElement(harmony, "kind")
    kind.text = kind_text
    kind.set("text", symbol or "C")
    return harmony

def parse_chord_symbol(symbol: str) -> tuple[str, str]:
    clean = (symbol or "C").strip().split()[0].split("/")[0]
    if len(clean) >= 2 and clean[1] in {"#", "b"}:
        root = clean[:2]
        suffix = clean[2:]
    else:
        root = clean[:1] or "C"
        suffix = clean[1:]

    suffix_lower = suffix.lower()
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
