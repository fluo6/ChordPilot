import json
import math
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))
import chordpilot_study as study
import numpy as np
from scipy.io.wavfile import write


class StudyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.sr = 22050

    def wav(self, name, frequencies=(), seconds=2):
        t = np.arange(round(seconds * self.sr)) / self.sr
        audio = sum((0.15 * np.sin(2 * np.pi * f * t) for f in frequencies), np.zeros(len(t)))
        file = self.root / name
        write(file, self.sr, audio.astype(np.float32))
        return str(file)

    def test_rejects_invalid_ranges(self):
        self.assertEqual(study.validate_range(1, 1.05, 2), (1, 1.05))
        for start, end in [(-1, 1), (0, 3), (1, 1), (1, .5), (1, 1.049), (math.nan, 1), (0, math.inf)]:
            with self.subTest(start=start, end=end), self.assertRaises(ValueError):
                study.validate_range(start, end, 2)

    def test_silence_and_settings(self):
        audio = self.wav("silent.wav")
        result = study.analyze_range(audio, {"full_mix": audio}, .2, .8, {"song_key": "G", "known_key": "Am"})
        self.assertEqual(result["chord"], "N.C.")
        self.assertEqual(result["evidence"]["detected_notes"], [])
        self.assertEqual(result["chord_confidence"], 0)
        self.assertEqual(result["key_context"], {"key": "Am", "origin": "override"})
        self.assertEqual(result["range"], [.2, .8])

    def test_outside_notes_do_not_change_evidence_or_crop_digest(self):
        audio = self.wav("song.wav", [261.63, 329.63, 392])
        before = study.analyze_range(audio, {"full_mix": audio}, .5, 1, {"known_key": "C"})
        t = np.arange(2 * self.sr) / self.sr
        data = sum((.15 * np.sin(2 * np.pi * f * t) for f in [261.63, 329.63, 392]), np.zeros(len(t)))
        data[:int(.5 * self.sr)] = .8 * np.sin(2 * np.pi * 739.99 * t[:int(.5 * self.sr)])
        data[self.sr:] = .8 * np.sin(2 * np.pi * 466.16 * t[self.sr:])
        write(audio, self.sr, data.astype(np.float32))
        after = study.analyze_range(audio, {"full_mix": audio}, .5, 1, {"known_key": "C"})
        self.assertEqual(before["evidence"], after["evidence"])
        self.assertEqual(before["input_fingerprints"]["full_mix"]["sample_sha256"], after["input_fingerprints"]["full_mix"]["sample_sha256"])
        candidates = [item["chord"] for item in after["alternatives"]]
        self.assertTrue(candidates[0].startswith("C"), candidates)

    def test_short_crop_uses_only_requested_samples(self):
        audio = self.wav("tail.wav")
        t = np.arange(2 * self.sr) / self.sr
        data = np.zeros(len(t), dtype=np.float32)
        data[int(.1 * self.sr):] = .5 * np.sin(2 * np.pi * 440 * t[int(.1 * self.sr):])
        write(audio, self.sr, data)
        result = study.analyze_range(audio, {"full_mix": audio}, .04, .09)
        self.assertEqual(result["chord"], "N.C.")

    def test_bass_other_roles_and_bass_only(self):
        mix = self.wav("mix.wav")
        other = self.wav("other.wav", [261.63, 329.63, 392])
        bass = self.wav("bass.wav", [82.41])
        result = study.analyze_range(mix, {"other": other, "bass": bass}, .2, 1.2, {"known_key": "C"})
        only_other = study.analyze_range(mix, {"other": other}, .2, 1.2, {"known_key": "C"})
        self.assertEqual(result["evidence"]["detected_notes"], only_other["evidence"]["detected_notes"])
        self.assertEqual(result["bass_reference"]["note"], "E")
        self.assertIn("/E", result["chord"])
        alone = study.analyze_range(mix, {"bass": bass}, .2, 1.2)
        self.assertTrue(alone["evidence"]["detected_notes"])

    def test_sources_fail_explicitly(self):
        mix = self.wav("mix.wav")
        short = self.wav("short.wav", seconds=.5)
        for paths in [{}, {"full_mix": mix, "other": mix}, {"unknown": mix}, {"other": short}, {"bass": str(self.root / "missing.wav")}]:
            with self.subTest(paths=paths), self.assertRaises((ValueError, FileNotFoundError)):
                study.analyze_range(mix, paths, .2, 1.2)

    def test_silent_stems_do_not_dilute_non_bass_evidence(self):
        mix = self.wav("mix.wav", [261.63, 329.63, 392])
        silent = self.wav("silent.wav")
        one = study.analyze_range(mix, {"other": mix}, .2, 1.2)
        two = study.analyze_range(mix, {"other": mix, "vocals": silent}, .2, 1.2)
        self.assertEqual(one["evidence"]["detected_notes"], two["evidence"]["detected_notes"])

    def test_cli_real_signal_and_error_json(self):
        mix = self.wav("mix.wav", [261.63, 329.63, 392])
        command = [sys.executable, str(Path(study.__file__).with_name("chordpilot.py")), "analyze-range", mix, "--sources", json.dumps({"full_mix": mix}), "--start", ".2", "--end", "1.2"]
        result = subprocess.run(command, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertTrue(json.loads(result.stdout)["chord"].startswith("C"))
        result = subprocess.run(command[:-1] + [".1"], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(json.loads(result.stdout)["ok"])


if __name__ == "__main__":
    unittest.main()
