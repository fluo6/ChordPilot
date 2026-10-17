"""Measure isolated voicing-snapshot cost on an existing accompaniment WAV."""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).absolute().parents[2] / "backend"))
from chordpilot_audio import load_audio
from chordpilot_spectrum import spectral_power_for_crop, voicing_frames_for_crop


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("audio", type=Path)
    parser.add_argument("--seconds", type=float, default=60)
    args = parser.parse_args()
    if args.seconds <= 0:
        parser.error("--seconds must be positive")

    import numpy as np

    audio, sample_rate = load_audio(args.audio)
    crop = np.ascontiguousarray(audio[:round(args.seconds * sample_rate)])
    start = time.perf_counter()
    power = spectral_power_for_crop(crop, sample_rate, np)
    spectrum_seconds = time.perf_counter() - start
    start = time.perf_counter()
    frames = voicing_frames_for_crop(crop, sample_rate, np, {}, power, power)
    voicing_seconds = time.perf_counter() - start
    report = {
        "audio": str(args.audio),
        "duration_seconds": round(len(crop) / sample_rate, 3),
        "sample_rate": sample_rate,
        "spectrum_seconds": round(spectrum_seconds, 3),
        "voicing_seconds": round(voicing_seconds, 3),
        "snapshot_count": len(frames),
        "nonempty_snapshots": sum(bool(frame["midis"]) for frame in frames),
        "serialized_snapshot_bytes": len(json.dumps(frames, separators=(",", ":")).encode("utf-8")),
    }
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
