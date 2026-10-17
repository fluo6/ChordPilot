# Fading-root protection against a conflicting third

Focused follow-up to REC-01/REC-03, 16 October 2026. Versions: `sub-bar-v18`, `local-study-v24`. Builds on the [registered half-diminished check](2026-10-16-half-diminished-evidence.md).

## Diagnosis

The original Virtual Insanity 19.1–19.8 s reference selection is not a clean chord interior. A 350 ms sliding-window probe finds earlier G♭/G♭maj7 evidence at its beginning; the measured C/E♭/G♭/B♭ accompaniment becomes clearer later. Existing local video frames at 19.1 and 19.6 s both show the Cm7b5 highlight. The highlight alone does not establish the accompaniment's exact audio onset, particularly with staggered bass and piano attacks. The original reference window and its failing result remain in the corpus; shifting a test window must not be counted as an algorithm gain.

A separate, reproducible algorithm defect affects the later 19.6–20.3 and 19.6–20.5 s selections. Normal ranking already chooses Cm7b5. The early-evidence rule instead adds 0.45 raw score units to C7#11, overriding that correct choice. The early root's power really falls, but that does not establish that its earlier chord quality should persist.

In those selections, measured E♭ chroma is 7.97% and 8.41%; E natural is 6.20% and 6.58%. E♭4's retained MIDI strength is only 5.3% / 5.4%, below the old 6% strong-MIDI conflict check. Pitch-class strength and retained MIDI strength have different normalization and must not be treated as interchangeable. The rule therefore overlooks conflicting minor-third evidence and retains the earlier dominant-looking interpretation. An upper E peak is compatible with C-root harmonics, but the change does not attempt to prove or remove that harmonic relationship.

## Shared fix

Before granting fading-root credit, inspect the measured chroma for the opposite major/minor third. If that pitch reaches 6% and is outside the proposed chord's formula, abstain from the credit. Preserve eligibility when the formula contains both thirds, such as 7#9. This is a conservative veto, not a new chord bonus or a forced m7b5 template.

The check lives in `fading_chord_hint`, shared by Local Study and Auto timeline analysis. All earlier root-decay, retained-note, guide-tone, score-gap and low-note constraints remain. Fixed/legacy timing does not gain temporal inference. Raw chroma, MIDI notes, spectra and crop boundaries are unchanged. No settings defaults or new dependencies were introduced.

## Actual recording checks

Known key Ebm; Other + Bass from the existing separated stems; 50% overtone weighting, no tail reduction. Paired runs remove only this veto for the before case.

| Local selection | Before | After |
| --- | --- | --- |
| 19.1–19.8 s, original mixed transition | Bb13 | Bb13 (unresolved) |
| 19.35–20.006 s, near the automatic beat cell | C7#11 | C7#11 (unresolved) |
| 19.6–20.3 s | C7#11 | Cm7b5 |
| 19.6–20.5 s | C7#11 | Cm7b5 |
| 19.7–20.4 s, already-correct control | Cm7b5 | Cm7b5 |
| 6.1–6.8 s, previous corrected passage | Cm7b5 | Cm7b5 |

The two corrected overlapping selections concern one passage; they are not two independent song-accuracy samples. Original 83-window corpus results remain unchanged. In particular, the original second Cm7b5 window still fails.

The paired first-23-second Auto timeline uses 92 BPM, the existing Drums beat grid, detailed stability and known Ebm. Both beat and half-beat event sequences remain unchanged by this guard. Beat mode returns C7#11 at 19.354–20.006 s, then Cm7b5 at 20.006–20.659 s. Half-beat mode returns Cadd9 at 19.354–19.680 s and Cm7b5 at 19.680–20.659 s. It catches the later chord earlier, but across all 13 original selected windows, root/function/exact overlap is worse overall:

| Grid | Root | Function | Exact |
| --- | ---: | ---: | ---: |
| Beat | 60.03% | 34.09% | 11.46% |
| Half beat | 50.69% | 31.66% | 8.27% |

Therefore the default grid is unchanged. This fix does not solve attack-aware timing, distinguish every independent upper note from a partial, or establish exact performed chord boundaries. Current near-onset errors still require broader temporal evidence work rather than more permissive chord credit.

## Verification and reproduction

- Portable measured evidence: `tests/fixtures/chord-evidence/fading-third-conflict.json`. The test in `test_fading_roots.py` fails 24 transposed subcases before the veto and passes after it. Earlier Hero fading-root cases remain covered in all 12 keys.
- All 83 established local reference predictions are unchanged: Hero 17/20 roots, 11/20 functions, 9/20 exact; Virtual Insanity 7/13, 4/13, 1/13; Gravity 12/16, 10/16, 3/16; Overjoyed 19/21, 13/21, 2/21; September 5/13, 1/13, 0/13. These are selected-window results, not whole-song accuracy.
- Hero's full 95-second timeline retains 62 BPM and identical published chord events: 91.69% selected-window root overlap, 65.04% function and 55.51% exact. D6/9 still covers the checked 13.8–16.0 s window. Waste Of Time Abmaj9/Eb7#9/Eb9sus4 and Ballad C13 still pass with tail reduction off and at 20%; Ballad bars 5–8 remain Fmaj9.
- Full Python suite: **197 tests pass**. JS suite: **310 pass with two established environment exclusions** (`environment defaults parse without starting the HTTP server`; `smoke CLI preserves its primary error and attempts directory cleanup when WAV removal fails`). Logs: `fading-third-conflict-python.log`, `fading-third-conflict-js.log`. Scientific Python and JS temporary-file operations run outside the restrictive filesystem sandbox.
- Independent scoped review found no actionable correctness issues; additional read-only probes confirmed reverse major/minor conflicts abstain and 7#9 can retain its fading hint. No browser/layout QA was performed; the Help change is explanatory text only. `git diff --check` passes.
- Actual-audio diagnostic scripts/reports: `.chordpilot-data/benchmarks/fading-third-conflict-{validation,targets,timeline,reference,hero-timeline,prior}.*`, plus `second-half-diminished-probe.*`. Before/after uses the same media, features, ranking and settings; only this veto differs. Local media stays outside portable fixtures.
- Reanalyse Chords can reuse stems; Analyze Selection refreshes a Local Study. Existing saved analyses remain snapshots.

The 6% threshold is a heuristic on normalized measured pitch classes, not a probability or absolute loudness threshold. Reverb, melody and harmonic leakage can make it abstain on a valid sustained chord; that is preferable to granting unwarranted persistence credit. It does not improve the underlying note extractor or infer rootless voicings.
