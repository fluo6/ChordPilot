"""Synthetic acoustic/role tests, not musical ground truth."""
import copy
import importlib.util
from pathlib import Path
import unittest
import numpy as np

PATH = Path(__file__).resolve().parents[2] / 'scripts/testing/structure-contextual-roles.py'
spec = importlib.util.spec_from_file_location('contextual', PATH)
contextual = importlib.util.module_from_spec(spec)
spec.loader.exec_module(contextual)


class ContextualRolesTest(unittest.TestCase):
    def context_case(self):
        rows = [{'start':i*10., 'end':(i+1)*10., 'label':label}
                for i,label in enumerate(['pre-chorus','chorus','verse','verse','chorus','outro'])]
        p = np.zeros((6,27))
        p[0,[26,1,3]] = [.7,.2,.1]
        p[1,[2,1]] = [.95,.05];p[4] = p[1]
        p[2,[1,2]] = [.9,.1];p[5,[5,1]] = [.9,.1]
        p[3,[1,26,3]] = [.4,.3,.3]
        views = {}
        for k in range(8):
            d = np.ones((6,6));np.fill_diagonal(d,0)
            d[0,3]=d[3,0]=.6;d[1,4]=d[4,1]=.05
            other=2 if k<4 else 5
            d[3,other]=d[other,3]=.4
            views[str(k)]=d
        return rows,p,views

    def direct_case(self):
        rows=[{'start':0.,'end':10.,'label':'verse'}, {'start':10.,'end':20.,'label':'chorus'}]
        p=np.zeros((2,27));p[0,[1,2,3]]=[.7,.1,.2];p[1,[1,2,3]]=[.2,.49,.31]
        return rows,p,{str(k):np.array([[0.,.1],[.1,0.]]) for k in range(8)}

    def test_context_resolves_without_direct_agreement_and_keeps_occurrences(self):
        rows,p,views=self.context_case();before=copy.deepcopy(rows)
        result=contextual.refine(rows,p,views)
        self.assertEqual(result[3]['role'],'pre_chorus')
        self.assertEqual(result[3]['decision']['basis'],'successor_context')
        self.assertEqual(result[3]['decision']['donor_index'],0)
        self.assertEqual([(r['start'],r['end']) for r in result],[(r['start'],r['end']) for r in rows])
        self.assertEqual(rows,before);np.testing.assert_array_equal(p,self.context_case()[1])

    def test_direct_recurrence_can_change_class_without_increasing_old_margin(self):
        rows,p,views=self.direct_case();result=contextual.refine(rows,p,views)
        self.assertEqual(result[1]['role'],'verse')
        self.assertEqual(result[1]['decision']['basis'],'direct_recurrence')
        self.assertLess(result[1]['decision']['pooled_margin'],result[1]['decision']['native_margin'])

    def test_uncertain_or_conflicting_successor_cannot_anchor(self):
        for replacement in [(.6,2),(.95,1)]:
            rows,p,views=self.context_case();p[4]=0;p[4,replacement[1]]=replacement[0];p[4,3]=1-replacement[0]
            self.assertEqual(contextual.refine(rows,p,views)[3]['label'],'verse')

    def test_neighbor_disagreement_and_ties_block_context(self):
        rows,p,views=self.context_case();views['7']=np.ones((6,6));np.fill_diagonal(views['7'],0)
        self.assertEqual(contextual.refine(rows,p,views)[3]['label'],'verse')

    def test_context_needs_repeated_successor_not_only_same_role(self):
        rows,p,views=self.context_case()
        for d in views.values():d[1,2]=d[2,1]=.01
        self.assertEqual(contextual.refine(rows,p,views)[3]['label'],'verse')

    def test_strong_target_nonvocal_donor_and_native_disagreement_preserved(self):
        rows,p,views=self.direct_case();p[1]=0;p[1,[2,1]]=[.9,.1]
        self.assertEqual(contextual.refine(rows,p,views)[1]['label'],'chorus')
        for label in ['inst','pre-chorus']:
            rows,p,views=self.direct_case();rows[0]['label']=label
            self.assertEqual(contextual.refine(rows,p,views)[1]['label'],'chorus')

    def test_route_conflict_does_not_prefer_context_to_force_a_change(self):
        rows,p,views=self.context_case()
        for k in range(8):
            views[str(k)][3,5]=views[str(k)][5,3]=1
            views[str(k)][3,2]=views[str(k)][2,3]=.4
        result=contextual.refine(rows,p,views)
        self.assertEqual(result[3]['label'],'verse')
        self.assertEqual(result[3]['decision']['proposal_status'],'withheld_route_conflict')

    def test_swapped_order_counterexample_blocks_context(self):
        rows,p,views=self.context_case()
        views['7'][3,1]=views['7'][1,3]=.2
        views['7'][4,0]=views['7'][0,4]=.2
        self.assertEqual(contextual.refine(rows,p,views)[3]['label'],'verse')

    def test_context_never_uses_overlapping_or_wrapped_windows(self):
        self.assertEqual(contextual._nearest(np.zeros((2,2)),windows=True),[None,None])
        self.assertIsNone(contextual._reciprocal([[None,None]],2))

    def test_no_cascade_from_uncertain_donors(self):
        rows,p,views=self.direct_case();p[0]=p[1]
        self.assertEqual([r['label'] for r in contextual.refine(rows,p,views)],['verse','chorus'])

    def test_tied_pooled_winner_is_not_chosen_by_class_id(self):
        rows,p,views=self.direct_case();p[0]=0;p[0,[1,2,3]]=[.51,.29,.2];p[1]=0;p[1,[1,2,3]]=[.23,.45,.32]
        self.assertEqual(contextual.refine(rows,p,views)[1]['label'],'chorus')

    def test_singleton_and_silence_preserve_raw(self):
        rows,p,views=self.direct_case();rows[0]['label']='silence'
        result=contextual.refine(rows[:1],p[:1],{k:d[:1,:1] for k,d in views.items()})
        self.assertIsNone(result[0]['role']);self.assertEqual(result[0]['native_label'],'silence')

    def test_invalid_shapes_order_and_values_rejected(self):
        rows,p,views=self.context_case()
        for bad in [p[:2],p*2,p*np.nan,-p]:
            with self.assertRaises(ValueError):contextual.refine(rows,bad,views)
        with self.assertRaises(ValueError):contextual.refine(rows,p,{'one':views['0']})
        with self.assertRaises(ValueError):contextual.refine(rows[::-1],p,views)
        views['0'][1,2]=-1
        with self.assertRaises(ValueError):contextual.refine(rows,p,views)


if __name__=='__main__':unittest.main()
