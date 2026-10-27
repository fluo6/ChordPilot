import importlib.util
from pathlib import Path
import unittest

import numpy as np


path = Path(__file__).resolve().parents[2] / 'scripts/testing/structure-role-consensus.py'
consensus = None
if path.exists():
    spec = importlib.util.spec_from_file_location('structure_role_consensus', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    consensus = module.consensus_roles


class StructureRoleConsensusTests(unittest.TestCase):
    def decide(self, probabilities, clusters, eligible):
        self.assertIsNotNone(consensus, 'Occurrence-preserving consensus missing')
        return consensus(probabilities, clusters, eligible)

    def test_shared_harmony_cannot_erase_confident_verse_and_chorus(self):
        decisions = self.decide([[.98, .02], [.01, .99]], [[0, 1]], [True, True])
        self.assertEqual([d['class_id'] for d in decisions], [0, 1])
        self.assertEqual([d['basis'] for d in decisions], ['occurrence', 'occurrence'])

    def test_weak_evidence_can_borrow_only_from_agreeing_content_peers(self):
        decisions = self.decide([[.65, .35], [.99, .01]], [[0, 1]], [True, True])
        self.assertEqual(decisions[0]['class_id'], 0)
        self.assertEqual(decisions[0]['basis'], 'compatible_recurrence')
        self.assertEqual(decisions[0]['support_indices'], [0, 1])
        self.assertAlmostEqual(decisions[0]['score'], .82)
        # A different winner anywhere in the group prevents propagation.
        decisions = self.decide([[.65, .35], [.99, .01], [.1, .9]], [[0, 1, 2]], [True] * 3)
        self.assertIsNone(decisions[0]['class_id'])

    def test_intro_return_does_not_inherit_intro_and_weak_peers_abstain(self):
        decisions = self.decide([[.99, .01], [.6, .4]], [[0, 1]], [False, True])
        self.assertIsNone(decisions[1]['class_id'])
        decisions = self.decide([[.6, .4], [.7, .3]], [[0, 1]], [True, True])
        self.assertTrue(all(d['class_id'] is None for d in decisions))

    def test_rejects_invalid_probabilities_and_incomplete_or_duplicate_groups(self):
        self.assertIsNotNone(consensus, 'Occurrence-preserving consensus missing')
        for probabilities, clusters, eligible in [
            ([[np.nan, 0]], [[0]], [True]),
            ([[.9, .9]], [[0]], [True]),
            ([[-.1, 1.1]], [[0]], [True]),
            ([[1., 0.]], [], [True]),
            ([[1., 0.]], [[0], [0]], [True]),
            ([[1., 0.]], [[0]], []),
        ]:
            with self.assertRaises(ValueError):
                consensus(probabilities, clusters, eligible)
