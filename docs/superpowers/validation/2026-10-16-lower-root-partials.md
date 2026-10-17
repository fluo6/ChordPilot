# Measured lower-root partials in half-diminished recognition

Focused REC-01/REC-03 follow-up, 16 October 2026. Versions: `sub-bar-v19`, `local-study-v25`. ML experiments remain deferred under ML-01; this extends the existing deterministic evidence check. Builds on the [conflicting-third veto](2026-10-16-fading-third-conflict.md) and [registered half-diminished evidence](2026-10-16-half-diminished-evidence.md).

## Diagnosis

Virtual Insanity's automatic 19.354–20.006 s cell returns C7#11 even though its retained spectrum includes the complete registered C4/E♭4/G♭4/B♭4 voicing and C5/E♭5 octave support. The existing half-diminished rule rejects every major-third peak inside that register. Here the weaker E4 peak is closely compatible with a fifth partial of the measured low C2:

| Retained peak | Frequency | Relative level |
| --- | ---: | ---: |
| C2 | 65.92 Hz | −2.8 dB |
| C3 | 131.71 Hz | −2.6 dB |
| C4 | 262.98 Hz | 0 dB |
| E♭4 | 314.35 Hz | −11.2 dB |
| E4 | 329.94 Hz | −14.8 dB |
| E6 | 1324.43 Hz | −13.4 dB |

Five times measured C2 is 329.60 Hz; E4 is about 1.8 cents above that. E6 is about 6.1 cents above four times measured E4. The earlier strict ratio to the registered C4 alone misses this upper peak. The measured minor third is 3.6 dB stronger than the competing major third.

Real string overtones need not be exact integer multiples: bending stiffness can stretch upper modes, as explained by [UNSW Music Acoustics](https://phys.unsw.edu.au/jw/harmonics.html). This motivates checking measured relationships; it does **not** prove the E peaks in this recording are harmonics. Independent played notes can coincide with those frequencies. We do not fit an inharmonicity model or infer a missing fundamental.

## Narrow shared exception

All existing complete-voicing, chroma, tuning, octave, source, Overtone Weighting and conflicting-low-note checks still apply. For a major-third peak inside the candidate voicing, additionally require:

- Measured root peaks one **and two octaves below** the registered shell root. Each adjacent octave must agree within 20 cents. Without the measured low root, abstain.
- Every such competing major-third peak must be exactly root MIDI +4, at least 3 dB weaker than the measured minor third, and within eight cents of five times the measured two-octave-lower root.
- Strong upper major-third peaks must satisfy the original root ratios, or be higher octave partners of that corroborated fifth-partial peak within eight cents. This does not widen all frequency tolerances.
- Other strong unrelated tones still block the hint. A stronger or detuned independent major third remains a veto.

The shared `half_diminished_hint` remains a bounded ranking hint: `min(0.65, 1.3 × overtone_weighting)` raw score units, applied only within that score gap. It serves Local Study and Auto/Fixed timeline cells. No extra DSP pass, setting/default change or dependency is added. Raw spectra, note strengths and MIDI detections remain unchanged. New hints retain `lower_root_midi` and `fundamental_midi` alongside the measured shell and potential partials; these are evidence roles, not proof of their acoustic origin.

## Real recording results

Same cached Other/Bass stems, known Ebm, 50% overtone weighting, no tail reduction. The paired baseline restores only the earlier unconditional lower-major veto; existing fading-root and other checks remain in both runs.

| Local Study selection | Before | After |
| --- | --- | --- |
| 19.354–20.006 s | C7#11 | Cm7b5 |
| 19.1–19.8 s, mixed-transition diagnostic | Bb13 | Bb13 (unresolved) |
| 19.6–20.3 s | Cm7b5 | Cm7b5 |
| 19.6–20.5 s | Cm7b5 | Cm7b5 |
| 6.1–6.8 s | Cm7b5 | Cm7b5 |

In the paired first-23-second Auto timeline, at 92 BPM with the existing Drums-derived beat grid and detailed stability, Cm7b5 previously covers 20.006–20.659 s. It now covers **19.354–20.659 s**, incorporating the preceding cell. Other chord assignments in this checked timeline remain unchanged. The grid itself does not move: this is improved evidence interpretation and event merging, **not** a new onset detector or verification of the exact performed attack.

Across the original 13 manually sampled reference windows:

| Duration-weighted agreement | Before | After |
| --- | ---: | ---: |
| Root | 60.03% | 60.03% |
| Function | 34.09% | 37.95% |
| Exact symbol | 11.46% | 15.32% |

The original second Cm7b5 window gains 0.446 s of correct function/exact coverage. Its first 0.254 s remains unresolved. The first Cm7b5 window still has only 0.211 s of correct function coverage: the later 6.311–6.963 s cell remains C7#11. These are selected-window measurements, not whole-song accuracy. The original Local Study corpus is preserved rather than moving its transition window to an easier range.

## Verification

- Portable measured regression: `tests/fixtures/chord-evidence/lower-root-partial.json`. The new test in `test_half_diminished.py` exercises all 12 transpositions and metadata, missing/detuned lower octave roots, dominant/near-equal major thirds, detuned lower/upper major peaks, an unrelated lower major third and missing minor-third octave support. A stronger-minor/major variant verifies the exception does not accidentally depend on the earlier −14 dB cutoff.
- Red/green: the initial test fails 13 cases against the earlier helper. Adding missing/detuned sub-root cases produces two further expected failures before requiring the measured low fundamental. All five focused half-diminished tests pass after the final guard.
- Final full Python suite: **198 tests pass**. JS suite: **310 pass with the two established exclusions**: `environment defaults parse without starting the HTTP server` and `smoke CLI preserves its primary error and attempts directory cleanup when WAV removal fails`.
- All 83 established local predictions remain unchanged: Hero 17/20 roots, 11/20 functions, 9/20 exact; Virtual Insanity 7/13, 4/13, 1/13; Gravity 12/16, 10/16, 3/16; Overjoyed 19/21, 13/21, 2/21; September 5/13, 1/13, 0/13. No reference windows were moved.
- Hero's full checked 95-second event sequence is identical to the previous baseline: 62 BPM, 91.69% selected root overlap, 65.04% function, 55.51% exact; D6/9 still covers 13.8–16.0 s. Waste Of Time Abmaj9/Eb7#9/Eb9sus4 and Ballad C13 pass with tail reduction at zero and 20%; Ballad bars 5–8 remain Fmaj9.
- Independent scoped review of the change and final measured-fundamental tightening found no actionable correctness issues. No browser/layout QA was performed; Help changes are explanatory text.
- Local actual-audio artifacts: `.chordpilot-data/benchmarks/lower-partial-{validation,targets,timeline,reference,hero-timeline,prior}.*`; test logs `lower-partial-{red,sub-root-red,green,python,js}.log`. Media stays local.

Reanalyse Chords reuses available stems; Analyze Selection refreshes Local Study. Saved analyses remain snapshots. Remaining work includes broader onset timing, other ambiguous transitions and roots, and distinguishing independently played upper notes from coincident partials. The frequency and level cutoffs are conservative heuristics; missing low roots or different tuning can still cause abstention.
