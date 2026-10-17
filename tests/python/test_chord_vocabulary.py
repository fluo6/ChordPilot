import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'backend'))
import numpy as np
import chordpilot_chords as chords
from chordpilot_export import chord_to_harmony


FORMULAS = {
    '6/9': [0,4,7,9,14], 'm6/9': [0,3,7,9,14],
    'dim7': [0,3,6,9], 'mmaj7': [0,3,7,11],
    '7b5': [0,4,6,10], '7#5': [0,4,8,10],
    '7b9': [0,4,7,10,13], '7#11': [0,4,7,10,18],
    '7b13': [0,4,7,10,20], 'maj7#11': [0,4,7,11,18],
    '9#11': [0,4,7,10,14,18], '13#11': [0,4,7,10,18,21],
    '13b9': [0,4,7,10,13,21], 'mmaj9': [0,3,7,11,14],
    '7b9#11': [0,4,7,10,13,18], '7#9#11': [0,4,7,10,15,18],
}


class ChordVocabularyTests(unittest.TestCase):
    def test_formulas_aliases_and_numeric_slashes(self):
        for quality, intervals in FORMULAS.items():
            candidate = chords.parse_candidate_symbol('C' + quality + '/E')
            with self.subTest(quality=quality):
                self.assertIsNotNone(candidate)
                self.assertEqual(candidate['quality'], quality)
                self.assertEqual(candidate['bass'], 4)
                self.assertEqual(chords.chord_tones_for_candidate(candidate), {i % 12 for i in intervals})
        for alias, expected in [('C69','C6/9'), ('C6add9','C6/9'), ('Cm69','Cm6/9'),
                                ('C-6/9/E','Cm6/9/E'), ('C°7','Cdim7'), ('Cm(maj7)','Cmmaj7'),
                                ('CmM7','Cmmaj7'), ('C7(b9)','C7b9'), ('Cmaj7(#11)','Cmaj7#11'),
                                ('CM7#11','Cmaj7#11'), ('C7+5','C7#5'), ('C7(+5)','C7#5')]:
            with self.subTest(alias=alias):
                self.assertEqual(chords.parse_candidate_symbol(alias)['symbol'], expected)
        for alias in ('Cm(maj9)', 'CmM9'):
            self.assertEqual(chords.parse_candidate_symbol(alias)['symbol'], 'Cmmaj9')
        self.assertIsNone(chords.parse_candidate_symbol('C6/9/nope'))

    def test_new_qualities_can_win_with_clear_evidence_in_every_key(self):
        for root in range(12):
            for quality, intervals in FORMULAS.items():
                chroma = np.full(12, .001)
                chroma[[(root + i) % 12 for i in intervals]] = 1
                bass = {'pitch_class': root, 'confidence': .95}
                ranked, _ = chords.rank_chord_candidates(chroma, chords.PITCH_NAMES[root], None, None, bass, np, {})
                with self.subTest(root=root, quality=quality):
                    self.assertEqual(ranked[0]['chord'], chords.PITCH_NAMES[root] + quality)

    def test_dense_recorded_chroma_does_not_offer_unsupported_second_batch_extensions(self):
        # Virtual Insanity's diffuse Gb-major passage previously acquired a
        # spurious Db9#11 just because its large pitch set covered the mixture.
        chroma = np.array([.053484,.124710,.072541,.050791,.056908,.097361,
                           .139855,.089780,.105188,.068270,.079284,.061828])
        candidates, _ = chords.generate_chord_candidates(chroma, None, np, {})
        self.assertNotIn('Db9#11', {item['symbol'] for item in candidates})

    def test_six_nine_does_not_invent_a_sixth_or_a_ninth(self):
        for intervals, expected in [([0,4,7], 'C'), ([0,4,7,9], 'C6'),
                                    ([0,4,7,14], 'Cadd9'), ([0,3,7,9], 'Cm6')]:
            chroma = np.full(12, .001)
            chroma[[i % 12 for i in intervals]] = 1
            ranked, _ = chords.rank_chord_candidates(chroma, 'C', None, None,
                {'pitch_class':0, 'confidence':.95}, np, {})
            self.assertEqual(ranked[0]['chord'], expected)

    def test_measured_six_nine_can_omit_the_perfect_fifth(self):
        # Recorded accompaniment: D3, F#4, B4 and E4; A is quiet.
        measured = np.array([.02881425,.03382537,.16526195,.02433856,.23480277,.02196841,
                             .13690147,.02187593,.02644303,.03303465,.02252795,.25020565])
        for offset in range(12):
            chroma = np.roll(measured, offset)
            root = (2 + offset) % 12
            ranked, _ = chords.rank_chord_candidates(chroma, chords.PITCH_NAMES[(4 + offset) % 12],
                None, None, None, np, {})
            with self.subTest(offset=offset):
                self.assertEqual(ranked[0]['chord'], chords.PITCH_NAMES[root] + '6/9')

        for root in range(12):
            for quality, third in (('6/9', 4), ('m6/9', 3)):
                chroma = np.full(12, .001)
                chroma[[(root + i) % 12 for i in (0, third, 9, 14)]] = 1
                ranked, _ = chords.rank_chord_candidates(chroma, chords.PITCH_NAMES[root], None, None,
                    {'pitch_class': root, 'confidence': .95}, np, {})
                with self.subTest(root=root, quality=quality):
                    self.assertEqual(ranked[0]['chord'], chords.PITCH_NAMES[root] + quality)

    def test_unmeasured_six_nine_tones_do_not_waive_the_fifth(self):
        candidate = chords.parse_candidate_symbol('C6/9')
        for absent in (0, 4, 9, 2):
            chroma = np.full(12, .001)
            chroma[[0,4,9,2]] = 1
            chroma[absent] = .001
            result = chords.score_chord_candidate(candidate, chroma, 'C', None, None,
                {'pitch_class': 0, 'confidence': .95}, np, {})
            self.assertIn('missing weak G essential tone', result['reasons'])

    def test_six_nine_keeps_a_strong_fifth_as_positive_evidence(self):
        chroma = np.full(12, .001)
        chroma[[0,2,4,9]] = (1 - .3 - .007) / 4
        chroma[7] = .3
        ranked, _ = chords.rank_chord_candidates(chroma, 'C', None, None,
            {'pitch_class': 0, 'confidence': .95}, np, {})
        self.assertEqual(ranked[0]['chord'], 'C6/9')

    def test_musicxml_keeps_six_nine_and_alterations(self):
        for symbol, kind in [('C6/9/E','major-sixth'), ('Cm69','minor-sixth'),
                             ('Cdim7','diminished-seventh'), ('Cmmaj7','major-minor')]:
            harmony = chord_to_harmony(symbol)
            self.assertEqual(harmony.findtext('kind'), kind)
            if '6' in symbol:
                self.assertEqual(harmony.findtext('degree/degree-value'), '9')
                self.assertEqual(harmony.findtext('degree/degree-alter'), '0')
        self.assertEqual(chord_to_harmony('C6/9/E').findtext('bass/bass-step'), 'E')
        for symbol, degree, alter in [('C7b5','5','-1'), ('C7#5','5','1'),
                                     ('C7b9','9','-1'), ('C7#11','11','1'), ('C7b13','13','-1')]:
            harmony = chord_to_harmony(symbol)
            self.assertEqual(harmony.findtext('degree/degree-value'), degree)
            self.assertEqual(harmony.findtext('degree/degree-alter'), alter)

    def test_second_batch_musicxml_preserves_each_altered_degree(self):
        cases = {
            'C9#11/E': ('dominant-ninth', [('11','1')]),
            'C13#11': ('dominant-13th', [('11','1')]),
            'C13b9': ('dominant-13th', [('9','-1')]),
            'Cm(maj9)': ('major-minor', [('9','0')]),
            'C7b9#11': ('dominant', [('9','-1'),('11','1')]),
            'C7#9#11': ('dominant', [('9','1'),('11','1')]),
        }
        for symbol, (kind, degrees) in cases.items():
            harmony = chord_to_harmony(symbol)
            with self.subTest(symbol=symbol):
                self.assertEqual(harmony.findtext('kind'), kind)
                self.assertEqual([(d.findtext('degree-value'), d.findtext('degree-alter'))
                                  for d in harmony.findall('degree')], degrees)
        self.assertEqual(chord_to_harmony('C9#11/E').findtext('bass/bass-step'), 'E')


if __name__ == '__main__':
    unittest.main()
