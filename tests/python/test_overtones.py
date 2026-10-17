import sys
import tempfile
import unittest
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).absolute().parents[2] / 'backend'))
import chordpilot_spectrum as spectrum
import chordpilot_common as common
import chordpilot_analysis as analysis
import chordpilot_study as study


class OvertoneTests(unittest.TestCase):
    def power(self, tones, sr=8192):
        time = np.arange(sr) / sr
        audio = sum(amplitude * np.sin(2 * np.pi * frequency * time) for frequency, amplitude in tones)
        return audio, spectrum.spectral_power_for_crop(audio, sr, np), sr

    def test_harmonic_family_is_downweighted_without_deleting_or_mutating_peaks(self):
        _, power, sr = self.power([(100 * n, 1 / n ** .5) for n in range(1, 7)] + [(225, .5)])
        saved = power.copy()
        weighted, info = spectrum.reduce_overtones(power, sr, np, .5)
        np.testing.assert_array_equal(power, saved)
        self.assertTrue(info['applied'])
        self.assertGreater(info['removed_fraction'], 0)
        self.assertAlmostEqual(weighted[50], power[50])  # fundamental, 100 Hz
        self.assertLess(weighted[150], power[150])  # third harmonic, 300 Hz
        self.assertGreaterEqual(weighted[150], power[150] * .625)
        self.assertAlmostEqual(weighted[112], power[112])  # independent ninth-like tone

    def test_off_silence_and_two_note_octave_are_unchanged(self):
        for tones, strength in [([(100, 1), (200, .7)], .5), ([(100 * n, 1 / n) for n in range(1, 7)], 0), ([(100, 0)], 1)]:
            _, power, sr = self.power(tones)
            weighted, info = spectrum.reduce_overtones(power, sr, np, strength)
            np.testing.assert_array_equal(weighted, power)
            self.assertFalse(info['applied'])

    def test_independent_upper_fundamental_with_its_own_family_is_preserved(self):
        _, power, sr = self.power([(100 * n, 1 / n) for n in range(1, 7)]
            + [(300 * n, .5 / n) for n in range(1, 5)])
        weighted, _ = spectrum.reduce_overtones(power, sr, np, 1)
        self.assertAlmostEqual(weighted[150], power[150])

    def test_partial_masks_cannot_attenuate_a_nearby_supported_fundamental(self):
        power = np.zeros(2049)
        for frequency, value in [(50, 1), (100, .4), (150, .3), (200, .2), (104, .15), (208, .05), (312, .03), (416, .02)]:
            power[frequency // 2] = value
        weighted, info = spectrum.reduce_overtones(power, 8192, np, .5)
        self.assertTrue(info['applied'])
        self.assertEqual(weighted[52], power[52])

    def test_broadband_noise_is_not_treated_as_a_collection_of_harmonic_families(self):
        noise = np.random.default_rng(7).normal(0, .1, 11025)
        power = spectrum.spectral_power_for_crop(noise, 22050, np)
        weighted, info = spectrum.reduce_overtones(power, 22050, np, .5)
        self.assertFalse(info['applied'])
        np.testing.assert_array_equal(weighted, power)

    def test_partial_masks_preserve_stronger_neighboring_notes_without_a_family(self):
        power = np.zeros(2049)
        for frequency, value in [(50, 1), (100, .4), (150, .3), (200, .2), (104, 2)]:
            power[frequency // 2] = value
        weighted, info = spectrum.reduce_overtones(power, 8192, np, .5)
        self.assertTrue(info['applied'])
        self.assertEqual(weighted[52], power[52])

    def test_settings_are_clamped_and_cache_key_changes(self):
        default = common.normalize_analysis_options({})
        off = common.normalize_analysis_options({'overtone_weighting': 0})
        self.assertEqual(default['overtone_weighting'], .5)
        self.assertEqual(common.normalize_analysis_options({'overtone_weighting': 4})['overtone_weighting'], 1)
        self.assertNotEqual(common.options_cache_suffix(default), common.options_cache_suffix(off))

    def test_timed_and_local_evidence_use_weighted_notes_but_keep_original_spectrum(self):
        from scipy.io import wavfile
        audio, _, sr = self.power([(130.8128 * n, .2 / n ** .5) for n in range(1, 7)] + [(293.6648, .12)], sr=22050)
        def timed(strength):
            bars = [{'start': 0, 'chord': ''}]
            analysis.attach_timed_chord_events(bars, audio, sr, 120, '4/4', [0, .5], np,
                common.normalize_analysis_options({'chord_timing': 'fixed', 'overtone_weighting': strength}), 'other', key='C')
            return bars[0]['chord_events'][0]['debug']['cells'][0]['evidence']
        raw, weighted = timed(0), timed(.5)
        self.assertEqual(raw['spectrum'], weighted['spectrum'])
        self.assertTrue(weighted['overtone_weighting']['applied'])
        self.assertNotEqual(raw['detected_notes'], weighted['detected_notes'])
        self.assertNotEqual(raw['detected_pitches'], weighted['detected_pitches'])
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'harmonics.wav'
            wavfile.write(str(path), sr, audio.astype(np.float32))
            local = study.analyze_range(str(path), {'full_mix': str(path)}, 0, .5, {'overtone_weighting': .5})
        evidence = local['source_evidence']['full_mix']
        self.assertTrue(evidence['overtone_weighting']['applied'])
        self.assertEqual([p['midi'] for p in weighted['detected_pitches']], [p['midi'] for p in evidence['detected_pitches']])
        self.assertAlmostEqual(weighted['overtone_weighting']['removed_fraction'], evidence['overtone_weighting']['removed_fraction'], places=5)
        self.assertTrue(evidence['overtone_weighted_spectrum']['peaks'])


if __name__ == '__main__':
    unittest.main()
