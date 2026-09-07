import json
import os
import struct
import sys
import tempfile
import unittest
import wave
from pathlib import Path
from unittest.mock import patch

BACKEND = Path(__file__).resolve().parents[2] / "backend"
sys.path.insert(0, str(BACKEND))

import chordpilot_audio as audio
import chordpilot_cache as cache
import chordpilot_stems as stems


class CacheTests(unittest.TestCase):
    def test_cache_root_uses_configured_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            configured = Path(directory) / "persistent-cache"
            with patch.dict(os.environ, {"CHORDPILOT_CACHE_DIR": str(configured)}):
                self.assertEqual(cache.cache_root(), configured)
                self.assertTrue(configured.is_dir())

    def test_cache_root_creates_child_directories(self):
        with tempfile.TemporaryDirectory() as directory:
            configured = Path(directory) / "persistent-cache"
            with patch.dict(os.environ, {"CHORDPILOT_CACHE_DIR": str(configured)}):
                cache.cache_root()
            for child in ("decoded", "analysis", "stems", "history"):
                self.assertTrue((configured / child).is_dir())

    def test_cache_root_keeps_temp_default_without_environment(self):
        with patch.dict(os.environ, {}, clear=True):
            root = cache.cache_root()
        self.assertEqual(root, Path(tempfile.gettempdir()) / "ChordPilot")

    def test_fingerprint_and_key_change_with_file(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "song.bin"
            path.write_bytes(b"one")
            fingerprint = cache.file_fingerprint(path)
            first = cache.cache_key(path)
            self.assertEqual(fingerprint["size"], 3)
            self.assertEqual(fingerprint["path"], str(path.resolve()))
            path.write_bytes(b"different")
            self.assertNotEqual(first, cache.cache_key(path))

    def test_analysis_cache_round_trip_and_invalid_json(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "analysis").mkdir()
            source = root / "song.wav"
            source.write_bytes(b"audio")
            with patch.object(cache, "cache_root", return_value=root):
                self.assertIsNone(cache.read_analysis_cache(source, "fast"))
                payload = {"title": "Song", "analysis_engine": {"cache": "none"}}
                cache.write_analysis_cache(source, payload, "fast")
                loaded = cache.read_analysis_cache(source, "fast")
                self.assertEqual(loaded["title"], "Song")
                self.assertEqual(loaded["analysis_engine"]["cache"], "analysis cache hit")
                cache.analysis_cache_path(source, "fast").write_text("not json", encoding="utf8")
                self.assertIsNone(cache.read_analysis_cache(source, "fast"))

    def test_append_history_writes_summary_only(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "history").mkdir()
            payload = {"title": "Song", "source_path": "x", "duration": 1, "tempo": 120, "key": "C", "bars": [{}, {}], "analysis_engine": {"mode": "fast"}}
            with patch.object(cache, "cache_root", return_value=root):
                cache.append_history(payload)
            row = json.loads((root / "history" / "analysis-history.jsonl").read_text(encoding="utf8"))
            self.assertEqual(row["bars"], 2)
            self.assertNotIn("bars_payload", row)


class AudioTests(unittest.TestCase):
    def test_audio_duration_reads_wave_header_and_falls_back(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "tone.wav"
            with wave.open(str(path), "wb") as handle:
                handle.setnchannels(1)
                handle.setsampwidth(2)
                handle.setframerate(8000)
                handle.writeframes(struct.pack("<" + "h" * 8000, *([0] * 8000)))
            with patch.object(audio, "load_audio", side_effect=RuntimeError("no scipy")):
                self.assertEqual(audio.audio_duration(path), 1.0)
                self.assertEqual(audio.audio_duration(Path(directory) / "missing.mp3"), 180.0)

    def test_resolve_ffmpeg_prefers_valid_configuration(self):
        with tempfile.TemporaryDirectory() as directory:
            executable = Path(directory) / "ffmpeg"
            executable.write_text("", encoding="utf8")
            with patch.dict(os.environ, {"CHORDPILOT_FFMPEG": str(executable)}):
                self.assertEqual(audio.resolve_ffmpeg(), str(executable))

    def test_waveform_peaks_normalizes_bins(self):
        try:
            import numpy as np
        except ImportError:
            self.skipTest("numpy is not installed")
        values = np.asarray([0.0, -0.5, 1.0, -0.25], dtype=np.float32)
        with patch.object(audio, "load_audio", return_value=(values, 4)):
            self.assertEqual(audio.waveform_peaks(Path("x.wav"), bins=2), [0.5, 1.0])
        with patch.object(audio, "load_audio", return_value=(np.asarray([], dtype=np.float32), 4)):
            self.assertEqual(audio.waveform_peaks(Path("x.wav")), [])

    def test_pcm_conversion_handles_integer_and_float(self):
        try:
            import numpy as np
        except ImportError:
            self.skipTest("numpy is not installed")
        integer = audio.pcm_to_float(np.asarray([-32768, 0, 32767], dtype=np.int16), np)
        self.assertAlmostEqual(float(integer[0]), -1.0)
        self.assertAlmostEqual(float(integer[-1]), 32767 / 32768)
        floating = audio.pcm_to_float(np.asarray([0.25], dtype=np.float64), np)
        self.assertEqual(str(floating.dtype), "float32")


class StemTests(unittest.TestCase):
    def test_find_existing_stems_requires_known_names(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            nested = root / "model" / "song"
            nested.mkdir(parents=True)
            for name in ("vocals", "drums", "bass"):
                (nested / f"{name}.wav").write_bytes(b"")
            (nested / "piano.wav").write_bytes(b"")
            found = stems.find_existing_stems(root)
            self.assertEqual(set(found), {"vocals", "drums", "bass"})

    def test_error_summary_prefers_tail_and_handles_empty(self):
        self.assertEqual(stems.demucs_error_summary("", ""), "no error output")
        lines = stems.demucs_error_summary("out", "\n".join(f"err{i}" for i in range(10)))
        self.assertNotIn("err0", lines)
        self.assertIn("err9", lines)
        self.assertTrue(lines.endswith("out"))

    def test_configured_demucs_command_path_or_words(self):
        with tempfile.TemporaryDirectory() as directory:
            executable = Path(directory) / "demucs.exe"
            executable.write_text("", encoding="utf8")
            with patch.dict(os.environ, {"CHORDPILOT_DEMUCS": str(executable)}):
                self.assertEqual(stems.resolve_demucs_command(), [str(executable)])
            with patch.dict(os.environ, {"CHORDPILOT_DEMUCS": "python -m demucs"}):
                self.assertEqual(stems.resolve_demucs_command(), ["python", "-m", "demucs"])

    def test_auto_install_can_be_disabled(self):
        with patch.dict(os.environ, {"CHORDPILOT_AUTO_INSTALL_DEMUCS": "false"}):
            self.assertIsNone(stems.install_demucs_for_user())


if __name__ == "__main__":
    unittest.main()
