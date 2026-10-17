# Early chord evidence for fading roots

Focused REC-03 improvement, 16 October 2026. Builds on the [root/extension evidence fix](2026-10-16-root-extension-evidence.md). Remaining onset and boundary work stays open.

## Measured failures

Hero's 15.3–16.0 s Local Study returned Bsus4 while the broader 13.8–16.0 s passage correctly returned D6/9. The late selection retains D3, but E4/F♯4/B4 dominate. The first 250 ms still ranks D6/9 with a clear lead. D3's retained strength falls from .161 in that early window to .046 in the whole selection.

The automatic cell at 19.911–20.879 s similarly switched to Bsus4; its isolated Local Study returned the equivalent Esus2. Its early 250 ms still ranks C#m7, and C♯3's retained strength falls from .140 to .027. E and B persist; F♯ is diffuse chroma rather than a retained strong pitch. Both cases are compatible with a fading root rather than sufficient evidence for a new harmony.

Previously extracted score frames show D6/9 and C#m7 in these passages. Highlight timing is approximate and can lag the performed audio; these observations do not establish exact physical onsets.

## Shared rule

Auto timing and Local Study inspect the **first and last 250 ms inside intervals of 0.5–2 seconds**. No outside-selection notes or new context fingerprints are introduced. Shorter cells and longer selections keep their existing ranking; fixed-grid timing is unchanged.

The early window uses the existing chroma, retained pitches, overtone weighting and low-accompaniment guidance. Its candidate must:

- Lead its nearest alternative by at least .12 raw score units and be within .45 of the whole-interval winner.
- Have a third and no slash bass. Its third and defining sixth/seventh, plus the ninth for 6/9, must each retain at least 6% of current normalized chroma.
- Contain every currently retained strong pitch class (strength at least .06). A new strong tone blocks retention.
- Retain the same root MIDI note: early strength at least .08, whole-interval strength at least .02, early strength at least 1.5 times the whole strength, both frequencies within 30 cents.
- Have late root power below 75% of early root power. Equal-length FFT windows are compared over three bins centered on the early measured frequency. Unequal-length window peaks are not directly comparable because their resolution changes the height.

Current low-note guidance at confidence .62 or above blocks this extra preference. A qualifying candidate receives .45 raw score units before relative confidence is recomputed. This is a ranking weight, not a probability, audio gain or bass-mix percentage.

Merged events weight that bonus by the fraction of original cell duration with accepted same-chord hints. Supporting early ranges remain in `evidence.fading_root`; individual cells retain their measured root-power ratios. Event alternatives and confidence retain the support too. Neither spectra nor detected MIDI notes are rewritten to match the chord.

The target root-power ratios are approximately **.6662 for D3** and **.0708 for C♯3**, comparing equal-length last/first windows. These are power ratios, not amplitude ratios.

## Actual recording checks

| Hero passage | Before | After |
| --- | --- | --- |
| Local Study 15.3–16.0 s | Bsus4 | D6/9 |
| Local Study 19.911–20.879 s | Esus2 | C#m7 |
| Automatic event 19.911–20.879 s | Bsus4 | C#m7 |

Hero's full 95-second automatic analysis remains at 62 BPM with bounds 60–90 and the reference fixture's other settings. D6/9 still covers the checked 13.8–16.0 s interval. The 0.089-second loss at the end of the checked 18–20 s C#m7 window is removed:

| Duration-weighted agreement on selected Hero windows | Before | After |
| --- | ---: | ---: |
| Root | 91.35% | 91.69% |
| Function | 64.70% | 65.04% |
| Exact | 55.17% | 55.51% |

All **83 established Local Study predictions remain identical** to the root-evidence baseline: Hero 17/20 roots, Virtual Insanity 7/13, Gravity 12/16, Overjoyed 19/21 and September 5/13. The two corrected narrow selections are additional diagnostics, not extra points silently added to that benchmark.

Waste Of Time's Abmaj9, Eb7#9 and Eb9sus4 and Ballad's C13 pass with tail reduction off and at 20%. Ballad's checked opening Gm9 → C13 change remains present and bars 5–8 remain Fmaj9. This does not validate every passing chord or song boundary.

## Verification and limits

- Portable measured evidence: `tests/fixtures/chord-evidence/fading-roots.json`. Both targets are tested in all 12 transpositions, with abstention for new tones, bass changes, missing/detuned roots, weak early support and nondecaying roots.
- Synthetic audio tests cover extraction at overtone weighting 0 and 50%, duration limits, and publication of single-cell and merged events. Review reproduced stale event alternatives/confidence after merging; regression tests captured that failure, and duration-weighted support fixes it.
- Full Python suite: 192 tests pass. Focused study-model, timing-settings and bass-view JS suites: 22 tests pass. Independent scoped review has no remaining important findings.
- Actual diagnostics: `.chordpilot-data/benchmarks/fading-root-reference.*`, `fading-root-timeline.*`, `fading-root-prior.log` and `fading-root-diagnosis.*`. Media remains local; the portable fixture contains derived evidence only.

Versions: `sub-bar-v16`, `local-study-v22`. Reanalyse Chords reuses available stems; Analyze Selection refreshes Local Study. Saved analyses remain snapshots. Help explains the rule under “Fading roots and early chord evidence.”

This does not locate every fresh attack or move grid boundaries to exact performed onsets. It can miss changes made entirely from a subset of the preceding chord's tones, and may abstain with melody, leakage, detuning or weak roots. The first window is a reference slice, not a guarantee of an attack. Dense recordings, fast cells, changing meters and full-song boundaries need further validation. Rootless voicings remain deferred.
