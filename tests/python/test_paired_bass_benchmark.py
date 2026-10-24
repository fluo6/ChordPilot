import importlib.util
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location('paired_bass_benchmark',Path(__file__).resolve().parents[2]/'scripts/testing/paired-bass-benchmark.py')
benchmark=importlib.util.module_from_spec(spec)
spec.loader.exec_module(benchmark)


class PairedBassBenchmarkTests(unittest.TestCase):
    def test_nearest_pair_must_not_prevent_two_valid_attack_matches(self):
        ref={'bass_events':[{'time':1,'midi':40,'kind':'repeat'},{'time':1.25,'midi':40,'kind':'repeat'}],
             'bass_windows':[[0,2]],'ghost_events':[],'bass_silence':[]}
        result=benchmark.bass_metrics(ref,[{'start':.85,'end':1,'midi':40},{'start':1.1,'end':1.3,'midi':40}])
        self.assertEqual(result['matched'],2)

    def test_one_sustained_detection_cannot_satisfy_repeated_attacks(self):
        ref={'bass_events':[{'time':0,'midi':40,'kind':'repeat'},{'time':.3,'midi':40,'kind':'repeat'}],
             'bass_windows':[[0,1]],'ghost_events':[],'bass_silence':[]}
        result=benchmark.bass_metrics(ref,[{'start':.1,'end':.8,'midi':40}],.2)
        self.assertEqual(result['matched'],1)
        self.assertEqual(result['missed'],1)

    def test_unmatched_octave_alias_and_intro_noise_are_reported_separately(self):
        ref={'bass_events':[{'time':2,'midi':40,'kind':'groove'}],'bass_windows':[[2,3]],
             'ghost_events':[],'bass_silence':[{'start':0,'end':1}]}
        result=benchmark.bass_metrics(ref,[{'start':.2,'end':.4,'midi':35},{'start':2,'end':2.2,'midi':52}],.18)
        self.assertEqual(result['matched'],0)
        self.assertEqual(result['unmatched_detections'],1)
        self.assertEqual(result['octave_errors'],1)
        self.assertEqual(result['intro_false_attacks'],1)
