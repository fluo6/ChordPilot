import copy
import json
import sys
import unittest
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'backend'))
import chordpilot_chords as chords
import chordpilot_analysis as analysis
from chordpilot_common import normalize_analysis_options
from chordpilot_spectrum import detected_pitches_for_crop, spectral_power_for_crop, spectrum_from_power


class FadingRootTests(unittest.TestCase):
    def cases(self):
        return json.loads((ROOT / 'tests/fixtures/chord-evidence/fading-roots.json').read_text())['cases']

    def hint(self, case, reference=None, key='E'):
        current = case['current']
        ranked, _ = chords.rank_chord_candidates(np.array(current['chroma']), key, None, None, reference, np, {})
        return chords.fading_chord_hint(np.array(current['chroma']), current['evidence'],
            reference, case['early'], ranked, key, np, {})

    def test_measured_fading_roots_retain_the_early_chord(self):
        for original in self.cases():
            for shift in range(12):
                case = copy.deepcopy(original)
                for stage in ('current', 'early'):
                    case[stage]['chroma'] = np.roll(case[stage]['chroma'], shift).tolist()
                    for pitch in case[stage]['evidence']['detected_pitches']:
                        pitch['midi'] += shift
                        pitch['frequency_hz'] *= 2 ** (shift / 12)
                    reference = case[stage]['bass_reference']
                    if reference:
                        reference['pitch_class'] = (reference['pitch_class'] + shift) % 12
                case['early']['root_decay'] = {str(int(midi) + shift): value for midi, value in case['early']['root_decay'].items()}
                candidate = chords.parse_candidate_symbol(case['expected'])
                case['expected'] = chords.chord_symbol_for((candidate['root'] + shift) % 12, candidate['quality'])
                key = chords.PITCH_NAMES[(4 + shift) % 12]
                with self.subTest(chord=case['expected']):
                    self.check_fading_case(case, key)

    def check_fading_case(self, case, key):
        hint = self.hint(case, key=key)
        self.assertEqual(hint['chord'], case['expected'])
        current = case['current']
        ranked, _ = chords.rank_chord_candidates(np.array(current['chroma']), key, None,
            None, None, np, {}, fading_hint=hint)
        self.assertEqual(ranked[0]['chord'], case['expected'])

    def test_new_notes_bass_changes_missing_roots_and_nondecaying_roots_abstain(self):
        for original in self.cases():
            root = chords.parse_candidate_symbol(original['expected'])['root']
            for condition in ('new_note', 'bass_change', 'missing_root', 'no_decay', 'weak_early_root', 'detuned_root'):
                with self.subTest(chord=original['expected'], condition=condition):
                    case = copy.deepcopy(original)
                    reference = None
                    if condition == 'new_note':
                        outside = next(pc for pc in range(12) if pc not in chords.chord_tones_for_candidate(chords.parse_candidate_symbol(case['expected'])))
                        case['current']['evidence']['detected_pitches'].append({'midi': 60 + outside, 'strength': .2})
                    elif condition == 'bass_change':
                        reference = {'pitch_class': (root + 1) % 12, 'confidence': .95, 'origin': 'bass'}
                    elif condition == 'missing_root':
                        case['current']['evidence']['detected_pitches'] = [p for p in case['current']['evidence']['detected_pitches'] if p['midi'] % 12 != root]
                    elif condition == 'no_decay':
                        case['early']['root_decay'] = {midi: 1 for midi in case['early']['root_decay']}
                    elif condition == 'weak_early_root':
                        for pitch in case['early']['evidence']['detected_pitches']:
                            if pitch['midi'] % 12 == root:
                                pitch['strength'] = .01
                    else:
                        for pitch in case['current']['evidence']['detected_pitches']:
                            if pitch['midi'] % 12 == root:
                                pitch['frequency_hz'] *= 2 ** (.4 / 12)
                    self.assertIsNone(self.hint(case, reference))

    def test_measured_conflicting_third_blocks_an_early_dominant_override_in_all_keys(self):
        cases = json.loads((ROOT / 'tests/fixtures/chord-evidence/fading-third-conflict.json').read_text())['cases']
        for original in cases:
            for shift in range(12):
                case = copy.deepcopy(original)
                for stage in ('current', 'early'):
                    case[stage]['chroma'] = np.roll(case[stage]['chroma'], shift).tolist()
                    for pitch in case[stage]['evidence']['detected_pitches']:
                        pitch['midi'] += shift
                        pitch['frequency_hz'] *= 2 ** (shift / 12)
                    reference = case[stage].get('bass_reference')
                    if reference:
                        reference['pitch_class'] = (reference['pitch_class'] + shift) % 12
                case['early']['root_decay'] = {str(int(midi) + shift): value
                    for midi, value in case['early']['root_decay'].items()}
                key = chords.PITCH_NAMES[(3 + shift) % 12] + 'm'
                with self.subTest(selection=case['range'], shift=shift):
                    hint = self.hint(case, key=key)
                    self.assertIsNone(hint)
                    ranked, _ = chords.rank_chord_candidates(np.array(case['current']['chroma']),
                        key, None, None, None, np, {}, fading_hint=hint)
                    self.assertEqual(ranked[0]['chord'], chords.PITCH_NAMES[shift] + 'm7b5')

    def test_audio_extraction_preserves_a_fading_root_without_reading_outside(self):
        sr = 22050
        time = np.arange(round(.7 * sr)) / sr
        audio = .5 * np.exp(-time / .35) * np.sin(2 * np.pi * 146.832 * time)
        audio += sum(amplitude * np.sin(2 * np.pi * frequency * time)
            for amplitude, frequency in ((.3, 329.628), (.4, 369.994), (.6, 493.883)))
        for weighting in (0, .5):
            with self.subTest(overtone_weighting=weighting):
                options = normalize_analysis_options({'known_key': 'E', 'overtone_weighting': weighting})
                chroma = chords.chroma_for_segment(audio, sr, 0, .7, np, options)
                evidence = chords.chord_evidence(chroma, 7, 7.7, 'other', np)
                evidence['detected_pitches'] = detected_pitches_for_crop(audio, sr, np)
                evidence['spectrum'] = spectrum_from_power(spectral_power_for_crop(audio, sr, np), sr, np)
                ranked, _ = chords.rank_chord_candidates(chroma, 'E', None, None, None, np, options)
                self.assertNotEqual(ranked[0]['chord'], 'D6/9')
                hint = analysis.fading_root_for_crop(audio, sr, 7, chroma, evidence, None, ranked, 'E', np, options)
                self.assertEqual(hint['chord'], 'D6/9')
                self.assertEqual(hint['early_range'], [7, 7.25])
                self.assertLess(hint['root_power_ratio'], .75)
                for ineligible in (audio[:round(.3 * sr)], np.tile(audio, 3)):
                    self.assertIsNone(analysis.fading_root_for_crop(ineligible, sr, 7, chroma,
                        evidence, None, ranked, 'E', np, options))

    def test_single_and_merged_song_results_keep_temporal_ranking_and_explanation(self):
        sr = 22050
        time = np.arange(round(.7 * sr)) / sr
        audio = .5 * np.exp(-time / .35) * np.sin(2 * np.pi * 146.832 * time)
        audio += sum(amplitude * np.sin(2 * np.pi * frequency * time)
            for amplitude, frequency in ((.3, 329.628), (.4, 369.994), (.6, 493.883)))
        for repeats in (1, 2):
            with self.subTest(cells=repeats):
                bars = [{'start': 0, 'chord': ''}]
                analysis.attach_timed_chord_events(bars, np.tile(audio, repeats), sr, 60, '4/4',
                    [index * .7 for index in range(repeats)], np,
                    normalize_analysis_options({'overtone_weighting': 0, 'chord_timing': 'auto'}), 'other', key='E')
                event = bars[0]['chord_events'][0]
                self.assertEqual(event['chord'], 'D6/9')
                self.assertEqual(event['alternatives'][0]['chord'], event['chord'])
                self.assertEqual(event['evidence']['fading_root']['chord'], event['chord'])
                self.assertEqual(len(event['evidence']['fading_root']['support_ranges']), repeats)
                self.assertIn('early chord retained', event['debug']['selection_reasons'][0])
