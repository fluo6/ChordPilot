import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).absolute().parents[2] / 'backend'))
from chordpilot_analysis import estimate_bass_reference


class BassFundamentalsTests(unittest.TestCase):
    sr = 22050

    def tone(self, midi, duration=.6, partials=(1, .5, .25)):
        t = np.arange(round(self.sr * duration)) / self.sr
        f = 440 * 2 ** ((midi - 69) / 12)
        return sum(amplitude * np.sin(2 * np.pi * f * (index + 1) * t)
                   for index, amplitude in enumerate(partials)) * .15

    def test_strong_third_partial_does_not_become_bass_root(self):
        result = estimate_bass_reference(self.tone(31, partials=(.12, .6, 1)), self.sr, 0, .6, np)
        self.assertEqual(result['pitch_class'], 7)
        self.assertEqual(result['midi'], 31)

    def test_missing_fundamental_is_supported_by_multiple_partials(self):
        result = estimate_bass_reference(self.tone(23, partials=(0, 1, .7, .3)), self.sr, 0, .6, np)
        self.assertEqual(result['midi'], 23)

    def test_weak_fundamental_is_not_replaced_by_dominant_second_partial(self):
        for midi in (23, 28, 31, 36, 43):
            with self.subTest(midi=midi):
                result = estimate_bass_reference(self.tone(midi, partials=(.25, 1)), self.sr, 0, .6, np)
                self.assertIsNotNone(result)
                self.assertEqual(result['midi'], midi)

    def test_weak_root_with_dominant_third_partial_keeps_pitch_class(self):
        result = estimate_bass_reference(self.tone(31, partials=(.15, 0, 1)), self.sr, 0, .6, np)
        self.assertEqual(result['midi'], 31)

    def test_pure_upper_note_does_not_invent_lower_octave(self):
        result = estimate_bass_reference(self.tone(45, partials=(1,)), self.sr, 0, .6, np)
        self.assertEqual(result['midi'], 45)

    def test_out_of_range_upper_bleed_is_not_lowered_into_bass_register(self):
        for midi in (72, 76, 78, 81):
            for partials in ((1,), (.25, 1)):
                with self.subTest(midi=midi, partials=partials):
                    self.assertIsNone(estimate_bass_reference(self.tone(midi, partials=partials), self.sr, 0, .6, np))

    def test_noise_and_silence_have_no_confident_pitch(self):
        for audio in (np.zeros(self.sr), np.random.default_rng(7).normal(0, .1, self.sr)):
            self.assertIsNone(estimate_bass_reference(audio, self.sr, 0, 1, np))

    def test_quiet_periodic_recording_noise_is_not_a_bass_note(self):
        import chordpilot_analysis as analysis
        quiet = self.tone(29, .4, (1,)) * .0003
        audio = np.concatenate([quiet, self.tone(31, .5)])
        events = analysis.bass_note_events(audio, self.sr, np)
        self.assertEqual([note['midi'] for note in events], [31])

    def test_local_bass_selection_keeps_the_recording_noise_reference(self):
        from chordpilot_bass import bass_note_events
        t = np.arange(self.sr) / self.sr
        noise = .00016 * np.sin(2*np.pi*49.93*t)
        recording = np.concatenate([noise,self.tone(39,1)])
        self.assertFalse(bass_note_events(recording,self.sr,np,.2,.9))
        self.assertIsNone(estimate_bass_reference(recording,self.sr,.2,.9,np))

    def test_recording_noise_gate_preserves_quiet_notes_and_real_near_50_hz_bass(self):
        from chordpilot_bass import bass_note_events
        # Quiet but audible bass, including a missing fundamental, must survive
        # the recording-level threshold; no special pitch/frequency rejection.
        for partials in ((1,.5,.25),(0,1,.7,.3)):
            recording = np.concatenate([self.tone(31,1,partials)*.02,self.tone(39,1)])
            events = bass_note_events(recording,self.sr,np,.2,.9)
            self.assertTrue(events)
            self.assertEqual({n['midi'] for n in events},{31})
        t = np.arange(self.sr) / self.sr
        recording = np.concatenate([.05*np.sin(2*np.pi*49.93*t),self.tone(39,1)])
        self.assertEqual({n['midi'] for n in bass_note_events(recording,self.sr,np,.2,.9)},{31})

    def test_recording_noise_reference_uses_the_same_bandwidth_as_whole_tracking(self):
        from chordpilot_bass import bass_note_events, bass_noise_floor
        t=np.arange(self.sr)/self.sr
        recording=np.concatenate([.0003*np.sin(2*np.pi*49*t),.15*np.sin(2*np.pi*6000*t)])
        self.assertAlmostEqual(bass_noise_floor(recording,self.sr,np),1e-4)
        self.assertIn(31,[n['midi'] for n in bass_note_events(recording,self.sr,np)])
        self.assertEqual({n['midi'] for n in bass_note_events(recording,self.sr,np,.1,.9)},{31})

    def test_bass_events_preserve_octave_jump_and_short_passing_note(self):
        import chordpilot_analysis as analysis
        tracker = getattr(analysis, 'bass_note_events', None)
        self.assertTrue(callable(tracker), 'independent bass note tracking is required')
        audio = np.concatenate([self.tone(31, .4), self.tone(43, .3), self.tone(38, .12), self.tone(36, .4)])
        events = tracker(audio, self.sr, np)
        self.assertEqual([event['midi'] for event in events], [31, 43, 38, 36])
        for event, expected in zip(events, [0, .4, .7, .82]):
            self.assertAlmostEqual(event['start'], expected, delta=.07)

    def test_bass_events_leave_real_rest_and_respect_selected_crop(self):
        import chordpilot_analysis as analysis
        tracker = getattr(analysis, 'bass_note_events', None)
        self.assertTrue(callable(tracker), 'independent bass note tracking is required')
        audio = np.concatenate([self.tone(31, .3), np.zeros(round(.2 * self.sr)), self.tone(36, .3)])
        events = tracker(audio, self.sr, np)
        self.assertEqual([event['midi'] for event in events], [31, 36])
        self.assertGreater(events[1]['start'] - events[0]['end'], .09)
        selected = tracker(audio, self.sr, np, .52, .78)
        self.assertEqual([event['midi'] for event in selected], [36])
        self.assertGreaterEqual(selected[0]['start'], .52)
        self.assertLessEqual(selected[-1]['end'], .78)

    def test_loud_short_passing_notes_survive_adjacent_note_windows(self):
        from chordpilot_bass import bass_note_events
        for duration in (.08, .1):
            audio = np.concatenate([self.tone(31, .4), self.tone(38, duration), self.tone(43, .4)])
            notes = bass_note_events(audio, self.sr, np)
            self.assertEqual([note['midi'] for note in notes], [31, 38, 43])

    def test_short_note_with_missing_root_keeps_the_inferred_fundamental(self):
        from chordpilot_bass import bass_note_events
        audio=np.concatenate([self.tone(31,.4),self.tone(38,.1,(0,1,.7,.3)),self.tone(43,.4)])
        self.assertEqual([note['midi'] for note in bass_note_events(audio,self.sr,np)],[31,38,43])

    def test_quiet_reappearing_release_is_not_engraved_as_a_new_note(self):
        from chordpilot_bass import bass_note_events
        audio = np.concatenate([self.tone(31, .5), np.zeros(round(.1*self.sr)),
                                self.tone(31, .25)*.025, self.tone(38, .4)])
        notes = bass_note_events(audio, self.sr, np)
        self.assertEqual([note['midi'] for note in notes], [31, 38])
        self.assertGreater(notes[0]['end'], .8)

    def test_quiet_returns_cannot_keep_renewing_an_old_loud_note(self):
        from chordpilot_bass import bass_note_events
        audio=np.concatenate([self.tone(31,.4),np.zeros(round(self.sr*.1)),
          self.tone(31,.2)*.02,np.zeros(round(self.sr*.2)),self.tone(31,.2)*.02,
          np.zeros(round(self.sr*.2)),self.tone(31,.4)*.02])
        notes=bass_note_events(audio,self.sr,np)
        self.assertGreaterEqual(len(notes),2)
        self.assertLess(notes[0]['end'],1.2)

    def test_quiet_fast_note_after_a_rest_survives_louder_recent_note(self):
        from chordpilot_bass import bass_note_events
        audio = np.concatenate([self.tone(31,.4),np.zeros(round(self.sr*.1)),
                                self.tone(38,.12)*.08,np.zeros(round(self.sr*.08)),self.tone(43,.4)])
        notes = bass_note_events(audio,self.sr,np)
        self.assertEqual([note['midi'] for note in notes],[31,38,43])

    def test_decaying_pitch_release_does_not_create_short_chromatic_notes(self):
        from chordpilot_analysis import bass_note_events
        t = np.arange(round(self.sr * 1.1)) / self.sr
        frequencies = np.interp(t, [0, .5, .6, .7, .8, .9, 1.1], [49, 49, 44, 44, 47, 49, 49])
        phase = np.cumsum(frequencies) * 2 * np.pi / self.sr
        release = .15 * (np.sin(phase) + .5*np.sin(phase*2)) * np.exp(-np.maximum(0,t-.5)*7)
        audio = np.concatenate([release, self.tone(38, .2)])
        notes = bass_note_events(audio, self.sr, np)
        self.assertFalse(any(note['midi'] in (29, 30) for note in notes))
        self.assertEqual(notes[-1]['midi'], 38)

    def test_short_chromatic_note_with_new_attack_is_retained(self):
        from chordpilot_analysis import bass_note_events
        audio = np.concatenate([self.tone(38, .4)*.4, self.tone(37, .1), self.tone(36, .4)])
        notes = bass_note_events(audio, self.sr, np)
        self.assertEqual([note['midi'] for note in notes], [38, 37, 36])

    def test_continuous_slide_does_not_engrave_each_semitone_as_a_played_note(self):
        from chordpilot_bass import bass_note_events
        for glide in (.25,.4,.55):
            t=np.arange(round(self.sr*(.8+glide)))/self.sr
            frequency=np.interp(t,[0,.4,.4+glide,.8+glide],[73.416,73.416,51.913,51.913])
            phase=np.cumsum(frequency)*2*np.pi/self.sr
            audio=.15*(np.sin(phase)+.5*np.sin(phase*2)+.25*np.sin(phase*3))
            self.assertEqual([note['midi'] for note in bass_note_events(audio,self.sr,np)],[38,32])

    def test_separate_chromatic_holds_without_a_volume_jump_are_retained(self):
        from chordpilot_bass import bass_note_events
        audio=np.concatenate([self.tone(midi,.16) for midi in (38,37,36,35)])
        self.assertEqual([note['midi'] for note in bass_note_events(audio,self.sr,np)],[38,37,36,35])

    def test_fast_phase_continuous_chromatic_holds_are_retained(self):
        from chordpilot_bass import bass_note_events
        for root, duration in ((38,.12),(38,.14),(25,.12),(25,.14),(26,.12)):
            frequencies = np.concatenate([np.full(round(self.sr * length), 440 * 2 ** ((midi-69)/12))
                                          for midi, length in ((root,.4),(root-1,duration),(root-2,duration),(root-3,.4))])
            phase = np.cumsum(frequencies) * 2 * np.pi / self.sr
            audio = .15 * (np.sin(phase) + .5*np.sin(2*phase) + .25*np.sin(3*phase))
            with self.subTest(root=root, duration=duration):
                self.assertEqual([note['midi'] for note in bass_note_events(audio,self.sr,np)], list(range(root,root-4,-1)))

    def test_rejected_single_frame_neighbor_does_not_erase_a_returning_note(self):
        from unittest.mock import patch
        from chordpilot_bass import bass_note_events
        audio = self.tone(38, .8)
        audio[round(self.sr*.42):] *= .5
        audio[round(self.sr*.54):] *= .2
        # A brief rejected neighbour in an otherwise stable, decaying D2.
        pitches = [(38,.98,73.42)]*20 + [(39,.98,77.78)] + [(38,.98,73.42)]*6
        pitches += [(43,.98,98)]*20
        with patch('chordpilot_bass.periodic_bass_pitch', side_effect=pitches):
            notes = bass_note_events(audio, self.sr, np)
        self.assertTrue(any(note['midi'] == 38 and note['start'] <= .48 < note['end'] for note in notes))

    def test_bar_bass_notes_are_independent_of_chord_grid(self):
        from chordpilot_analysis import add_bass_reference_to_bars
        audio = np.concatenate([self.tone(31, .4), self.tone(43, .3), self.tone(36, .4)])
        bars = [{'start': 0}, {'start': .6}]
        add_bass_reference_to_bars(bars, audio, self.sr, np)
        self.assertIn('bass_events', bars[0])
        self.assertEqual([event['midi'] for event in bars[0]['bass_events']], [31, 43])
        self.assertEqual([event['midi'] for event in bars[1]['bass_events']], [43, 36])
        self.assertEqual(bars[0]['bass_events'][-1]['end'], .6)
        self.assertEqual(bars[1]['bass_events'][0]['start'], .6)


if __name__ == '__main__':
    unittest.main()
