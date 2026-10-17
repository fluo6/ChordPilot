# First Half-Diminished Timeline Cell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user selected manual execution in another session; no subagents are required.

**Goal:** Correct the remaining first Cm7♭5 passage in Virtual Insanity without regressing the existing song references or forcing uncertain audio into the printed chord.

**Architecture:** Diagnose the existing evidence → registered hint → provisional rank → neighbor-aware rank → grouped-event publication path. Fix one demonstrated inconsistency in the shared recognition/ranking path, retaining the current acoustic evidence and bounded credits. This is an investigation-and-fix task: do not invent a numerical scoring change before identifying the failing stage.

**Tech Stack:** Python, NumPy/SciPy, existing chord formulas/scorer and unittest; existing JS regression tests. No new libraries, ML models or stem separation runs.

**Spec:** [Current baseline and protected behavior](../validation/2026-10-16-lower-root-partials.md), supplemented by the scope and acceptance criteria below.

**Execution:** The authoring session prepared this document only. The user will give it to another session, perform the implementation there, and return for review. Do not automatically dispatch, message another session, commit or push.

## Scope

Implement one bounded REC-01/REC-03 fix: the first half-diminished passage in **Virtual Insanity**, video ID `H0WCL4qc4-Y`.

| Case | Current result | Required treatment |
| --- | --- | --- |
| Local Study 6.1–6.8 s | Cm7b5 | Preserve |
| Auto cell 6.311–6.963 s | C7#11 | Investigate and correct where measured harmony supports Cm7b5 |
| Reference overlap 6.1–6.8 s | Only 0.211 s has correct function/exact symbol | Aim for the full 0.700 s, subject to checking the performed transition |
| Later Auto passage 19.354–20.659 s | Cm7b5 | Preserve the recent fix |
| Mixed Local Study 19.1–19.8 s | Bb13, unresolved | Preserve as a diagnostic; solving it is outside this task |

The reference label is manually read and its highlight timing is approximate. In particular, do not assume the entire 6.311–6.963 s cell has one performed chord just because the 6.1–6.8 s interior reference says Cm7b5. Check the transition toward the following B/C♭ harmony before asserting an exact boundary.

### Excluded work

- ML training/integration, rootless voicings, additional chord vocabulary or new presets.
- September calibration, general onset detection, automatic meter/tempo changes or beat-grid redesign.
- Global FFT/chroma extractor rewrites, broad harmonic suppression, a general transcription model or whole-file refactoring.
- UI layout, keyboard highlighting, bass fingering, session persistence or unrelated TODO items.
- Changing reference windows/settings to manufacture a better result.

If the diagnosis requires one of these larger changes, deliver the evidence and a narrowly proposed follow-up instead of silently widening this implementation.

## Global Constraints

- Workspace: `C:/Users/Fujia/Documents/fujia-dev/ChordPilot`; PowerShell; last observed branch `codex/local-study`.
- The checkout contains substantial uncommitted work from previous tasks. Inspect `git status --short`; do not reset, clean, stash, overwrite unrelated changes or stage everything.
- A new checkout from HEAD alone may omit the latest work. Use the existing current checkout, or explicitly preserve the complete working state before moving elsewhere. The authoring session will not edit production code while this handoff is being executed.
- Current algorithm versions: `sub-bar-v19`, `local-study-v25`. Confirm them at execution time; later concurrent work supersedes these numbers.
- Keep known key **Ebm**, tempo **92 BPM**, source **Other + independent Bass**, Auto timing, **beat** grid, **detailed** stability, tail reduction **0**, overtone weighting **0.5**, Simplify Chords **false** for the primary comparison.
- Reuse existing stems and existing Drums-derived beat times. Do not rerun Demucs, alter the audio or download another recording.
- Preserve raw spectra, chroma, detected MIDI notes and fingerprints. Recognition preferences must not rewrite the measured notes to agree with a chosen chord.
- Preserve current safeguards: complete registered shell/octave checks, contradictory bass rejection, lower-major/root-family checks, the conflicting-third fading veto and source restrictions.
- Do not simply raise the 0.65 registered-hint cap or 0.45 fading-root cap, remove their score-gap gates, widen tuning tolerances, or add another credit under a new name to force this example.
- Do not hardcode the song, key, MIDI root or timestamps in production code. Reference/diagnostic fixtures may identify the test passage.
- ML-01 and VOI-02 remain explicitly deferred.
- Keep generated audio, video, frames and reports under the local benchmark directory; portable fixtures contain compact derived evidence only.

## Review Focus

Each item below must be exercised by Task 2's tests and Task 3's audio checks:

1. A saved hint exists but its credit is not applied, or is lost during neighbor/group reranking; evidence must not imply a preference was applied when it was not.
2. A real major third or altered dominant extension resembles a partial; preserve genuine dominant and 7#9 cases rather than preferring m7b5 universally.
3. A weak/missing minor third, conflicting bass, or incomplete octave evidence must still cause abstention.
4. A genuine following chord arrives inside/near the cell; do not smear Cm7b5 across a supported change or borrow notes from outside the interval.
5. A fix works for C/Ebm only; shared evidence tests must transpose through all 12 roots and retain consistent final alternatives/confidence.

## File Map and Existing Interfaces

Read the functions completely, including all callers, before editing. Line numbers are intentionally not fixed because this checkout is already in progress.

| File | Role in this task |
| --- | --- |
| `backend/chordpilot_chords.py` | Primary possible edit: `half_diminished_hint`, `rank_chord_candidates`, `score_chord_candidate` |
| `backend/chordpilot_analysis.py` | Trace `attach_timed_chord_events`; edit only if the defect is in evidence forwarding, grouping or publication |
| `backend/chordpilot_timing.py` | Read `group_chord_cells`/`stabilize_chord_cells`; no general smoothing rewrite |
| `backend/chordpilot_spectrum.py` | Read extraction and harmonic weighting; product edits outside this plan's intended scope |
| `backend/chordpilot_study.py` | Confirm shared behavior; increment version if detection/ranking semantics change |
| `backend/chordpilot_common.py` | Increment the timing algorithm version for changed recognition semantics |
| `tests/python/test_half_diminished.py` | Add the measured regression and conservative counterexamples |
| `tests/python/test_chord_timing.py` | Add a publication/context regression if the defect is in that path |
| `tests/fixtures/chord-evidence/first-half-diminished-cell.json` | New portable measured evidence; no media |
| `docs/superpowers/validation/2026-10-16-first-half-diminished-cell.md` | New results, actual settings, limitations and reproduction commands |
| `TODO.md` | Update REC-01/REC-03 and the latest verification record after validation |
| `src/renderer/index.html` | Update existing Help copy only if the rule's user-visible explanation changes |

Reuse these signatures; do not add a new recognition service or public option:

```python
half_diminished_hint(chroma, evidence, reference, np, options) -> dict | None

rank_chord_candidates(chroma, key, previous_symbol, next_symbol,
                      bass_reference, np, options,
                      fading_hint=None, registered_hint=None) -> tuple[list[dict], list[str]]

analyze_range(audio_path, source_paths, start, end, raw_options=None) -> dict

attach_timed_chord_events(bars, audio, sr, tempo, time_signature,
                         beat_times, np, options, evidence_source,
                         bass_audio=None, bass_sr=None, key="C") -> None
```

`half_diminished_hint` currently returns `chord`, `bonus`, `voices`, `harmonic_major_midis`, and optionally `lower_root_midi`/`fundamental_midi`. Grouped hints also carry duration-weighted credit and `support_ranges`. A present hint does not by itself establish that `rank_chord_candidates` accepted its credit.

## Task 1: Reproduce and Identify the Failing Stage

**Files:** Read the implementation and latest validation report. Create only a local diagnostic driver/report under `.chordpilot-data/benchmarks/first-half-diminished/` until the cause is known. Create the portable fixture once the actual input is captured.

**Consumes:** Current source state, existing media/stems, exact fixture settings and APIs above.

**Produces:** Immutable before report, compact measured fixture, stage-by-stage score trace and one written root-cause statement.

- [ ] **1. Record the starting state.** Save branch, algorithm versions, normalized options and relevant source-file hashes in the local before report. Preserve copies of current result files before rerunning anything that writes them.
- [ ] **2. Locate the existing recording.** Use `.chordpilot-data/benchmarks/virtual-insanity/reference-95s.wav` and read actual stem paths from `virtual-insanity/stems.json`. Its `stems` field is a list of `{name, path, ...}` objects. Check the files exist; report unavailable media honestly if they do not.
- [ ] **3. Reproduce the current 23-second timeline.** Follow the setup in `.chordpilot-data/benchmarks/lower-partial-validation.py`: Other/Bass truncated to 23 s, Drums-derived beat grid at 92 BPM, known Ebm and original fixture options. Use only the current algorithm for this new before baseline.
- [ ] **4. Save the current complete output** to `first-half-diminished/before.json`, including all original 13 window metrics, event boundaries/labels, target-cell evidence and alternatives. Reproduce Local Study at 6.1–6.8 s and at the actual automatic cell bounds as separate cases.
- [ ] **5. Trace the target cell through each ranking stage.** Log full 12-bin chroma, raw/retained peak frequencies and dB, registered hint, bass reference, uncredited Cm7b5/C7#11 raw scores, score gap, allowed credit, applied credit and final scores. Repeat for provisional ranking, neighbor-aware ranking and final grouped publication. Use temporary local instrumentation/debugger and restore it; do not ship noisy logging or source-text patching.
- [ ] **6. Check the actual transition** using the existing local reference video/audio. Separate a played third from harmonic-looking energy where the evidence allows it. Check the 6.8–6.963 s tail and the following B/C♭ entry; do not turn approximate highlight timing into an exact onset assertion.
- [ ] **7. Freeze actual target inputs** in `first-half-diminished-cell.json`: source/provenance, current versions/options, exact range, chroma, bass reference, relevant retained spectrum peaks, hint and expected interpretation. Preserve a conflicting/uncertain control. Do not reconstruct the missing chroma bins from the six displayed pitch classes.
- [ ] **8. Write the diagnosis before production edits.** Identify whether the hint is valid but outside its credit gate, a scoring term counts harmonic evidence incorrectly, neighbor context changes the result, or grouped publication drops/misrepresents the preference. State precisely which input and score term causes the wrong label.

### Important observed evidence

The existing `lower-partial-timeline.json` **after** report already shows the failing cell carrying a Cm7b5 `registered_chord` hint with bonus 0.65 and voices `[60, 63, 66, 70, 72, 75]`. Its published label is nevertheless C7#11, with raw score 2.881. E♭4/E♭5 peaks are present at approximately 313.42/626.77 Hz; E5 is strong near 660.14 Hz. Therefore **missing hint generation is not an established diagnosis**. Trace the credit and reranking stages first.

Do not reuse the old diagnostic's `before` result as this task's baseline: it deliberately restores an earlier lower-major veto. Likewise, `verify_prior.py baseline` deliberately disables an older scoring improvement. For this task use current behavior as before, and run `verify_prior.py` without arguments.

## Task 2: Add a Failing Regression and Apply One Shared Fix

**Files:** New measured fixture; `test_half_diminished.py`; shared scorer and/or timeline publication only as established by Task 1. Add a targeted `test_chord_timing.py` case if forwarding/publication is implicated.

**Consumes:** Task 1's actual input, score trace and root cause.

**Produces:** Smallest shared correction, portable regression tests and preserved evidence contracts. Public signatures remain unchanged.

- [ ] **1. Add a failing measured-evidence regression.** Suggested name: `test_first_half_diminished_cell_keeps_corroborated_minor_function`. Use the frozen real chroma/peaks, actual neighbor symbols and bass reference; assert the expected final label and first alternative. If the defect is stage-specific, test that stage instead of making a direct no-context rank pass accidentally.
- [ ] **2. Transpose that regression through all 12 roots.** Rotate chroma; transpose MIDI, frequencies, key, neighboring chord symbols and bass pitch class consistently. Assert equivalent root/function, not a hardcoded C symbol.
- [ ] **3. Add the counterexamples implied by the diagnosis.** Preserve rejection of a detuned/strong independent major third, missing minor-third/octave evidence, conflicting independent bass and the overtone-off setting. Protect genuine `7#9`/dominant formulas. Reuse existing negative fixtures where they already exercise the affected branch.
- [ ] **4. Add a cell/publication test where needed.** Suggested name: `test_first_half_diminished_hint_survives_context_and_event_publication`. Verify `event['chord'] == event['alternatives'][0]['chord']`, confidence/reasons correspond to the selected ranking, hint credit respects its cap and merged supporting durations, and boundaries remain contiguous. A synthetic audio proxy is acceptable for publication mechanics but is not an actual-recording accuracy result.
- [ ] **5. Run the focused tests before the fix.** Confirm an assertion fails for the diagnosed reason, not import errors, malformed evidence or missing files. Save the failure in the local report.
- [ ] **6. Implement one correction at the failing shared stage.** If forwarding/publication is wrong, fix that wiring/accounting. If shared scoring is wrong, correct the demonstrated evidence-counting inconsistency while preserving the existing credit limits and the original measured data. Apply it through the shared helper used by both Local Study and timeline where applicable.
- [ ] **7. Run focused tests and inspect the complete diff.** No song/time-specific branch, copied scorer, broad threshold relaxation or second unrelated fix. If the evidence/scorer is behaving consistently and no safe bounded correction is demonstrated, document that conclusion and propose the next investigation; do not claim implementation success or raise the credit merely to pass this recording.

This plan deliberately does not prescribe an unverified replacement formula. Task 1 decides the failing term; the implementation must follow that evidence. A broader acoustic model, changed credit policy or new temporal subsystem needs a separate plan.

Focused commands, from the workspace root:

```powershell
C:/Python39/python.exe -m unittest discover -s tests/python -p test_half_diminished.py
C:/Python39/python.exe -m unittest discover -s tests/python -p test_fading_roots.py
C:/Python39/python.exe -m unittest discover -s tests/python -p test_chord_timing.py
```

## Task 3: Validate, Version and Document the Result

**Files:** Algorithm-version constants, new validation report, TODO and conditional Help copy. Local before/after reports remain under `first-half-diminished/`.

**Consumes:** Tested shared correction from Task 2 and immutable current before results.

**Produces:** Reviewable diff, reproducible before/after evidence, exact verification results and clearly recorded remaining failures.

- [ ] **1. Rerun the same 23-second timeline** into `first-half-diminished/after.json`. Use identical stems, beat grid, key/options and windows. Compare root, function and exact-symbol duration overlap separately; list every changed event and inspect any changed passage beyond the target.
- [ ] **2. Require target improvement.** Aim for Cm7b5 across the original 6.1–6.8 s reference (0.700 s instead of 0.211 s). Preserve the later 19.354–20.659 s Cm7b5 event. If a different performed boundary is established, report it separately and leave uncertain coverage unresolved; never move the original reference to make the acceptance check pass.
- [ ] **3. Recheck all 83 local reference windows.** Use the original fixtures/settings for Hero, Virtual Insanity, Gravity, Overjoyed and September. Read `scripts/testing/chord-reference-benchmark.py` for the maintained comparison functions. The local `lower-partial-reference.py` runner is usable as a template, but give the new run its own output paths and compare against `lower-partial-reference.json`; do not overwrite historical baselines or use its older hardcoded comparison file without updating the driver.
- [ ] **4. Recheck the previous successes.** Run the existing Waste Of Time/Ballad check without `baseline`, and the 95-second Hero timeline setup. Preserve the results listed below. The local `lower-partial-hero.py` wrapper similarly needs a new output filename to retain historical reports.
- [ ] **5. Increment recognition versions if semantics changed.** If the starting versions remain v19/v25, use `sub-bar-v20` and `local-study-v26`. If another task has advanced them, increment from the actual current versions. Do not silently rewrite saved analyses.
- [ ] **6. Run the full suites on the final source state.** Record actual test counts and exclusions; extra tests should increase the Python count beyond the current 198. Scientific imports and JS temporary-file renames may need the execution environment's normal permission mechanism; environment failures are not algorithm failures.
- [ ] **7. Document the final change** in the new validation report and update REC-01/REC-03 in TODO. Include actual settings, before/after score explanation, original-window metrics, regressions, untouched uncertainty and version numbers. Update Help only if a rule's explanation changed. Keep ML and rootless items deferred.
- [ ] **8. Perform a scoped review and hand back the diff.** Check only this task's changes against the captured starting state; the repository-wide dirty diff includes other work. No commit/push unless the user explicitly requests it.

Full verification commands:

```powershell
C:/Python39/python.exe -m unittest discover -s tests/python
node --test --test-skip-pattern='environment defaults parse without starting the HTTP server|smoke CLI preserves its primary error and attempts directory cleanup when WAV removal fails' tests/js/*.test.js
git diff --check
```

The JS command intentionally retains **two existing environment exclusions**. Do not call this an unqualified full-suite pass. Add normal newline/trailing-whitespace checks for new untracked files, which `git diff --check` alone may not inspect.

### Protected baseline

| Reference | Windows | Root | Function | Exact |
| --- | ---: | ---: | ---: | ---: |
| Hero | 20 | 17 | 11 | 9 |
| Virtual Insanity | 13 | 7 | 4 | 1 |
| Gravity | 16 | 12 | 10 | 3 |
| Overjoyed | 21 | 19 | 13 | 2 |
| September | 13 | 5 | 1 | 0 |

These are selected local windows, not whole-song accuracy. Prefer unchanged predictions outside the target; any other change needs its own verified explanation. No unexplained root/function/exact regressions are acceptable.

- Virtual Insanity 23-second beat-grid timeline: root **60.03%**, function **37.95%**, exact **15.32%** across the original 13 windows. Do not regress the non-target reference coverage.
- Hero: 62 BPM; original 95-second checked event sequence preserved; selected root/function/exact overlap **91.69% / 65.04% / 55.51%**. D6/9 covers 13.8–16.0 s; narrow 15.3–16.0 s remains D6/9. The 19.911–20.879 s fading-root case remains C#m7.
- Waste Of Time: Abmaj9 at 0.260–1.489 s, Eb7#9 at 56.260–57.260 s, Eb9sus4 at 94.624–95.541 s; tail reduction at 0 and 0.2.
- Ballad: C13 at 3.410–4.870 s with tail reduction at 0 and 0.2; bars 5–8 remain Fmaj9.
- The first registered correction at 6.1–6.8 s and the later Cm7b5 timeline improvement must remain correct. Mixed/unsupported selections may still abstain or return another label; forcing them is not an acceptance requirement.

## Completion Checklist

- [ ] The exact failing stage and score term are documented, including whether hint credit actually applied.
- [ ] A portable test failed before and passes after the correction; transpositions and conservative counterexamples pass.
- [ ] The original first Cm7b5 reference gains verified automatic coverage, with no hidden shifted reference or unsupported extension across a real change.
- [ ] Shared Local Study/timeline behavior and published alternatives/confidence remain consistent.
- [ ] All 83 local windows, both Cm7b5 passages and earlier named regressions are checked; differences are explained.
- [ ] Final full-suite results, versions, scoped diff and remaining limitations are reported accurately.
- [ ] No ML/rootless implementation, new dependencies, media commits, unrelated cleanup or unsolicited commit/push.

If the investigation establishes that a safe correction needs broader work, the acceptable **investigation handoff** is the frozen evidence, failing stage, conservative test and follow-up proposal. Label the recognition fix **unresolved**, not complete.

## Message to Paste into the Implementation Session

```text
Implement the bounded investigate-and-fix task in:
C:/Users/Fujia/Documents/fujia-dev/ChordPilot/docs/superpowers/plans/2026-10-16-first-half-diminished-cell.md

Read the entire plan and linked baseline report first. Work in the current dirty working state without resetting or discarding existing changes. Diagnose the first Virtual Insanity Cm7b5 timeline cell at 6.311–6.963 s: it already carries a registered Cm7b5 hint but publishes C7#11. Trace credit application and reranking before changing scoring. Add a failing measured regression, make only a supported shared fix, preserve the listed references and deferred items, and report exact before/after tests and remaining limitations. Do not commit or push. I will bring the completed diff/results back to the original session for review.
```
