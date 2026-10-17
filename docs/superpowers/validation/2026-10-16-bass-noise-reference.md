# Recording-level bass noise reference

Completed REC-02's reproducible local-selection noise-gate discrepancy on 16 October 2026. This does not establish general separation-artifact rejection or solve Virtual Insanity's opening chord.

The subsequent [root/extension evidence fix](2026-10-16-root-extension-evidence.md) restores the opening's minor root and supersedes the chord totals below. This report retains the noise-calibration baseline.

## Reproduction and cause

Virtual Insanity, 0.3–1.1 s, existing htdemucs Bass/Other stems:

- Bass RMS: approximately .00011175; Other RMS: approximately .00257191.
- A 49.93 Hz component supplies about 88% of the Bass spectrum's power near the selected window. Local tracking returned G1 with .965 periodicity confidence.
- Whole-recording tracking already rejected it. Local tracking reset the adaptive noise threshold using only the quiet crop, so the same background component became eligible for pitch tracking.

The tone is a suspect background/separation component; its electrical or acoustic cause has not been established. No pitch blacklist, 50 Hz notch, tuning cutoff, or song-specific rule was added.

## Shared fix

`bass_noise_floor` measures 120 ms RMS blocks in the bass tracker's resampled analysis bandwidth. The established threshold remains:

    max(0.0001, 0.005 × recording 95th-percentile block RMS)

The factor is an amplitude ratio, not a chord-mixing weight. Local selections inherit this recording-level calibration. Pitch estimation still reads only the requested crop. Local Study passes the calibration through its cropped-source analysis and stores the scalar in input fingerprints and `source_evidence.bass.noise_gate` alongside selected RMS.

The threshold applies to individual tracking frames, rather than the entire selection's average. A brief valid note separated by rests can therefore survive. Calibration uses the same analysis bandwidth in whole-track and local paths, so high-frequency bleed cannot raise only the local threshold.

Bass-only studies with no verified fundamental return N.C. with zero confidence and no detected MIDI notes; the original source spectrum remains available. Combined studies continue using measured accompaniment evidence when bass guidance is unavailable. Chord formulas, scoring, key rules and preset defaults are unchanged.

Cache versions advance to `sub-bar-v14` and `local-study-v20`. Reanalyse Chords reuses available stems; existing Local Study runs remain historical snapshots until Analyze Selection is run again.

## Actual recording checks

The target's G1 bass reference is now absent. Its Local Study chord changes from Eb7#9/G to F#maj13, **still incorrect against the expected Ebm**. The prior root match was accompanied by the false G bass and wrong chord quality. Removing that evidence is not a claim of improved root accuracy.

| Reference | Windows | Root before → after | Function before → after | Exact before → after |
| --- | ---: | --- | --- | --- |
| Hero | 20 | 17 → 17 | 11 → 11 | 9 → 9 |
| Virtual Insanity | 13 | 6 → 5 | 2 → 2 | 0 → 0 |
| Gravity | 16 | 12 → 12 | 10 → 10 | 3 → 3 |
| Overjoyed | 21 | 18 → 18 | 12 → 12 | 2 → 2 |
| September | 13 | 5 → 5 | 1 → 1 | 0 → 0 |

Only the target changes in these 83 local windows. These selected comparisons do not establish whole-song accuracy or verify exact boundaries.

Gravity retains 35/35 sustained interiors and 11/11 passing-note interiors in the full bass track, with no extra rejected-pitch attacks in the six checked windows. Its local narrow-crop passing checks remain 9/11, with one wrong and one unvoiced; attack-boundary checks remain imperfect. September retains 33/33 sustained bass interiors, and its checked rejected-slide attacks remain absent. The separate ambiguous score-guide checkpoint remains wrong. These limitations are unchanged, rather than hidden by the successful interior totals.

Waste Of Time's Abmaj9, Eb7#9 and Eb9sus4 regressions and Ballad's C13 still pass with tail reduction 0 and 20%; Ballad bars 5–8 remain Fmaj9. Hero's D6/9 local window is preserved.

## Verification and remaining work

- New tests first reproduced local false G1 acceptance and Local Study guidance. They now pass alongside quiet-note, missing-fundamental and audible near-50 Hz cases.
- Review reproduced a brief-note-plus-rest failure in an initial selection-average gate. A failing regression was added; restoring per-frame gating fixed it in Bass-only and Bass+Other studies.
- Review also reproduced a bandwidth mismatch using strong 6 kHz bleed outside a quiet bass selection. Calibration now uses the tracker's analysis bandwidth, and the regression preserves G1 in whole and local tracking.
- Full Python suite: 183 tests pass. Focused study-model, timing-settings and bass-view JavaScript suites: 22 tests pass. Whitespace checks pass.
- Actual audio reports/scripts are under `.chordpilot-data/benchmarks/`: `bass-noise-diagnosis.py`, `noise-reference-probe.py`, `noise-bass-references.py` and their JSON/log outputs.

The gate is an amplitude heuristic: very faint real notes below it can still be omitted, and artifacts above it can still pass. It does not independently establish musical relevance. REC-01 retains the wrong opening harmony/root; BAS-01 retains quiet-note, attack/release and broader noise validation work. Rootless voicing work remains deferred.
