import importlib.util
from pathlib import Path
import unittest

import numpy as np


path=Path(__file__).resolve().parents[2]/'scripts/testing/structure-decoder-experiment.py'
decoder=None
if path.exists():
    spec=importlib.util.spec_from_file_location('structure_decoder_experiment',path)
    decoder=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(decoder)


class StructureDecoderTests(unittest.TestCase):
    def test_recording_edge_peak_cannot_suppress_an_internal_section(self):
        section=np.zeros(350);section[[2,80,220]]=[.8,.3,.6]
        labels=np.zeros((10,350));labels[2,:80]=1;labels[8,80:]=1
        self.assertIsNotNone(decoder,'decoder experiment missing')
        rows=decoder.decode(section,labels,35,fps=10,window_seconds=12,edge_guard_seconds=1)
        self.assertEqual(rows[0],{'start':0.,'end':8.,'label':'intro'})
        # A chorus-first recording must stay chorus-first with identical peaks.
        labels[:]=0;labels[9]=1
        rows=decoder.decode(section,labels,35,fps=10,window_seconds=12,edge_guard_seconds=1)
        self.assertEqual(rows[0]['label'],'chorus')

    def test_early_intro_transition_survives_a_stronger_start_peak(self):
        self.assertIsNotNone(decoder,'decoder experiment missing')
        section=np.zeros(300)
        section[[2,80,200]]=[.8,.3,.6]
        labels=np.zeros((10,300))
        labels[2,:80]=1
        labels[8,80:200]=1
        labels[9,200:]=1
        rows=decoder.decode(section,labels,30,fps=10,window_seconds=4)
        self.assertTrue(any(row['label']=='intro' and row['end']==8 for row in rows))
        self.assertTrue(any(row['label']=='verse' and row['start']==8 for row in rows))
        legacy=decoder.decode(section,labels,30,fps=10,window_seconds=12)
        self.assertFalse(any(row['label']=='intro' and row['end']==8 for row in legacy))

    def test_frame_rounded_final_endpoint_is_clipped_to_recording(self):
        self.assertIsNotNone(decoder,'decoder experiment missing')
        section=np.zeros(101);section[50]=.7
        labels=np.zeros((10,101));labels[8]=1
        rows=decoder.decode(section,labels,10.005,fps=10,window_seconds=2)
        self.assertEqual(rows[0]['start'],0)
        self.assertEqual(rows[-1]['end'],10.005)
        self.assertEqual(rows[0]['end'],rows[1]['start'])

    def test_invalid_activation_lengths_and_nan_are_rejected(self):
        self.assertIsNotNone(decoder,'decoder experiment missing')
        for section,labels in [(np.zeros(10),np.ones((10,9))),
                               (np.full(10,np.nan),np.ones((10,10)))]:
            with self.assertRaises(ValueError):decoder.decode(section,labels,1,fps=10)
