# Root and added-extension evidence

Focused REC-01 improvement, 16 October 2026. This supersedes the opening-chord result in the [bass-noise report](2026-10-16-bass-noise-reference.md), while retaining that noise calibration.

The later [fading-root fix](2026-10-16-fading-root-evidence.md) removes the Hero timing-edge regression recorded below. The 83 local-window results remain unchanged.

## Cause and change

Virtual Insanity, 0.3–1.1 s, existing Bass/Other stems, known key E♭ minor, overtone weighting 50%, tail reduction off:

- After false G1 bass guidance was removed, the accompaniment ranked F♯maj13 first. Its strong B♭ and D♭ and larger pitch-class set outweighed E♭ minor's weaker root.
- Measured normalized E♭ energy was 8.71%, F♯ 11.71%, B♭ 24.33%, D♭ 18.33%, F 6.49% and A♭ 4.66%. A♭ barely passed the old 4.5% extension threshold, allowing larger relative chords to absorb diffuse energy.
- A separate later G♭-major passage at 17.8–18.6 s had E♭ energy only 5.08%. Tightening extension evidence alone changed that passage to a wrong relative-minor root. This regression was reproduced before the final change.

The shared scorer now uses its existing **5.5% active-note threshold** for proposed roots. Confirmed low-note guidance remains part of that combined evidence, so an accompaniment need not itself play the root. Guidance can come from separated bass or the established fallback's retained, tuned low accompaniment pitch; it is not always an independent stem. Other essential tones retain their existing 4.5% threshold.

Added extensions with formula intervals of 12 semitones or more need measured accompaniment support of at least 5.5%, or low-note guidance at that pitch with confidence at least .62. They must also retain the existing 4.5% combined-evidence support. Unsupported tones receive the existing .35 score penalty. Sixth and seventh thresholds remain unchanged, as do the measured-guide-tone exceptions for fifthless 13th and sixth/ninth voicings. These percentages are normalized pitch-class energy shares, not dB or probabilities.

A blanket 6% extension threshold was rejected because it worsened checked functions in other references. The final rule requires both measured and combined support rather than letting one replace the other. No new tonic preference, song-specific rule, fundamental estimator or rootless-voicing inference was added.

Versions: `sub-bar-v15`, `local-study-v21`. Both timeline and Local Study use the shared scorer. Reanalyse Chords can reuse existing stems. Existing saved analyses remain snapshots until reanalysed.

## Actual recording results

All 83 Local Study windows were reanalysed from the existing source audio and cached stems using each fixture's settings. Baseline is the latest REC-02 run, not the older false-G1 result.

| Reference | Windows | Root before → after | Function before → after | Exact before → after |
| --- | ---: | --- | --- | --- |
| Hero | 20 | 17 → 17 | 11 → 11 | 9 → 9 |
| Virtual Insanity | 13 | 5 → 7 | 2 → 3 | 0 → 0 |
| Gravity | 16 | 12 → 12 | 10 → 10 | 3 → 3 |
| Overjoyed | 21 | 18 → 19 | 12 → 13 | 2 → 2 |
| September | 13 | 5 → 5 | 1 → 1 | 0 → 0 |

Only five predictions change; the other 78 are identical. No checked window loses root, function or exact-symbol agreement.

| Passage | Reference | Before | After |
| --- | --- | --- | --- |
| Virtual Insanity 0.3–1.1 s | Ebm | F#maj13 | Ebm9 |
| Virtual Insanity 13.3–14.7 s | Ebm7 | F#13/Eb | Ebm9 |
| Virtual Insanity 17.8–18.6 s | Gbmaj7 | F#maj13 | F#maj9 |
| Hero 39.2–40.4 s | B | B7b9 | B7 |
| Overjoyed 9.65–10.60 s | Bmaj7 | C#13/B | Bmaj7#11 |

The opening's minor root is recovered, but **Ebm9 is not an exact match to the printed Ebm label**. Added ninths/alterations in these passages remain unverified. Hero's B7 still has an unwanted seventh against the reference. The function metric compares root, third, seventh and suspension; it does not establish exact extensions or inversions.

Prior checks also retain Waste Of Time's Abmaj9 (0.260–1.489 s), Eb7#9 (56.260–57.260 s) and Eb9sus4 (94.624–95.541 s), and Ballad's C13 (3.410–4.870 s), with tail reduction both off and at 20%. Ballad timeline bars 5–8 remain Fmaj9. Hero's 13.8–16.0 s Local Study still returns D6/9.

### Timeline tradeoff

Hero's full 95-second automatic analysis was also rerun with BPM bounds 60–90 and the fixture's other settings. Tempo remains 62 BPM, and D6/9 covers the entire checked 13.8–16.0 s interval. An immediate-before scorer run through the same pipeline isolates this change's effects:

| Duration-weighted agreement on selected Hero windows | Before | After |
| --- | ---: | ---: |
| Root | 91.69% | 91.35% |
| Function | 65.04% | 64.70% |
| Exact | 55.51% | 55.17% |

The entire decrease is a **0.089 s overlap** at the end of the reference's 18–20 s C#m7 window. The event beginning at 19.911 s changes from C#m7 to Bsus4. This is a timing-edge regression against the fixture even though the broader Local Study window still returns C#m7. The video-highlight timing is approximate; the performed transition needs inspection before claiming this boundary is right or wrong. Fading-root context remains REC-03 rather than adding another threshold exception to conceal the tradeoff. Reports: `root-extension-timeline.json` and `root-extension-timeline-before.json`, with corresponding scripts/logs in the benchmark directory.

## Verification and remaining limits

- Regression tests first failed on the frozen opening evidence and the later major passage, then passed in all 12 transpositions. Other tests retain clear ninths when bass blending dilutes them and allow a confirmed extension bass while rejecting weak bass guidance.
- Independent scoped code review found no blocking issues and separately checked C9/D from C–E–G–B♭ accompaniment plus D bass. That case and its weak-bass counterpart are now regression tests.
- Full Python suite: 188 tests pass. Focused study-model, timing-settings and bass-view JavaScript suites: 22 tests pass. Whitespace checks pass. No browser/layout change is included.
- Actual audio diagnostics: `.chordpilot-data/benchmarks/root-extension-reference.py` and its JSON/log, plus `root-extension-prior.log`. Portable reference windows/settings are in `tests/fixtures/chord-references/`; the reusable runner remains `scripts/testing/chord-reference-benchmark.py`.

This is a conservative ranking heuristic, not a solution to missing fundamentals or overtone separation. A weak real root may still be penalized without independent evidence; diffuse energy can exceed the threshold; relative chords can share pitch classes. Whole-song accuracy, exact change boundaries, meter and confidence calibration remain open in TODO.md. Rootless voicing work remains deferred.
