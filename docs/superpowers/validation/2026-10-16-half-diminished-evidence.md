# Registered half-diminished evidence

Focused REC-01 improvement, 16 October 2026. Builds on the [root/extension](2026-10-16-root-extension-evidence.md) and [fading-root](2026-10-16-fading-root-evidence.md) fixes. Versions: `sub-bar-v17`, `local-study-v23`.

## Diagnosis

The Virtual Insanity reference already has a supported `m7b5` formula. Its manually read Cm7b5 windows returned C7#11 at 6.1–6.8 s and Bb13 at 19.1–19.8 s. The problem is measured-note interpretation, not a vocabulary gap.

At 6.1–6.8 s, Other contains lower C4/Eb4/Gb4/Bb4 peaks. Eb4 (313.55 Hz, −17.5 dB) has an octave partner at 626.94 Hz (−21.8 dB), although it falls below the retained MIDI list's relative-strength cutoff. C4 (263.54 Hz) also has an octave at 527.40 Hz. E5 at 660.34 Hz is strong enough to favor a dominant candidate, but is within about four cents of 2.5 × measured C4. G4 also closely follows 1.5 × C4. These ratios support a harmonic explanation; they do not prove that those notes were not independently played.

At 19.1–19.8 s, Eb is weaker and a lower E4 is present. The beginning of this selection also contains transitional spectral content. The new rule abstains rather than forcing the printed chord. Manual video highlights are approximate and do not establish exact performed boundaries.

Piano transcription research explicitly models inharmonicity and overlapping spectral patterns; the app does not implement that complete model. See [Ortiz-Berenguer and Casajús-Quirós, DAFx 2002](https://dafx.de/paper-archive/2002/DAFX02_Ortiz_Casajus_polyphonic_transcription_piano.pdf). The check below is a narrower heuristic based on this recording's measured register and frequency relationships.

## Shared check

The scorer can accept a registered half-diminished hint from retained source spectra after tail/overtone weighting. It requires:

- Overtone Weighting above zero. Multi-harmonic-source Local Studies, Bass-only, vocal and drum timelines do not receive this hint.
- Measured chroma support: root ≥8%, minor third ≥4.5%, flattened fifth and minor seventh each ≥5.5%.
- Spectral peaks at root MIDI +0/+3/+6/+10/+12/+15. Peaks must reach −24 dB against the original spectrum reference and lie within 30 cents of their equal-tempered note.
- The root and minor-third octave pairs must each agree within 20 cents.
- No measured major-third peak at or below the lower voicing's seventh. Strong upper major-third peaks (at least −14 dB) must all match a 1.25/2.5/5 root ratio within eight cents.
- No strong unrelated tone inside the lower voicing: an extra peak there must closely match the 1.5 root ratio. Clear low-note guidance for a different root blocks the hint.

A qualifying candidate receives `min(0.65, 1.3 × overtone_weighting)` raw score units, only if it is already within that credit of the best candidate. At the default 50%, the cap is 0.65. This is corroboration weight, not probability or audio gain. Candidate scores/relative confidence are recomputed together. Merged timeline events weight hints by supporting cell duration; supporting ranges remain saved. Raw chroma, spectra and detected MIDI notes are not rewritten to fit the chord.

The rule is conservative and specific to a complete registered half-diminished shell. It does not solve general polyphonic transcription, infer rootless voicings, prove simultaneity from an average spectrum, or reliably distinguish every played upper note from a partial. Genuine upper notes close to harmonic ratios remain ambiguous. Missing octave support, detuning, melody, reverb or separation leakage can cause abstention. Legacy bar analysis lacks this registered evidence and retains its existing behavior.

## Actual recording results

| Local selection | Before | After |
| --- | --- | --- |
| Virtual Insanity 6.1–6.8 s | C7#11 | Cm7b5 |
| Virtual Insanity 19.1–19.8 s | Bb13 | Bb13 (unresolved) |

Across the established 83 local windows, only the first selection changes. Virtual Insanity goes from 3/13 to 4/13 function matches and 0/13 to 1/13 exact symbols; roots remain 7/13. Hero, Gravity, Overjoyed and September predictions are identical to the previous baseline. These selected windows are not whole-song accuracy.

The automatic-timeline check uses the first 23 seconds of the existing Other/Bass stems, 92 BPM, beat times derived from the existing Drums stem, known key Ebm and the fixture's General settings. A paired run disables only this new helper for the baseline. Across all 13 manually selected windows:

| Duration-weighted agreement | Before | After |
| --- | ---: | ---: |
| Root | 60.03% | 60.03% |
| Function | 32.26% | 34.09% |
| Exact | 9.64% | 11.46% |

Only 0.211 s of the 0.7 s first Cm7b5 window becomes correct in the automatic timeline; remaining cell/context errors persist. The second Cm7b5 window gains no correct function coverage. This does not establish exact attack timing or validate the full song's meter.

Hero's full 95-second check retains 62 BPM, 91.69% selected-window root agreement, 65.04% function and 55.51% exact agreement. Its D6/9 covers the checked 13.8–16.0 s interval. Waste Of Time's Abmaj9/Eb7#9/Eb9sus4 and Ballad's C13 still pass with tail reduction off and at 20%; Ballad bars 5–8 remain Fmaj9.

## Verification

- Full Python suite: 196 tests pass, including four new half-diminished tests.
- Full JS suite with the two established environment exclusions: 310 tests pass. Excluded: `environment defaults parse without starting the HTTP server` and `smoke CLI preserves its primary error and attempts directory cleanup when WAV removal fails`. The first sandboxed run failed temporary-file renames; rerunning outside that filesystem sandbox passes. The excluded cases remain tracked under QA-02.
- Portable measured evidence: `tests/fixtures/chord-evidence/half-diminished.json`. Tests transpose the successful case through all 12 keys, check missing tones/octave support, independent lower thirds, detuned partials, conflicting bass and the off setting, and deliberately retain the unresolved second case.
- Synthetic audio derived from measured frequencies/levels exercises actual extraction and Local Study plus single-cell/merged timeline publication. It is not an additional real-recording accuracy point.
- Independent scoped code review found no important actionable issues.
- Local diagnostic artifacts: `.chordpilot-data/benchmarks/half-diminished-{reference,timeline,hero-timeline,targets-after}.json`, corresponding scripts/logs, and `half-diminished-prior.log`. Media stays local.

Reanalyse Chords can reuse available stems; Analyze Selection refreshes a Local Study. Existing saved analyses remain snapshots. Help explains the check under “Half-diminished chords and upper harmonics.” REC-01 remains open for the second passage and other unresolved root/function errors.
