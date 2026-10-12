# Waste Of Time opening-chord diagnosis

Read-only reproduction on the original cached Other/Bass stems. The referenced saved session still contains Abmaj7 as bar 1's single chord (saved October 12); the newer fine-grid comparison contains Cm7 at its opening cells. No session, stem, or product algorithm was changed during this investigation.

## Reproduction

Used the saved chroma frequency limits (65–1800 Hz), simplify=true, key Ab, the existing Bass estimator, and candidate scoring. The narrow-window comparison includes Cm7 as the following provisional chord, matching the opening fine-grid behavior.

| Original-audio interval | Cm raw score | Cm7 raw score | Abmaj7 raw score | Current winner |
|---|---:|---:|---:|---|
| 0.255–0.546 s | 2.5259 | 2.7231 | 2.5638 | Cm7 |
| 0.255–0.838 s | 2.8288 | 3.1396 | 2.7496 | Cm7 |

These raw scores are ranking values, not probabilities or calibrated confidence.

## Findings

1. **Bass pitch-class extraction loses the Ab root.** The current estimator assigns every coarse FFT bin to a rounded MIDI pitch class and sums them. It returns A with confidence 0.267, despite local spectral peaks refined to 103.515 Hz and 209.993 Hz, both mapping to Ab. Energy spread across neighboring coarse bins and harmonics biases that aggregate away from the strongest Ab peaks. This is not a shortage of low-frequency data: the Bass crop contains substantial Ab energy.
2. **Shared chord tones plus context favor C minor.** Abmaj7 is Ab–C–Eb–G; Cm is C–Eb–G. In the first half-beat, Other has C 19.18%, Eb 13.53%, G 19.17%, Ab 10.27%, and Bb 6.63% of its pitch-class energy. The scorer rewards strong essential tones and gives the Cm-rooted candidates a 0.18 continuity bonus from the following Cm7. Without that neighbor bonus, Abmaj7's 2.5638 score narrowly exceeds Cm7's 2.5431 in this half-beat. The one-beat window also has enough Bb to favor Cm7, whose tones overlap the expected Abmaj9 voicing.
3. **Abmaj9 is unsupported.** `CHORD_QUALITIES` contains no maj9 entry; `parse_candidate_symbol('Abmaj9')` returns None. Disabling Simplify alone cannot enable it.

## Controlled counterfactual

Replacing only the Bass reference with Ab at an explicitly injected confidence of 0.9 makes Abmaj7 the top candidate in both intervals above. This isolates root evidence as an important contributor; it does not claim that 0.9 is the correctly measured confidence, that every opening cell must share the same chord, or that a corrected detector has already been implemented.

## Recommended correction

Estimate Bass pitches from interpolated spectral peaks, aggregate appropriate original-interval evidence, and validate harmonic/root ambiguity with synthetic bass notes and this actual crop. Add a maj9 chord template and its parsing/candidate-generation tests. Then compare Abmaj7/Abmaj9 against Cm/Cm7 using the corrected root evidence and assess continuity so it cannot erase supported changes. Retain the user-provided Ab-major expectation as validation evidence, not a song-specific hard-coded output.

The recording has not been manually checked by listening during this investigation, so these findings explain the algorithm's ranking rather than proving the exact played voicing.
