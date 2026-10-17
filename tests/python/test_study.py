import json
import math
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))
import chordpilot_study as study
import numpy as np
from scipy.io.wavfile import write


class StudyTests(unittest.TestCase):
    def test_recording_gate_checks_note_frames_not_selection_average_with_rests(self):
        from chordpilot_bass import bass_noise_floor, bass_note_events
        t = np.arange(self.sr*2)/self.sr
        bass = .15*(np.sin(2*np.pi*77.7817*t)+.5*np.sin(4*np.pi*77.7817*t)+.25*np.sin(6*np.pi*77.7817*t))
        bass[:self.sr]=0
        count=round(self.sr*.4)
        bass[:count]=.0013*np.sin(2*np.pi*49.0*t[:count])
        floor=bass_noise_floor(bass,self.sr,np)
        self.assertLess(float(np.sqrt(np.mean(bass[:self.sr]**2))),floor)
        self.assertTrue(bass_note_events(bass,self.sr,np,0,1))
        bass_path,other_path=str(self.root/'brief-bass.wav'),str(self.root/'brief-other.wav')
        write(bass_path,self.sr,bass.astype(np.float32))
        other=sum(.001*np.sin(2*np.pi*f*t) for f in (196,246.94,293.66))
        write(other_path,self.sr,other.astype(np.float32))
        for sources in ({'other':other_path,'bass':bass_path},{'bass':bass_path}):
            run=study.analyze_range(other_path,sources,0,1,{'known_key':'G'})
            self.assertTrue(run['source_evidence']['bass']['used_for_notes'])
            self.assertIn(31,[p['midi'] for p in run['evidence']['detected_pitches']])

    def test_local_study_does_not_promote_quiet_recording_noise_to_bass_guidance(self):
        t = np.arange(self.sr) / self.sr
        noise = .00016*np.sin(2*np.pi*49.93*t)
        played = .1*np.sin(2*np.pi*77.7817*t)
        bass_path = str(self.root/'bass-with-noise.wav')
        other_path = str(self.root/'chord-with-noise.wav')
        write(bass_path,self.sr,np.concatenate([noise,played]).astype(np.float32))
        other = sum(.002*np.sin(2*np.pi*f*np.arange(self.sr*2)/self.sr) for f in (155.5635,184.9972,233.0819))
        write(other_path,self.sr,other.astype(np.float32))
        run = study.analyze_range(other_path,{'other':other_path,'bass':bass_path},.2,.9,{'known_key':'Ebm'})
        self.assertFalse((run['bass_reference'] or {}).get('origin') == 'bass')
        self.assertFalse(run['source_evidence']['bass']['used_for_notes'])
        self.assertNotIn(31,[p['midi'] for p in run['evidence']['detected_pitches']])
        # Bass-only studies use the same gate, while keeping the raw spectrum.
        solo = study.analyze_range(bass_path,{'bass':bass_path},.2,.9)
        self.assertIsNone(solo['bass_reference'])
        self.assertEqual(solo['chord'],'N.C.')
        self.assertEqual(solo['chord_confidence'],0)
        self.assertEqual(solo['evidence']['detected_pitches'],[])
        self.assertTrue(solo['source_evidence']['bass']['spectrum']['peaks'])
        gate=solo['source_evidence']['bass']['noise_gate']
        self.assertEqual(gate['reference'],'recording')
        self.assertGreater(gate['threshold_rms'],gate['selection_rms'])
        self.assertEqual(solo['input_fingerprints']['bass']['bass_noise_floor'],gate['threshold_rms'])

    def test_bass_keyboard_evidence_uses_fundamental_but_spectrum_keeps_partials(self):
        t = np.arange(self.sr) / self.sr
        f = 440 * 2 ** ((31 - 69) / 12)
        audio = .1 * (.25 * np.sin(2*np.pi*f*t) + np.sin(4*np.pi*f*t) + .8*np.sin(6*np.pi*f*t))
        filename = str(self.root / 'harmonic-bass.wav')
        write(filename, self.sr, audio.astype(np.float32))
        run = study.analyze_range(filename, {'bass':filename}, .1, .9, {'overtone_weighting':0})
        self.assertEqual(run['bass_reference']['midi'], 31)
        self.assertEqual([p['midi'] for p in run['evidence']['detected_pitches']], [31])
        self.assertGreater(len(run['source_evidence']['bass']['spectrum']['peaks']), 1)

    def test_inaudible_bass_is_not_amplified_into_keyboard_evidence(self):
        from scipy.io import wavfile
        mix = self.wav('guitar.wav', [196,233.08,349.23,440])
        sr = 22050
        time = np.arange(sr*2)/sr
        quiet = str(self.root/'quiet-bass.wav')
        wavfile.write(quiet,sr,(np.sin(2*np.pi*82.41*time)*1e-7).astype(np.float32))
        run = study.analyze_range(mix, {'other':mix,'bass':quiet}, .2,1.2, {'known_key':'F','overtone_weighting':0})
        self.assertEqual(run['bass_reference']['origin'],'accompaniment')
        self.assertFalse(run['source_evidence']['bass']['used_for_notes'])
        self.assertFalse(any(pitch['midi']==40 for pitch in run['evidence']['detected_pitches']))
        voice = self.wav('voice.wav', [440])
        vocal_run = study.analyze_range(mix, {'vocals':voice,'bass':quiet}, .2,1.2, {'known_key':'F','overtone_weighting':0})
        self.assertIsNone(vocal_run['bass_reference'])
        self.assertFalse(vocal_run['source_evidence']['bass']['used_for_notes'])
        self.assertFalse(any(pitch['midi']==40 for pitch in vocal_run['evidence']['detected_pitches']))
    def test_saved_spectrum_labels_tone_peaks_and_handles_silence(self):
        sr = 22050
        time = np.arange(sr) / sr
        crop = np.sin(2 * np.pi * 130.8128 * time) + .5 * np.sin(2 * np.pi * 523.2511 * time)
        spectrum = study.spectrum_for_crop(crop, sr, np)
        self.assertEqual(len(spectrum['frequencies_hz']), len(spectrum['magnitudes_db']))
        self.assertLessEqual(len(spectrum['frequencies_hz']), 768)
        self.assertTrue(all(a < b for a, b in zip(spectrum['frequencies_hz'], spectrum['frequencies_hz'][1:])))
        self.assertEqual({peak['note'] for peak in spectrum['peaks']}, {'C3', 'C5'})
        self.assertAlmostEqual(max(peak['level_db'] for peak in spectrum['peaks']), 0, delta=.2)
        quieter = study.spectrum_for_crop(crop * .5, sr, np)
        self.assertAlmostEqual(quieter['reference_power'] / spectrum['reference_power'], .25)
        self.assertTrue(all(math.isfinite(value) and -80 <= value <= 0 for value in spectrum['magnitudes_db']))
        silent = study.spectrum_for_crop(np.zeros(sr), sr, np)
        self.assertEqual(silent['peaks'], [])
        self.assertTrue(all(value == -80 for value in silent['magnitudes_db']))

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.sr = 22050

    def wav(self, name, frequencies=(), seconds=2):
        t = np.arange(round(seconds * self.sr)) / self.sr
        audio = sum((0.15 * np.sin(2 * np.pi * f * t) for f in frequencies), np.zeros(len(t)))
        file = self.root / name
        write(file, self.sr, audio.astype(np.float32))
        return str(file)

    def test_rejects_invalid_ranges(self):
        self.assertEqual(study.validate_range(1, 1.05, 2), (1, 1.05))
        for start, end in [(-1, 1), (0, 3), (1, 1), (1, .5), (1, 1.049), (math.nan, 1), (0, math.inf)]:
            with self.subTest(start=start, end=end), self.assertRaises(ValueError):
                study.validate_range(start, end, 2)

    def test_extended_chord_strategy_is_shared_across_positions_roots_and_display_settings(self):
        from chordpilot_common import PITCH_NAMES
        cases = [(root, quality, intervals) for root in range(12)
                 for quality, intervals in [('7', [0, 4, 7, 10]), ('7#9', [0, 4, 7, 10, 15]), ('maj9', [0, 4, 7, 11, 14])]]
        block = np.arange(round(1.4 * self.sr)) / self.sr
        frequency = lambda midi: 440 * 2 ** ((midi - 69) / 12)
        other_audio = np.concatenate([sum(.12 * np.sin(2 * np.pi * frequency(60 + root + interval) * block)
                                           for interval in intervals) for root, _, intervals in cases])
        bass_audio = np.concatenate([.5 * np.sin(2 * np.pi * frequency(36 + root) * block)
                                     for root, _, _ in cases])
        other, bass = self.root / 'changing-harmony.wav', self.root / 'changing-bass.wav'
        write(other, self.sr, other_audio.astype(np.float32))
        write(bass, self.sr, bass_audio.astype(np.float32))
        for index, (root, quality, _) in enumerate(cases):
            start, end = index * 1.4 + .2, index * 1.4 + 1.2
            key = PITCH_NAMES[root if quality == 'maj9' else (root + 5) % 12]
            for simplify in (True, False):
                with self.subTest(root=PITCH_NAMES[root], quality=quality, start=start, simplify=simplify):
                    result = study.analyze_range(str(other), {'other': str(other), 'bass': str(bass)}, start, end,
                                                 {'song_key': key, 'simplify_chords': simplify})
                    self.assertEqual(result['chord'], PITCH_NAMES[root] + quality)
                    self.assertEqual(result['range'], [start, end])
                    self.assertTrue(result['evidence']['detected_pitches'])

    def test_silence_and_settings(self):
        audio = self.wav("silent.wav")
        result = study.analyze_range(audio, {"full_mix": audio}, .2, .8, {"song_key": "G", "known_key": "Am"})
        self.assertEqual(result["chord"], "N.C.")
        self.assertEqual(result["evidence"]["detected_notes"], [])
        self.assertEqual(result["chord_confidence"], 0)
        self.assertEqual(result["key_context"], {"key": "Am", "origin": "override"})
        self.assertEqual(result["range"], [.2, .8])
        self.assertEqual(result["evidence"]["detected_pitches"], [])

    def test_detected_pitches_distinguish_octaves_and_include_selected_bass(self):
        octaves = self.wav("octaves.wav", [130.8128, 523.2511])
        result = study.analyze_range(octaves, {"full_mix": octaves}, .2, 1.2)
        pitches = result["evidence"]["detected_pitches"]
        self.assertEqual({note["midi"] for note in pitches}, {48, 72})
        self.assertEqual({note["note"] for note in pitches}, {"C3", "C5"})
        for note in pitches:
            self.assertGreater(note["frequency_hz"], 0)
            self.assertGreater(note["strength"], 0)
        other = self.wav("other.wav", [261.6256, 329.6276, 391.9954])
        bass = self.wav("bass.wav", [82.4069])
        result = study.analyze_range(other, {"bass": bass, "other": other}, .2, 1.2)
        self.assertEqual({note["midi"] for note in result["evidence"]["detected_pitches"]}, {40, 60, 64, 67})
        self.assertEqual(result["source_evidence"]["bass"]["detected_pitches"][0]["note"], "E2")
        self.assertEqual(result['source_evidence']['bass']['spectrum']['peaks'][0]['note'], 'E2')
        self.assertTrue(result['source_evidence']['other']['spectrum']['peaks'])
        scoring = result['evidence']['scoring_pitch_classes']
        self.assertEqual(result['evidence']['scoring_source'], 'other')
        self.assertEqual([item['note'] for item in scoring], study.PITCH_NAMES)
        self.assertAlmostEqual(sum(item['accompaniment'] for item in scoring), 1, delta=.002)
        self.assertAlmostEqual(sum(item['scored'] for item in scoring), 1, delta=.002)
        weight = result['evidence']['scoring_bass_weight']
        self.assertGreater(weight, 0)
        self.assertLessEqual(weight, .3)
        for index, item in enumerate(scoring):
            expected = item['accompaniment'] * (1 - weight) + (weight if index == result['bass_reference']['pitch_class'] else 0)
            self.assertAlmostEqual(item['scored'], expected, delta=.0002)

    def test_pitch_detection_covers_keyboard_extremes_and_accidentals(self):
        audio = self.wav("keyboard.wav", [27.5, 277.1826, 4186.009])
        result = study.analyze_range(audio, {"full_mix": audio}, .2, 1.2)
        self.assertEqual({note["midi"] for note in result["evidence"]["detected_pitches"]}, {21, 61, 108})

    def test_outside_notes_do_not_change_evidence_or_crop_digest(self):
        audio = self.wav("song.wav", [261.63, 329.63, 392])
        before = study.analyze_range(audio, {"full_mix": audio}, .5, 1, {"known_key": "C"})
        t = np.arange(2 * self.sr) / self.sr
        data = sum((.15 * np.sin(2 * np.pi * f * t) for f in [261.63, 329.63, 392]), np.zeros(len(t)))
        data[:int(.5 * self.sr)] = .8 * np.sin(2 * np.pi * 739.99 * t[:int(.5 * self.sr)])
        data[self.sr:] = .8 * np.sin(2 * np.pi * 466.16 * t[self.sr:])
        write(audio, self.sr, data.astype(np.float32))
        after = study.analyze_range(audio, {"full_mix": audio}, .5, 1, {"known_key": "C"})
        self.assertEqual(before["evidence"], after["evidence"])
        self.assertEqual(before["input_fingerprints"]["full_mix"]["sample_sha256"], after["input_fingerprints"]["full_mix"]["sample_sha256"])
        candidates = [item["chord"] for item in after["alternatives"]]
        self.assertTrue(candidates[0].startswith("C"), candidates)

    def test_short_crop_uses_only_requested_samples(self):
        audio = self.wav("tail.wav")
        t = np.arange(2 * self.sr) / self.sr
        data = np.zeros(len(t), dtype=np.float32)
        data[int(.1 * self.sr):] = .5 * np.sin(2 * np.pi * 440 * t[int(.1 * self.sr):])
        write(audio, self.sr, data)
        result = study.analyze_range(audio, {"full_mix": audio}, .04, .09)
        self.assertEqual(result["chord"], "N.C.")
        self.assertEqual(result["evidence"]["detected_pitches"], [])

    def test_bass_other_roles_and_bass_only(self):
        mix = self.wav("mix.wav")
        other = self.wav("other.wav", [261.63, 329.63, 392])
        bass = self.wav("bass.wav", [82.41])
        result = study.analyze_range(mix, {"other": other, "bass": bass}, .2, 1.2, {"known_key": "C"})
        only_other = study.analyze_range(mix, {"other": other}, .2, 1.2, {"known_key": "C"})
        self.assertEqual(result["evidence"]["detected_notes"], only_other["evidence"]["detected_notes"])
        self.assertEqual(result["bass_reference"]["note"], "E")
        self.assertIn("/E", result["chord"])
        alone = study.analyze_range(mix, {"bass": bass}, .2, 1.2)
        self.assertTrue(alone["evidence"]["detected_notes"])

    def test_sources_fail_explicitly(self):
        mix = self.wav("mix.wav")
        short = self.wav("short.wav", seconds=.5)
        for paths in [{}, {"full_mix": mix, "other": mix}, {"unknown": mix}, {"other": short}, {"bass": str(self.root / "missing.wav")}]:
            with self.subTest(paths=paths), self.assertRaises((ValueError, FileNotFoundError)):
                study.analyze_range(mix, paths, .2, 1.2)

    def test_silent_stems_do_not_dilute_non_bass_evidence(self):
        mix = self.wav("mix.wav", [261.63, 329.63, 392])
        silent = self.wav("silent.wav")
        one = study.analyze_range(mix, {"other": mix}, .2, 1.2)
        two = study.analyze_range(mix, {"other": mix, "vocals": silent}, .2, 1.2)
        self.assertEqual(one["evidence"]["detected_notes"], two["evidence"]["detected_notes"])

    def test_cli_real_signal_and_error_json(self):
        mix = self.wav("mix.wav", [261.63, 329.63, 392])
        command = [sys.executable, str(Path(study.__file__).with_name("chordpilot.py")), "analyze-range", mix, "--sources", json.dumps({"full_mix": mix}), "--start", ".2", "--end", "1.2"]
        result = subprocess.run(command, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertTrue(json.loads(result.stdout)["chord"].startswith("C"))
        result = subprocess.run(command[:-1] + [".1"], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(json.loads(result.stdout)["ok"])


if __name__ == "__main__":
    unittest.main()
