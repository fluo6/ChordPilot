# First Half-Diminished Cell in Virtual Insanity

Focused REC-01/REC-03 follow-up, 16 October 2026. Versions: `sub-bar-v20`, `local-study-v26`. ML experiments remain deferred under ML-01; this resolves an internal accounting inconsistency in the deterministic ranking path. Builds on [measured lower-root partials](2026-10-16-lower-root-partials.md), [conflicting-third veto](2026-10-16-fading-third-conflict.md), and [registered half-diminished evidence](2026-10-16-half-diminished-evidence.md).

## Diagnosis

In Virtual Insanity (video ID `H0WCL4qc4-Y`), the first half-diminished passage spans 5.659–6.963 s on the 92 BPM beat grid. While the first cell (5.659–6.311 s) was previously recognized as Cm7b5, the second cell (6.311–6.963 s) published C7#11, leaving the 6.1–6.8 s reference window with only 0.211 s of correct function and exact-symbol coverage.

Tracing the cell through candidate generation and ranking revealed that:
1. `half_diminished_hint` correctly detected the complete registered shell voices `[60, 63, 66, 70, 72, 75]` and corroborated that the strong major-third peak at 660.14 Hz (E5) was within 3.2 cents of 2.5× C4 (264.08 Hz), producing `registered_chord` with bonus 0.65 and `harmonic_major_midis: [76]`.
2. However, in `rank_chord_candidates`, `score_chord_candidate` penalized the candidate Cm7b5 for unexplained strong notes because pitch class 4 (E) had normalized chroma 0.1070 (above the active threshold 0.055) and is not in the Cm7b5 formula `[0, 3, 6, 10]`. The unexplained penalty reduced Cm7b5 score by `0.1070 × 1.85 = 0.1980` (from 2.3749 to 2.1770).
3. This penalty artificially widened the raw score gap between C7#11 (2.8810) and Cm7b5 (2.1770) to 0.7040.
4. Because 0.7040 exceeds the maximum allowed hint bonus cap of 0.65 (`best_score - target['raw_score'] <= bonus`), the gate failed, and the corroborated hint was discarded.

The failing mechanism was double-counting: the acoustic evidence for E5 had already been verified by `half_diminished_hint` as a root harmonic, yet `score_chord_candidate` penalized the same target chord as if E5 were an unexplained competing tone.

## Shared Correction

The correction was implemented in `rank_chord_candidates` in [backend/chordpilot_chords.py](file:///c:/Users/Fujia/Documents/fujia-dev/ChordPilot/backend/chordpilot_chords.py#L517-L540):

- When `registered_hint` is provided and includes `harmonic_major_midis`, those pitch classes are recognized as explained root harmonics of the target chord rather than penalized as unexplained strong notes.
- In `score_chord_candidate` and `rank_chord_candidates`, candidate evidence is normalized and blended with independent bass evidence via `candidate_scoring_chroma`. The harmonic refund evaluates the exact same blended values and active threshold (`floor`), ensuring that the refund never exceeds the penalty actually applied, and is 0.0 when bass blending moves harmonic overtones below the active threshold.
- The unexplained penalty corresponding to those harmonic pitch classes (`harmonic_unexplained × 1.85`) is relieved on the target candidate, and the penalty reason text is adjusted or cleared if no other unexplained active tones remain.
- This narrows the raw score gap from 0.7040 to 0.5061, cleanly inside the `0.5061 <= 0.65` gate.
- With the 0.65 bonus applied, Cm7b5 achieves a raw score of 3.0249, decisively outranking C7#11 (2.8810).
- No scoring formulas, thresholds, or bonus caps were relaxed. Existing safeguards (complete registered shell, octave checks, conflicting bass rejection, tuning tolerances, and independent major-third rejection) remain fully intact.

## Real Recording Results

Evaluated on cached Other and Bass stems from Virtual Insanity (`H0WCL4qc4-Y`), known key Ebm, 92 BPM beat grid, detailed stability, tail reduction 0, and overtone weighting 0.5.

### Local Study

| Selection | Before | After |
| --- | --- | --- |
| 6.1–6.8 s (reference window) | Cm7b5 | Cm7b5 (preserved) |
| 6.311–6.963 s (automatic cell) | C7#11 | Cm7b5 (corrected) |
| 19.1–19.8 s (mixed-transition diagnostic) | Bb13 | Bb13 (preserved failure) |
| 19.354–20.006 s (second passage cell) | Cm7b5 | Cm7b5 (preserved) |

### Timeline Events (23-second benchmark)

- **Beat 5.659–6.311 s** (Cm7b5) and **beat 6.311–6.963 s** (now Cm7b5) merge into a single contiguous bar event:
  - Before: `5.659–6.311 s: Cm7b5`, `6.311–6.963 s: C7#11`
  - After: `5.659–6.963 s: Cm7b5`
- The following harmony transition at 6.963 s is preserved: `6.963–7.615 s: Bmaj7#11`, accurately matching the reference video highlight transition toward B/C♭ harmony at beat boundary 6.963 s.
- The later Cm7b5 passage at `19.354–20.659 s` is preserved.

### Duration-Weighted Agreement (13 Reference Windows)

| Metric | Before | After | Delta |
| --- | ---: | ---: | ---: |
| Root | 60.03% | 60.03% | 0.00% |
| Function | 37.95% | 42.18% | **+4.23%** |
| Exact symbol | 15.32% | 19.56% | **+4.24%** |

- Target window 6.1–6.8 s gains the full **0.700 s** of correct root, function, and exact-symbol coverage (previously 0.211 s).
- Second Cm7b5 window 19.1–19.8 s retains its 0.446 s coverage.
- All other 11 reference windows are 100% identical.

## Reference Baselines & Regressions

All 83 established local reference windows across five songs were re-evaluated against the previous baseline (`lower-partial-reference.json`):

| Song | Total Windows | Root (Before/After) | Function (Before/After) | Exact (Before/After) | Regressions |
| --- | ---: | ---: | ---: | ---: | ---: |
| Hero | 20 | 17 / 17 | 11 / 11 | 9 / 9 | 0 |
| Virtual Insanity | 13 | 7 / 7 | 4 / 4 | 1 / 1 | 0 |
| Gravity | 16 | 12 / 12 | 10 / 10 | 3 / 3 | 0 |
| Overjoyed | 21 | 19 / 19 | 13 / 13 | 2 / 2 | 0 |
| September | 13 | 5 / 5 | 1 / 1 | 0 / 0 | 0 |

- **Hero 95-second timeline**: 62 BPM, root overlap 91.69%, function 65.04%, exact 55.51%; D6/9 covers 13.8–16.0 s (exact 2.2 s); C#m7 fading-root passage preserved at 19.911–20.879 s.
- **Prior regressions (`verify_prior.py`)**: Waste Of Time (Abmaj9, Eb7#9, Eb9sus4) and Ballad (C13, bars 5–8 Fmaj9) at tail reduction 0 and 0.2 all pass.

## Verification

1. **Measured Portable Regression**: `tests/fixtures/chord-evidence/first-half-diminished-cell.json`.
2. **Focused Tests**: Added three test suites in `tests/python/test_half_diminished.py`:
   - `test_first_half_diminished_cell_keeps_corroborated_minor_function`: verifies all 12 root transpositions, independent major-third rejection, missing minor-third rejection, missing octave rejection, conflicting bass rejection, overtone-off rejection, and transitional Bb13 control.
   - `test_first_half_diminished_hint_survives_context_and_event_publication`: verifies Local Study and timeline event publication, candidate alternatives, and contiguous boundary merging.
   - `test_first_half_diminished_harmonic_refund_respects_bass_blending`: verifies confident matching C bass blending with E moved below active threshold (zero phantom refund) and E remaining active (refund strictly matches blended penalty).
   - Initial red run confirmed 13 expected failures before the fix. All 8 tests in `test_half_diminished.py` pass after the fix.
3. **Full Suites**:
   - Python test suite: **201 tests pass** (was 198, +3 new tests).
   - JS test suite: **310 tests pass** (with the two existing environment exclusions: `environment defaults parse without starting the HTTP server` and `smoke CLI preserves its primary error and attempts directory cleanup when WAV removal fails`).
   - `git diff --check`: passed with zero whitespace or line-ending errors.
4. **Artifacts**: Stored locally in `.chordpilot-data/benchmarks/first-half-diminished/` (`before.json`, `after.json`, `trace_cell.py`, `test_fix.py`, `run_after.py`) and `.chordpilot-data/benchmarks/` (`first-half-diminished-reference.json`, `first-half-diminished-hero-timeline.json`).

## Remaining Limitations

- Exact played boundaries and micro-timing remain constrained by the beat grid; this fix reclassifies evidence on the existing grid and does not introduce onset detection.
- Mixed-transition selections such as the 19.1–19.8 s diagnostic window still mix adjacent harmonic evidence and return Bb13.
- ML experiments (ML-01) and rootless voicings (VOI-02) remain explicitly deferred.
