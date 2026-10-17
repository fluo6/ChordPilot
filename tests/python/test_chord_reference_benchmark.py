import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('chord_reference_benchmark',
    Path(__file__).absolute().parents[2] / 'scripts/testing/chord-reference-benchmark.py')
benchmark = importlib.util.module_from_spec(spec)
spec.loader.exec_module(benchmark)


class ChordReferenceBenchmarkTests(unittest.TestCase):
    def test_confidence_audit_separates_high_scored_errors_from_correct_roots(self):
        rows = [
            {'chord_confidence': .92, 'root_agreement': False, 'function_agreement': False, 'exact_agreement': False},
            {'chord_confidence': .82, 'root_agreement': True, 'function_agreement': True, 'exact_agreement': False},
            {'chord_confidence': .4, 'root_agreement': True, 'function_agreement': False, 'exact_agreement': False},
        ]
        bands = benchmark.confidence_audit(rows)
        self.assertEqual([band['count'] for band in bands], [1, 0, 1, 1])
        self.assertEqual(bands[-1]['wrong_roots'], 1)
        self.assertEqual(bands[-2]['correct_functions'], 1)

    def test_exact_comparison_distinguishes_extensions_alterations_and_bass(self):
        self.assertTrue(benchmark.exact_agreement('C69/E', 'C6/9/E'))
        self.assertTrue(benchmark.exact_agreement('C7+5', 'C7#5'))
        for expected, actual in [('C6/9','C6'), ('C7#5','C7b13'), ('C6/9/E','C6/9'), ('Cdim7','Cdim')]:
            self.assertFalse(benchmark.exact_agreement(expected, actual))

    def test_one_detected_change_cannot_satisfy_two_reference_boundaries(self):
        targets = [
            {'time': .4, 'from_root': 0, 'to_root': 7},
            {'time': .8, 'from_root': 7, 'to_root': 0},
            {'time': 1.2, 'from_root': 0, 'to_root': 7},
        ]
        detected = [{'time': .8, 'from_root': 0, 'to_root': 7}]
        result = benchmark.match_boundaries(targets, detected, .5)
        self.assertEqual(sum(row['detected_time'] is not None for row in result), 1)
        self.assertIsNone(result[1]['detected_time'])
        self.assertIsNone(result[2]['detected_time'])

    def test_extensions_keep_the_same_function_but_sevenths_and_roots_matter(self):
        self.assertEqual(benchmark.agreement('C7', 'C13'), (True, True))
        self.assertEqual(benchmark.agreement('C7', 'Cmaj9'), (True, False))
        self.assertEqual(benchmark.agreement('C7', 'C9sus4'), (True, False))
        self.assertEqual(benchmark.agreement('F/A', 'Fadd9/A'), (True, True))
        self.assertEqual(benchmark.agreement('C7', 'Am7/C'), (False, False))
