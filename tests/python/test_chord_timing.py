import sys
import unittest
from pathlib import Path
from xml.etree import ElementTree as ET

sys.path.insert(0, str(Path(__file__).absolute().parents[2] / "backend"))
import chordpilot_timing as timing
import chordpilot_common as common
import chordpilot_chords as chords
import chordpilot_analysis as analysis
from chordpilot_export import render_musicxml, render_txt
import numpy as np


class ChordTimingTests(unittest.TestCase):
    def test_timing_options_are_normalized_and_cache_distinctly(self):
        base = common.normalize_analysis_options({})
        self.assertEqual(base["chord_timing"], "auto")
        self.assertEqual(base["chord_grid"], "beat")
        self.assertNotEqual(common.options_cache_suffix(base), common.options_cache_suffix(common.normalize_analysis_options({"chord_grid": "half_beat"})))
        self.assertEqual(common.normalize_analysis_options({"chord_timing": "broken", "chord_grid": "fine"})["chord_timing"], "auto")

    def test_legacy_key_chroma_ignores_the_remembered_fine_grid(self):
        audio = np.zeros(16000, dtype=np.float32)
        c_chroma = np.zeros(12); c_chroma[0] = 1
        g_chroma = np.zeros(12); g_chroma[7] = 1
        bars = [{"start": 0, "_chroma": c_chroma}, {"start": 1, "_chroma": g_chroma}]
        legacy_beat = analysis.duration_weighted_cell_chroma(audio, 8000, bars, 120, "4/4", [], np,
            common.normalize_analysis_options({"chord_timing": "legacy", "chord_grid": "beat"}))
        legacy_half_beat = analysis.duration_weighted_cell_chroma(audio, 8000, bars, 120, "4/4", [], np,
            common.normalize_analysis_options({"chord_timing": "legacy", "chord_grid": "half_beat"}))
        expected = c_chroma + g_chroma
        np.testing.assert_allclose(legacy_beat, expected)
        np.testing.assert_allclose(legacy_half_beat, expected)

    def test_analysis_grid_builds_half_bar_beat_and_half_beat_cells(self):
        self.assertEqual(timing.analysis_cell_bounds(0, 2, [], "half_bar", 4, 120), [(0, 1), (1, 2)])
        self.assertEqual(timing.analysis_cell_bounds(0, 2, [], "beat", 4, 120), [(0, .5), (.5, 1), (1, 1.5), (1.5, 2)])
        self.assertEqual(timing.analysis_cell_bounds(0, 2, [], "half_beat", 4, 120), [(0, .25), (.25, .5), (.5, .75), (.75, 1), (1, 1.25), (1.25, 1.5), (1.5, 1.75), (1.75, 2)])

    def test_actual_irregular_beats_are_used_and_duplicate_beats_ignored(self):
        self.assertEqual(timing.analysis_cell_bounds(0, 2, [0, .48, .48, 1.03, 1.51, 2.2], "beat", 4, 120), [(0, .48), (.48, 1.03), (1.03, 1.51), (1.51, 2)])
        self.assertEqual(timing.analysis_cell_bounds(0, 2, [0, .4, .9, 1.5, 1.8], "half_bar", 4, 120), [(0, .9), (.9, 2)])

    def test_missing_beats_fall_back_and_partial_final_cell_is_clipped(self):
        self.assertEqual(timing.analysis_cell_bounds(0, 1.2, [4, 5], "beat", 4, 120), [(0, .5), (.5, 1), (1, 1.2)])

    def test_auto_merges_same_chord_and_only_suppresses_low_confidence_isolated_flicker(self):
        cells = [
            {"start": 0, "end": .5, "chord": "C", "confidence": .8, "alternatives": []},
            {"start": .5, "end": 1, "chord": "G", "confidence": .4, "alternatives": [{"chord": "G", "score": .9}, {"chord": "C", "score": .88}]},
            {"start": 1, "end": 1.5, "chord": "C", "confidence": .8, "alternatives": []},
            {"start": 1.5, "end": 2, "chord": "G", "confidence": .9, "alternatives": []},
        ]
        result = timing.group_chord_cells(cells)
        self.assertEqual([(item["start"], item["end"], item["chord"]) for item in result], [(0, 1.5, "C"), (1.5, 2, "G")])
        passing = timing.group_chord_cells([{"start": 0, "end": .5, "chord": "C", "confidence": .8}, {"start": .5, "end": 1, "chord": "G", "confidence": .8, "alternatives": [{"chord": "G", "score": .9}, {"chord": "C", "score": .6}]}, {"start": 1, "end": 1.5, "chord": "C", "confidence": .8}])
        self.assertEqual([item["chord"] for item in passing], ["C", "G", "C"])
        silence = timing.group_chord_cells([{"start": 0, "end": .5, "chord": "C", "confidence": .8}, {"start": .5, "end": 1, "chord": "N.C.", "confidence": .1, "alternatives": [{"chord": "C", "score": .95}]}, {"start": 1, "end": 1.5, "chord": "C", "confidence": .8}])
        self.assertEqual([item["chord"] for item in silence], ["C", "N.C.", "C"])

    def test_short_chroma_crop_does_not_read_samples_after_requested_end(self):
        sample_rate = 8000
        time = np.arange(4000) / sample_rate
        audio = np.sin(2 * np.pi * 261.63 * time).astype(np.float32)
        audio[1600:] = np.sin(2 * np.pi * 392.0 * time[1600:])
        crop = chords.chroma_for_segment(audio, sample_rate, 0, .2, np, {})
        reference = chords.chroma_for_segment(audio[:1600], sample_rate, 0, .2, np, {})
        np.testing.assert_allclose(crop, reference)

    def test_fixed_grid_attaches_two_supported_chords_inside_one_bar(self):
        sr = 8192
        t = np.arange(sr * 2) / sr
        audio = np.zeros_like(t, dtype=np.float32)
        for begin, finish, notes in [(0, 1, [261.63, 329.63, 392.0]), (1, 2, [196.0, 246.94, 392.0])]:
            mask = (t >= begin) & (t < finish)
            audio[mask] = sum(np.sin(2 * np.pi * note * t[mask]) for note in notes)
        options = common.normalize_analysis_options({"chord_timing": "fixed", "chord_grid": "half_bar"})
        bars = [{"start": 0, "chord": "C", "confidence": .5}]
        analysis.attach_timed_chord_events(bars, audio, sr, 120, "4/4", [0, .5, 1, 1.5], np, options, "synthetic", key="C")
        self.assertEqual([(event["start"], event["end"]) for event in bars[0]["chord_events"]], [(0, 1), (1, 2)])
        self.assertEqual([event["chord"] for event in bars[0]["chord_events"]], ["C", "G"])
        chart = {"tempo": 120, "time_signature": "4/4", "duration": 2, "beat_times": [0, .5, 1, 1.5], "bars": bars}
        self.assertIn("C", render_txt(chart)); self.assertIn("G", render_txt(chart))
        self.assertEqual(len(ET.fromstring(render_musicxml(chart)).findall("./part/measure/harmony")), 2)
        auto_bars = [{"start": 0, "chord": "C"}]
        auto_options = common.normalize_analysis_options({"chord_timing": "auto", "chord_grid": "half_bar"})
        analysis.attach_timed_chord_events(auto_bars, audio, sr, 120, "4/4", [0, .5, 1, 1.5], np, auto_options, "synthetic", key="C")
        self.assertEqual([event["chord"] for event in auto_bars[0]["chord_events"]], ["C", "G"])
        legacy_bars = [{"start": 0, "chord": "C"}]
        analysis.attach_timed_chord_events(legacy_bars, audio, sr, 120, "4/4", [0, .5, 1, 1.5], np, common.normalize_analysis_options({"chord_timing": "legacy"}), "synthetic", key="C")
        self.assertNotIn("chord_events", legacy_bars[0])

    def test_auto_keeps_sustained_chord_through_a_brief_moving_melody(self):
        sr = 8192
        t = np.arange(sr * 2) / sr
        audio = sum(np.sin(2 * np.pi * note * t) for note in [261.63, 329.63, 392.0]).astype(np.float32) * .5
        passing = (t >= .5) & (t < 1)
        audio[passing] += np.sin(2 * np.pi * 587.33 * t[passing]) * .35
        options = common.normalize_analysis_options({"chord_timing": "auto", "chord_grid": "beat"})
        bars = [{"start": 0, "chord": "C"}]
        analysis.attach_timed_chord_events(bars, audio, sr, 120, "4/4", [0, .5, 1, 1.5], np, options, "synthetic", key="C")
        self.assertEqual([(event["start"], event["end"], event["chord"]) for event in bars[0]["chord_events"]], [(0, 2, "C")])
        self.assertEqual([cell["detected_chord"] for cell in bars[0]["chord_events"][0]["debug"]["cells"]], ["C", "Cadd9", "C", "C"])

    def test_bass_stem_adds_supported_inversion_and_partial_silence_stays_nc(self):
        sr = 8192
        t = np.arange(sr * 2) / sr
        chords_audio = sum(np.sin(2 * np.pi * note * t) for note in [261.63, 329.63, 392.0]).astype(np.float32) * .25
        bass_audio = (np.sin(2 * np.pi * 82.41 * t) * .9).astype(np.float32)
        options = common.normalize_analysis_options({"chord_timing": "fixed", "chord_grid": "half_bar"})
        bars = [{"start": 0, "chord": "C"}]
        analysis.attach_timed_chord_events(bars, chords_audio, sr, 120, "4/4", [0, .5, 1, 1.5], np, options, "other", bass_audio, sr, "C")
        self.assertEqual([event["chord"] for event in bars[0]["chord_events"]], ["C/E", "C/E"])
        self.assertTrue(all(event["bass_reference"]["note"] == "E" for event in bars[0]["chord_events"]))

        silent_audio = np.zeros_like(t, dtype=np.float32)
        active = t >= 1
        silent_audio[active] = sum(np.sin(2 * np.pi * note * t[active]) for note in [261.63, 329.63, 392.0])
        silent_bars = [{"start": 0, "chord": "C"}]
        analysis.attach_timed_chord_events(silent_bars, silent_audio, sr, 120, "4/4", [0, .5, 1, 1.5], np, options, "synthetic", key="C")
        self.assertEqual([event["chord"] for event in silent_bars[0]["chord_events"]], ["N.C.", "C"])


if __name__ == "__main__":
    unittest.main()
