import sys
import unittest
import tempfile
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).absolute().parents[2] / 'backend'))
import chordpilot_common as common
import chordpilot_spectrum as spectrum
import chordpilot_analysis as analysis
import chordpilot_study as study


class SustainTailTests(unittest.TestCase):
    def test_removed_accompaniment_tail_cannot_return_as_a_bass_reference(self):
        from scipy.io import wavfile
        sr = 8192
        t = np.arange(sr * 2) / sr
        audio = .3 * np.sin(2 * np.pi * 130.8128 * t) * 2 ** (-t / 2)
        for frequency in (146.8324, 184.9972, 220.):
            audio += np.where(t >= 1, .15 * np.sin(2 * np.pi * frequency * t), 0)
        options = common.normalize_analysis_options({'chord_grid': 'half_bar',
            'tail_reduction': 1, 'tail_half_life': 1, 'overtone_weighting': 0})
        for mode in ('fixed', 'auto'):
            bars = [{'start': 0, 'chord': ''}]
            analysis.attach_timed_chord_events(bars, audio, sr, 120, '4/4', [0, .5, 1, 1.5],
                np, {**options, 'chord_timing': mode}, 'other', key='D')
            event = bars[0]['chord_events'][-1]
            cell = event['debug']['cells'][-1]
            self.assertNotIn(48, [pitch['midi'] for pitch in cell['evidence']['detected_pitches']])
            self.assertIn(48, [pitch['midi'] for pitch in cell['evidence']['original_detected_pitches']])
            for item in (cell, event):
                self.assertNotEqual((item.get('bass_reference') or {}).get('pitch_class'), 0)
                self.assertNotIn('/C', item['chord'])
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'guitar-tail.wav'
            wavfile.write(str(path), sr, audio.astype(np.float32))
            run = study.analyze_range(str(path), {'other': str(path)}, 1, 2, options)
        self.assertNotEqual((run['bass_reference'] or {}).get('pitch_class'), 0)
        self.assertNotIn('/C', run['chord'])

    def test_subtracts_predicted_power_without_mutating_original_or_new_note(self):
        previous = np.array([1., 0., 0.])
        current = np.array([.5, 1., 0.])
        reduced, info = spectrum.reduce_sustain_tail(current, previous, .25,
            {'tail_reduction': 1., 'tail_half_life': .5}, np)
        np.testing.assert_allclose(reduced, [0, 1, 0])
        np.testing.assert_allclose(current, [.5, 1, 0])
        self.assertAlmostEqual(info['decay_factor'], 2 ** (-.5))
        self.assertAlmostEqual(info['removed_fraction'], 1 / 3)

    def test_off_and_first_cell_keep_original_evidence(self):
        current = np.array([.5, 1., 0.])
        for previous, strength in [(current, 0), (None, 1)]:
            reduced, info = spectrum.reduce_sustain_tail(current, previous, .25,
                {'tail_reduction': strength, 'tail_half_life': .5}, np)
            np.testing.assert_array_equal(current, reduced)
            self.assertFalse(info['applied'])

    def test_partial_reduction_is_proportional_and_silence_stays_finite(self):
        reduced, _ = spectrum.reduce_sustain_tail(np.array([1.]), np.array([1.]), .5,
            {'tail_reduction': .5, 'tail_half_life': .5}, np)
        self.assertAlmostEqual(reduced[0], .75)
        reduced, info = spectrum.reduce_sustain_tail(np.zeros(3), np.ones(3), .5,
            {'tail_reduction': 1., 'tail_half_life': .5}, np)
        self.assertTrue(np.isfinite(reduced).all())
        self.assertEqual(info['removed_fraction'], 0)

    def test_settings_default_off_and_make_distinct_cache_entries(self):
        off = common.normalize_analysis_options({})
        on = common.normalize_analysis_options({'tail_reduction': .5, 'tail_half_life': .75})
        self.assertEqual(off['tail_reduction'], 0)
        self.assertEqual(on['tail_reduction'], .5)
        self.assertNotEqual(common.options_cache_suffix(off), common.options_cache_suffix(on))

    def test_no_removed_power_keeps_the_existing_chroma_measurement(self):
        original = np.arange(1., 13.); original /= original.sum()
        power = np.ones(8193)
        adjusted = spectrum.apply_tail_to_chroma(original, power, power, 22050, np, common.normalize_analysis_options({}))
        np.testing.assert_allclose(adjusted, original)

    def test_analysis_records_original_and_reduced_spectra_and_uses_reduced_chroma(self):
        sr = 8192
        t = np.arange(sr * 2) / sr
        old = np.sin(2 * np.pi * 261.6256 * t) * 2 ** (-t / 2)
        fresh = np.where(t >= 1, np.sin(2 * np.pi * 369.9944 * t), 0)
        audio = old + fresh
        def run(strength):
            bars = [{'start': 0, 'chord': ''}]
            analysis.attach_timed_chord_events(bars, audio, sr, 120, '4/4', [0, .5, 1, 1.5], np,
                common.normalize_analysis_options({'chord_timing': 'fixed', 'tail_reduction': strength, 'tail_half_life': 1}), 'other', key='C')
            return bars[0]['chord_events'][2]['debug']['cells'][0]['evidence']
        raw, reduced = run(0), run(1)
        self.assertEqual(raw['spectrum'], reduced['spectrum'])
        self.assertTrue(reduced['tail_reduction']['applied'])
        original_peak = next(peak for peak in reduced['spectrum']['peaks'] if peak['midi'] == 60)
        reduced_peak = next((peak for peak in reduced['tail_reduced_spectrum']['peaks'] if peak['midi'] == 60), {'level_db': -80})
        self.assertLess(reduced_peak['level_db'], original_peak['level_db'])
        self.assertNotEqual(raw['detected_notes'], reduced['detected_notes'])

    def test_local_study_uses_prior_context_and_preserves_original_measurements(self):
        from scipy.io import wavfile
        sr = 8192
        t = np.arange(sr * 2) / sr
        audio = .3 * (np.sin(2 * np.pi * 261.6256 * t) * 2 ** (-t / 2)
            + np.where(t >= 1, np.sin(2 * np.pi * 369.9944 * t), 0))
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'passage.wav'
            wavfile.write(str(path), sr, audio.astype(np.float32))
            off = study.analyze_range(str(path), {'full_mix': str(path)}, 1, 1.5)
            on = study.analyze_range(str(path), {'full_mix': str(path)}, 1, 1.5,
                {'tail_reduction': 1, 'tail_half_life': 1})
        original = on['source_evidence']['full_mix']
        self.assertEqual(original['spectrum'], off['source_evidence']['full_mix']['spectrum'])
        self.assertTrue(original['tail_reduction']['applied'])
        self.assertIn('tail_context_sha256', on['input_fingerprints']['full_mix'])
        self.assertTrue(original['tail_reduced_spectrum']['peaks'])
        self.assertEqual(on['settings']['tail_reduction'], 1)

    def test_silent_context_does_not_change_local_study_exact_pitches(self):
        from scipy.io import wavfile
        sr = 8192
        t = np.arange(sr * 3) / sr
        audio = np.where((t >= 2) & (t < 2.8), .3 * np.sin(2 * np.pi * 261.6256 * t), 0)
        audio += np.where(t >= 2.8, .3 * np.sin(2 * np.pi * 329.6276 * t), 0)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'silent-context.wav'
            wavfile.write(str(path), sr, audio.astype(np.float32))
            off = study.analyze_range(str(path), {'full_mix': str(path)}, 2, 3)
            on = study.analyze_range(str(path), {'full_mix': str(path)}, 2, 3, {'tail_reduction': .5})
        self.assertAlmostEqual(on['source_evidence']['full_mix']['tail_reduction']['removed_fraction'], 0)
        self.assertEqual(on['evidence']['detected_pitches'], off['evidence']['detected_pitches'])


if __name__ == '__main__':
    unittest.main()
