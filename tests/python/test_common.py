import dataclasses
import sys
import unittest
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2] / "backend"
sys.path.insert(0, str(BACKEND))

from chordpilot_common import Bar, clamp_number, normalize_analysis_options, normalize_known_key, options_cache_suffix


class CommonTests(unittest.TestCase):
    def test_clamp_number(self):
        self.assertEqual(clamp_number("12.5", 3, 0, 20), 12.5)
        self.assertEqual(clamp_number("bad", 3, 0, 20), 3)
        self.assertEqual(clamp_number(-10, 3, 0, 20), 0)
        self.assertEqual(clamp_number(30, 3, 0, 20), 20)

    def test_normalize_known_key(self):
        cases = {
            None: "", "": "", "auto": "", "detect": "", "unknown": "",
            "c major": "C", "A minor": "Am", "db": "C#", "D#m": "Ebm",
            "gbm": "F#m", "H": "", "C harmonic minor": "",
        }
        for value, expected in cases.items():
            with self.subTest(value=value):
                self.assertEqual(normalize_known_key(value), expected)

    def test_default_options_are_complete_and_independent(self):
        first = normalize_analysis_options()
        second = normalize_analysis_options()
        self.assertEqual(first["known_key"], "")
        self.assertEqual(first["demucs_model"], "htdemucs")
        self.assertFalse(first["require_stems"])
        first["min_bpm"] = 1
        self.assertEqual(second["min_bpm"], 60)

    def test_numeric_options_are_clamped_and_consistent(self):
        options = normalize_analysis_options({
            "min_bpm": 500, "max_bpm": 1, "beat_offset": 9,
            "onset_frame": 10, "onset_hop": 99999,
            "chroma_low_hz": 900, "chroma_high_hz": 100,
            "chord_alternatives": 99,
        })
        self.assertEqual(options["min_bpm"], 240)
        self.assertEqual(options["max_bpm"], 280)
        self.assertEqual(options["beat_offset"], 2.0)
        self.assertEqual(options["onset_frame"], 512)
        self.assertEqual(options["onset_hop"], 4096)
        self.assertEqual(options["chroma_low_hz"], 500)
        self.assertEqual(options["chroma_high_hz"], 1000)
        self.assertEqual(options["chord_alternatives"], 12)

    def test_enum_and_language_options_are_normalized(self):
        valid = normalize_analysis_options({
            "known_key": "Bb minor", "chord_source": "full-mix",
            "lyrics_source": "full-mix", "lyrics_model": "SMALL",
            "lyrics_language": "en-au", "demucs_model": " mdx ",
            "require_stems": True, "use_cache": False,
        })
        self.assertEqual(valid["known_key"], "Bbm")
        self.assertEqual(valid["chord_source"], "full_mix")
        self.assertEqual(valid["lyrics_source"], "full_mix")
        self.assertEqual(valid["lyrics_model"], "small")
        self.assertEqual(valid["lyrics_language"], "en-au")
        self.assertEqual(valid["demucs_model"], "mdx")
        self.assertTrue(valid["require_stems"])
        self.assertFalse(valid["use_cache"])

        invalid = normalize_analysis_options({"chord_source": "piano", "lyrics_source": "bad", "lyrics_model": "large", "lyrics_language": "english"})
        self.assertEqual(invalid["chord_source"], "auto")
        self.assertEqual(invalid["lyrics_source"], "auto")
        self.assertEqual(invalid["lyrics_model"], "tiny")
        self.assertEqual(invalid["lyrics_language"], "")

    def test_cache_suffix_is_stable_and_sensitive(self):
        first = options_cache_suffix({"b": 2, "a": 1})
        self.assertEqual(first, options_cache_suffix({"a": 1, "b": 2}))
        self.assertNotEqual(first, options_cache_suffix({"a": 1, "b": 3}))
        self.assertEqual(len(first), 10)

    def test_bar_defaults_and_serialization(self):
        bar = Bar(1, "Verse", "C", 0.0)
        self.assertEqual(dataclasses.asdict(bar), {
            "number": 1, "section": "Verse", "chord": "C", "start": 0.0,
            "repeat_start": False, "repeat_end": 0, "notes": "", "lyrics": "", "confidence": None,
        })


if __name__ == "__main__":
    unittest.main()
