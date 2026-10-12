import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'backend'))
import numpy as np
import chordpilot_chords as chords
from chordpilot_analysis import estimate_bass_reference
from chordpilot_export import chord_to_harmony
from chordpilot_timing import group_chord_cells


class ExtendedChordTests(unittest.TestCase):
    def test_musicxml_preserves_extensions(self):
        self.assertEqual(chord_to_harmony('Abmaj9').findtext('kind'), 'major-ninth')
        self.assertEqual(chord_to_harmony('Cm9').findtext('kind'), 'minor-ninth')
        self.assertEqual(chord_to_harmony('Cadd9').findtext('degree/degree-value'), '9')

    def test_auto_keeps_sustained_added_ninth_and_short_seventh_changes(self):
        for sequence in (['C', 'Cadd9', 'Cadd9', 'C'], ['C', 'Cmaj9', 'C']):
            cells = [{'start': i, 'end': i + 1, 'chord': chord, 'confidence': .9} for i, chord in enumerate(sequence)]
            grouped = group_chord_cells(cells)
            self.assertEqual([cell['chord'] for cell in grouped], list(dict.fromkeys(sequence[:-1])) + [sequence[-1]])
        chroma = np.zeros(12)
        chroma[[0, 2, 4, 7]] = .25
        cells = [{'start': i * .5, 'end': (i + 1) * .5, 'chord': chord, 'confidence': .9, '_chroma': chroma}
                 for i, chord in enumerate(['C', 'Cadd9', 'C'])]
        self.assertEqual([c['chord'] for c in group_chord_cells(cells, np, {'beat_period': .5})], ['C', 'Cadd9', 'C'])

    def test_extended_formulas_and_aliases(self):
        for name in ('Abmaj9/C', 'AbM9/C'):
            candidate = chords.parse_candidate_symbol(name)
            self.assertIsNotNone(candidate)
            self.assertEqual(candidate['quality'], 'maj9')
            self.assertEqual(chords.chord_tones_for_candidate(candidate), {8, 0, 3, 7, 10})
        self.assertEqual(chords.parse_candidate_symbol('Cm9')['quality'], 'm9')

    def test_simplification_does_not_change_detection(self):
        chroma = np.zeros(12)
        chroma[[8, 0, 3, 7, 10]] = [.3, .2, .18, .17, .15]
        results = []
        for simplify in (True, False):
            candidates, _ = chords.generate_chord_candidates(chroma, None, np, {'simplify_chords': simplify})
            ranked = [chords.score_chord_candidate(c, chroma, 'Ab', None, None, None, np, {'simplify_chords': simplify}) for c in candidates]
            results.append(max(ranked, key=lambda c: c['raw_score'])['chord'])
        self.assertEqual(results, ['Abmaj9', 'Abmaj9'])

    def test_triad_does_not_invent_extensions(self):
        chroma = np.full(12, .001)
        chroma[[0, 4, 7]] = [.4, .3, .3]
        candidates, _ = chords.generate_chord_candidates(chroma, None, np, {})
        ranked = [chords.score_chord_candidate(c, chroma, 'C', None, None, None, np, {}) for c in candidates]
        self.assertEqual(max(ranked, key=lambda c: c['raw_score'])['chord'], 'C')

    def test_bass_resolves_chromatic_notes_with_harmonics(self):
        sr = 22050
        t = np.arange(int(sr * .29)) / sr
        for midi in range(33, 60):
            frequency = 440 * 2 ** ((midi - 69) / 12)
            audio = np.sin(2 * np.pi * frequency * t) + .6 * np.sin(4 * np.pi * frequency * t)
            with self.subTest(midi=midi):
                result = estimate_bass_reference(audio, sr, 0, .29, np)
                self.assertEqual(result['pitch_class'], midi % 12)

    def test_bass_uses_entire_selected_range(self):
        sr = 22050
        t = np.arange(sr) / sr
        audio = np.sin(2 * np.pi * 103.826 * t)
        audio[:int(.22 * sr)] = np.sin(2 * np.pi * 110 * t[:int(.22 * sr)])
        self.assertEqual(estimate_bass_reference(audio, sr, 0, 1, np)['note'], 'Ab')
        self.assertIsNone(estimate_bass_reference(np.zeros(sr), sr, 0, 1, np))
