"""Synthetic behavior checks: no song labels or reference timestamps."""
import copy
import importlib.util
from pathlib import Path
import unittest
import numpy as np

PATH = Path(__file__).resolve().parents[2] / 'scripts/testing/structure-native-recurrence.py'
spec = importlib.util.spec_from_file_location('native_recurrence', PATH)
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)


class NativeRecurrenceTest(unittest.TestCase):
    def inputs(self):
        rows = [{'start': i*10., 'end': (i+1)*10., 'label': label}
                for i, label in enumerate(['verse', 'chorus', 'chorus'])]
        p = np.zeros((3, 27))
        p[0, [1, 2, 3]] = [.75, .15, .10]
        p[1, [1, 2, 3]] = [.25, .45, .30]
        p[2, [1, 2, 3]] = [.03, .95, .02]
        d = np.array([[0, .2, .8], [.2, 0, .9], [.8, .9, 0.]])
        return rows, p, {str(i): d.copy() for i in range(8)}

    def test_uncertain_role_assisted_without_merging_or_mutating(self):
        rows, p, views = self.inputs()
        before = copy.deepcopy(rows)
        result = native.refine(rows, p, views)
        self.assertEqual([r['role'] for r in result], ['verse', 'verse', 'chorus'])
        self.assertEqual([(r['start'], r['end']) for r in result], [(r['start'], r['end']) for r in rows])
        self.assertEqual(result[1]['decision']['basis'], 'reciprocal_audio_consensus')
        self.assertEqual(result[1]['decision']['donor_index'], 0)
        self.assertEqual(result[1]['native_label'], 'chorus')
        self.assertEqual(rows, before)
        np.testing.assert_array_equal(p, self.inputs()[1])

    def test_strong_target_and_ambiguous_donor_preserved(self):
        rows, p, views = self.inputs()
        p[1] = 0; p[1, [1, 2]] = [.1, .9]
        self.assertEqual(native.refine(rows, p, views)[1]['role'], 'chorus')
        rows, p, views = self.inputs()
        p[0] = p[1]
        self.assertEqual(native.refine(rows, p, views)[1]['role'], 'chorus')

    def test_view_disagreement_ties_and_nonreciprocity_preserve_native(self):
        for matrix in [np.array([[0,.2,.1],[.2,0,.3],[.1,.3,0]]),
                       np.array([[0,.2,.2],[.2,0,.2],[.2,.2,0]])]:
            rows, p, views = self.inputs()
            views['7'] = matrix
            self.assertEqual(native.refine(rows, p, views)[1]['role'], 'chorus')

    def test_nonvocal_roles_and_silence_are_not_relabelled(self):
        rows, p, views = self.inputs()
        rows[0]['label'] = 'inst'
        self.assertEqual(native.refine(rows, p, views)[1]['role'], 'chorus')
        rows[1]['label'] = 'silence'
        result = native.refine(rows, p, views)
        self.assertIsNone(result[1]['role'])
        self.assertEqual(result[1]['native_label'], 'silence')
        self.assertEqual(len(result), 3)

    def test_native_decoder_winner_disagreement_prevents_donor(self):
        rows, p, views = self.inputs()
        rows[0]['label'] = 'pre-chorus'
        self.assertEqual(native.refine(rows, p, views)[1]['role'], 'chorus')

    def test_no_cascade_and_permutation_equivariance(self):
        rows, p, views = self.inputs()
        result = native.refine(rows, p, views)
        order = [1, 0, 2]
        permuted = native.refine([rows[i] for i in order], p[order],
                                {k: d[np.ix_(order, order)] for k,d in views.items()})
        self.assertEqual([r['role'] for r in permuted], [result[i]['role'] for i in order])
        self.assertEqual(permuted[0]['decision']['donor_index'], 1)

    def test_bad_inputs_fail_closed(self):
        rows, p, views = self.inputs()
        for bad in [p[:2], p*np.nan, p*2, -p]:
            with self.assertRaises(ValueError): native.refine(rows, bad, views)
        with self.assertRaises(ValueError): native.refine(rows, p, {})
        with self.assertRaises(ValueError): native.refine(rows, p, {'one': views['0']})
        views['7'][0,1] = -1
        with self.assertRaises(ValueError): native.refine(rows, p, views)

    def test_changed_winner_without_improved_margin_is_audited_not_applied(self):
        rows, p, views = self.inputs()
        p[0] = 0; p[0, [1, 2, 3]] = [.7, .1, .2]
        p[1] = 0; p[1, [1, 2, 3]] = [.2, .49, .31]
        result = native.refine(rows, p, views)
        self.assertEqual(result[1]['role'], 'chorus')
        self.assertEqual(result[1]['decision']['proposed_label'], 'verse')
        self.assertEqual(result[1]['decision']['proposal_status'], 'withheld_margin_not_improved')
        self.assertEqual(result[1]['decision']['donor_index'], 0)

    def test_singleton_and_adjacent_equal_roles_keep_occurrences(self):
        rows, p, views = self.inputs()
        rows[1]['label'] = 'verse'
        result = native.refine(rows, p, views)
        self.assertEqual(len(result), 3)
        self.assertEqual([r['role'] for r in result[:2]], ['verse', 'verse'])
        result = native.refine(rows[:1], p[:1], {k: d[:1,:1] for k,d in views.items()})
        self.assertEqual(result[0]['role'], 'verse')


if __name__ == '__main__': unittest.main()
