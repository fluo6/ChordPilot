import sys
import json
import unittest
from pathlib import Path
from xml.etree import ElementTree as ET

sys.path.insert(0, str(Path(__file__).absolute().parents[2] / "backend"))
import chordpilot_timing as timing
import chordpilot_common as common
import chordpilot_chords as chords
import chordpilot_analysis as analysis
from chordpilot_export import render_musicxml, render_txt
import numpy as np


class ChordTimingTests(unittest.TestCase):
    def test_balanced_does_not_project_a_short_region_root_over_new_local_evidence(self):
        rows = (Path(__file__).resolve().parents[1] / "fixtures" / "chord-evidence"
            / "forever-love-verse1-cells.jsonl").read_text(encoding="utf-8").splitlines()
        cells = [{"start": row["start"], "end": row["end"], "chord": row["chord"],
            "_chroma": np.array(row["chroma"]), "_ranked": row["ranked"],
            "bass_reference": row["bass_reference"],
            "evidence": {"detected_pitches": row.get("detected_pitches", [])}}
            for row in map(json.loads, rows[1:])]
        timing.stabilize_chord_cells(cells, np, {"chord_stability": "balanced",
            "beat_period": 60 / 133, "beats_per_bar": 4, "key": "A"})
        # No PDF labels enter this replay: B/F# measurements and local B-root
        # candidates replace the earlier E-root reference inside a short region.
        passage = [cell for cell in cells if 42.12 <= cell["start"] < 43.0]
        self.assertEqual(len(passage), 4)
        self.assertTrue(all(chords.root_index_from_symbol(cell["chord"]) == 11 for cell in passage))

    def test_sustained_does_not_project_an_intro_root_across_bassless_verse(self):
        rows = (Path(__file__).resolve().parents[1] / "fixtures" / "chord-evidence"
            / "forever-love-verse1-cells.jsonl").read_text(encoding="utf-8").splitlines()
        fixture = json.loads(rows[0])
        cells = [{"start": row["start"], "end": row["end"], "chord": row["chord"],
            "_chroma": np.array(row["chroma"]), "_ranked": row["ranked"],
            "bass_reference": row["bass_reference"],
            "evidence": {"detected_pitches": row.get("detected_pitches", [])}}
            for row in map(json.loads, rows[1:])]
        timing.stabilize_chord_cells(cells, np, {"chord_stability": "sustained",
            "beat_period": 60 / fixture["tempo"], "beats_per_bar": 4, "key": fixture["key"]})

        def matching(start, end, prefix):
            passage = [cell for cell in cells if start <= cell["start"] < end]
            return sum(cell["chord"].startswith(prefix) for cell in passage), len(passage)

        self.assertEqual(matching(11.67, 14.83, "A"), (14, 14))
        self.assertGreaterEqual(matching(18.67, 22.05, "A")[0], 13)
        self.assertEqual(matching(27.69, 29.27, "A"), (7, 7))
        self.assertEqual(matching(16.64, 18.44, "Dm"), (7, 7))

    def test_weak_bass_uses_a_measured_low_accompaniment_note(self):
        sr = 8192
        t = np.arange(sr) / sr
        other = sum(amplitude * np.sin(2*np.pi*frequency*t) for frequency, amplitude in [(196, .3),(233.08,.1),(349.23,.1),(440,.1)])
        bass = np.sin(2*np.pi*82.4*t) * 1e-7
        reference = analysis.chord_reference_for_segment(other,sr,0,1,np,bass,sr)
        self.assertEqual(reference['note'],'G')
        self.assertEqual(reference['origin'],'accompaniment')
        self.assertGreaterEqual(reference['confidence'],.62)
        # Genuine independent bass takes precedence, even if the guitar is louder.
        reference = analysis.chord_reference_for_segment(other,sr,0,1,np,bass*1e6,sr)
        self.assertEqual(reference['note'],'E')
        self.assertEqual(reference['origin'],'bass')

    def test_guide_filter_retains_a_local_fallback_and_continuous_path(self):
        chroma = np.array([.041447,.255781,.028240,.002957,.057318,.122893,.000094,.297807,.047844,.016365,.000417,.128836])
        cells = [{'start':index*.5,'end':(index+1)*.5,'chord':'C#m7b5','_chroma':chroma,
            'bass_reference':{'pitch_class':1,'confidence':.75,'origin':'accompaniment'},
            '_ranked':[{'chord':'C#m7b5','raw_score':4}]} for index in range(2)]
        timing.stabilize_chord_cells(cells,np,{'chord_stability':'sustained','beat_period':.5,'beats_per_bar':4})
        self.assertEqual([cell['chord'] for cell in cells],['C#m7b5','C#m7b5'])

    def test_sustained_guitar_progression_survives_a_nearly_silent_bass_stem(self):
        sr = 8192
        t = np.arange(sr*12)/sr
        audio = np.zeros_like(t)
        # Root notes occur at each chord's attack, followed by upper guitar voicings.
        for start, notes in [(0,[55,58,65,69]),(2,[48,64,67,70,69]),(4,[53,57,64,67]),(6,[53,57,64,67]),(8,[53,57,64,67]),(10,[53,57,64,67])]:
            for midi in notes:
                frequency = 440*2**((midi-69)/12)
                mask = (t>=start)&(t<start+2)
                envelope = np.exp(-(t[mask]-start)/(.8 if midi==notes[0] else 3))
                audio[mask] += .2*np.sin(2*np.pi*frequency*t[mask])*envelope
        bass = np.sin(2*np.pi*82.4*t)*1e-7
        bars = [{'start':start,'chord':''} for start in range(0,12,2)]
        options = common.normalize_analysis_options({'chord_stability':'sustained','chord_grid':'half_beat','known_key':'F','overtone_weighting':0})
        analysis.attach_timed_chord_events(bars,audio,sr,120,'4/4',list(np.arange(0,12,.5)),np,options,'other',bass,sr,'F')
        roots = [chords.root_index_from_symbol(bar['chord']) for bar in bars]
        self.assertEqual(roots[:3],[7,0,5])
        self.assertEqual(roots[2:],[5]*4)

    def test_sustained_low_root_survives_an_ambiguous_slash_voicing(self):
        # Post-tail guitar evidence: C6 and Am7/C share tones, then upper notes
        # temporarily win as Amadd9/C. A later tonic must not erase this change.
        g = np.zeros(12); g[[7,10,2,5,9]] = .2
        f = np.zeros(12); f[[5,9,0,4,7]] = .2
        rows = [(g,7,.85)]*4 + [
            (np.array([.226,.008,.013,.004,.246,.014,.006,.25,.027,.092,.062,.052]),0,.877),
            (np.array([.241,.030,.037,.036,.085,.100,.034,.025,.042,.106,.135,.130]),0,.908),
            (np.array([.088,.023,.028,.014,.348,.050,.008,.030,.022,.192,.137,.061]),None,0),
            (np.array([.123,.035,.055,.056,.182,.058,.050,.054,.082,.129,.095,.079]),0,.716),
        ] + [(f,5,.85)]*8
        for transpose in (0,3,6):
            with self.subTest(transpose=transpose):
                key = common.PITCH_NAMES[(5+transpose)%12]
                options = common.normalize_analysis_options({'known_key':key,'chord_stability':'sustained'})
                cells = []
                for index,(chroma,root,confidence) in enumerate(rows):
                    chroma = np.roll(chroma/chroma.sum(),transpose)
                    reference = {'origin':'accompaniment','pitch_class':(root+transpose)%12,'confidence':confidence} if root is not None else None
                    ranked,_ = chords.rank_chord_candidates(chroma,key,None,None,reference,np,options)
                    cells.append({'start':index*.5,'end':(index+1)*.5,'chord':ranked[0]['chord'],
                        '_chroma':chroma,'bass_reference':reference,
                        '_ranked':[{'chord':item['chord'],'raw_score':item['raw_score']} for item in ranked]})
                    if index == 5:
                        # Measured peaks contain E and Bb, but no B: broad FFT-bin
                        # spill must not turn that voicing into a protected Amadd9.
                        cells[-1]['evidence'] = {'detected_pitches':[{'midi':(midi+transpose),'strength':strength}
                            for midi,strength in [(48,.597),(64,.182),(58,.116),(69,.045),(76,.035),(77,.026)]]}
                timing.stabilize_chord_cells(cells,np,{**options,'key':key,'beat_period':.5,'beats_per_bar':4})
                roots = [chords.root_index_from_symbol(cell['chord']) for cell in cells]
                self.assertEqual(roots,[(7+transpose)%12]*4+[transpose]*4+[(5+transpose)%12]*8)

    def test_sustained_keeps_a_constant_harmony_when_its_guitar_voicing_inverts(self):
        inversion = np.array([.158513477,.001,.236423171,.001,.157715887,.001,.001,.198836733,.001,.001,.001,.248510731])
        root_position = np.zeros(12); root_position[[0,2,4,7,11]] = .2
        for initial in (0,4):
            for transpose in (0,5):
                with self.subTest(initial=initial,transpose=transpose):
                    key = common.PITCH_NAMES[transpose]
                    cells = []
                    for index in range(initial+8):
                        chroma = np.roll(root_position if index<initial else inversion,transpose)
                        reference = {'origin':'accompaniment','pitch_class':(transpose+(0 if index<initial else 4))%12,'confidence':.9}
                        ranked,_ = chords.rank_chord_candidates(chroma,key,None,None,reference,np,{})
                        cells.append({'start':index*.5,'end':(index+1)*.5,'chord':ranked[0]['chord'],
                            '_chroma':chroma,'bass_reference':reference,'_ranked':ranked})
                    expected = [cell['chord'] for cell in cells]
                    timing.stabilize_chord_cells(cells,np,{'chord_stability':'sustained','beat_period':.5,'key':key})
                    self.assertEqual([cell['chord'] for cell in cells],expected)


    def test_timed_evidence_keeps_measured_bass_octaves_for_the_keyboard(self):
        sr = 8192
        t = np.arange(sr * 2) / sr
        other = sum(np.sin(2 * np.pi * frequency * t) for frequency in [261.6256, 311.1270, 391.9954, 466.1638])
        bass = np.sin(2 * np.pi * 51.9131 * t)
        bars = [{'start': 0, 'chord': ''}]
        analysis.attach_timed_chord_events(bars, other, sr, 120, '4/4', [0, .5, 1, 1.5], np,
            common.normalize_analysis_options({'chord_timing': 'fixed'}), 'other', bass, sr, key='Ab')
        cell = bars[0]['chord_events'][0]['debug']['cells'][0]
        self.assertTrue(cell['evidence']['detected_pitches'])
        self.assertEqual(cell['bass_reference']['detected_pitches'][0]['midi'], 32)
        self.assertEqual(cell['bass_reference']['detected_pitches'][0]['note'], 'Ab1')

    def test_beat_spectra_follow_changed_notes_inside_a_stable_chord(self):
        sr = 8192
        t = np.arange(sr * 2) / sr
        audio = np.where(t < 1, np.sin(2 * np.pi * 261.6256 * t), np.sin(2 * np.pi * 329.6276 * t))
        bars = [{'start': 0, 'chord': ''}]
        analysis.attach_timed_chord_events(bars, audio, sr, 120, '4/4', [0, .5, 1, 1.5], np,
            common.normalize_analysis_options({'chord_timing': 'auto'}), 'piano', key='C')
        cells = [cell for event in bars[0]['chord_events'] for cell in event['debug']['cells']]
        self.assertEqual(cells[0]['evidence']['spectrum']['peaks'][0]['note'], 'C4')
        self.assertEqual(cells[-1]['evidence']['spectrum']['peaks'][0]['note'], 'E4')
        self.assertEqual(len(cells[0]['evidence']['spectrum']['frequencies_hz']), 192)

    def test_sustained_stability_recovers_a_rolled_piano_voicing(self):
        sr = 8192
        t = np.arange(sr * 4) / sr
        audio = np.zeros_like(t)
        # Rotate the voicing twice per beat; no short cell contains every tone.
        notes = [60, 64, 67, 71, 74, 67, 64, 71]
        for index in range(16):
            mask = (t >= index * .25) & (t < (index + 1) * .25)
            frequency = 440 * 2 ** ((notes[index % len(notes)] - 69) / 12)
            audio[mask] = np.sin(2 * np.pi * frequency * t[mask])
        options = common.normalize_analysis_options({'chord_timing': 'auto', 'chord_grid': 'beat', 'chord_stability': 'sustained'})
        bars = [{'start': 0, 'chord': ''}, {'start': 2, 'chord': ''}]
        analysis.attach_timed_chord_events(bars, audio, sr, 120, '4/4', list(np.arange(0, 4, .5)), np, options, 'piano', key='C')
        self.assertEqual([event['chord'] for bar in bars for event in bar['chord_events']], ['Cmaj9', 'Cmaj9'])

    def test_sustained_stability_keeps_clear_changes_without_a_bass_stem(self):
        sr = 8192
        t = np.arange(sr * 2) / sr
        audio = np.zeros_like(t)
        for start, end, notes in [(0, 1, [261.63, 329.63, 392]), (1, 2, [196, 246.94, 293.66])]:
            mask = (t >= start) & (t < end)
            audio[mask] = sum(np.sin(2 * np.pi * note * t[mask]) for note in notes)
        options = common.normalize_analysis_options({'chord_timing': 'auto', 'chord_stability': 'sustained'})
        bars = [{'start': 0, 'chord': ''}]
        analysis.attach_timed_chord_events(bars, audio, sr, 120, '4/4', [0, .5, 1, 1.5], np, options, 'piano', key='C')
        self.assertEqual([(event['start'], event['end'], event['chord']) for event in bars[0]['chord_events']], [(0, 1, 'C'), (1, 2, 'G')])

    def test_stability_consolidates_uncertain_voicings_but_keeps_clear_bass_changes(self):
        cells = []
        for index, symbol in enumerate(['Fmaj9', 'Dm11', 'Dm11', 'Fmaj9']):
            chroma = np.zeros(12); chroma[[5, 9, 0, 4, 7]] = .2
            cells.append({'start': index * .5, 'end': (index + 1) * .5, 'chord': symbol, '_chroma': chroma,
                          '_ranked': [{'chord': symbol, 'raw_score': 3.1}, {'chord': 'Fmaj9' if symbol != 'Fmaj9' else 'Dm11', 'raw_score': 2.9}]})
        timing.stabilize_chord_cells(cells, np, {'chord_stability': 'sustained', 'beat_period': .5, 'beats_per_bar': 4})
        self.assertEqual([cell['chord'] for cell in cells], ['Fmaj9'] * 4)
        self.assertEqual(cells[1]['detected_chord'], 'Dm11')
        for index, cell in enumerate(cells):
            cell['chord'] = 'C' if index < 2 else 'G'
            cell['_ranked'] = [{'chord': cell['chord'], 'raw_score': 4}, {'chord': 'G' if index < 2 else 'C', 'raw_score': 3.8}]
            cell['bass_reference'] = {'pitch_class': 0 if index < 2 else 7, 'confidence': .95}
        timing.stabilize_chord_cells(cells, np, {'chord_stability': 'sustained', 'beat_period': .5, 'beats_per_bar': 4})
        self.assertEqual([cell['chord'] for cell in cells], ['C', 'C', 'G', 'G'])

    def test_refinement_can_find_changes_late_in_a_mixed_cell(self):
        sr = 8192
        t = np.arange(sr) / sr
        audio = np.where(t < .81, np.sin(2 * np.pi * 65.406 * t), np.sin(2 * np.pi * 87.307 * t))
        cells = [{'start': 0, 'end': .5, 'bass_reference': {'pitch_class': 0, 'confidence': .95}},
                 {'start': .5, 'end': 1, 'bass_reference': {'pitch_class': 5, 'confidence': .95}}]
        self.assertTrue(analysis.refine_cell_bass_boundaries(cells, audio, sr, np))
        self.assertAlmostEqual(cells[0]['end'], .81, delta=.05)
        self.assertEqual(cells[0]['end'], cells[1]['start'])
        cells = [{'start': 0, 'end': .5, 'bass_reference': {'pitch_class': 0, 'confidence': .2}},
                 {'start': .5, 'end': 1, 'bass_reference': {'pitch_class': 5, 'confidence': .2}}]
        self.assertFalse(analysis.refine_cell_bass_boundaries(cells, audio, sr, np))
        self.assertEqual(cells[0]['end'], .5)

    def test_millisecond_rounding_does_not_create_zero_length_tail_events(self):
        bounds = timing.analysis_cell_bounds(0, 2.00001, [0, .5, 1, 1.5, 2], 'beat', 4, 120)
        self.assertEqual(bounds[-1], (1.5, 2.00001))
        self.assertTrue(all(round(end, 3) > round(start, 3) for start, end in bounds))

    def test_auto_refines_off_grid_root_changes_and_keeps_brief_passing_chords(self):
        sr = 8192
        t = np.arange(sr * 2) / sr
        other, bass = np.zeros_like(t), np.zeros_like(t)
        for start, end, root in [(0, .62, 0), (.62, .96, 5), (.96, 2, 0)]:
            mask = (t >= start) & (t < end)
            other[mask] = sum(.2 * np.sin(2 * np.pi * (440 * 2 ** ((60 + root + n - 69) / 12)) * t[mask]) for n in [4, 7, 11])
            bass[mask] = np.sin(2 * np.pi * (440 * 2 ** ((36 + root - 69) / 12)) * t[mask])
        bars = [{'start': 0, 'chord': 'C'}]
        options = common.normalize_analysis_options({'chord_timing': 'auto', 'chord_grid': 'beat'})
        analysis.attach_timed_chord_events(bars, other, sr, 120, '4/4', [0, .5, 1, 1.5], np, options, 'other', bass, sr, 'C')
        events = bars[0]['chord_events']
        self.assertEqual([event['chord'] for event in events], ['Cmaj7', 'Fmaj7', 'Cmaj7'])
        self.assertAlmostEqual(events[1]['start'], .62, delta=.05)
        self.assertAlmostEqual(events[1]['end'], .96, delta=.05)
        self.assertEqual(events[0]['start'], 0); self.assertEqual(events[-1]['end'], 2)
        for left, right in zip(events, events[1:]): self.assertEqual(left['end'], right['start'])
        fixed = [{'start': 0, 'chord': 'C'}]
        options['chord_timing'] = 'fixed'
        analysis.attach_timed_chord_events(fixed, other, sr, 120, '4/4', [0, .5, 1, 1.5], np, options, 'other', bass, sr, 'C')
        self.assertEqual([(event['start'], event['end']) for event in fixed[0]['chord_events']], [(0, .5), (.5, 1), (1, 1.5), (1.5, 2)])

    def test_timing_options_are_normalized_and_cache_distinctly(self):
        base = common.normalize_analysis_options({})
        self.assertEqual(base["chord_timing"], "auto")
        self.assertEqual(base["chord_grid"], "beat")
        self.assertEqual(base['chord_stability'], 'detailed')
        self.assertEqual(common.normalize_analysis_options({'chord_stability': 'invalid'})['chord_stability'], 'detailed')
        self.assertNotEqual(common.options_cache_suffix(base), common.options_cache_suffix(common.normalize_analysis_options({'chord_stability': 'sustained'})))
        self.assertNotEqual(common.options_cache_suffix(base), common.options_cache_suffix(common.normalize_analysis_options({"chord_grid": "half_beat"})))
        self.assertEqual(common.normalize_analysis_options({"chord_timing": "broken", "chord_grid": "fine"})["chord_timing"], "auto")

    def test_legacy_key_chroma_ignores_the_remembered_fine_grid(self):
        audio = np.zeros(16000, dtype=np.float32)
        c_chroma = np.zeros(12); c_chroma[0] = 1
        g_chroma = np.zeros(12); g_chroma[7] = 1
        bars = [{"start": 0, "_chroma": c_chroma}, {"start": 1, "_chroma": g_chroma}]
        legacy_beat = analysis.duration_weighted_cell_chroma(audio, 8000, bars, 120, "4/4", [], np,
            common.normalize_analysis_options({"chord_timing": "legacy", "chord_grid": "beat"}))
        legacy_half_beat = analysis.duration_weighted_cell_chroma(audio, 8000, bars, 120, "4/4", [], np,
            common.normalize_analysis_options({"chord_timing": "legacy", "chord_grid": "half_beat"}))
        expected = c_chroma + g_chroma
        np.testing.assert_allclose(legacy_beat, expected)
        np.testing.assert_allclose(legacy_half_beat, expected)

    def test_analysis_grid_builds_half_bar_beat_and_half_beat_cells(self):
        self.assertEqual(timing.analysis_cell_bounds(0, 2, [], "half_bar", 4, 120), [(0, 1), (1, 2)])
        self.assertEqual(timing.analysis_cell_bounds(0, 2, [], "beat", 4, 120), [(0, .5), (.5, 1), (1, 1.5), (1.5, 2)])
        self.assertEqual(timing.analysis_cell_bounds(0, 2, [], "half_beat", 4, 120), [(0, .25), (.25, .5), (.5, .75), (.75, 1), (1, 1.25), (1.25, 1.5), (1.5, 1.75), (1.75, 2)])

    def test_actual_irregular_beats_are_used_and_duplicate_beats_ignored(self):
        self.assertEqual(timing.analysis_cell_bounds(0, 2, [0, .48, .48, 1.03, 1.51, 2.2], "beat", 4, 120), [(0, .48), (.48, 1.03), (1.03, 1.51), (1.51, 2)])
        self.assertEqual(timing.analysis_cell_bounds(0, 2, [0, .4, .9, 1.5, 1.8], "half_bar", 4, 120), [(0, .9), (.9, 2)])

    def test_missing_beats_fall_back_and_partial_final_cell_is_clipped(self):
        self.assertEqual(timing.analysis_cell_bounds(0, 1.2, [4, 5], "beat", 4, 120), [(0, .5), (.5, 1), (1, 1.2)])

    def test_auto_merges_same_chord_and_only_suppresses_low_confidence_isolated_flicker(self):
        cells = [
            {"start": 0, "end": .5, "chord": "C", "confidence": .8, "alternatives": []},
            {"start": .5, "end": 1, "chord": "G", "confidence": .4, "alternatives": [{"chord": "G", "score": .9}, {"chord": "C", "score": .88}]},
            {"start": 1, "end": 1.5, "chord": "C", "confidence": .8, "alternatives": []},
            {"start": 1.5, "end": 2, "chord": "G", "confidence": .9, "alternatives": []},
        ]
        result = timing.group_chord_cells(cells)
        self.assertEqual([(item["start"], item["end"], item["chord"]) for item in result], [(0, 1.5, "C"), (1.5, 2, "G")])
        passing = timing.group_chord_cells([{"start": 0, "end": .5, "chord": "C", "confidence": .8}, {"start": .5, "end": 1, "chord": "G", "confidence": .8, "alternatives": [{"chord": "G", "score": .9}, {"chord": "C", "score": .6}]}, {"start": 1, "end": 1.5, "chord": "C", "confidence": .8}])
        self.assertEqual([item["chord"] for item in passing], ["C", "G", "C"])
        supported = [dict(cell) for cell in cells[:3]]
        for cell, pc in zip(supported, [0, 7, 0]):
            cell['bass_reference'] = {'pitch_class': pc, 'confidence': .95}
        self.assertEqual([item['chord'] for item in timing.group_chord_cells(supported)], ['C', 'G', 'C'])
        silence = timing.group_chord_cells([{"start": 0, "end": .5, "chord": "C", "confidence": .8}, {"start": .5, "end": 1, "chord": "N.C.", "confidence": .1, "alternatives": [{"chord": "C", "score": .95}]}, {"start": 1, "end": 1.5, "chord": "C", "confidence": .8}])
        self.assertEqual([item["chord"] for item in silence], ["C", "N.C.", "C"])

    def test_short_chroma_crop_does_not_read_samples_after_requested_end(self):
        sample_rate = 8000
        time = np.arange(4000) / sample_rate
        audio = np.sin(2 * np.pi * 261.63 * time).astype(np.float32)
        audio[1600:] = np.sin(2 * np.pi * 392.0 * time[1600:])
        crop = chords.chroma_for_segment(audio, sample_rate, 0, .2, np, {})
        reference = chords.chroma_for_segment(audio[:1600], sample_rate, 0, .2, np, {})
        np.testing.assert_allclose(crop, reference)

    def test_fixed_grid_attaches_two_supported_chords_inside_one_bar(self):
        sr = 8192
        t = np.arange(sr * 2) / sr
        audio = np.zeros_like(t, dtype=np.float32)
        for begin, finish, notes in [(0, 1, [261.63, 329.63, 392.0]), (1, 2, [196.0, 246.94, 392.0])]:
            mask = (t >= begin) & (t < finish)
            audio[mask] = sum(np.sin(2 * np.pi * note * t[mask]) for note in notes)
        options = common.normalize_analysis_options({"chord_timing": "fixed", "chord_grid": "half_bar", "chord_stability": "sustained"})
        bars = [{"start": 0, "chord": "C", "confidence": .5}]
        analysis.attach_timed_chord_events(bars, audio, sr, 120, "4/4", [0, .5, 1, 1.5], np, options, "synthetic", key="C")
        self.assertEqual([(event["start"], event["end"]) for event in bars[0]["chord_events"]], [(0, 1), (1, 2)])
        self.assertEqual([event["chord"] for event in bars[0]["chord_events"]], ["C", "G"])
        chart = {"tempo": 120, "time_signature": "4/4", "duration": 2, "beat_times": [0, .5, 1, 1.5], "bars": bars}
        self.assertIn("C", render_txt(chart)); self.assertIn("G", render_txt(chart))
        self.assertEqual(len(ET.fromstring(render_musicxml(chart)).findall("./part/measure/harmony")), 2)
        auto_bars = [{"start": 0, "chord": "C"}]
        auto_options = common.normalize_analysis_options({"chord_timing": "auto", "chord_grid": "half_bar"})
        analysis.attach_timed_chord_events(auto_bars, audio, sr, 120, "4/4", [0, .5, 1, 1.5], np, auto_options, "synthetic", key="C")
        self.assertEqual([event["chord"] for event in auto_bars[0]["chord_events"]], ["C", "G"])
        legacy_bars = [{"start": 0, "chord": "C"}]
        analysis.attach_timed_chord_events(legacy_bars, audio, sr, 120, "4/4", [0, .5, 1, 1.5], np, common.normalize_analysis_options({"chord_timing": "legacy"}), "synthetic", key="C")
        self.assertNotIn("chord_events", legacy_bars[0])

    def test_auto_keeps_sustained_chord_through_a_brief_moving_melody(self):
        sr = 8192
        t = np.arange(sr * 2) / sr
        audio = sum(np.sin(2 * np.pi * note * t) for note in [261.63, 329.63, 392.0]).astype(np.float32) * .5
        passing = (t >= .5) & (t < 1)
        audio[passing] += np.sin(2 * np.pi * 587.33 * t[passing]) * .35
        options = common.normalize_analysis_options({"chord_timing": "auto", "chord_grid": "beat"})
        bars = [{"start": 0, "chord": "C"}]
        analysis.attach_timed_chord_events(bars, audio, sr, 120, "4/4", [0, .5, 1, 1.5], np, options, "synthetic", key="C")
        self.assertEqual([(event["start"], event["end"], event["chord"]) for event in bars[0]["chord_events"]], [(0, 2, "C")])
        self.assertEqual([cell["detected_chord"] for cell in bars[0]["chord_events"][0]["debug"]["cells"]], ["C", "Cadd9", "C", "C"])

    def test_bass_stem_adds_supported_inversion_and_partial_silence_stays_nc(self):
        sr = 8192
        t = np.arange(sr * 2) / sr
        chords_audio = sum(np.sin(2 * np.pi * note * t) for note in [261.63, 329.63, 392.0]).astype(np.float32) * .25
        bass_audio = (np.sin(2 * np.pi * 82.41 * t) * .9).astype(np.float32)
        options = common.normalize_analysis_options({"chord_timing": "fixed", "chord_grid": "half_bar"})
        bars = [{"start": 0, "chord": "C"}]
        analysis.attach_timed_chord_events(bars, chords_audio, sr, 120, "4/4", [0, .5, 1, 1.5], np, options, "other", bass_audio, sr, "C")
        self.assertEqual([event["chord"] for event in bars[0]["chord_events"]], ["C/E", "C/E"])
        self.assertTrue(all(event["bass_reference"]["note"] == "E" for event in bars[0]["chord_events"]))

        silent_audio = np.zeros_like(t, dtype=np.float32)
        active = t >= 1
        silent_audio[active] = sum(np.sin(2 * np.pi * note * t[active]) for note in [261.63, 329.63, 392.0])
        silent_bars = [{"start": 0, "chord": "C"}]
        analysis.attach_timed_chord_events(silent_bars, silent_audio, sr, 120, "4/4", [0, .5, 1, 1.5], np, options, "synthetic", key="C")
        self.assertEqual([event["chord"] for event in silent_bars[0]["chord_events"]], ["N.C.", "C"])


if __name__ == "__main__":
    unittest.main()
