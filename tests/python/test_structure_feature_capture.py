"""Capture must preserve representation values and reject misleading metadata."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
import numpy as np

PATH = Path(__file__).resolve().parents[2] / 'scripts/testing/structure-feature-capture.py'
spec = importlib.util.spec_from_file_location('feature_capture', PATH)
capture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(capture)


class CaptureTest(unittest.TestCase):
    def test_logits_allow_identical_negative_infinity_masks(self):
        old = np.array([[1, -np.inf, 3]], dtype=np.float32)
        result = capture.compare_logits(old.copy(), old)
        self.assertTrue(result['bit_identical'])
        self.assertTrue(result['within_float_tolerance'])
        self.assertEqual(result['max_absolute_difference'], 0)
        changed = old.copy()
        changed[0, 0] += 1
        self.assertFalse(capture.compare_logits(changed, old)['within_float_tolerance'])
        for bad in [np.array([[1, 0, 3]]), np.array([[1, -np.inf, np.nan]]),
                    np.array([[1, -np.inf, np.inf]]), old[0]]:
            with self.assertRaises(ValueError):
                capture.compare_logits(bad, old)

    def test_roundtrip_preserves_all_four_streams_and_input(self):
        values = np.arange(2 * 4096, dtype=np.float32).reshape(1, 2, 4096)
        before = values.copy()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'capture.npz'
            result = capture.save_features(path, values, .09, 0)
            with np.load(path) as saved:
                np.testing.assert_array_equal(saved['embeddings'], values[0])
                for i, stream in enumerate(result['streams']):
                    self.assertEqual(stream['columns'], [i * 1024, (i + 1) * 1024])
            self.assertEqual(result['uncovered_seconds'], .09 - .08)
            self.assertEqual(result['fps'], 25)
            np.testing.assert_array_equal(values, before)

    def test_invalid_values_shapes_dtype_or_coverage_leave_no_file(self):
        good = np.ones((1, 2, 4096), dtype=np.float32)
        invalid = [good.astype(np.float16), good[0], good[:, :, :4095],
                   np.full_like(good, np.nan), good[:, :0], np.zeros_like(good)]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'invalid.npz'
            for values in invalid:
                with self.subTest(shape=values.shape, dtype=values.dtype):
                    with self.assertRaises(ValueError):
                        capture.save_features(path, values, .09, 0)
                    self.assertFalse(path.exists())
            for duration, start in [(1, 0), (.01, 0), (.09, -1), (float('nan'), 0)]:
                with self.assertRaises(ValueError):
                    capture.save_features(path, good, duration, start)
                self.assertFalse(path.exists())


if __name__ == '__main__':
    unittest.main()
