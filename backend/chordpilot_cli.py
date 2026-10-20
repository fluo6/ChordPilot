from __future__ import annotations

from chordpilot_common import *
from chordpilot_analysis import analyze
from chordpilot_study import analyze_range
from chordpilot_export import export_chart, render_musicxml, render_txt

def self_test() -> dict[str, Any]:
    chart = analyze("example.wav")
    assert chart["bars"]
    xml = render_musicxml(chart)
    assert "score-partwise" in xml
    assert render_txt(chart)
    return {"ok": True, "bars": len(chart["bars"])}

def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="ChordPilot backend")
    parser.add_argument("--self-test", action="store_true")
    subparsers = parser.add_subparsers(dest="command")

    analyze_parser = subparsers.add_parser("analyze")
    analyze_parser.add_argument("audio_path")
    analyze_parser.add_argument("--mode", choices=["fast", "high-quality"], default="fast")
    analyze_parser.add_argument("--options", default="{}")

    study_parser = subparsers.add_parser("analyze-range")
    study_parser.add_argument("audio_path")
    study_parser.add_argument("--sources", required=True)
    study_parser.add_argument("--start", type=float, required=True)
    study_parser.add_argument("--end", type=float, required=True)
    study_parser.add_argument("--options", default="{}")

    export_parser = subparsers.add_parser("export")
    export_parser.add_argument("chart_path")
    export_parser.add_argument("format")
    export_parser.add_argument("output_path")

    drums_parser = subparsers.add_parser("analyze-drums")
    drums_parser.add_argument("stem_path")
    drums_parser.add_argument("--force", action="store_true")
    stems_parser = subparsers.add_parser("prepare-stems")
    stems_parser.add_argument("audio_path")

    args = parser.parse_args(argv)

    try:
        if args.self_test:
            respond(self_test())
        elif args.command == "analyze":
            respond(analyze(args.audio_path, args.mode, json.loads(args.options or "{}")))
        elif args.command == "analyze-range":
            respond(analyze_range(args.audio_path, json.loads(args.sources), args.start, args.end, json.loads(args.options)))
        elif args.command == "export":
            respond(export_chart(args.chart_path, args.format, args.output_path))
        elif args.command == "analyze-drums":
            from chordpilot_drums import analyze_drums
            respond(analyze_drums(args.stem_path, args.force))
        elif args.command == "prepare-stems":
            from chordpilot_stems import run_demucs
            respond(run_demucs(Path(args.audio_path)))
        else:
            parser.print_help(sys.stderr)
            return 2
    except Exception as exc:
        respond({"ok": False, "error": str(exc)})
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
