import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'backend'))
import chordpilot_chords as chords
import chordpilot_analysis as analysis
import chordpilot_study as study
from chordpilot_common import normalize_analysis_options


class HalfDiminishedTests(unittest.TestCase):
    def cases(self):
        return json.loads((ROOT / 'tests/fixtures/chord-evidence/half-diminished.json').read_text())['cases']

    def rank(self, case, shift=0, bass=None, strength=.5):
        evidence = copy.deepcopy(case['evidence'])
        for peak in evidence['spectrum']['peaks']:
            peak['midi'] += shift
            peak['frequency_hz'] *= 2 ** (shift / 12)
        chroma = np.roll(case['chroma'], shift)
        options = {'overtone_weighting': strength}
        hint = chords.half_diminished_hint(chroma, evidence, bass, np, options)
        ranked, _ = chords.rank_chord_candidates(chroma, chords.PITCH_NAMES[(3 + shift) % 12] + 'm',
            None, None, bass, np, options, registered_hint=hint)
        return ranked, hint

    def test_measured_lower_voicing_outweighs_an_upper_harmonic_third_in_all_keys(self):
        for shift in range(12):
            with self.subTest(shift=shift):
                ranked, hint = self.rank(self.cases()[0], shift)
                self.assertIsNotNone(hint)
                self.assertEqual(ranked[0]['chord'], chords.PITCH_NAMES[shift] + 'm7b5')
                self.assertGreater(ranked[0]['raw_score'], ranked[1]['raw_score'])

    def test_missing_tones_independent_major_thirds_and_conflicting_bass_abstain(self):
        original = self.cases()[0]
        for condition in ('missing_root', 'missing_third', 'missing_fifth', 'missing_seventh',
                          'no_third_octave', 'independent_major', 'detuned_harmonic', 'bass_change', 'off'):
            case = copy.deepcopy(original)
            peaks = case['evidence']['spectrum']['peaks']
            bass, strength = None, .5
            removed = {'missing_root': {0}, 'missing_third': {3}, 'missing_fifth': {6},
                       'missing_seventh': {10}}
            if condition in removed:
                peaks[:] = [p for p in peaks if p['midi'] % 12 not in removed[condition]]
            elif condition == 'no_third_octave':
                peaks[:] = [p for p in peaks if p['midi'] != 75]
            elif condition == 'independent_major':
                peaks.append({'midi': 64, 'frequency_hz': 332.0, 'level_db': -15})
            elif condition == 'detuned_harmonic':
                for p in peaks:
                    if p['midi'] % 12 == 4:
                        p['frequency_hz'] *= 2 ** (25 / 1200)
            elif condition == 'bass_change':
                bass = {'pitch_class': 6, 'confidence': .95}
            else:
                strength = 0
            with self.subTest(condition=condition):
                _, hint = self.rank(case, bass=bass, strength=strength)
                self.assertIsNone(hint)

    def test_diffuse_second_recorded_passage_does_not_force_the_printed_chord(self):
        ranked, hint = self.rank(self.cases()[1])
        self.assertIsNone(hint)
        self.assertEqual(ranked[0]['chord'], 'Bb13')

    def test_weaker_major_partial_needs_lower_root_and_minor_voicing_corroboration(self):
        original = json.loads((ROOT / 'tests/fixtures/chord-evidence/lower-root-partial.json').read_text())['cases'][0]
        for shift in range(12):
            with self.subTest(shift=shift):
                ranked, hint = self.rank(original, shift)
                self.assertIsNotNone(hint)
                self.assertEqual(ranked[0]['chord'], chords.PITCH_NAMES[shift] + 'm7b5')
                self.assertEqual(hint['lower_root_midi'], 48 + shift)
                self.assertEqual(hint['fundamental_midi'], 36 + shift)
        stronger_voicing = copy.deepcopy(original)
        for peak in stronger_voicing['evidence']['spectrum']['peaks']:
            if peak['midi'] == 63:
                peak['level_db'] = -4
            elif peak['midi'] == 64:
                peak['level_db'] = -8
        self.assertIsNotNone(self.rank(stronger_voicing)[1])
        for condition in ('no_lower_root', 'detuned_lower_root', 'no_sub_root', 'detuned_sub_root', 'major_louder', 'major_close',
                          'detuned_major', 'detuned_upper_major', 'unrelated_lower_major', 'missing_third_octave'):
            case = copy.deepcopy(original)
            peaks = case['evidence']['spectrum']['peaks']
            if condition == 'no_lower_root':
                peaks[:] = [p for p in peaks if p['midi'] != 48]
            elif condition == 'detuned_lower_root':
                next(p for p in peaks if p['midi'] == 48)['frequency_hz'] *= 2 ** (-25 / 1200)
            elif condition == 'no_sub_root':
                peaks[:] = [p for p in peaks if p['midi'] != 36]
            elif condition == 'detuned_sub_root':
                next(p for p in peaks if p['midi'] == 36)['frequency_hz'] *= 2 ** (-15 / 1200)
            elif condition in {'major_louder', 'major_close'}:
                next(p for p in peaks if p['midi'] == 64)['level_db'] = -8 if condition == 'major_louder' else -12
            elif condition == 'detuned_major':
                next(p for p in peaks if p['midi'] == 64)['frequency_hz'] *= 2 ** (15 / 1200)
            elif condition == 'detuned_upper_major':
                next(p for p in peaks if p['midi'] == 88)['frequency_hz'] *= 2 ** (15 / 1200)
            elif condition == 'unrelated_lower_major':
                peaks.append({'midi': 52, 'frequency_hz': 165.8, 'level_db': -20})
            else:
                peaks[:] = [p for p in peaks if p['midi'] != 75]
            with self.subTest(condition=condition):
                _, hint = self.rank(case)
                self.assertIsNone(hint)

    def test_audio_path_uses_the_same_registered_evidence_in_study_and_timeline(self):
        from scipy.io import wavfile
        sr = 22050
        time = np.arange(round(.7 * sr)) / sr
        # Frozen measured peak frequencies/levels, synthesised without the recording.
        audio = sum(10 ** (peak['level_db'] / 20) * np.sin(2 * np.pi * peak['frequency_hz'] * time)
            for peak in self.cases()[0]['evidence']['spectrum']['peaks']) * .05
        options = normalize_analysis_options({'known_key': 'Ebm', 'overtone_weighting': .5, 'chord_timing': 'auto'})
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'chord.wav'
            wavfile.write(str(path), sr, audio.astype(np.float32))
            local = study.analyze_range(str(path), {'other': str(path)}, 0, .7, options)
        self.assertEqual(local['chord'], 'Cm7b5')
        self.assertEqual(local['alternatives'][0]['chord'], local['chord'])
        self.assertEqual(local['evidence']['registered_chord']['chord'], local['chord'])
        for repeats in (1, 2):
            bars = [{'start': 0, 'chord': ''}]
            analysis.attach_timed_chord_events(bars, np.tile(audio, repeats), sr, 60, '4/4',
                [index * .7 for index in range(repeats)], np, options, 'other', key='Ebm')
            event = bars[0]['chord_events'][0]
            self.assertEqual(event['chord'], 'Cm7b5')
            self.assertEqual(event['alternatives'][0]['chord'], event['chord'])
            self.assertEqual(event['evidence']['registered_chord']['chord'], event['chord'])

    def test_first_half_diminished_cell_keeps_corroborated_minor_function(self):
        fixture = json.loads((ROOT / 'tests/fixtures/chord-evidence/first-half-diminished-cell.json').read_text())
        original = fixture['cases'][0]
        for shift in range(12):
            with self.subTest(shift=shift):
                evidence = copy.deepcopy(original['evidence'])
                for peak in evidence['spectrum']['peaks']:
                    peak['midi'] += shift
                    peak['frequency_hz'] *= 2 ** (shift / 12)
                chroma = np.roll(original['chroma'], shift)
                options = {'overtone_weighting': 0.5}
                hint = chords.half_diminished_hint(chroma, evidence, None, np, options)
                self.assertIsNotNone(hint)
                self.assertIn(76 + shift, hint['harmonic_major_midis'])
                candidate_prev = chords.parse_candidate_symbol(original['neighbors']['previous'])
                candidate_next = chords.parse_candidate_symbol(original['neighbors']['next'])
                prev_chord = chords.chord_symbol_for((candidate_prev['root'] + shift) % 12, candidate_prev['quality'])
                next_chord = chords.chord_symbol_for((candidate_next['root'] + shift) % 12, candidate_next['quality'])
                key = chords.PITCH_NAMES[(3 + shift) % 12] + 'm'
                ranked, _ = chords.rank_chord_candidates(chroma, key, prev_chord, next_chord, None, np, options, registered_hint=hint)
                expected_chord = chords.PITCH_NAMES[shift] + 'm7b5'
                self.assertEqual(ranked[0]['chord'], expected_chord)
                self.assertIn(ranked[1]['chord'], {chords.PITCH_NAMES[shift] + '7#11', chords.PITCH_NAMES[shift] + '9'})

        # Counterexamples and controls
        for condition in ('independent_major', 'missing_minor_third', 'no_third_octave', 'conflicting_bass', 'off'):
            case = copy.deepcopy(original)
            peaks = case['evidence']['spectrum']['peaks']
            bass, strength = None, 0.5
            if condition == 'independent_major':
                peaks.append({'midi': 64, 'frequency_hz': 332.0, 'level_db': -15.0, 'note': 'E4'})
            elif condition == 'missing_minor_third':
                peaks[:] = [p for p in peaks if p['midi'] % 12 != 3]
            elif condition == 'no_third_octave':
                peaks[:] = [p for p in peaks if p['midi'] != 75]
            elif condition == 'conflicting_bass':
                bass = {'pitch_class': 6, 'confidence': 0.95}
            else:
                strength = 0.0
            with self.subTest(condition=condition):
                options = {'overtone_weighting': strength}
                chroma_arr = np.asarray(case['chroma'])
                hint_direct = chords.half_diminished_hint(chroma_arr, case['evidence'], bass, np, options)
                self.assertIsNone(hint_direct)

        # Transitional control from fixture cases[1]
        control = fixture['cases'][1]
        control_chroma = np.asarray(control['chroma'])
        control_hint = chords.half_diminished_hint(control_chroma, control['evidence'], None, np, {'overtone_weighting': 0.5})
        self.assertIsNone(control_hint)
        ranked_control, _ = chords.rank_chord_candidates(control_chroma, 'Ebm', None, None, None, np,
            {'overtone_weighting': 0.5}, registered_hint=control_hint)
        self.assertEqual(ranked_control[0]['chord'], control['expected'])

    def test_first_half_diminished_hint_survives_context_and_event_publication(self):
        from scipy.io import wavfile
        fixture = json.loads((ROOT / 'tests/fixtures/chord-evidence/first-half-diminished-cell.json').read_text())
        original = fixture['cases'][0]
        sr = 22050
        time = np.arange(round(0.652 * sr)) / sr
        audio = sum(10 ** (peak['level_db'] / 20) * np.sin(2 * np.pi * peak['frequency_hz'] * time)
            for peak in original['evidence']['spectrum']['peaks']) * 0.05
        options = normalize_analysis_options({'known_key': 'Ebm', 'overtone_weighting': 0.5, 'chord_timing': 'auto'})
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'cell.wav'
            wavfile.write(str(path), sr, audio.astype(np.float32))
            local = study.analyze_range(str(path), {'other': str(path)}, 0, 0.652, options)
        self.assertEqual(local['chord'], 'Cm7b5')
        self.assertEqual(local['alternatives'][0]['chord'], local['chord'])
        self.assertIsNotNone(local['evidence'].get('registered_chord'))
        self.assertEqual(local['evidence']['registered_chord']['chord'], local['chord'])

        for repeats in (1, 2):
            bars = [{'start': 0, 'chord': ''}]
            analysis.attach_timed_chord_events(bars, np.tile(audio, repeats), sr, 60, '4/4',
                [index * 0.652 for index in range(repeats)], np, options, 'other', key='Ebm')
            event = bars[0]['chord_events'][0]
            self.assertEqual(event['chord'], 'Cm7b5')
            self.assertEqual(event['alternatives'][0]['chord'], event['chord'])
            self.assertIsNotNone(event['evidence'].get('registered_chord'))
            self.assertEqual(event['evidence']['registered_chord']['chord'], event['chord'])

    def test_first_half_diminished_harmonic_refund_respects_bass_blending(self):
        fixture = json.loads((ROOT / 'tests/fixtures/chord-evidence/first-half-diminished-cell.json').read_text())
        original = fixture['cases'][0]
        chroma = np.array(original['chroma'], dtype=float)
        options = {'overtone_weighting': 0.5}
        c_target = chords.parse_candidate_symbol('Cm7b5')

        # Case 1: Confident matching C bass moves E below active threshold
        bass = {'pitch_class': 0, 'confidence': 0.8}
        hint = chords.half_diminished_hint(chroma, original['evidence'], bass, np, options)
        self.assertIsNotNone(hint)
        self.assertEqual(hint['chord'], 'Cm7b5')
        self.assertIn(76, hint['harmonic_major_midis'])

        # Before blending, E (pc 4) is active in unblended chroma
        raw_active = chords.active_pitch_classes(chroma, np, threshold=0.055)
        self.assertIn(4, raw_active)

        # After blending, C bass elevates floor so E is no longer active
        blended, _ = chords.candidate_scoring_chroma(chroma, c_target, bass, np)
        blended_active = chords.active_pitch_classes(blended, np, threshold=0.055)
        self.assertNotIn(4, blended_active)

        # score_chord_candidate never assessed an unexplained note penalty for E
        score_no_hint = chords.score_chord_candidate(c_target, chroma, 'Ebm', None, None, bass, np, options)
        self.assertFalse(any('penalizes unexplained strong notes' in r for r in score_no_hint['reasons']))

        # rank_chord_candidates must not add a phantom penalty refund for E
        ranked, _ = chords.rank_chord_candidates(chroma, 'Ebm', None, None, bass, np, options, registered_hint=hint)
        target = next(item for item in ranked if item['chord'] == 'Cm7b5')
        # Any difference must come only from hint bonus, never an unapplied penalty refund
        bonus_applied = hint['bonus'] if any(r.startswith('registered half-diminished') for r in target['reasons']) else 0.0
        self.assertAlmostEqual(target['raw_score'] - score_no_hint['raw_score'], bonus_applied, places=4)

        # Case 2: Stronger E where E remains active even after bass blending
        chroma_strong_e = chroma.copy()
        chroma_strong_e[4] = 0.16
        chroma_strong_e = chroma_strong_e / chroma_strong_e.sum()
        blended_strong, _ = chords.candidate_scoring_chroma(chroma_strong_e, c_target, bass, np)
        blended_strong_active = chords.active_pitch_classes(blended_strong, np, threshold=0.055)
        self.assertIn(4, blended_strong_active)

        # Penalty applied in score_chord_candidate uses blended value
        actual_penalty = round(blended_strong[4] * 1.85, 4)
        score_strong_no_hint = chords.score_chord_candidate(c_target, chroma_strong_e, 'Ebm', None, None, bass, np, options)

        ranked_strong, _ = chords.rank_chord_candidates(chroma_strong_e, 'Ebm', None, None, bass, np, options, registered_hint=hint)
        target_strong = next(item for item in ranked_strong if item['chord'] == 'Cm7b5')
        bonus_strong = hint['bonus'] if any(r.startswith('registered half-diminished') for r in target_strong['reasons']) else 0.0
        # The refund must exactly equal actual_penalty (blended), never the unblended penalty
        unblended_penalty = round(chroma_strong_e[4] * 1.85, 4)
        self.assertGreater(unblended_penalty, actual_penalty)
        self.assertAlmostEqual(target_strong['raw_score'] - score_strong_no_hint['raw_score'], actual_penalty + bonus_strong, places=4)


