import sys
import tempfile
import unittest
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2] / "backend"
sys.path.insert(0, str(BACKEND))

from chordpilot_lyrics import (
    apply_lyrics_to_bars, bar_index_at_time, clamp_time, clean_lyric_text,
    lyric_confidence, lyrics_unavailable, select_lyrics_source,
)


class LyricsTests(unittest.TestCase):
    def test_clean_text_collapses_whitespace(self):
        self.assertEqual(clean_lyric_text("  hello\n  world\t "), "hello world")
        self.assertEqual(clean_lyric_text(None), "")

    def test_clamp_time_handles_invalid_and_bounds(self):
        self.assertEqual(clamp_time("1.23456", 10), 1.235)
        self.assertEqual(clamp_time(-2, 10), 0.0)
        self.assertEqual(clamp_time(20, 10), 10)
        self.assertEqual(clamp_time("bad", 10), 0.0)
        self.assertEqual(clamp_time(2, -1), 0.0)

    def test_lyric_confidence_clamps_and_uses_fallbacks(self):
        self.assertEqual(lyric_confidence(0, 0), 0.98)
        self.assertEqual(lyric_confidence(1, -1.2), 0.0)
        self.assertEqual(lyric_confidence("bad", "bad"), 0.55)
        self.assertGreater(lyric_confidence(0.1, -0.2), 0.8)

    def test_bar_index_at_time_handles_boundaries_and_tail(self):
        bars = [{"start": 0}, {"start": 2}, {"start": 4}]
        self.assertEqual(bar_index_at_time(bars, 0, 6), 0)
        self.assertEqual(bar_index_at_time(bars, 1.999, 6), 0)
        self.assertEqual(bar_index_at_time(bars, 2, 6), 1)
        self.assertEqual(bar_index_at_time(bars, 6, 6), 2)
        self.assertIsNone(bar_index_at_time([], 1, 6))

    def test_apply_lyrics_groups_by_midpoint_and_preserves_existing_empty_policy(self):
        bars = [{"start": 0}, {"start": 2, "lyrics": "manual"}, {"start": 4}]
        lines = [
            {"start": 0.2, "end": 0.8, "text": " first "},
            {"start": 0.9, "end": 1.3, "text": "second"},
            {"start": 2.2, "end": 2.8, "text": "replacement"},
            {"start": 4.1, "end": 4.2, "text": "   "},
        ]
        apply_lyrics_to_bars(bars, lines, 6)
        self.assertEqual(bars[0]["lyrics"], "first / second")
        self.assertEqual(bars[0]["lyrics_source"], "auto")
        self.assertEqual(bars[1]["lyrics"], "replacement")
        self.assertEqual(bars[2]["lyrics"], "")

    def test_source_selection_prefers_vocals_and_can_force_full_mix(self):
        source = Path("song.wav")
        stems = {"stems": [{"name": "vocals", "path": "vocals.wav"}, {"name": "bass", "path": "bass.wav"}]}
        self.assertEqual(select_lyrics_source(source, stems, {"lyrics_source": "auto"}), (Path("vocals.wav"), "vocals stem"))
        self.assertEqual(select_lyrics_source(source, stems, {"lyrics_source": "vocals"}), (Path("vocals.wav"), "vocals stem"))
        self.assertEqual(select_lyrics_source(source, stems, {"lyrics_source": "full_mix"}), (source, "full mix"))

    def test_unavailable_payload_is_structured(self):
        result = lyrics_unavailable("not installed")
        self.assertEqual(result, {"ok": False, "engine": "lyrics unavailable", "error": "not installed", "lines": []})


if __name__ == "__main__":
    unittest.main()
