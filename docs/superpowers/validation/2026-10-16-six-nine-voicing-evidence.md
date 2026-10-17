# Sixth/ninth voicing recognition

## Reproduction and cause

Hero reference, 13.8–16.0 s, key E, General evidence settings, existing Other/Bass stems. Local Study returned E9 while the checked video label is D6/9. The measured accompaniment has D3, F#4, B4 and E4. Its pitch-class strengths are D .165, F# .137, B .250, E .235, with A only .033. The independent bass tracker abstains on the whole selection; it does not supply an E root.

The D root and defining third, sixth and ninth were already present. D6/9 was penalized for its quiet perfect fifth, while E9 won despite a weak G# third. This is a candidate-scoring error, rather than a new overtone-filter or note-extraction fix.

## Change

For major and minor 6/9 candidates only, waive the missing-perfect-fifth requirement when:

- Root, third, sixth and ninth each have at least .06 normalized **measured accompaniment** strength, before any bass blend.
- Perfect fifth has less than .045 normalized **combined** strength, matching the existing essential-tone threshold.

The fifth remains in the chord formula and coverage calculation. A present fifth retains all previous positive scoring credit. Missing defining notes still receive the established penalties; bass blending cannot manufacture the evidence required for this exception. No song IDs, key-specific weights, or new settings are used. The shared scoring function applies to Local Study and automatic analysis.

Allowing selected extended voicings to omit the fifth follows the broader voicing convention discussed in [Berklee's voice-leading lesson](https://online.berklee.edu/takenote/voice-leading-paradigms-for-harmony-in-music-composition/). The .06/.045 gates are implementation safeguards, not musical laws.

Local Study cache version is `local-study-v18`; analysis timing version is `sub-bar-v12`. Existing saved predictions require reanalysis.

## Actual recording results

Local windows use identical audio/options and A/B scoring, disabling only this exception for the baseline. Metrics are root / harmonic function / exact canonical symbol, respectively. These sampled windows do not establish whole-song accuracy.

| Reference | Windows | Before | After |
| --- | ---: | --- | --- |
| Hero | 20 | 16 / 10 / 8 | 17 / 11 / 9 |
| Virtual Insanity | 13 | 6 / 2 / 0 | 6 / 2 / 0 |
| Gravity | 16 | 12 / 10 / 3 | 12 / 10 / 3 |
| Overjoyed | 21 | 18 / 12 / 2 | 18 / 12 / 2 |
| September | 13 | 5 / 1 / 0 | 5 / 1 / 0 |

Only Hero's target window changes in these 83 local comparisons: E9 → D6/9. The other four recordings' predicted symbols are unchanged.

The actual 95-second Hero automatic timeline was checked at 60–90 BPM, estimating 62 BPM in both runs. Across the 20 selected reference windows, duration-weighted root agreement rises from 86.97% to 91.69%, function from 60.32% to 65.04%, and exact agreement from 50.79% to 55.51%. The D6/9 target's 2.2 seconds now have full exact overlap, previously .968 seconds. This checks interior chord coverage; it does not establish exact onset/offset accuracy against the approximate video highlights.

Short isolated selections expose a remaining limitation: 13.8–14.3, 14.3–14.8 and 14.8–15.3 s now return D6/9, but 15.3–16.0 alone still returns Bsus4 as D fades. Timeline context maintains D6/9 through the checked window.

## Verification

- Test first: the recorded chroma vector returned the wrong ninth chord in all 12 transpositions before the fix, then passed.
- Major/minor omitted-fifth 6/9 cases in all keys; missing root/third/sixth/ninth cannot activate the waiver, even with a strong bass reference.
- The first implementation incorrectly removed positive credit for a strong fifth, causing Gravity regressions. Independent review identified the same issue. Added a failing strong-fifth test, then restricted the waiver to the weak-fifth threshold above. Final Gravity symbols are all preserved.
- Full Python suite: 171 tests pass. Frontend timing-settings and study-model suites: 11 tests pass. Whitespace check passes.
- Earlier actual-audio checks preserve Waste Of Time's Abmaj9, Eb7#9 and Eb9sus4, plus Ballad's C13, with tail reduction 0 and 20%. Ballad bars 5–8 remain Fmaj9.

Ignored diagnostic scripts/reports: `.chordpilot-data/benchmarks/diagnose-six-nine.py`, `six-nine-regressions.py`, `six-nine-regressions.json`, `six-nine-timeline.py`, and `hero/six-nine-timeline.json`.
