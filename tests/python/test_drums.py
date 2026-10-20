import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np

sys.path.insert(0, str(Path(__file__).absolute().parents[2] / 'backend'))
import chordpilot_drums as drums


class DrumTests(unittest.TestCase):
    def test_simultaneous_hits_keep_classes_and_raw_times(self):
        activations = np.zeros((1, 100, 5))
        activations[0, 12, 0] = .9
        activations[0, 12, 3] = .8
        events = drums.events_from_peaks({35: [.12], 42: [.12], 38: [float('nan'), 1.2]}, activations, 1)
        self.assertEqual([(e['time'], e['instrument']) for e in events], [(.12, 'kick'), (.12, 'hihat')])
        self.assertEqual(events[0]['score'], .9)

    def test_cached_events_skip_model_and_changed_stem_invalidates(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {'CHORDPILOT_CACHE_DIR': directory}):
            stem = Path(directory) / 'drums.wav'
            stem.write_bytes(b'first')
            weights = Path(directory) / 'weights.pth'
            weights.write_bytes(b'weights')
            with patch.object(drums, 'model_weights', return_value=weights), patch.object(drums, 'infer_events', return_value=(2., [{'time': .25, 'instrument': 'snare', 'score': .8}])) as infer:
                first = drums.analyze_drums(str(stem))
                second = drums.analyze_drums(str(stem))
                self.assertFalse(first['cached'])
                self.assertTrue(second['cached'])
                self.assertEqual(infer.call_count, 1)
                stem.write_bytes(b'changed stem')
                self.assertFalse(drums.analyze_drums(str(stem))['cached'])
                self.assertEqual(infer.call_count, 2)
                self.assertFalse(drums.analyze_drums(str(stem), force=True)['cached'])
                self.assertEqual(infer.call_count, 3)

    def test_missing_weights_fail_instead_of_using_random_model(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {'CHORDPILOT_DRUM_WEIGHTS': str(Path(directory) / 'missing.pth')}):
            with self.assertRaisesRegex(RuntimeError, 'weights'):
                drums.model_weights()

    def test_silence_returns_no_hits_without_loading_network(self):
        with patch('chordpilot_drums.load_audio', return_value=(np.zeros(44100), 44100)):
            duration, events = drums.infer_events(Path('silent.wav'), Path('unused.pth'))
        self.assertEqual(duration, 1)
        self.assertEqual(events, [])


if __name__ == '__main__':
    unittest.main()
