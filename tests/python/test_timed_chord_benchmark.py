import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('timed_benchmark',
    Path(__file__).resolve().parents[2] / 'scripts/testing/timed-chord-benchmark.py')
benchmark = importlib.util.module_from_spec(spec)
spec.loader.exec_module(benchmark)


class TimedChordBenchmarkTests(unittest.TestCase):
    def test_reference_extensions_and_altered_fifths_are_not_counted_as_exact(self):
        self.assertTrue(benchmark.agreement('D/F#','Dmaj9/F#')['family'])
        self.assertFalse(benchmark.agreement('D/F#','Dmaj9/F#')['exact'])
        self.assertFalse(benchmark.agreement('Cm7b5','Cm7')['family'])
        self.assertFalse(benchmark.agreement('Gmaj9','G9')['family'])

    def test_duration_weighting_penalizes_uncovered_audio_and_reports_beat_position(self):
        chart = {'bars':[{'start':0,'number':1,'chord_events':[{'start':0,'end':1,'chord':'Cmaj9'}]}],
                 'beat_times':[0,.5,1,1.5], 'tempo':120,'key':'C','analysis_engine':{'options':{}}}
        reference = {'title':'test','source_url':'test','windows':[
            {'start':0,'end':2,'chord':'Cmaj9','split':'calibration'},
            {'start':0,'end':2,'chord':'G','split':'held_out'}],
            'attacked_beats':[{'time':.51,'bar':1,'beat':2}]}
        result = benchmark.evaluate(chart,reference)
        self.assertEqual(result['chords']['calibration']['root_percent'],50)
        self.assertEqual(result['chords']['all']['root_percent'],25)
        self.assertEqual(result['beats']['median_error_ms'],10)
        self.assertEqual(result['beats']['correct_bar_and_beat'],1)


if __name__ == '__main__':
    unittest.main()
