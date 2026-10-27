import importlib.util
import unittest
from pathlib import Path

path = Path(__file__).resolve().parents[2] / 'scripts/testing/structure-benchmark.py'
benchmark = None
if path.exists():
    spec = importlib.util.spec_from_file_location('structure_benchmark',path)
    benchmark = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(benchmark)


class StructureBenchmarkTests(unittest.TestCase):
    def test_native_pre_chorus_label_keeps_its_distinct_role(self):
        reference={'duration':10,'segments':[{'start':0,'end':10,'role':'pre_chorus'}]}
        prediction={'duration':10,'segments':[{'start':0,'end':10,'label':'pre-chorus'}]}
        self.assertEqual(benchmark.evaluate(reference,prediction)['roles']['duration_accuracy'],1.)

    def test_wrong_roles_cannot_pass_with_perfect_boundaries(self):
        reference={'duration':10,'segments':[{'start':0,'end':4,'role':'intro'},{'start':4,'end':10,'role':'verse'}]}
        prediction={'duration':10,'segments':[{'start':0,'end':4,'role':'verse'},{'start':4,'end':10,'role':'chorus'}]}
        result=benchmark.evaluate(reference,prediction)
        self.assertEqual(result['boundaries']['0.5']['f1'],1.)
        self.assertEqual(result.get('roles',{}).get('duration_accuracy'),0.)

    def test_abstaining_roles_reports_coverage_without_inflating_accuracy(self):
        reference={'duration':10,'segments':[{'start':0,'end':4,'role':'intro'},{'start':4,'end':10,'role':'verse'}]}
        prediction={'duration':10,'segments':[{'start':0,'end':4,'role':'intro'},{'start':4,'end':10,'group':'A','role':None}]}
        roles=benchmark.evaluate(reference,prediction).get('roles',{})
        self.assertEqual(roles.get('duration_accuracy'),.4)
        self.assertEqual(roles.get('coverage'),.4)
        self.assertEqual(roles.get('covered_accuracy'),1.)

    def test_recording_hash_mismatch_is_rejected(self):
        reference={'source_hash':'one','duration':10,'segments':[{'start':0,'end':10,'role':'verse'}]}
        prediction={**reference,'source_hash':'two'}
        with self.assertRaisesRegex(ValueError,'Recording content hashes'):
            benchmark.evaluate(reference,prediction)

    def test_boundary_matching_is_one_to_one_and_excludes_song_endpoints(self):
        self.assertIsNotNone(benchmark,'structure evaluator is missing')
        result=benchmark.boundary_metrics([0,5,10],[0,4.7,5.1,10],.5)
        self.assertEqual(result['precision'],.5)
        self.assertEqual(result['recall'],1.)
        self.assertAlmostEqual(result['f1'],2/3)

    def test_group_metric_is_invariant_to_letters_and_reports_one_group_baseline(self):
        self.assertIsNotNone(benchmark,'structure evaluator is missing')
        reference=[{'start':0,'end':3,'group':'A'},{'start':3,'end':6,'group':'B'},{'start':6,'end':9,'group':'A'}]
        prediction=[{**row,'group':{'A':'Z','B':'Y'}[row['group']]} for row in reference]
        self.assertEqual(benchmark.group_metrics(reference,prediction)['f1'],1.)
        result=benchmark.group_metrics(reference,[{'start':0,'end':9,'group':'X'}])
        self.assertAlmostEqual(result['f1'],5/7)

    def test_evaluator_rejects_gaps_and_mismatched_recording_durations(self):
        self.assertIsNotNone(benchmark,'structure evaluator is missing')
        reference={'duration':10,'segments':[{'start':0,'end':10,'group':'A'}]}
        for prediction in ({'duration':11,'segments':[{'start':0,'end':11,'group':'A'}]},
                           {'duration':10,'segments':[{'start':1,'end':10,'group':'A'}]}):
            with self.assertRaises(ValueError):benchmark.evaluate(reference,prediction)

    def test_legacy_template_is_evaluation_only_and_uses_the_same_bar_grid(self):
        reference={'duration':12,'segments':[{'start':0,'end':4,'group':'A'},{'start':4,'end':12,'group':'B'}]}
        prediction={**reference,'bars':[{'start':i} for i in range(12)]}
        result=benchmark.evaluate(reference,prediction)
        self.assertEqual(result.get('legacy_template_boundaries',{}).get('0.5',{}).get('f1'),1.)
