"""Synthetic counterexamples for the experimental occurrence merge."""
import copy
import importlib.util
from pathlib import Path
import unittest

PATH = Path(__file__).resolve().parents[2] / 'scripts/testing/structure-occurrence-merge.py'


def row(i, group='A', role='verse'):
    return {'start':float(i), 'end':float(i+1), 'group':group, 'role':role,
            'native_label':role, 'model_probability':.95,
            'role_evidence':[{'start':float(i), 'end':float(i+1), 'score':.95}]}


class OccurrenceMergeTests(unittest.TestCase):
    def merge(self, rows, scores):
        self.assertTrue(PATH.exists(), 'Occurrence merge helper is not implemented')
        spec = importlib.util.spec_from_file_location('occurrence_merge', PATH)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module.merge_occurrences(rows, scores)

    def test_weak_self_repeat_is_one_occurrence_with_all_evidence(self):
        rows = [row(0), row(1), row(2)]
        original = copy.deepcopy(rows)
        merged = self.merge(rows, [.9, .01, .03])
        self.assertEqual([(r['start'], r['end']) for r in merged], [(0,3)])
        self.assertEqual(len(merged[0]['role_evidence']), 3)
        self.assertEqual(rows, original)

    def test_strong_boundary_preserves_same_role_repeat(self):
        self.assertEqual(len(self.merge([row(0),row(1)], [.1,.9])), 2)

    def test_content_return_after_contrast_preserves_anchor(self):
        merged = self.merge([row(0,'A'),row(1,'B'),row(2,'A')],[.1,.01,.01])
        self.assertEqual([(r['start'],r['end']) for r in merged], [(0,2),(2,3)])

    def test_shared_harmony_does_not_merge_different_roles(self):
        self.assertEqual(len(self.merge([row(0),row(1,role='chorus')],[.1,.01])),2)

    def test_unknowns_are_not_promoted_or_merged(self):
        self.assertEqual(len(self.merge([row(0,role=None),row(1,role=None)],[.1,.01])),2)

    def test_threshold_boundary_is_preserved(self):
        self.assertEqual(len(self.merge([row(0),row(1)],[.1,.5])),2)

    def test_invalid_boundary_scores_rejected(self):
        for scores in ([.1], [.1,float('nan')], [.1,1.1]):
            with self.assertRaises(ValueError):
                self.merge([row(0),row(1)],scores)


if __name__ == '__main__':
    unittest.main()
