"""Algorithmic checks, not musical accuracy claims."""
import importlib.util
from pathlib import Path
import unittest
import numpy as np

PATH = Path(__file__).resolve().parents[2] / 'scripts/testing/structure-representation-recurrence.py'
spec = importlib.util.spec_from_file_location('recurrence', PATH)
recurrence = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recurrence)


class RepresentationRecurrenceTest(unittest.TestCase):
    def test_fractional_overlap_and_tail_coverage(self):
        values = np.array([[1., 0.], [0., 1.], [1., 1.]])
        rows = [{'start': .25, 'end': 2.5}, {'start': 2.5, 'end': 3.1}]
        bins, coverage = recurrence.pool(values, rows, fps=1, bins=1)
        np.testing.assert_allclose(bins[0, 0], [1.25 / 2.25, 1.5 / 2.25])
        np.testing.assert_allclose(bins[1, 0], [1., 1.])
        np.testing.assert_allclose(coverage, [1., .5 / .6])
        for bad in [[{'start': 3., 'end': 4.}], [{'start': -1., 'end': 2.}],
                    [{'start': 2., 'end': 1.}]]:
            with self.assertRaises(ValueError):
                recurrence.pool(values, bad, fps=1)

    def test_order_matters_and_zero_vectors_are_not_matches(self):
        pattern = np.eye(4)
        desc = np.stack([pattern, pattern, pattern[::-1], np.zeros_like(pattern)])
        d = recurrence.distances(desc, np.ones(4))
        self.assertAlmostEqual(d[0, 1], 0)
        self.assertAlmostEqual(d[0, 2], 1)
        self.assertAlmostEqual(d[0, 3], 1)
        np.testing.assert_allclose(d, d.T)
        np.testing.assert_array_equal(np.diag(d), 0)
        self.assertAlmostEqual(recurrence.distances(desc[:2], [1, 2])[0, 1], .1*np.log(2))

    def test_center_removes_constant_offset_with_partial_last_frame(self):
        values = np.array([[1., 2.], [3., 1.], [9., 4.]])
        centered = recurrence.center(values, fps=1, duration=2.25)
        np.testing.assert_allclose(centered[0], values[0] - (values[0]+values[1]+.25*values[2])/2.25)
        np.testing.assert_allclose(centered, recurrence.center(values + 7, fps=1, duration=2.25))
        np.testing.assert_array_equal(values, [[1, 2], [3, 1], [9, 4]])

    def test_ties_hierarchy_and_singleton(self):
        d = np.array([[0., .1, .1], [.1, 0., .8], [.1, .8, 0.]])
        result = recurrence.summarize(d)
        self.assertEqual(result['nearest'], [[1, 2], [0], [0]])
        self.assertEqual(result['reciprocal_pairs'], [[0, 1], [0, 2]])
        self.assertAlmostEqual(result['linkage'][-1][2], .8)
        self.assertEqual(recurrence.summarize(np.zeros((1, 1)))['nearest'], [[]])
        self.assertEqual(recurrence.summarize(np.zeros((1, 1)))['linkage'], [])

    def test_invalid_inputs_rejected(self):
        for bad in [np.array([[0., np.nan], [np.nan, 0.]]), np.array([[0., 1.], [2., 0.]]),
                    np.array([[0., -1.], [-1., 0.]])]:
            with self.assertRaises(ValueError):
                recurrence.summarize(bad)
        with self.assertRaises(ValueError):
            recurrence.distances(np.ones((2, 4, 3)), [1, 0])
        with self.assertRaises(ValueError):
            recurrence.pool(np.full((2, 3), np.nan), [{'start': 0, 'end': 1}])


if __name__ == '__main__':
    unittest.main()
