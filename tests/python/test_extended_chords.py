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
    def test_diffuse_extensions_do_not_replace_a_supported_minor_root(self):
        # Recorded Virtual Insanity accompaniment, with false G1 guidance removed.
        chroma=np.array([.0439584104,.1833492827,.0459430298,.0870873105,.0593760098,.0649388660,
                         .1170740182,.0454245124,.0466486563,.0298014329,.2432817128,.0331167581])
        for shift in range(12):
            ranked,_=chords.rank_chord_candidates(np.roll(chroma,shift),
                chords.PITCH_NAMES[(3+shift)%12]+'m',None,None,None,np,{})
            detected=chords.parse_candidate_symbol(ranked[0]['chord'])
            with self.subTest(shift=shift):
                self.assertEqual(detected['root'],(3+shift)%12)
                self.assertIn(detected['quality'],('m','m7','m9'))

    def test_a_weak_eleventh_does_not_extend_a_clear_minor_ninth(self):
        chroma=np.full(12,.001)
        for pc,strength in ((0,.2),(3,.18),(7,.2),(10,.2),(2,.15),(5,.05)):
            chroma[pc]=strength
        ranked,_=chords.rank_chord_candidates(chroma,'Cm',None,None,None,np,{})
        self.assertEqual(ranked[0]['chord'],'Cm9')

    def test_diffuse_relative_minor_root_does_not_replace_a_supported_major_root(self):
        # Later Virtual Insanity Gb-major passage: Eb is below active-note support.
        chroma = np.array([.053484,.124710,.072541,.050791,.056908,.097361,
                           .139855,.089780,.105188,.068270,.079284,.061828])
        for shift in range(12):
            with self.subTest(shift=shift):
                ranked, _ = chords.rank_chord_candidates(np.roll(chroma, shift),
                    chords.PITCH_NAMES[(3 + shift) % 12] + 'm', None, None, None, np, {})
                candidate = chords.parse_candidate_symbol(ranked[0]['chord'])
                self.assertEqual(candidate['root'], (6 + shift) % 12)
                self.assertIn(candidate['quality'], ('maj7', 'maj9'))

    def test_confirmed_bass_does_not_dilute_measured_extensions(self):
        for root in range(12):
            chroma=np.full(12,.001)
            for interval,strength in ((0,.24),(4,.24),(7,.24),(10,.18),(2,.065)):
                chroma[(root+interval)%12]=strength
            ranked,_=chords.rank_chord_candidates(chroma,chords.PITCH_NAMES[root],None,None,
                {'pitch_class':root,'confidence':.98},np,{})
            self.assertEqual(ranked[0]['chord'],chords.PITCH_NAMES[root]+'9')

    def test_independently_confirmed_bass_can_supply_the_ninth(self):
        for root in range(12):
            chroma = np.full(12, .001)
            chroma[[(root + interval) % 12 for interval in (0, 4, 7, 10)]] = 1
            for confidence in (.95, .4):
                with self.subTest(root=root, confidence=confidence):
                    bass = {'pitch_class': (root + 2) % 12, 'confidence': confidence}
                    ranked, _ = chords.rank_chord_candidates(chroma,
                        chords.PITCH_NAMES[root], None, None, bass, np, {})
                    expected = chords.chord_symbol_for(root, '9', bass['pitch_class']) if confidence >= .62 else chords.chord_symbol_for(root, '7')
                    self.assertEqual(ranked[0]['chord'], expected)

    def test_measured_guide_tones_support_a_weak_perfect_fifth_in_every_key(self):
        cases = [
            (np.array([.064219,.056447,.082685,.166914,.063657,.060879,.043568,.043849,.032364,.067054,.186411,.131954]),
                11,'Bmaj7','Abmadd9/B'),
            (np.array([.124142,.020026,.067099,.018527,.199535,.112392,.035982,.034110,.045316,.037462,.212863,.092547]),
                0,'C9','C9sus4'),
        ]
        for chroma,bass,expected,wrong in cases:
            for transpose in range(12):
                with self.subTest(chord=expected,transpose=transpose):
                    evidence = np.roll(chroma,transpose)
                    key = chords.PITCH_NAMES[(3+transpose)%12]
                    reference = {'pitch_class':(bass+transpose)%12,'confidence':.98}
                    candidates = []
                    for symbol in (expected,wrong):
                        candidate = chords.parse_candidate_symbol(symbol)
                        candidate['root'] = (candidate['root']+transpose)%12
                        if candidate['bass'] is not None: candidate['bass'] = (candidate['bass']+transpose)%12
                        candidate['symbol'] = chords.chord_symbol_for(candidate['root'],candidate['quality'],candidate['bass'])
                        candidates.append(chords.score_chord_candidate(candidate,evidence,key,None,None,reference,np,{}))
                    self.assertGreater(candidates[0]['raw_score'],candidates[1]['raw_score'])

    def test_a_recovering_perfect_fifth_does_not_reject_supported_guide_tones(self):
        chroma = np.array([.064219,.056447,.082685,.166914,.063657,.060879,.043568,.043849,.032364,.067054,.186411,.131954])
        for extra in (.002,.008,.016,.032):
            with self.subTest(extra=extra):
                evidence = chroma.copy(); evidence[6] += extra
                bass = {'pitch_class':11,'confidence':.98}
                ranked,_ = chords.rank_chord_candidates(evidence,'Eb',None,None,bass,np,{})
                self.assertEqual(ranked[0]['chord'],'Bmaj7')


    def test_dominant_thirteenth_voicing_can_omit_the_ninth(self):
        # The measured major third, minor seventh and thirteenth define this
        # voicing; an absent ninth must not downgrade it to a sixth chord.
        for root in range(12):
            for fifth,seventh,thirteenth,quality in [(.23,.07,.14,'13'),(.001,.07,.14,'13'),(.23,.001,.14,'6'),(.23,.07,.001,'7')]:
                with self.subTest(root=root,fifth=fifth,seventh=seventh,thirteenth=thirteenth):
                    chroma = np.full(12,.001)
                    for interval,strength in [(0,.22),(4,.25),(7,fifth),(10,seventh),(9,thirteenth)]:
                        chroma[(root+interval)%12] = strength
                    ranked,_ = chords.rank_chord_candidates(chroma,chords.PITCH_NAMES[(root+5)%12],None,None,
                        {'pitch_class':root,'confidence':.9},np,{})
                    self.assertEqual(ranked[0]['chord'],chords.PITCH_NAMES[root]+quality)

    def test_clear_minor_third_beats_an_unsupported_suspension_in_a_guitar_voicing(self):
        chroma = np.array([.022,.016,.028,.017,.041,.244,.093,.249,.037,.135,.1,.019])
        bass = {'pitch_class':7,'confidence':.85}
        minor = chords.score_chord_candidate(chords.parse_candidate_symbol('Gm9'),chroma,'F',None,None,bass,np,{})
        suspended = chords.score_chord_candidate(chords.parse_candidate_symbol('G9sus4'),chroma,'F',None,None,bass,np,{})
        self.assertGreater(minor['raw_score'],suspended['raw_score'])
    def test_suspended_sevenths_and_ninths_keep_their_function(self):
        for name, tones in [('B7sus4', {11, 4, 6, 9}), ('B9sus4', {11, 4, 6, 9, 1})]:
            candidate = chords.parse_candidate_symbol(name)
            self.assertEqual(candidate['symbol'], name)
            self.assertEqual(chords.chord_tones_for_candidate(candidate), tones)
            chroma = np.full(12, .001); chroma[list(tones)] = 1
            ranked, _ = chords.rank_chord_candidates(chroma, 'Ab', None, None, {'pitch_class': 11, 'confidence': .95}, np, {})
            self.assertEqual(ranked[0]['chord'], name)
            harmony = chord_to_harmony(name)
            self.assertEqual(harmony.findtext('kind'), 'suspended-fourth')
            degrees = {degree.findtext('degree-value'): degree.findtext('degree-alter') for degree in harmony.findall('degree')}
            self.assertEqual(degrees['7'], '-1')
            if name == 'B9sus4': self.assertEqual(degrees['9'], '0')
        for root in range(12):
            for quality, intervals in [('7sus4', [0, 5, 7, 10]), ('9sus4', [0, 5, 7, 10, 14])]:
                chroma = np.full(12, .001); chroma[[(root + n) % 12 for n in intervals]] = 1
                ranked, _ = chords.rank_chord_candidates(chroma, chords.PITCH_NAMES[root], None, None, {'pitch_class': root, 'confidence': .95}, np, {})
                self.assertEqual(ranked[0]['chord'], chords.PITCH_NAMES[root] + quality)
        for alias in ('B7(sus4)', 'B9(sus4)'):
            self.assertEqual(chords.parse_candidate_symbol(alias)['quality'], alias[1:].replace('(', '').replace(')', ''))

    def test_non_chord_bass_slash_candidates_are_supported_by_upper_triad(self):
        chroma = np.full(12, .001); chroma[[1, 5, 8]] = 1
        bass = {'pitch_class': 3, 'confidence': .95}
        candidates, _ = chords.generate_chord_candidates(chroma, bass, np, {})
        self.assertIn('C#/Eb', {candidate['symbol'] for candidate in candidates})
        ranked, _ = chords.rank_chord_candidates(chroma, 'Ab', None, None, bass, np, {})
        self.assertEqual(ranked[0]['chord'], 'Eb9sus4')
        weak, _ = chords.generate_chord_candidates(chroma, {'pitch_class': 3, 'confidence': .2}, np, {})
        self.assertNotIn('C#/Eb', {candidate['symbol'] for candidate in weak})
        harmony = chord_to_harmony('Db/Eb')
        self.assertEqual(harmony.findtext('bass/bass-step'), 'E')
        self.assertEqual(harmony.findtext('bass/bass-alter'), '-1')
        chroma = np.zeros(12); chroma[[9, 1, 4, 7]] = 1
        bass = {'pitch_class': 9, 'confidence': .95}
        plain = chords.score_chord_candidate(chords.parse_candidate_symbol('A7'), chroma, 'D', None, None, bass, np, {})
        wrong = chords.score_chord_candidate(chords.parse_candidate_symbol('A7/E'), chroma, 'D', None, None, bass, np, {})
        self.assertGreater(plain['raw_score'], wrong['raw_score'] + .5)

    def test_suspended_ninth_function_wins_over_upper_triad_slash_in_every_key(self):
        for root in range(12):
            chroma = np.full(12, .001)
            chroma[[(root + interval) % 12 for interval in [2, 5, 10]]] = 1
            bass = {'pitch_class': root, 'confidence': .95}
            ranked, _ = chords.rank_chord_candidates(chroma, chords.PITCH_NAMES[(root + 5) % 12], None, None, bass, np, {})
            self.assertEqual(ranked[0]['chord'], chords.PITCH_NAMES[root] + '9sus4')
            upper = chords.PITCH_NAMES[(root + 10) % 12] + '/' + chords.PITCH_NAMES[root]
            self.assertIn(upper, {item['chord'] for item in ranked})

    def test_suspended_names_require_their_defining_notes(self):
        for tones, bass, key, expected in [
            ([0, 5, 7], 0, 'C', 'Csus4'),
            ([0, 4, 7], 4, 'C', 'C/E'),
            ([8, 0, 3], 3, 'Ab', 'Ab/Eb'),
            ([1, 5, 8], None, 'Ab', 'C#'),
        ]:
            chroma = np.zeros(12); chroma[tones] = 1
            reference = {'pitch_class': bass, 'confidence': .95} if bass is not None else None
            ranked, _ = chords.rank_chord_candidates(chroma, key, None, None, reference, np, {})
            self.assertEqual(ranked[0]['chord'], expected)

    def test_bass_supports_root_omitted_major_voicings_without_forcing_inversions(self):
        for root in range(12):
            for quality, intervals in [('maj7', [4, 7, 11]), ('maj9', [4, 7, 11, 14])]:
                chroma = np.full(12, .001)
                chroma[[(root + interval) % 12 for interval in intervals]] = 1
                ranked, _ = chords.rank_chord_candidates(chroma, chords.PITCH_NAMES[root], None, None,
                    {'pitch_class': root, 'confidence': .95}, np, {})
                self.assertEqual(ranked[0]['chord'], chords.PITCH_NAMES[root] + quality)
        chroma = np.zeros(12); chroma[[0, 4, 7]] = 1
        ranked, _ = chords.rank_chord_candidates(chroma, 'C', None, None, {'pitch_class': 4, 'confidence': .95}, np, {})
        self.assertEqual(ranked[0]['chord'], 'C/E')
        chroma = np.zeros(12); chroma[[0, 4, 7, 11]] = 1
        ranked, _ = chords.rank_chord_candidates(chroma, 'C', None, None, {'pitch_class': 6, 'confidence': .2}, np, {})
        self.assertEqual(ranked[0]['chord'], 'Cmaj7')

    def test_sharp_ninth_formula_aliases_and_export(self):
        self.assertIsNone(chords.parse_candidate_symbol('Eb7#9b5'))
        for symbol in ('Eb7#9', 'Eb7(#9)', 'Eb7♯9'):
            candidate = chords.parse_candidate_symbol(symbol)
            self.assertEqual(candidate['symbol'], 'Eb7#9')
            self.assertEqual(chords.chord_tones_for_candidate(candidate), {3, 7, 10, 1, 6})
            harmony = chord_to_harmony(symbol)
            self.assertEqual(harmony.findtext('kind'), 'dominant')
            self.assertEqual(harmony.findtext('degree/degree-value'), '9')
            self.assertEqual(harmony.findtext('degree/degree-alter'), '1')

    def test_sharp_ninth_requires_evidence_and_works_in_every_key(self):
        for root in range(12):
            for has_ninth in (False, True):
                chroma = np.full(12, .001)
                chroma[[(root + n) % 12 for n in [0, 4, 7, 10]]] = .2
                if has_ninth: chroma[(root + 3) % 12] = .2
                bass = {'pitch_class': root, 'confidence': .9}
                ranked, _ = chords.rank_chord_candidates(chroma, chords.PITCH_NAMES[(root + 5) % 12], None, None, bass, np, {'simplify_chords': True})
                self.assertEqual(ranked[0]['chord'], chords.PITCH_NAMES[root] + ('7#9' if has_ninth else '7'))

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
