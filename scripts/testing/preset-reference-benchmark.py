"""Compare the five UI presets on the existing, selected chord reference windows.

Run from any directory with Python that has the ChordPilot analysis dependencies:
    python scripts/testing/preset-reference-benchmark.py

The default output is ignored local data, not a fixture. Use --cases and --presets
for a shorter diagnostic run. The fixture's known key and other non-preset options
are retained for every preset, so each comparison changes only the six UI controls.
"""
from __future__ import annotations

import argparse
from functools import lru_cache
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

import chordpilot_analysis
import chordpilot_study
from chordpilot_audio import load_audio
from chordpilot_analysis import estimate_high_quality_from_stems
from chordpilot_chords import parse_candidate_symbol
from chordpilot_common import CHORD_QUALITIES, normalize_analysis_options
from chordpilot_study import analyze_range


# Study normally decodes each recording and stem anew for every window. Reuse
# immutable decoded arrays, cropped consistently to the end of scored material.
ACTIVE_LIMIT_SECONDS = None


@lru_cache(maxsize=24)
def _cached_audio(path: Path, limit: float | None):
    audio, sr = load_audio(path)
    return (audio[:min(len(audio), round(limit * sr))] if limit else audio), sr


def cached_audio(path: Path):
    return _cached_audio(Path(path), ACTIVE_LIMIT_SECONDS)


chordpilot_study.load_audio = cached_audio
chordpilot_analysis.load_audio = cached_audio


PRESETS = {
    "general": dict(chord_timing="auto", chord_grid="beat", chord_stability="detailed",
                    tail_reduction=0, tail_half_life=.5, overtone_weighting=.5),
    "clean_guitar": dict(chord_timing="auto", chord_grid="beat", chord_stability="sustained",
                         tail_reduction=.2, tail_half_life=.5, overtone_weighting=0),
    "piano": dict(chord_timing="auto", chord_grid="half_beat", chord_stability="sustained",
                  tail_reduction=.2, tail_half_life=.5, overtone_weighting=0),
    "reverb_fx": dict(chord_timing="auto", chord_grid="half_beat", chord_stability="balanced",
                      tail_reduction=.2, tail_half_life=.8, overtone_weighting=.5),
    "fast_changes": dict(chord_timing="auto", chord_grid="half_beat", chord_stability="detailed",
                         tail_reduction=0, tail_half_life=.5, overtone_weighting=.5),
}

EVIDENCE_ABLATIONS = {
    "tail0_overtone0": {**PRESETS["general"], "tail_reduction": 0, "overtone_weighting": 0},
    "tail0_overtone50": {**PRESETS["general"], "tail_reduction": 0, "overtone_weighting": .5},
    "tail20_overtone0": {**PRESETS["general"], "tail_reduction": .2, "overtone_weighting": 0},
    "tail20_overtone50": {**PRESETS["general"], "tail_reduction": .2, "overtone_weighting": .5},
}

AUDIO = {
    "gravity": "gravity.wav",
    "hero": "reference-95s.wav",
    "overjoyed": "intro-65s.wav",
    "september": "september.wav",
    "virtual-insanity": "reference-95s.wav",
}


def stem_path(media: Path, name: str) -> Path:
    manifest = json.loads((media / "stems.json").read_text(encoding="utf-8"))
    saved = next(Path(stem["path"]) for stem in manifest["stems"] if stem["name"] == name)
    if saved.is_file():
        return saved
    matches = list((media / "cache" / "stems").rglob(name + ".wav"))
    if len(matches) != 1:
        raise FileNotFoundError(f"Expected one {name} stem under {media}; found {len(matches)}")
    return matches[0]


def matches(expected: str, actual: str) -> dict[str, bool]:
    target, detected = parse_candidate_symbol(expected), parse_candidate_symbol(actual)
    if not target:
        raise ValueError(f"Unsupported reference chord: {expected!r}")
    if not detected:
        return {"root": False, "function": False, "exact": False}

    def function(chord: dict) -> tuple:
        quality = CHORD_QUALITIES[chord["quality"]]
        intervals = quality["intervals"]
        seventh = 10 if 10 in intervals else 11 if 11 in intervals else None
        return quality["third"], seventh, quality["suspension"]

    root = target["root"] == detected["root"]
    return {
        "root": root,
        "function": root and function(target) == function(detected),
        "exact": all(target[key] == detected[key] for key in ("root", "quality", "bass")),
    }


def local_result(audio: Path, stems: dict[str, Path], windows: list[dict], options: dict) -> dict:
    rows = []
    version = None
    for window in windows:
        result = analyze_range(str(audio), {key: str(stems[key]) for key in ("other", "bass")},
                               window["start"], window["end"], options)
        version = result["algorithm_version"]
        rows.append({"start": window["start"], "end": window["end"],
                     "expected": window["chord"], "detected": result["chord"],
                     "agreement": matches(window["chord"], result["chord"])})
    return {"algorithm_version": version,
            "scores": {kind: sum(row["agreement"][kind] for row in rows) for kind in ("root", "function", "exact")},
            "total": len(rows), "windows": rows}


def timeline_result(audio: Path, stems: dict[str, Path], windows: list[dict], options: dict) -> dict:
    result = estimate_high_quality_from_stems(audio,
        {"stems": [{"name": name, "path": str(path)} for name, path in stems.items()]}, options)
    events = [event for bar in result["bars"] for event in bar["chord_events"]]
    duration = sum(window["end"] - window["start"] for window in windows)
    scores = {kind: 0.0 for kind in ("root", "function", "exact")}
    rows = []
    for window in windows:
        overlaps = []
        for event in events:
            seconds = max(0.0, min(window["end"], event["end"]) - max(window["start"], event["start"]))
            if seconds:
                agreement = matches(window["chord"], event["chord"])
                for kind in scores:
                    scores[kind] += seconds * agreement[kind]
                overlaps.append({"seconds": round(seconds, 3), "detected": event["chord"],
                                 "agreement": agreement})
        rows.append({"start": window["start"], "end": window["end"],
                     "expected": window["chord"], "overlaps": overlaps})
    return {"tempo": result["tempo"], "key": result["key"], "event_count": len(events),
            "scored_seconds": round(duration, 3),
            "scores": {kind: round(value / duration, 5) for kind, value in scores.items()},
            "windows": rows}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cases", nargs="+", choices=AUDIO, default=list(AUDIO))
    parser.add_argument("--presets", nargs="+", choices=PRESETS, default=list(PRESETS))
    parser.add_argument("--local-only", action="store_true")
    parser.add_argument("--timed-only", action="store_true")
    parser.add_argument("--full-recording", action="store_true",
                        help="Analyze full media instead of the scored span plus two seconds.")
    parser.add_argument("--evidence-ablation", action="store_true",
                        help="Compare only tail and overtone controls while holding General's other settings fixed.")
    parser.add_argument("--output", type=Path, default=ROOT / ".chordpilot-data" / "benchmarks"
                        / "reference-reports" / "presets-current.json")
    args = parser.parse_args()
    if args.local_only and args.timed_only:
        parser.error("--local-only and --timed-only are mutually exclusive")
    if args.evidence_ablation and args.presets != list(PRESETS):
        parser.error("--presets cannot be combined with --evidence-ablation")
    variants = EVIDENCE_ABLATIONS if args.evidence_ablation else PRESETS
    report = {"method": "selected fixture windows; exact means parsed root, quality and bass",
              "presets": variants, "cases": {}}
    for case in args.cases:
        global ACTIVE_LIMIT_SECONDS
        media = ROOT / ".chordpilot-data" / "benchmarks" / case
        audio = media / AUDIO[case]
        if not audio.is_file():
            raise FileNotFoundError(audio)
        stems = {name: stem_path(media, name) for name in ("other", "bass", "drums")}
        fixture = json.loads((ROOT / "tests" / "fixtures" / "chord-references" / (case + ".json"))
                             .read_text(encoding="utf-8"))
        windows = fixture["windows"]
        ACTIVE_LIMIT_SECONDS = None if args.full_recording else round(max(w["end"] for w in windows) + 2, 3)
        for window in windows:
            if not parse_candidate_symbol(window["chord"]):
                raise ValueError(f"Unsupported fixture chord: {case} {window['chord']}")
        case_report = {"title": fixture["title"], "reference_kind": fixture["reference_kind"],
                       "audio": str(audio.relative_to(ROOT)),
                       "stems": {key: str(path.relative_to(ROOT)) for key, path in stems.items()},
                       "fixture_settings": fixture["settings"], "window_count": len(windows),
                       "analysis_limit_seconds": ACTIVE_LIMIT_SECONDS,
                       "results": {}}
        report["cases"][case] = case_report
        for preset in (variants if args.evidence_ablation else args.presets):
            options = normalize_analysis_options({**fixture["settings"], **variants[preset]})
            run = {"settings": options}
            if not args.timed_only:
                run["local"] = local_result(audio, stems, windows, options)
            if not args.local_only:
                run["timeline"] = timeline_result(audio, stems, windows, options)
            case_report["results"][preset] = run
            print(json.dumps({"case": case, "preset": preset,
                              "local": run.get("local", {}).get("scores"),
                              "timeline": run.get("timeline", {}).get("scores")}), flush=True)
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
