import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).absolute().parents[2] / 'backend'))
from chordpilot_analysis import estimate_tempo_from_envelope


class TempoBoundsTests(unittest.TestCase):
    def pulses(self, interval):
        envelope = np.zeros(1200)
        envelope[::interval] = 1
        return envelope

    def test_slow_ballad_is_not_doubled_above_requested_maximum(self):
        self.assertEqual(estimate_tempo_from_envelope(self.pulses(100), 100, 1, np, 50, 90), 60)

    def test_fast_tempo_is_not_halved_below_requested_minimum(self):
        self.assertEqual(estimate_tempo_from_envelope(self.pulses(27), 100, 1, np, 210, 240), 222)

    def test_default_octave_preference_remains_when_within_range(self):
        self.assertEqual(estimate_tempo_from_envelope(self.pulses(100), 100, 1, np, 50, 190), 120)

    def test_short_input_fallback_respects_range(self):
        self.assertEqual(estimate_tempo_from_envelope(np.zeros(3), 100, 1, np, 50, 90), 90)
        self.assertEqual(estimate_tempo_from_envelope(np.zeros(16), 1, 100, np, 50, 90), 90)


if __name__ == '__main__':
    unittest.main()
