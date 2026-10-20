import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'backend'))
from chordpilot_analysis import estimate_beat_times, onset_envelope
import chordpilot_analysis as analysis


class BeatTrackingTests(unittest.TestCase):
    def track(self, times, tempo=120, offset=0):
        envelope = np.zeros(round((times[-1] + 1) * 100))
        envelope[np.rint(np.array(times) * 100).astype(int)] = 1
        return estimate_beat_times(envelope, tempo, 100, 1, np, offset)

    def test_fractional_tempo_does_not_accumulate_drift_past_four_minutes(self):
        expected = np.arange(.5, 300, 60 / 103.4)
        actual = self.track(expected, 103)
        self.assertEqual(len(actual), len(expected))
        self.assertLess(np.max(np.abs(np.array(actual) - expected)), .011)

    def test_beats_follow_a_gradual_tempo_change(self):
        expected = np.r_[1., 1. + np.cumsum(np.linspace(.5, .6, 100))]
        actual = self.track(expected, 110)
        self.assertEqual(len(actual), len(expected))
        self.assertLess(np.max(np.abs(np.array(actual) - expected)), .011)

    def test_leading_silence_and_whole_beat_offsets_are_preserved(self):
        expected = np.arange(5, 12, .5)
        np.testing.assert_allclose(self.track(expected, offset=.5), expected + .5, atol=.011)
        shifted = self.track(np.arange(.1, 4, .5), offset=-.2)
        np.testing.assert_allclose(shifted, np.arange(.4, 3.5, .5), atol=.011)

    def test_silence_does_not_produce_measured_beats(self):
        self.assertEqual(estimate_beat_times(np.zeros(1000), 120, 100, 1, np), [])
        result=analysis.estimate_rhythm(np.zeros(22050),22050,np)
        self.assertEqual(result['beat_times'],[])
        self.assertIn('no rhythmic evidence',result['tempo_beats'])

    def test_stronger_backbeats_do_not_discard_the_first_beat(self):
        times=np.arange(.5,20,.5)
        envelope=np.zeros(2100)
        envelope[np.rint(times*100).astype(int)]=np.resize([1.,2.],len(times))
        np.testing.assert_allclose(estimate_beat_times(envelope,120,100,1,np),times,atol=.011)

    def test_available_librosa_timestamps_are_retained_and_shifted_once(self):
        library=Mock()
        library.beat.beat_track.return_value=(120,np.array([10,61,113,166,220]))
        envelope=np.zeros(300); envelope[[10,61,113,166,220]]=1
        with patch.object(analysis,'try_import',return_value=library), \
             patch.object(analysis,'onset_envelope',return_value=envelope):
            result=analysis.estimate_rhythm(np.zeros(300),100,np,{'onset_hop':1,'beat_offset':.5})
        self.assertEqual(result['beat_times'],[.6,1.11,1.63,2.16,2.7])
        self.assertEqual(result['tempo_beats'],'librosa onset beat tracking')
        self.assertAlmostEqual(result['tempo_exact'],114.2857,places=4)

    def test_broken_optional_tracker_uses_measured_fallback(self):
        library=Mock(); library.beat.beat_track.side_effect=RuntimeError('optional tracker failed')
        envelope=np.zeros(800); envelope[np.arange(50,750,50)]=1
        with patch.object(analysis,'try_import',return_value=library), \
             patch.object(analysis,'onset_envelope',return_value=envelope):
            result=analysis.estimate_rhythm(np.zeros(800),100,np,{'onset_hop':1})
        self.assertEqual(result['beat_times'],list(np.arange(.5,7.5,.5)))
        self.assertEqual(result['tempo_beats'],'onset dynamic programming')

    def test_one_missing_attack_keeps_the_beat_count(self):
        expected = np.arange(1, 16, .5)
        observed = np.delete(expected, 12)
        actual = self.track(observed)
        np.testing.assert_allclose(actual, expected, atol=.011)

    def test_audio_frame_coordinates_match_known_clicks(self):
        sr, hop, frame = 22050, 512, 2048
        expected = np.arange(.5, 8, .5)
        audio = np.zeros(sr * 9)
        audio[np.rint(expected * sr).astype(int)] = 1
        envelope = onset_envelope(audio, sr, frame, hop, np)
        actual = estimate_beat_times(envelope, 120, sr, hop, np)
        self.assertEqual(len(actual), len(expected))
        self.assertLess(np.max(np.abs(np.array(actual) - expected)), hop / sr)

    def test_attack_at_file_start_is_not_lost(self):
        sr, hop, frame = 22050, 512, 2048
        for offset in [0, .005, .01]:
            with self.subTest(offset=offset):
                expected = np.arange(0, 6, .5) + offset
                audio = np.zeros(sr * 7)
                audio[np.rint(expected * sr).astype(int)] = 1
                actual = estimate_beat_times(onset_envelope(audio, sr, frame, hop, np), 120, sr, hop, np)
                self.assertEqual(len(actual), len(expected))
                np.testing.assert_allclose(actual, expected, atol=hop / sr)

    def test_installed_librosa_keeps_opening_attack_and_excludes_silent_tail(self):
        if not analysis.try_import('librosa'):
            self.skipTest('optional librosa is unavailable in this interpreter')
        sr=22050
        expected=np.arange(0,7,.5)
        audio=np.zeros(sr*8); audio[np.rint(expected*sr).astype(int)]=1
        result=analysis.estimate_rhythm(audio,sr,np)
        self.assertEqual(result['tempo_beats'],'librosa onset beat tracking')
        np.testing.assert_allclose(result['beat_times'],expected,atol=512/sr)

    def test_selected_timing_engine_matches_the_beats_that_are_published(self):
        measured={'duration':4,'tempo':120,'beat_times':[.3,.81,1.33],
                  'tempo_beats':'onset dynamic programming','tempo_exact':117.65,
                  'bars':[{'number':1,'start':.3,'chord':'C'}]}
        with patch.object(analysis,'estimate_builtin',return_value=measured), \
             patch.object(analysis,'estimate_with_librosa',return_value={'tempo':90,'beat_times':[0,.66,1.33]}), \
             patch.object(analysis,'waveform_peaks',return_value=[]), patch.object(analysis,'append_history'):
            result=analysis.analyze('missing.wav','fast',{'use_cache':False,'known_key':'C'})
        self.assertEqual(result['beat_times'],[.3,.81,1.33])
        self.assertEqual(result['analysis_engine']['tempo_beats'],'onset dynamic programming')
        self.assertEqual(result.get('tempo_exact'),117.65)

    def test_bar_phase_selects_a_downbeat_without_moving_measured_beats(self):
        beats=[.25,.75,1.25,1.75,2.25,2.75,3.25,3.75,4.25]
        bars=analysis.estimate_bars_from_audio(np.zeros(5000),1000,120,'4/4',beats,np,options={'bar_phase':2})
        self.assertEqual([b['start'] for b in bars],[.25,1.25,3.25])
        self.assertEqual(bars[0]['pickup_beats'],2)
        self.assertEqual(bars[0]['evidence']['range'],[.25,1.25])
        self.assertEqual(bars[-1]['evidence']['range'][1],5.)

    def test_fallback_retains_timing_corrections_and_pickup(self):
        with patch.object(analysis,'estimate_builtin',side_effect=RuntimeError('chords failed')), \
             patch.object(analysis,'estimate_with_librosa',return_value={'tempo':120,'beat_times':[.25+i*.5 for i in range(9)]}), \
             patch.object(analysis,'audio_duration',return_value=5), \
             patch.object(analysis,'waveform_peaks',return_value=[]), patch.object(analysis,'append_history'):
            result=analysis.analyze('missing.wav','fast',{'use_cache':False,'known_key':'C','beat_offset':.5,'bar_phase':2})
        self.assertEqual(result['beat_times'],[.75+i*.5 for i in range(9)])
        self.assertEqual([b['start'] for b in result['bars']],[.75,1.75,3.75])
        self.assertEqual(result['bars'][0]['pickup_beats'],2)
        self.assertEqual(result['analysis_engine']['bar_alignment'],'manual beat phase')


if __name__ == '__main__':
    unittest.main()
