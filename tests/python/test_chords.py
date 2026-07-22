import sys
import unittest
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2] / "backend"
sys.path.insert(0, str(BACKEND))

import chordpilot_chords as chords

try:
    import numpy as np
except ImportError:
    np = None


class ChordParsingTests(unittest.TestCase):
    def test_root_index_handles_accidentals_slashes_and_no_chord(self):
        self.assertEqual(chords.root_index_from_symbol("C"), 0)
        self.assertEqual(chords.root_index_from_symbol("C#m7/G#"), 1)
        self.assertEqual(chords.root_index_from_symbol("Bb7"), 10)
        self.assertIsNone(chords.root_index_from_symbol("N.C."))
        self.assertIsNone(chords.root_index_from_symbol("H"))

    def test_pitch_normalization_handles_enharmonics(self):
        cases = {"db": "C#", "D#4": "Eb", "Gb": "F#", "g#": "Ab", "A#": "Bb", "c": "C", "": ""}
        for value, expected in cases.items():
            with self.subTest(value=value):
                self.assertEqual(chords.normalize_pitch_name(value), expected)
        self.assertEqual(chords.pitch_index_from_name("Db"), 1)
        self.assertIsNone(chords.pitch_index_from_name("H"))

    def test_quality_suffix_normalizes_aliases(self):
        cases = {
            "": "", "major": "", "minor": "m", "min7": "m7", "-": "m",
            "dom7": "7", "Ma7": "maj7", "dim": "dim", "+": "aug",
            "sus": "sus4", "sus2": "sus2", "half-diminished": "m7b5",
        }
        for value, expected in cases.items():
            with self.subTest(value=value):
                self.assertEqual(chords.normalize_quality_suffix(value), expected)

    def test_candidate_parser_canonicalizes_symbols(self):
        self.assertEqual(chords.parse_candidate_symbol("db min7 / ab"), {"symbol": "C#m7/Ab", "root": 1, "quality": "m7", "bass": 8})
        self.assertEqual(chords.parse_candidate_symbol("Cmajor"), {"symbol": "C", "root": 0, "quality": "", "bass": None})
        self.assertIsNone(chords.parse_candidate_symbol("N.C."))
        self.assertIsNone(chords.parse_candidate_symbol("H7"))
        self.assertIsNone(chords.parse_candidate_symbol("Cmagic"))
        self.assertIsNone(chords.parse_candidate_symbol("C/H"))

    def test_chord_tones_and_symbols(self):
        candidate = {"root": 0, "quality": "m7"}
        self.assertEqual(chords.chord_tones_for_candidate(candidate), {0, 3, 7, 10})
        self.assertEqual(chords.chord_symbol_for(0, "m7", 7), "Cm7/G")
        self.assertEqual(chords.chord_symbol_for(0, "", 0), "C")

    def test_key_pitch_classes_major_minor_and_enharmonic(self):
        self.assertEqual(chords.key_pitch_classes("C"), {0, 2, 4, 5, 7, 9, 11})
        self.assertEqual(chords.key_pitch_classes("Am"), {0, 2, 4, 5, 7, 9, 11})
        self.assertEqual(chords.key_pitch_classes("Db"), {1, 3, 5, 6, 8, 10, 0})

    def test_neighbor_root_bonus_rewards_related_motion(self):
        self.assertEqual(chords.chord_root_distance_bonus(0, None), 0.0)
        self.assertEqual(chords.chord_root_distance_bonus(0, "C"), 0.18)
        self.assertEqual(chords.chord_root_distance_bonus(0, "F"), 0.12)
        self.assertEqual(chords.chord_root_distance_bonus(0, "D"), 0.05)
        self.assertEqual(chords.chord_root_distance_bonus(0, "F#"), -0.03)


@unittest.skipIf(np is None, "numpy is not installed")
class ChordSignalTests(unittest.TestCase):
    def test_active_pitch_classes_empty_and_thresholded(self):
        self.assertEqual(chords.active_pitch_classes(np.zeros(12), np), [])
        chroma = np.zeros(12)
        chroma[[0, 4, 7]] = [0.5, 0.3, 0.2]
        self.assertEqual(chords.active_pitch_classes(chroma, np), [0, 4, 7])

    def test_detected_pitch_confidence_is_bounded(self):
        self.assertEqual(chords.detected_pitch_confidence(np.zeros(12), np), 0.0)
        focused = np.zeros(12)
        focused[0] = 1
        self.assertEqual(chords.detected_pitch_confidence(focused, np), 0.98)
        spread = np.ones(12)
        self.assertGreaterEqual(chords.detected_pitch_confidence(spread, np), 0)
        self.assertLessEqual(chords.detected_pitch_confidence(spread, np), 0.98)

    def test_chord_alternatives_rank_matching_template(self):
        chroma = np.asarray(chords.MAJOR_TEMPLATE, dtype=float)
        alternatives = chords.chord_alternatives(chroma, np, 4)
        self.assertEqual(len(alternatives), 4)
        self.assertEqual(alternatives[0]["chord"], "C")
        self.assertGreaterEqual(alternatives[0]["score"], alternatives[-1]["score"])

    def test_estimate_chord_handles_silence_and_major_template(self):
        self.assertEqual(chords.estimate_chord(np.zeros(12), np), ("N.C.", 0.0))
        chord, confidence = chords.estimate_chord(np.asarray(chords.MAJOR_TEMPLATE, dtype=float), np)
        self.assertEqual(chord, "C")
        self.assertGreater(confidence, 0.3)

    def test_chord_evidence_summarizes_strong_notes(self):
        empty = chords.chord_evidence(np.zeros(12), 0, 2, "mix", np)
        self.assertEqual(empty["detected_notes"], [])
        self.assertIn("No strong", empty["summary"])

        chroma = np.zeros(12)
        chroma[[0, 4, 7]] = [0.5, 0.3, 0.2]
        evidence = chords.chord_evidence(chroma, 1.2345, 2.3456, "other", np)
        self.assertEqual(evidence["range"], [1.234, 2.346])
        self.assertEqual([item["note"] for item in evidence["detected_notes"][:3]], ["C", "E", "G"])

    def test_rank_candidates_returns_no_chord_for_silence(self):
        ranked, libraries = chords.rank_chord_candidates(np.zeros(12), "C", None, None, None, np, {"simplify_chords": True})
        self.assertEqual(ranked[0]["chord"], "N.C.")
        self.assertEqual(libraries, [])


if __name__ == "__main__":
    unittest.main()
