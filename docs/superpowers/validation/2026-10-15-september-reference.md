# September bass and chord reference

Reference: [Vincent Lafontaine — PLAY ALONG September, Earth Wind n Fire TRANSCRIPTION](https://www.youtube.com/watch?v=HOGev7Ld6qA). The video supplies static score pages, key A, 4/4 and quarter note = 125. Automatic analysis of its drum stem estimates 126 BPM. Used the existing htdemucs model. Downloaded media, extracted score frames, diagnostic scripts and reports are ignored under `.chordpilot-data/benchmarks/september/`.

## Selected bass checks

`tests/fixtures/chord-references/september.json` records 33 clear pitch interiors from the intro pedal, verse and chorus. Tracked agreement improves from 32/33 to 33/33. This is a selected checkpoint result, not full-song accuracy or exact onset validation. A written C#2 around 21.82 s is separately marked `score_guide`: the recording has a flat/bending pitch near C2, and the detector is not forced to match the printed name.

The opening 0–6.5 s bass rest produces no false bass attacks. Two checked Bb1 fragments around 21.91 and 113.56 s are eliminated as slide intermediates. The high-register pickup around 6.8–8.1 s is not reliably recovered from the separated Bass stem. It remains explicitly unscored; full-mix/Other probes did not provide a reliable monophonic replacement. Source-separation failures are not counted as successes. Total event count changes from 594 to 599 because recovered notes and rejected fragments both affect it; count alone is not an accuracy metric.

## Detector changes

- For a fragment shorter than 160 ms, detect continuous movement between neighbouring pitches in one direction (steps of one or two semitones, gaps under 100 ms, drift over 500 cents/s).
- Confirm that movement with two central 60 ms waveform windows separated by one 20 ms hop. If either window cannot resolve a pitch, preserve the fragment. This matters near C1, where such a short window cannot resolve a full low period reliably.
- Reject the fragment only without a renewed attack: the maximum of the first three 20 ms RMS windows must stay below 1.4 times the minimum of the preceding four windows, bounded by the noise floor. This is a conservative level-rise heuristic, not a general onset detector.
- The older decaying-release check now compares with the last retained note. A rejected 20 ms neighbouring pitch must not erase a stable returning D2, as happened near 20.2 s.

Long-window smear can make genuinely held chromatic notes look like slides. Synthetic regressions preserve phase-continuous, equal-level 120/140 ms chromatic holds, including low-register cases, while rejecting continuous 250/400/550 ms slides. A 100 ms chromatic hold already missed by the old stability check remains a limitation.

The shared Bass tracker supplies chord-root and Local Study evidence. Cache versions advance to `sub-bar-v9` and `local-study-v16`; Reanalyse Chords uses existing stems to refresh results.

## Chords and remaining limitations

Thirteen manually aligned short chord windows currently match 5/13 roots and 1/13 chord functions (third, seventh and suspension). Ringing accompaniment makes some brief C#m7/Bm7 passages resemble A-family chords or related inversions. Narrow local windows do not validate complete phrase timing or harmonic function. No song-specific naming overrides were added.

Compared the general settings with a 900 Hz upper chroma limit, 50% tail/overtone reduction, and both together. Root agreement was respectively 5/13, 5/13, 4/13 and 4/13. These trials do not justify a new preset or a claim that chord recognition is solved for this reference. The durable fixture exposes these failures for future work.

## Prior references and verification

Gravity retains all 35 sustained-note and 11 passing-note checkpoints, with no extra attacks in its six checked rejection windows. Independent source-score review supports the removed slide intermediates near 77.64, 126.17, 171.69 and 185.42 s; they lie between written slide endpoints. The short-window confirmation conservatively retains ambiguous cases.

Waste Of Time's Abmaj9, Eb7#9 and Eb9sus4 and Ballad's C13 remain correct with tail reduction at 0% and 20%. Ballad bars 5–8 remain Fmaj9. Gravity chord checks remain 11/16 roots and 8/16 functions; Overjoyed remains 18/21 roots and 12/21 functions.

Verification: 159 Python tests and 294 JavaScript tests pass. The established JS command excludes the two unrelated Windows/environment cases named `environment defaults parse without starting the HTTP server` and `smoke CLI preserves its primary error and attempts directory cleanup when WAV removal fails`. Added red/green regressions for fast phase-continuous holds and a rejected one-frame neighbour. Independent review identified and checked the short-window and low-register preservation cases.

Reproduce selected audio checks with `scripts/testing/chord-reference-benchmark.py`, the September mix/Other/Bass files, and `tests/fixtures/chord-references/september.json`. Reports distinguish tracked pitch interiors, local estimates, ambiguous score guides, false attack windows and unscored sections.
