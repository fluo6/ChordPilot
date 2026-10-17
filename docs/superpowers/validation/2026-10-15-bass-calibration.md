# Gravity bass recalibration and phrase fingering

Reference: [BasscoverPete — John Mayer, Gravity bass cover / score / TAB](https://www.youtube.com/watch?v=JF-79DoNNOU). Reused the existing local recording and htdemucs Bass stem. No separation or song-specific pitch rules were added. Media, diagnostic scripts and full reports remain ignored under `.chordpilot-data/benchmarks/gravity/`.

## Checked results

The existing 35 sustained/interior bass checkpoints still match 35/35. Eleven additional passing-note interiors, read against the video's TAB and audio, improve from 7/11 to 11/11. The recovered pitches include D2 near 16.58 and 17.86 s, and A1 near 32.01 and 32.50 s. These are confident pitch interiors; detected starts/ends do not claim exact performance onsets.

Six checked rejection windows contain three extra baseline attacks (quiet G1 reentries near 14.73 and 26.28 s, and an Ab1 glide near 32.41 s). The calibrated track has zero extra attacks of those rejected pitches in those windows. Ringing G1 is joined to the existing held note, rather than scored as a new attack. A held note overlapping a rejection window is deliberately not counted as an extra attack. The reference fixture now records the passing points and rejection windows. These selected checks do **not** establish a perfect full-song transcription.

Full-song event count is diagnostic, not an accuracy score. The algorithm still may omit quiet legato notes, ambiguous attacks and very fast fills. Score rhythm remains estimated, and the 6/8 browser fixture uses manually aligned bars; automatic meter detection is not validated here.

## Shared detector changes

- Retain 120 ms periodicity frames at 20 ms hops; try an 80 ms window when the main frame is unvoiced. This recovers short notes otherwise mixed with both neighbours.
- For runs under 160 ms, reject excessive pitch movement. Use the middle 50% of frequencies when at least four frames exist, so an attack/release outlier cannot erase an otherwise stable note. Runs supported by fewer than three main frames and confidence below 90% require a core within 15 cents.
- Low-confidence short runs and rescue-only runs need direct fundamental support at least 30% of the strongest spectrum peak. A missing root may instead use second **and** third harmonics at that threshold, at least three pitch frames and at most 15 cents core spread. Existing missing-fundamental and upper-bleed checks remain.
- Retain the release-energy test, extended to runs under 160 ms. A stable, ordered passing pitch between two longer notes can survive without an independent attack transient; this preserves legato passing notes.
- When note RMS is below 10% of a confirmed note ending within 0.6 s, reject it as a new attack. A same-pitch return can extend the preceding held note. The eligibility anchor is the last confirmed core end, **not** the extended tail end, so ringing cannot renew the limit indefinitely.
- Advance timing cache to `sub-bar-v8` and Local Study to `local-study-v15`. Reanalyse Chords refreshes from existing stems.

## Score and fingering

The score switches from a sixteenth grid to thirty-seconds when a confirmed note of at least 39 ms would otherwise collapse. It reserves room for subsequent confirmed notes, including the last note of a fill. Dense phrases can increase capacity further, up to 1/128. Each voice still fills the meter exactly. This preserves recognized pitches; it is not a claim of exact rhythmic transcription or swing/triplet support.

Fingering uses a small dynamic program over measured notes, favouring modest fret positions, small hand shifts and nearby strings. It plans the complete merged phrase before clipping into bars, so a tied note keeps its string and fret. The opening G1 → D2 → G2 corresponds to E-string fret 3 → A-string fret 5 → D-string fret 5, matching the reference approach. This remains a suggestion rather than inferred proof of where the performer played. Fretboard markers and current highlighting use the chosen string/fret, and both four/five-string tunings are supported.

Browser QA checked the recovered D2 → C#2 as A-string frets 5 → 4, current-note colouring, four/five-string consistency and the actual engraved short notes, without console warnings/errors. Screenshot: `.chordpilot-data/benchmarks/gravity/bass-calibrated-preview.png`.

## Regressions

Gravity chord reference remains 11/16 roots and 8/16 functions; Overjoyed local reference remains 18/21 roots and 12/21 functions. Waste Of Time's Abmaj9, Eb7#9 and Eb9sus4 and Ballad's C13 still match with tail reduction off and at 20%; Ballad bars 5–8 remain Fmaj9. The existing related-minor/inversion naming limitations remain.

Synthetic regressions cover short loud notes, short missing fundamentals, ringing continuity without repeated attacks, bounded tail continuation, noise, overtones, release glides, fresh chromatic attacks, octave jumps, rests and crops. JS regressions cover human-oriented fingering, cross-bar consistency, adaptive rhythmic grids, dense fill capacity, aligned score/TAB and legacy sessions.

Reproduce audio checks with `scripts/testing/chord-reference-benchmark.py` using the existing Gravity stems and `tests/fixtures/chord-references/gravity.json`. The resulting report includes bass passing-note scores and rejected attack windows. Prior isolated attack/highlight checkpoints remain separate from note interiors, without relabelling abstentions as successes.

Final verification: 155 Python tests passed; 294 JavaScript tests passed with the two established Windows/environment cases excluded (`environment defaults parse without starting the HTTP server` and `smoke CLI preserves its primary error and attempts directory cleanup when WAV removal fails`). Independent review confirmed the cross-bar, bounded-tail and dense-capacity fixes; native 6/8 voice durations remain exact with 25 and 50 note probes. Syntax and whitespace checks pass.
