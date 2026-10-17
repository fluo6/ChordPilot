# Conservative overtone weighting

New Auto/Fixed analyses and Local Studies default to 50% Overtone Weighting; 0% gives the prior baseline. Legacy whole-bar timing does not apply this stage. The setting is clamped to 0–100%, saved in analysis/study settings, and participates in cache identity. Existing snapshots require reanalysis. Historical studies default to zero and changing the setting marks their result stale. Local Study's algorithm version is v10.

The shared power-domain helper finds measured fundamentals with a second and third partial and at least three partials among harmonics 2–6, within 30 cents. Fundamentals must exceed 8% of the global maximum and eight times a 17-bin local median; partials must exceed 0.4% of the maximum and four times the local median. This avoids interpreting broadband noise as a large set of harmonic families. Sorted frequencies and bisect lookup avoid scanning every peak for each harmonic.

Eligible partial bands retain `1 - 0.75 * strength` of their power. Masks do not compound. At 50% strength the floor is 62.5% power; at 100% it is 25%. Entire bands of independently supported fundamental candidates and stronger neighboring peaks are protected. This is an averaged spectral heuristic, not note transcription or an onset/decay model. Weak fundamentals, missing even partials, stretched piano partials beyond tolerance, and overlapping played notes remain limitations.

The stage runs after optional sustain-tail subtraction and before ranking/stabilization, reweighting established chroma and estimated MIDI pitches. The same shared helper is used for song accompaniment cells and Local Study sources. Bass keyboard evidence is weighted, while the independent bass-root detector remains original. Original spectra and pre-weighting evidence are retained; the blue curve uses the original 0 dB reference. The amber chord average uses final weighted cells and its own peak reference. The keyboard preserves the existing component and highlights actual measured octaves.

## Physical references

- [UNSW: How harmonic are harmonics?](https://phys.unsw.edu.au/jw/harmonics.html) explains deviations from exact harmonic ratios in real strings. The current tolerance accommodates small departures but does not fit string stiffness.
- [Klapuri, Multiple Fundamental Frequency Estimation by Summing Harmonic Amplitudes](https://archives.ismir.net/ismir2006/paper/000125.pdf) provides background on harmonic salience and cancellation. ChordPilot implements the simpler documented rule above, not the complete estimator from this paper.

Both references and the formula are available in Help.

## Verification

Eight Python regressions cover harmonic reduction and power floors, off/silent/octave baselines, independent upper notes, overlapping protected root bands, stronger neighboring peaks, broadband noise, settings/cache differences, and consistency between timed and Local Study evidence. JS tests cover settings round trips, historical result invalidation, saved-spectrum validation, and the separately labelled weighted curves. Full suites passed: 124 Python and 259 JavaScript tests, with the same two pre-existing JavaScript exclusions. Independent review found no remaining consequential issues after the protected-band and historical-comparison fixes.

Read-only comparisons using the existing Waste Of Time session and cached Bass + Other stems:

| Local range (s) | Baseline and 50% result | Bass power removed | Other power removed |
| --- | --- | --- | --- |
| 0.260–1.489 | Abmaj9 | 8.83% | 0% |
| 56.260–57.260 | Eb7#9 | 2.23% | 1.86% |
| 94.624–95.541 | Eb9sus4 | 13.60% | 0% |

Ab1 remains present in the opening passage. These checks establish preservation of the previously examined chords, not general recognition-accuracy gains. A hidden isolated Electron preview confirmed both blue curves, 48 Beat Detail keys, measured Ab1 and its orange bass marker, horizontal scrolling, and no spectrum overflow at 370 px. Source audio and the user's session were not modified.
