import sys
import unittest
import tempfile
from unittest.mock import patch
import numpy as np
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'backend'))
try:
    import chordpilot_structure as structure
except ImportError:
    structure = None


class StructureContractTests(unittest.TestCase):
    def test_export_projection_respects_one_naming_convention_without_changing_predictions(self):
        import copy
        chart={'duration':8,'bars':[{'start':0},{'start':4}],
               'structure':{'version':1,'analysis':{'segments':[
                   {'id':'a','start':0,'end':4,'role':'verse','group':'A'},
                   {'id':'b','start':4,'end':8,'role':None,'group':'B'}]},'manual_segments':None}}
        original=copy.deepcopy(chart['structure']['analysis'])
        for mode,expected in [(None,['Verse','Unclassified']),('roles',['Verse','Unclassified']),
                              ('groups',['A','B']),('mixed',['Verse','B'])]:
            chart['structure']['display_mode']=mode
            structure.project_sections(chart)
            self.assertEqual([b['section'] for b in chart['bars']],expected)
            self.assertEqual(chart['structure']['analysis'],original)
        chart['structure']['display_mode']=None
        chart['structure']['analysis']['segments'][0]['role']=None
        structure.project_sections(chart)
        self.assertEqual([b['section'] for b in chart['bars']],['A','B'])
        chart['structure']['manual_segments']=[{'id':'legacy','start':0,'end':8,'label':'My custom name','origin':'legacy'}]
        structure.project_sections(chart)
        self.assertEqual(chart['bars'][0]['section'],'My custom name')
        chart['structure']['display_mode']='roles'
        structure.project_sections(chart)
        self.assertEqual(chart['bars'][0]['section'],'Unclassified')

    def test_saved_labels_and_manual_answers_cannot_change_inference(self):
        sr=8000;t=np.arange(sr*12)/sr
        audio=.2*np.sin(2*np.pi*220*t)
        plain={'duration':12,'bars':[{'start':i} for i in range(12)]}
        labelled={'duration':12,'bars':[{'start':i,'section':'Intro' if i<3 else 'Chorus','section_id':str(i)} for i in range(12)],
                  'structure':{'manual_segments':[{'id':'answer','start':0,'end':12,'role':'intro','label':'Human answer'}]},
                  'expected_boundaries':[0,3,7,12]}
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'source.wav';path.write_bytes(b'fixed audio identity')
            with patch('chordpilot_audio.load_audio',return_value=(audio,sr)), \
                 patch('chordpilot_cache.read_analysis_cache',return_value=None) as read_cache, \
                 patch('chordpilot_cache.write_analysis_cache'):
                first=structure.analyze_structure(path,plain)
                second=structure.analyze_structure(path,labelled)
            self.assertEqual(read_cache.call_args_list[0],read_cache.call_args_list[1])
        for result in (first,second):
            result['analysis'].pop('elapsed_seconds')
            self.assertIsNone(result['manual_segments'])
            self.assertTrue(all(row.get('role') is None and row.get('label') is None for row in result['analysis']['segments']))
        self.assertEqual(first,second)

    def test_honest_empty_structure_and_boundary_ownership(self):
        self.assertIsNotNone(structure, 'source-time structure module is missing')
        chart = {'duration': 8, 'bars': [{'start': 0}, {'start': 4}]}
        chart['structure'] = structure.empty_structure(8, 'not_analyzed')
        structure.project_sections(chart)
        self.assertEqual([b['section'] for b in chart['bars']], ['Unlabelled', 'Unlabelled'])
        chart['structure']['analysis']['segments'] = [
            {'id': 'a', 'start': 0, 'end': 4, 'group': 'A', 'role': None},
            {'id': 'b', 'start': 4, 'end': 8, 'group': 'B', 'role': None}]
        structure.project_sections(chart)
        self.assertEqual([b['section_id'] for b in chart['bars']], ['a', 'b'])

    def test_invalid_partitions_are_rejected_without_silently_repairing_evidence(self):
        self.assertIsNotNone(structure, 'source-time structure module is missing')
        for rows in ([{'id':'a','start':1,'end':8}],
                     [{'id':'a','start':0,'end':9}],
                     [{'id':'a','start':0,'end':4},{'id':'a','start':4,'end':8}],
                     [{'id':'a','start':0,'end':float('nan')}],
                     [{'id':'a','start':0,'end':3},{'id':'b','start':4,'end':8}]):
            self.assertFalse(structure.validate_segments(rows, 8))
        self.assertTrue(structure.validate_segments([], 0))

    def test_audio_changes_produce_a_b_a_without_a_pop_template(self):
        detect = getattr(structure, 'analyze_structure_audio', None)
        self.assertTrue(callable(detect), 'acoustic structure detection is missing')
        sr = 8000
        def phrase(roots):
            t = np.arange(sr * 2) / sr
            return np.concatenate([sum(.12 * np.sin(2*np.pi*f*t) for f in chord) for chord in roots])
        a = phrase([(261.63,329.63,392),(349.23,440,523.25)] * 2)
        b = phrase([(293.66,349.23,440),(392,466.16,587.33)] * 2)
        audio = np.concatenate([a,b,a])
        grid = {'duration':24,'bars':[{'start':i*2} for i in range(12)]}
        result = detect(audio,sr,grid)
        rows = result['analysis']['segments']
        self.assertEqual([row['start'] for row in rows],[0,8,16])
        self.assertEqual([row['group'] for row in rows],['A','B','A'])
        self.assertTrue(all(row['role'] is None for row in rows))
        self.assertIsNone(rows[0]['evidence']['repeat_score'])
        self.assertTrue(structure.validate_segments(rows,24))

    def test_uniform_audio_silence_and_bad_grid_abstain_without_periodic_splits(self):
        detect = getattr(structure, 'analyze_structure_audio', None)
        self.assertTrue(callable(detect), 'acoustic structure detection is missing')
        sr=8000;time=np.arange(sr*32)/sr
        for audio, status in [(np.zeros_like(time),'insufficient_evidence'),(.2*np.sin(2*np.pi*220*time),'estimated')]:
            result=detect(audio,sr,{'duration':32,'bars':[{'start':0},{'start':float('nan')}]})
            self.assertEqual(result['analysis']['status'],status)
            self.assertEqual(len(result['analysis']['segments']),1)
            self.assertTrue(result['analysis']['diagnostics'])
            self.assertTrue(structure.validate_segments(result['analysis']['segments'],32))
            if status=='insufficient_evidence':self.assertIsNone(result['analysis']['segments'][0]['group'])

    def test_quiet_harmonic_change_over_a_common_bed_is_detected_without_splitting_stationary_noise(self):
        sr=8000;t=np.arange(sr*8)/sr
        bed=.2*np.sin(2*np.pi*220*t)
        a=bed+.08*np.sin(2*np.pi*329.63*t)
        b=bed+.08*np.sin(2*np.pi*293.66*t)
        grid={'duration':24,'bars':[{'start':i*2} for i in range(12)]}
        result=structure.analyze_structure_audio(np.concatenate([a,b,a]),sr,grid)
        self.assertEqual([row['start'] for row in result['analysis']['segments']],[0,8,16])
        noise=np.random.default_rng(42).normal(0,.04,sr*24)
        result=structure.analyze_structure_audio(noise,sr,grid)
        self.assertEqual(len(result['analysis']['segments']),1)

    def test_order_and_texture_prevent_false_repeated_groups(self):
        group=getattr(structure,'group_segments',None)
        self.assertTrue(callable(group),'ordered repeated-group comparison is missing')
        # Each row is independently constructed chroma, timbre, RMS and activity.
        features=np.zeros((24,38));features[:,36]=.1
        for i in range(8):
            features[i,i%4]=1;features[i,12]=1
            features[8+i,(7-i)%4]=1;features[8+i,12]=1
            features[16+i,i%4]=1;features[16+i,20]=1
        rows=[{'id':str(i),'start':i*8.,'end':(i+1)*8.} for i in range(3)]
        group(rows,features,np.arange(25,dtype=float))
        self.assertEqual([row['group'] for row in rows],['A','B','C'])

    def test_repeat_comparison_uses_source_time_when_pickups_change_feature_density(self):
        times=np.r_[np.linspace(0,1,40,endpoint=False),2,3,4,6,8,10,12,14,16,18,20,22,24]
        features=np.zeros((len(times)-1,38));features[:,12]=1;features[:,36]=.1
        for i,t in enumerate(times[:-1]):
            features[i,3 if 8<=t<16 else 0 if t%8<4 else 1]=1
        rows=[{'id':str(i),'start':i*8.,'end':(i+1)*8.} for i in range(3)]
        structure.group_segments(rows,features,times)
        self.assertEqual([row['group'] for row in rows],['A','B','A'])


if __name__ == '__main__':
    unittest.main()
