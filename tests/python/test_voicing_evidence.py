import sys, unittest, tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'backend'))
import numpy as np
import chordpilot_spectrum as spectrum

class VoicingEvidenceTests(unittest.TestCase):
    sr = 22050

    def tones(self, midis, duration=.96):
        t = np.arange(round(self.sr * duration)) / self.sr
        return sum(.1 * np.sin(2*np.pi*440*2**((m-69)/12)*t) for m in midis).astype(np.float32)

    def test_sustained_shapes_keep_octaves_and_absolute_ranges(self):
        for midis in ([50,55,60,65,69], [55,60,64,71], [52,60,67,71]):
            frames = spectrum.voicing_frames_for_crop(self.tones(midis), self.sr, np, {})
            self.assertGreaterEqual(len(frames), 2)
            self.assertTrue(all(f['midis'] == midis for f in frames))
            self.assertTrue(all(0 <= f['start'] < f['end'] <= .961 for f in frames))

    def test_sequential_notes_noise_and_short_audio_do_not_create_a_voicing(self):
        arpeggio = np.concatenate([self.tones([m], .16) for m in [50,55,60,65,69]])
        for audio in (arpeggio, np.zeros(self.sr), np.random.default_rng(3).normal(0,.1,self.sr), self.tones([50,55,60,65,69], .15)):
            frames = spectrum.voicing_frames_for_crop(audio, self.sr, np, {})
            self.assertFalse(any(f['midis'] for f in frames))

    def test_fast_repeated_arpeggios_are_not_simultaneous_quartal_or_so_what_shapes(self):
        for midis in ([60,65,70], [50,55,60,65,69]):
            length = round(self.sr * .16 / len(midis))
            t = np.arange(length) / self.sr
            cycle = np.concatenate([.1 * np.hanning(length) * np.sin(2*np.pi*440*2**((m-69)/12)*t) for m in midis])
            frames = spectrum.voicing_frames_for_crop(np.tile(cycle,12),self.sr,np,{})
            self.assertFalse(any(f['midis'] for f in frames))

    def test_extra_doublings_and_unstable_voices_are_not_silently_discarded(self):
        audio = self.tones([50,55,60,65,69,74])
        frames = spectrum.voicing_frames_for_crop(audio, self.sr, np, {})
        self.assertFalse(any(f['midis'] for f in frames))
        changed = np.concatenate([self.tones([50,55,60,65,69], .16),self.tones([51,56,61,66,70], .16)])
        self.assertFalse(any(f['midis'] for f in spectrum.voicing_frames_for_crop(changed,self.sr,np,{})))

    def test_evidence_is_bounded_and_uses_retained_power(self):
        audio = self.tones([50,55,60,65,69], 12)
        power = spectrum.spectral_power_for_crop(audio,self.sr,np)
        frames = spectrum.voicing_frames_for_crop(audio,self.sr,np,{},power,np.zeros_like(power))
        self.assertLessEqual(len(frames),64)
        self.assertFalse(any(f['midis'] for f in frames))

    def test_fast_beat_and_grouped_half_beat_grids_keep_sustained_voicing_evidence(self):
        from chordpilot_analysis import attach_timed_chord_events
        from chordpilot_common import normalize_analysis_options
        audio = self.tones([50,55,60,65,69], 2)
        for tempo, timing, grid in ((150,'fixed','beat'), (120,'auto','half_beat')):
            options = normalize_analysis_options({'known_key':'D','chord_timing':timing,'chord_grid':grid})
            bars = [{'start':0,'chord':''}]
            beats = [i * 60 / tempo for i in range(6)]
            attach_timed_chord_events(bars,audio,self.sr,tempo,'4/4',beats,np,options,'other',key='D')
            frames = bars[0]['chord_events'][0]['evidence']['voicing_frames']
            with self.subTest(tempo=tempo, grid=grid):
                self.assertGreaterEqual(len(frames),2)
                self.assertTrue(all(f['midis']==[50,55,60,65,69] for f in frames))

    def test_study_and_timed_cells_share_accompaniment_snapshots_without_bass(self):
        from scipy.io.wavfile import write
        from chordpilot_study import analyze_range
        from chordpilot_analysis import attach_timed_chord_events
        from chordpilot_common import normalize_analysis_options
        audio = self.tones([50,55,60,65,69], 2)
        bass = self.tones([38], 2)
        options = normalize_analysis_options({'known_key':'D','chord_timing':'fixed','overtone_weighting':.5})
        with tempfile.TemporaryDirectory() as folder:
            other_path, bass_path = Path(folder)/'other.wav', Path(folder)/'bass.wav'
            write(str(other_path),self.sr,audio)
            write(str(bass_path),self.sr,bass)
            run = analyze_range(str(other_path), {'other':str(other_path),'bass':str(bass_path)}, .5,1.0, options)
            self.assertEqual(run['evidence']['voicing_frames'],run['source_evidence']['other']['voicing_frames'])
            self.assertNotIn('voicing_frames',run['source_evidence']['bass'])
            self.assertTrue(all(f['start'] >= .5 and f['end'] <= 1.0 for f in run['evidence']['voicing_frames']))
            solo = analyze_range(str(bass_path), {'bass':str(bass_path)}, .5,1.5, options)
            self.assertNotIn('voicing_frames', solo['evidence'])
        bars = [{'start':.5,'chord':''}]
        attach_timed_chord_events(bars,audio,self.sr,120,'4/4',[.5,1.5],np,options,'other',bass,self.sr,key='D')
        frames = bars[0]['chord_events'][0]['evidence']['voicing_frames']
        self.assertEqual(frames,run['evidence']['voicing_frames'])
        self.assertTrue(all(38 not in f['midis'] for f in frames))

if __name__ == '__main__': unittest.main()
