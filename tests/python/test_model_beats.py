import sys
import unittest
from unittest.mock import patch
from unittest.mock import Mock
from types import SimpleNamespace
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'backend'))
import numpy as np
import chordpilot_analysis as analysis
from chordpilot_common import normalize_analysis_options


class ModelBeatTests(unittest.TestCase):
    def test_steady_model_option_is_explicit_and_round_trips(self):
        self.assertEqual(normalize_analysis_options({'rhythm_engine': 'beat_this_steady'})['rhythm_engine'], 'beat_this_steady')

    def test_steady_decoder_cache_revision_does_not_invalidate_other_engines(self):
        for engine in ('onset','beat_this_steady'):
            with patch.object(analysis.Path,'exists',return_value=True), \
                 patch.object(analysis,'read_analysis_cache',return_value={'bars':[]}) as read, \
                 patch.object(analysis,'append_history'):
                analysis.analyze('song.wav','fast',{'rhythm_engine':engine})
            self.assertEqual('-steady-v2' in read.call_args.args[1],engine=='beat_this_steady')

    def test_steady_model_rejects_insufficient_evidence(self):
        from chordpilot_beats import steady_model_grid
        fake = SimpleNamespace(beat=SimpleNamespace(beat_track=Mock(return_value=(120, np.array([0,25])))))
        with patch.dict(sys.modules, {'librosa':fake}):
            with self.assertRaisesRegex(RuntimeError, 'Not enough model evidence'):
                steady_model_grid(np.ones(100)*.01, np.ones(100)*.01, 2, np, {})

    def test_steady_model_keeps_quarters_and_estimates_a_short_measure(self):
        from chordpilot_beats import steady_model_grid
        frames = np.arange(0, 400, 25)
        beat, downbeat = np.ones(400)*.00001, np.ones(400)*.00001
        beat[frames] = .99
        downbeat[frames[[0,4,8,10,14]]] = .99
        fake = SimpleNamespace(beat=SimpleNamespace(beat_track=Mock(return_value=(120, frames))))
        with patch.dict(sys.modules, {'librosa':fake}):
            result = steady_model_grid(beat, downbeat, 8, np, {'min_bpm':90,'max_bpm':150})
        self.assertEqual(result['beat_times'], (frames/50).tolist())
        self.assertEqual(result['measure_grid'][:4], [
            {'start':0.,'end':2.,'beats':4,'confidence':.99,'inferred':False,'meter_estimate':False},
            {'start':2.,'end':4.,'beats':4,'confidence':.99,'inferred':False,'meter_estimate':False},
            {'start':4.,'end':5.,'beats':2,'confidence':.99,'inferred':False,'meter_estimate':True},
            {'start':5.,'end':7.,'beats':4,'confidence':.99,'inferred':False,'meter_estimate':False}])
        self.assertTrue(any('ambiguous' in warning for warning in result['timing_diagnostics']))
        self.assertEqual(result['measure_grid'][-1]['end'],8)

    def test_estimated_meter_reaches_the_shared_bar_model(self):
        grid=[{'start':0,'beats':2},{'start':1,'beats':4}]
        bars=analysis.estimate_bars_from_audio(np.zeros(3000),1000,120,'4/4',[0,.5,1,1.5,2,2.5],np,
            downbeat_times=[0,1],measure_grid=grid)
        self.assertEqual([bar['time_signature'] for bar in bars],['2/4','4/4'])
        self.assertNotIn('pickup_beats',bars[0])

    def test_model_pulse_does_not_force_a_slow_song_to_double_time(self):
        from chordpilot_beats import steady_model_grid
        frames = np.arange(0, 624, 39)
        beat, downbeat = np.ones(624)*.00001, np.ones(624)*.00001
        beat[frames] = .99; downbeat[frames[::4]] = .99
        tracker = Mock(return_value=(77, frames))
        with patch.dict(sys.modules, {'librosa':SimpleNamespace(beat=SimpleNamespace(beat_track=tracker))}):
            steady_model_grid(beat, downbeat, 12.48, np, {'min_bpm':60,'max_bpm':190})
        self.assertEqual(tracker.call_args.kwargs['bpm'],77)

    def test_a_final_partial_span_does_not_invent_a_meter_change(self):
        from chordpilot_beats import steady_model_grid
        frames = np.arange(0, 400, 25)
        beat, downbeat = np.ones(400)*.00001, np.ones(400)*.00001
        beat[frames] = .99; downbeat[frames[::4]] = .99
        fake = SimpleNamespace(beat=SimpleNamespace(beat_track=Mock(return_value=(120, frames))))
        with patch.dict(sys.modules, {'librosa':fake}):
            result = steady_model_grid(beat, downbeat, 8, np, {'min_bpm':90,'max_bpm':150})
        self.assertFalse(any(m['meter_estimate'] for m in result['measure_grid']))
        self.assertEqual(result['measure_grid'][-1]['start'],6)
        self.assertEqual(result['measure_grid'][-1]['beats'],4)

    def test_shifted_grids_keep_partial_measure_beat_counts(self):
        from chordpilot_beats import offset_steady_grid
        for offset in (-1.,1.):
            result={'beat_times':[i*.5 for i in range(16)],'measure_grid':[
                {'start':i*2.,'end':(i+1)*2.,'beats':4,'confidence':.99,'inferred':False,'meter_estimate':False} for i in range(4)]}
            offset_steady_grid(result,offset,8)
            self.assertEqual(result['downbeat_times'],[m['start'] for m in result['measure_grid']])
            for measure in result['measure_grid']:
                interior=[b for b in result['beat_times'] if measure['start']+.001<b<measure['end']-.001]
                self.assertEqual(len(interior),measure['beats']-1)
            self.assertEqual(result['measure_grid'][-1 if offset>0 else 0]['beats'],2)
            if offset<0:self.assertEqual(result['measure_grid'][0]['pickup_beats'],2)
        short={'beat_times':[i*.5 for i in range(8)],'measure_grid':[
            {'start':i*2.,'end':(i+1)*2.,'beats':4,'confidence':.99,'inferred':False,'meter_estimate':False} for i in range(2)]}
        offset_steady_grid(short,-1,4)
        self.assertEqual(short['measure_grid'][-1]['end'],4)
        self.assertEqual(short['measure_grid'][-1]['beats'],2)
        fractional={'beat_times':[i*.5 for i in range(8)],'measure_grid':[
            {'start':i*2.,'end':(i+1)*2.,'beats':4,'confidence':.99,'inferred':False,'meter_estimate':False} for i in range(2)]}
        offset_steady_grid(fractional,-.1,4)
        self.assertEqual(fractional['measure_grid'][-1]['end'],4)
        self.assertTrue(fractional['measure_grid'][-1]['inferred'])

    def test_leading_beats_are_a_pickup_instead_of_a_meter_change(self):
        from chordpilot_beats import steady_model_grid
        frames=np.arange(0,400,25)
        beat,downbeat=np.ones(400)*.00001,np.ones(400)*.00001
        beat[frames]=.99;downbeat[frames[[2,6,10,14]]]=.99
        fake=SimpleNamespace(beat=SimpleNamespace(beat_track=Mock(return_value=(120,frames))))
        with patch.dict(sys.modules,{'librosa':fake}):
            result=steady_model_grid(beat,downbeat,8,np,{'min_bpm':90,'max_bpm':150})
        self.assertEqual(result['measure_grid'][0].get('pickup_beats'),2)
        self.assertFalse(result['measure_grid'][0]['meter_estimate'])
        bars=analysis.estimate_bars_from_audio(np.zeros(8000),1000,120,'4/4',result['beat_times'],np,
            downbeat_times=result['downbeat_times'],measure_grid=result['measure_grid'])
        self.assertEqual(bars[0]['time_signature'],'4/4')
        self.assertEqual(bars[0]['pickup_beats'],2)

    def test_explicit_model_failure_does_not_silently_create_a_different_grid(self):
        with patch.object(analysis, 'estimate_builtin', side_effect=RuntimeError('optional model unavailable')):
            with self.assertRaisesRegex(RuntimeError, 'optional model unavailable'):
                analysis.analyze('missing.wav', 'fast', {'rhythm_engine': 'beat_this', 'use_cache': False})

    def test_optional_engine_round_trips_and_invalid_values_keep_existing_default(self):
        self.assertEqual(normalize_analysis_options({'rhythm_engine': 'beat_this'})['rhythm_engine'], 'beat_this')
        self.assertEqual(normalize_analysis_options({'rhythm_engine': 'unknown'})['rhythm_engine'], 'onset')

    def test_joint_downbeats_define_bars_without_counting_extra_beat_peaks(self):
        from chordpilot_beats import metrical_grid
        # Extra peaks near the opening and a syncopated strum must not shift bars.
        raw = [.94, 1.04, 1.7, 1.88, 2.4, 3.12, 3.78, 4.44, 5.1, 5.76, 6.44, 7.14, 7.76]
        beats, downbeats, inferred = metrical_grid(raw, [2.4, 5.1, 7.76], 8, np)
        self.assertEqual(downbeats, [2.4, 5.1, 7.76])
        self.assertEqual(beats, [1.04, 1.7, 2.4, 3.12, 3.78, 4.44, 5.1, 5.76, 6.44, 7.14, 7.76])
        self.assertEqual(inferred, 0)
        bars = analysis.estimate_bars_from_audio(np.zeros(8000), 1000, 90, '4/4', beats, np,
                                                downbeat_times=downbeats)
        self.assertEqual([b['start'] for b in bars], [1.04, 2.4, 5.1, 7.76])
        self.assertEqual(bars[0]['pickup_beats'], 2)
        self.assertEqual(bars[0]['section'], 'Unlabelled')

    def test_missing_quarter_beat_is_interpolated_without_moving_model_downbeats(self):
        from chordpilot_beats import metrical_grid
        beats, downbeats, inferred = metrical_grid([0, .5, 1.5, 2, 2.5, 3, 3.5, 4], [0, 2, 4], 4.5, np)
        self.assertEqual(beats, [0, .5, 1, 1.5, 2, 2.5, 3, 3.5, 4])
        self.assertEqual(inferred, 1)
        self.assertEqual(downbeats, [0, 2, 4])
