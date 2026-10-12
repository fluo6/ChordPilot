import csv
import json
import sys
import tempfile
import unittest
from pathlib import Path
from xml.etree import ElementTree as ET

BACKEND = Path(__file__).resolve().parents[2] / "backend"
sys.path.insert(0, str(BACKEND))

from chordpilot_export import (
    bar_chord_events, chord_to_harmony, duration_type, export_chart, key_to_fifths, parse_chord_symbol,
    parse_time_signature, render_musicxml, render_txt, write_csv,
)


CHART = {
    "title": "Test & Tune", "key": "D", "tempo": 90, "time_signature": "3/4",
    "bars": [
        {"number": 1, "section": "Verse", "chord": "C#maj7/G#", "start": 0, "repeat_start": True, "lyrics": "Hello & goodbye", "confidence": 0.8},
        {"number": 2, "section": "Verse", "chord": "Am", "start": 2, "repeat_end": 2},
        {"number": 3, "section": "Chorus", "chord": "Bdim", "start": 4},
    ],
}


class ExportTests(unittest.TestCase):
    def test_timed_events_are_preserved_in_text_csv_and_musicxml_with_irregular_beats(self):
        chart = {
            "title": "Timed", "tempo": 120, "time_signature": "7/8",
            "duration": 3.5, "beat_times": [0, .4, 1.1, 1.1, 1.5, 2.0, 2.6, 3.0],
            "bars": [{"number": 1, "start": 0, "section": "Verse", "chord": "C",
                      "lyrics": "line", "repeat_start": True,
                      "chord_events": [
                          {"start": 0, "end": 1.1, "chord": "C"},
                          {"start": 1.1, "end": 2.0, "chord": "N.C."},
                          {"start": 2.0, "end": 3.5, "chord": "G"},
                      ]}]
        }
        self.assertIn("C", render_txt(chart))
        self.assertIn("N.C.", render_txt(chart))
        self.assertIn("G", render_txt(chart))
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "events.csv"
            write_csv(chart, path)
            with path.open(newline="", encoding="utf8") as handle:
                rows = list(csv.DictReader(handle))
            self.assertEqual([(row["number"], row["chord"], row["start"], row["end"]) for row in rows], [
                ("1", "C", "0", "1.1"), ("1", "N.C.", "1.1", "2.0"), ("1", "G", "2.0", "3.5")
            ])
        root = ET.fromstring(render_musicxml(chart))
        measure = root.find("./part/measure")
        harmonies = measure.findall("harmony")
        self.assertEqual(len(harmonies), 3)
        self.assertEqual(harmonies[1].findtext("kind"), "none")
        self.assertIsNone(harmonies[1].find("root"))
        # 1.1s is beat 2 in the measured irregular beat grid: 2 eighth-note beats = 1 quarter.
        divisions = int(measure.findtext("attributes/divisions"))
        self.assertEqual(int(harmonies[1].findtext("offset")), divisions)
        self.assertEqual(int(harmonies[2].findtext("offset")), 2 * divisions)
        self.assertEqual(measure.findtext("attributes/time/beat-type"), "8")

    def test_parse_time_signature(self):
        self.assertEqual(parse_time_signature("7/8"), (7, 8))
        self.assertEqual(parse_time_signature("bad"), (4, 4))
        self.assertEqual(parse_time_signature(None), (4, 4))

    def test_legacy_export_keeps_old_text_and_csv_shape(self):
        self.assertIn("1  C#maj7/G#", render_txt(CHART))
        self.assertNotIn("0:", render_txt(CHART))
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "legacy.csv"
            write_csv(CHART, path)
            with path.open(newline="", encoding="utf8") as handle:
                reader = csv.DictReader(handle)
                self.assertNotIn("end", reader.fieldnames)
                self.assertEqual(len(list(reader)), 3)

    def test_malformed_timed_events_fall_back_to_legacy_bar_export(self):
        chart = {"tempo": 120, "time_signature": "4/4", "duration": 2, "bars": [
            {"number": 1, "start": 0, "chord": "G", "chord_events": [{"start": "bad", "end": None, "chord": "C"}]}
        ]}
        self.assertEqual(bar_chord_events(chart, 0)[0]["chord"], "G")
        self.assertIn("G", render_txt(chart))

    def test_duration_types(self):
        self.assertEqual(duration_type(4), "whole")
        self.assertEqual(duration_type(8), "whole")
        self.assertEqual(duration_type(2), "half")
        self.assertEqual(duration_type(1), "quarter")

    def test_key_fifths_handles_major_minor_and_unknown(self):
        self.assertEqual(key_to_fifths("Cb"), -7)
        self.assertEqual(key_to_fifths("F#m"), 6)
        self.assertEqual(key_to_fifths("C"), 0)
        self.assertEqual(key_to_fifths("H"), 0)

    def test_chord_symbol_quality_parsing(self):
        cases = {
            "C": ("C", "major"), "Db": ("Db", "major"), "Am": ("A", "minor"),
            "C7": ("C", "dominant"), "Cmaj7": ("C", "major-seventh"),
            "Am7": ("A", "minor-seventh"), "Fdim7": ("F", "diminished"),
            "Caug": ("C", "augmented"), "Dsus4": ("D", "suspended-fourth"),
            "G/B": ("G", "major"), "": ("C", "major"),
        }
        for value, expected in cases.items():
            with self.subTest(value=value):
                self.assertEqual(parse_chord_symbol(value), expected)

    def test_harmony_contains_root_and_accidental(self):
        harmony = chord_to_harmony("C#7")
        self.assertEqual(harmony.findtext("root/root-step"), "C")
        self.assertEqual(harmony.findtext("root/root-alter"), "1")
        self.assertEqual(harmony.findtext("kind"), "dominant")
        self.assertEqual(harmony.find("kind").attrib["text"], "C#7")

    def test_text_render_groups_sections_repeats_and_lyrics(self):
        text = render_txt(CHART)
        self.assertTrue(text.startswith("Test & Tune\nKey: D  Tempo: 90  Time: 3/4"))
        self.assertIn("[Verse]", text)
        self.assertIn("[Chorus]", text)
        self.assertIn("|:", text)
        self.assertIn("x2", text)
        self.assertIn("Hello & goodbye", text)

    def test_csv_render_has_stable_columns_and_rows(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "chart.csv"
            write_csv(CHART, path)
            with path.open(newline="", encoding="utf8") as handle:
                rows = list(csv.DictReader(handle))
            self.assertEqual(len(rows), 3)
            self.assertEqual(rows[0]["chord"], "C#maj7/G#")
            self.assertEqual(rows[1]["repeat_end"], "2")

    def test_musicxml_is_valid_and_contains_chart_data(self):
        xml = render_musicxml(CHART)
        root = ET.fromstring(xml)
        self.assertEqual(root.tag, "score-partwise")
        self.assertEqual(root.findtext("movement-title"), "Test & Tune")
        measures = root.findall("./part/measure")
        self.assertEqual(len(measures), 3)
        self.assertEqual(measures[0].findtext("attributes/time/beats"), "3")
        self.assertEqual(measures[0].findtext("direction/direction-type/words"), "Hello & goodbye")
        self.assertEqual(measures[1].find("barline/repeat").attrib, {"direction": "backward", "times": "2"})

    def test_export_chart_supports_all_formats_and_rejects_unknown(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "chart.json"
            source.write_text(json.dumps(CHART), encoding="utf8")
            for format_name in ("txt", "csv", "json", "musicxml"):
                destination = root / f"out.{format_name}"
                result = export_chart(str(source), format_name.upper(), str(destination))
                self.assertTrue(result["ok"])
                self.assertEqual(result["format"], format_name)
                self.assertTrue(destination.exists())
                self.assertGreater(destination.stat().st_size, 0)
            with self.assertRaisesRegex(ValueError, "Unsupported export format"):
                export_chart(str(source), "pdf", str(root / "out.pdf"))


if __name__ == "__main__":
    unittest.main()
