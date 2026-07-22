import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

BACKEND = Path(__file__).resolve().parents[2] / "backend"
sys.path.insert(0, str(BACKEND))

import chordpilot_analysis as analysis


class AnalysisUtilityTests(unittest.TestCase):
    def test_parse_beats_per_bar(self):
        self.assertEqual(analysis.parse_beats_per_bar("7/8"), 7)
        self.assertEqual(analysis.parse_beats_per_bar("0/4"), 1)
        self.assertEqual(analysis.parse_beats_per_bar("bad"), 4)

    def test_expand_sections_repeats_plan_to_exact_length(self):
        self.assertEqual(analysis.expand_sections(0), [])
        self.assertEqual(analysis.expand_sections(4), ["Intro"] * 4)
        sections = analysis.expand_sections(100)
        self.assertEqual(len(sections), 100)
        self.assertEqual(sections[:4], ["Intro"] * 4)
        self.assertIn("Bridge", sections)

    def test_build_bars_uses_grid_and_caps_count(self):
        bars = analysis.build_bars(10, 120, "4/4", None)
        self.assertEqual(len(bars), 8)
        self.assertEqual([bar.number for bar in bars], list(range(1, 9)))
        self.assertEqual([bar.start for bar in bars[:3]], [0.0, 2.0, 4.0])
        self.assertEqual(bars[4].repeat_start, True)
        self.assertEqual(len(analysis.build_bars(10000, 60, "4/4", None)), 160)

    def test_build_bars_uses_sufficient_beat_grid(self):
        beats = [index * 0.5 for index in range(12)]
        bars = analysis.build_bars(20, 120, "4/4", beats)
        self.assertEqual([bar.start for bar in bars], [0.0, 2.0, 4.0])

    def test_high_quality_source_selection(self):
        source = Path("mix.wav")
        paths = {"other": Path("other.wav"), "bass": Path("bass.wav"), "vocals": Path("vocals.wav")}
        self.assertEqual(analysis.select_high_quality_chord_source(source, paths, {"chord_source": "auto"}), (paths["other"], "other/accompaniment stem"))
        self.assertEqual(analysis.select_high_quality_chord_source(source, paths, {"chord_source": "bass"}), (paths["bass"], "bass stem (explicit)"))
        self.assertEqual(analysis.select_high_quality_chord_source(source, paths, {"chord_source": "full_mix"}), (source, "full mix (explicit)"))
        self.assertEqual(analysis.select_high_quality_chord_source(source, {}, {"chord_source": "auto"}), (source, "full mix fallback"))

    def test_complete_stems_checks_names_status_and_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            stem_rows = []
            for name in analysis.STEM_NAMES:
                path = root / f"{name}.wav"
                path.write_bytes(b"")
                stem_rows.append({"name": name, "path": str(path)})
            self.assertTrue(analysis.has_complete_stems({"stems": {"ok": True, "stems": stem_rows}}))
            self.assertFalse(analysis.has_complete_stems({"stems": {"ok": False, "stems": stem_rows}}))
            self.assertFalse(analysis.has_complete_stems({"stems": {"ok": True, "stems": stem_rows[:-1]}}))
            (root / "vocals.wav").unlink()
            self.assertFalse(analysis.has_complete_stems({"stems": {"ok": True, "stems": stem_rows}}))

    def test_required_stems_failure_is_not_silently_downgraded(self):
        with patch.object(analysis, "estimate_with_librosa", return_value={}), \
             patch.object(analysis, "run_demucs", side_effect=RuntimeError("demucs unavailable")), \
             patch.object(analysis, "append_history"), \
             patch.object(analysis, "read_analysis_cache", return_value=None):
            with self.assertRaisesRegex(RuntimeError, "Stem separation failed"):
                analysis.analyze("missing.wav", "high-quality", {"require_stems": True, "use_cache": False})

    def test_optional_stems_failure_falls_back_to_fast_analysis(self):
        builtin = {"duration": 4, "tempo": 100, "key": "G", "bars": [{"number": 1, "start": 0, "chord": "G"}], "beat_times": [0, 0.6]}
        with patch.object(analysis, "estimate_with_librosa", return_value={}), \
             patch.object(analysis, "run_demucs", side_effect=RuntimeError("offline")), \
             patch.object(analysis, "estimate_builtin", return_value=builtin), \
             patch.object(analysis, "waveform_peaks", return_value=[0.5]), \
             patch.object(analysis, "append_history"):
            result = analysis.analyze("missing.wav", "high-quality", {"use_cache": False})
        self.assertEqual(result["key"], "G")
        self.assertEqual(result["analysis_engine"]["mode"], "high-quality")
        self.assertFalse(result["stems"]["ok"])
        self.assertEqual(result["bars"][0]["chord"], "G")

    def test_fast_analysis_failure_returns_editable_no_chord_draft(self):
        with patch.object(analysis, "estimate_with_librosa", return_value={}), \
             patch.object(analysis, "estimate_builtin", side_effect=RuntimeError("decode failed")), \
             patch.object(analysis, "audio_duration", return_value=8), \
             patch.object(analysis, "waveform_peaks", return_value=[]), \
             patch.object(analysis, "append_history"):
            result = analysis.analyze("missing.wav", "fast", {"use_cache": False})
        self.assertEqual(len(result["bars"]), 8)
        self.assertTrue(all(bar["chord"] == "N.C." for bar in result["bars"]))
        self.assertIn("decode failed", result["bars"][0]["notes"])

    def test_known_key_takes_precedence(self):
        builtin = {"duration": 4, "tempo": 120, "key": "G", "bars": [{"number": 1, "start": 0, "chord": "C"}]}
        with patch.object(analysis, "estimate_with_librosa", return_value={}), \
             patch.object(analysis, "estimate_builtin", return_value=builtin), \
             patch.object(analysis, "waveform_peaks", return_value=[]), \
             patch.object(analysis, "append_history"):
            result = analysis.analyze("missing.wav", "fast", {"known_key": "Bb minor", "use_cache": False})
        self.assertEqual(result["key"], "Bbm")
        self.assertEqual(result["analysis_engine"]["key"], "known preset")


if __name__ == "__main__":
    unittest.main()
