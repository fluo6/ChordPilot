# Forever Love: audio-only recognition

The user clarified that the PDF is an evaluation reference, never a source of chord labels for the saved chart. The previous score-guided edits were therefore removed, including bar 15 and the later Bm7/Bm11/Em7 readings. Their reported 8/8 score agreement was manual reference alignment, not automatic recognition accuracy.

## Recognition inputs and provenance

All 167 bars were regenerated headlessly from the cached Other and Bass audio stems. The run uses the saved audio-derived 133 BPM beat grid and key A with one global set of analysis options: Auto timing, half-beat grid, Sustained stability, 20% tail reduction and the existing overtone setting. The recognizer receives empty chord labels and recomputes bass events. No old chord, alternative, PDF annotation or per-bar stability override enters the analysis. The saved chart contains no `score_reference` or `analysis_setting_override` fields. Its engine metadata records `chord_labels_used_as_input: false` and `bass_events_recomputed: true`.

The source session, candidate and installed file are checked with SHA-256 hashes. Each installation creates a verified backup beside the existing session before atomic replacement. Audio metadata, studies, UI state and bar starts are preserved. The temporary scripts are `.chordpilot-data/benchmarks/forever-love-audio-only.py` and `install-forever-love-audio-only.py`; they do not read the PDF or any expected chord list.

## Small smoothing correction

The regional root bonus could previously continue without a matching local root measurement inside a short bass-sparse region. Only regions longer than four bars had the existing protection. `sub-bar-v24` removes that duration exception: whenever fewer than 20% of a region's cells have a clear independent bass reference, the bonus needs a matching local bass reference. This changes evidence weighting rather than inserting a symbol or a song-specific time boundary.

The derived audio-cell test at 42.124–43.026 s fails before this correction and passes afterward in Balanced mode, selecting B-root suspended harmony from the measured B/F♯ cells. The final full-song Sustained run also publishes **Bsus4 at 42.124–43.026 s**, replacing Emaj9. It does not establish the PDF's minor quality or the later Bm6. No B-minor seventh, Bm11 or Em7 label is forced to match the score. Switching the entire song to Balanced changes later chromatic and modulation passages, so the saved song keeps the user's Sustained setting.

The paired installed v23/v24 runs have identical raw detections, per-cell spectral evidence and bass references across all 1,332 cells. Twenty selected cell symbols change. Bar summaries change at 24 (Emaj9 → Bsus4), 26 (Gmaj7 → Em9), 160 (C9sus4 → F9sus4), 162 (Fmaj7 → Bbmaj9) and 163 (Bbmaj7 → Bbmaj9). The late outro changes have not been independently checked against the PDF. Bar 26 remains a failure: the summary is Em9 even though its later events are F♯maj7 and F♯7♯5; a single longest event determines the bar label.

## Verification

- `npm test`: **319 JavaScript tests and 207 Python tests pass**. The new timing fixture was observed failing before the correction and passing afterward; the targeted 25-test timing suite also passes under the local Python runtime.
- Paired automatic-timeline replays reuse identical acoustic cells for Gravity (458), Overjoyed (180) and September (453). The change alters **zero cell symbols across all 1,091 cells**, and all reference root/function/exact duration metrics are unchanged. Their existing recognition errors remain; this is a regression check, not a claim that those songs are fully correct.
- Local Study scoring and Detailed mode do not use this smoothing change. No chord formula, acoustic-score threshold or reference-specific preset was changed.
- Reopening the installed JSON confirms 167 bars, algorithm `sub-bar-v24`, zero score overrides, all computed event confidence values, and matching candidate/installed hashes. The removed score-specific renderer path is absent from `backend/` and `src/`.

The local evidence reports are `.chordpilot-data/benchmarks/forever-love-audio-only-validation.json` and `timing-bonus-audio-regression.json`. The latter records the paired cell comparison; its extraction options retain the v23 input tag because extraction started before the v24 version bump.

## Current limits

| Approximate score phrase | Audio-only v23 roots / duration | Saved audio-only v24 roots / duration |
| --- | --- | --- |
| Bars 15–22, 25.66–40.09 s | 6/8 · 76.56% | 6/8 · 76.56% |
| Bars 23–30, 40.09–54.53 s | 4/8 · 54.69% | 5/8 · 62.51% |
| Bars 31–38, 54.53–68.97 s | 8/8 · 84.08% | 8/8 · 84.08% |

These selected score comparisons are not whole-song transcription accuracy. They explicitly expose the failures previously hidden by reference edits. All expected roots are applied only after recognition, in the evaluation script.

The first sung A-major voicing can still be named C♯m7/G♯ when the A root is weak, and G6/9 versus Em7 remains ambiguous without reliable root evidence. Minor quality, extensions, inversions and exact change times need separate validation. The production recognition path contains no PDF parser, reference-chord map or time-based override for this song.
