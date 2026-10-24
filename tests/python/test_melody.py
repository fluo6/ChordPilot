import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'backend'))
import chordpilot_melody as melody


class MelodyTests(unittest.TestCase):
    def test_ordinary_cli_import_keeps_melody_and_torch_lazy(self):
        result = subprocess.run([sys.executable, '-c',
            "import sys; import chordpilot_cli; assert 'chordpilot_melody' not in sys.modules; assert 'torch' not in sys.modules"],
            cwd=Path(melody.__file__).parent, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_regions_keep_original_pitch_and_repeated_attacks(self):
        regions = melody.decode_regions([.5, .5, .5, .5], [True, True, False, True], [60.2, 60.1, 0, 72.4], 2)
        notes = []
        melody.append_core(notes, regions, 0, 2)
        self.assertEqual([n['midi'] for n in notes], [60, 60, 72])
        self.assertEqual(notes[0]['pitch_midi'], 60.2)
        self.assertEqual(notes[1]['start'], .5)
        self.assertFalse(regions[2]['voiced'])

    def test_invalid_predictions_fail_instead_of_clamping_or_truncating(self):
        for pitch in [float('nan'), 140]:
            with self.assertRaises(ValueError):
                melody.decode_regions([1], [True], [pitch], 1)
        with self.assertRaisesRegex(ValueError, 'cover'):
            melody.decode_regions([.1], [True], [60], 1)
        with self.assertRaises(ValueError):
            melody.decode_regions([1], [], [60], 1)

    def test_context_joins_a_sustain_but_not_a_reattack(self):
        notes = []
        melody.append_core(notes, [{'start': 0, 'end': 3, 'voiced': True, 'midi': 60, 'pitch_midi': 60., 'source_index': 0}], 0, 2)
        melody.append_core(notes, [{'start': 1, 'end': 3, 'voiced': True, 'midi': 60, 'pitch_midi': 60., 'source_index': 1},
                                   {'start': 3, 'end': 4, 'voiced': True, 'midi': 60, 'pitch_midi': 60., 'source_index': 2}], 2, 4)
        self.assertEqual([(n['start'], n['end']) for n in notes], [(0, 3), (3, 4)])
        self.assertEqual(notes[0]['source_indices'], [0, 1])

    def test_missing_install_has_actionable_error(self):
        with patch.dict(os.environ, {'CHORDPILOT_MELODY_SOURCE': 'missing-model-source', 'CHORDPILOT_MELODY_WEIGHTS': 'missing-model.pt'}):
            with self.assertRaisesRegex(RuntimeError, 'docs/melody-analysis.md'):
                melody.model_files()

    def test_cache_is_source_model_and_language_specific(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {'CHORDPILOT_CACHE_DIR': directory}):
            stem = Path(directory) / 'vocals.wav'; stem.write_bytes(b'voice')
            weights = Path(directory) / 'model.pt'; weights.write_bytes(b'model')
            config = Path(directory) / 'config.yaml'; config.write_text('model: test')
            source = Path(directory) / 'source'; source.mkdir(); (source / 'inference.py').write_text('test')
            prediction = (1., [{'start': 0., 'end': 1., 'voiced': True, 'midi': 60, 'pitch_midi': 60.}],
                          [{'start': 0., 'end': 1., 'midi': 60, 'pitch_midi': 60., 'source_indices': [0]}])
            with patch.object(melody, 'model_files', return_value=(source, weights)), patch.object(melody, 'infer_events', return_value=prediction) as infer:
                first = melody.analyze_melody(str(stem), language='en')
                self.assertFalse(first['cached'])
                self.assertTrue(melody.analyze_melody(str(stem), language='en')['cached'])
                self.assertEqual(infer.call_count, 1)
                saved = Path(directory) / 'melody' / f"{first['fingerprint']}.json"
                saved.write_text('{broken')
                self.assertFalse(melody.analyze_melody(str(stem), language='en')['cached'])
                self.assertEqual(infer.call_count, 2)
                with patch.object(melody, 'infer_events', return_value=(1., [], [{'start': 0, 'end': 1, 'midi': 200}])):
                    with self.assertRaises(ValueError):
                        melody.analyze_melody(str(stem), True, 'en')
                self.assertEqual(json.loads(saved.read_text())['events'][0]['midi'], 60)
                melody.analyze_melody(str(stem), language='zh'); self.assertEqual(infer.call_count, 3)
                stem.write_bytes(b'new vocals')
                melody.analyze_melody(str(stem), language='en'); self.assertEqual(infer.call_count, 4)
                melody.analyze_melody(str(stem), True, 'en'); self.assertEqual(infer.call_count, 5)
                self.assertEqual(first['events'][0]['midi'], 60)

    def test_silence_does_not_initialize_the_model(self):
        import numpy as np
        with patch.object(melody, 'load_audio', return_value=(np.zeros(44100), 44100)):
            duration, regions, events = melody.infer_events(Path('silent.wav'), Path('missing-source'), Path('missing-weights'), 'auto')
        self.assertEqual(duration, 1)
        self.assertEqual(events, [])
        self.assertEqual(regions, [])


if __name__ == '__main__':
    unittest.main()
