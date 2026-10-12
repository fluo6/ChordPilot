# Chord Changes Within Bars Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect, display, edit, save, and export multiple timed chords inside a musical bar.

**Architecture:** Keep the existing bar grid and add ordered `chord_events` inside each bar. Reuse existing chord ranking on smaller audio crops; centralize timing and compatibility helpers so rendering, playback, editing, and exports consume the same events. Ship settings only after the renderer and export paths support their results.

**Tech Stack:** Existing Python/NumPy/SciPy backend, plain renderer JavaScript/CSS, Electron and web runtime, unittest and node:test. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-12-sub-bar-chords-design.md` (approved October 12).

## Global Constraints

- Preserve musical measure numbers, sections, lyrics, repeats, and song tempo grid.
- Use absolute original-audio seconds; tempo previews must map to original time.
- Modes: Auto changes, Fixed grid, Legacy one per bar. Grids: half bar, one beat, half beat. Initial new-analysis default: Auto changes, one beat.
- Derive subdivisions from actual beat intervals when available; boundaries initially stay on this grid.
- Preserve original sessions and user corrections; existing saved charts require no reanalysis to remain readable.
- Preserve all pre-existing workspace modifications. Record the starting diff before execution and stage only task-owned changes. No push, merge, or overwrite of the user's song file is part of this plan.
- Keep Python 3.9 compatibility and existing dependency/runtime conventions.

## Review Focus

- Irregular, duplicate, missing, or shifted beats must not create negative or overlapping events (Task 2).
- Partial bars and silence must not consume neighboring audio or invent chords (Task 2).
- Malformed event arrays and legacy sessions must remain safely readable without silently deleting valid history (Task 1).
- Tempo previews and chart transposition must preserve original event times and stored analysis evidence (Task 3).
- Bar edits and exports must retain all event timings, lyrics, and repeat semantics (Tasks 4–5).

## File and interface map

- Create `src/renderer/chord-events.js`: pure event compatibility, validation, selection, and bar-summary helpers; loaded before consumers in `index.html`.
- Create `backend/chordpilot_timing.py`: cell boundaries and Auto grouping; import existing common/chord helpers without importing analysis.
- Modify backend `chordpilot_analysis.py`, `chordpilot_chords.py`, `chordpilot_common.py`, `chordpilot_export.py`: exact crops, analysis integration, options/cache identity, and exports.
- Modify renderer `bars.js`, `timeline.js`, `transpose.js`, `actions.js`, `study.js`, `state.js`, `shell.js`, `renderer.js`, `index.html`, `styles.css`: event-aware consumers, editing, settings, and session handling. Keep unrelated existing code intact.
- Tests: create `tests/js/chord-events.test.js`, `tests/python/test_chord_timing.py`; extend existing bars, study-ui, analysis, chords, export, runtime, and UI utility tests where they already exercise the corresponding consumers.

## Task 1: Event contract and legacy compatibility

**Interfaces:** `barChordEvents(bar, endTime)` returns validated event copies, synthesizing a legacy event when no usable events exist; `activeChordEvent(events, time)` returns its index or -1; `summarizeChordEvents(events)` returns the longest-duration event, earliest on ties. Events carry `start`, `end`, `chord`, `confidence`, `chord_confidence`, `pitch_confidence`, `alternatives`, `evidence`, and optional `bass_reference`/`debug`. Persist array position as the selection index, not as a permanent identity.

- [ ] Write failing helper tests: a legacy C bar from 0–2 returns one C event; C 0–1 and G 1–2 returns G at time 1; equal durations summarize C; malformed/overlapping events fall back to a legacy view without mutating the source; an out-of-range selection returns -1.
- [ ] Run `node --test tests/js/chord-events.test.js`; confirm the missing-interface failure.
- [ ] Implement helpers in `chord-events.js` and load the script before `bars.js`. Validate finite ordered ranges, nonempty chord symbols, and array-shaped alternatives; derive legacy end from next bar/chart duration through callers.
- [ ] Add session round-trip coverage to the existing action/session tests: preserve event evidence and older sessions exactly; synthesized events are views, not writes during load.
- [ ] Run the helper and session tests; require all assertions above to pass. Commit only this task's files as `feat: add timed chord event compatibility helpers`.

## Task 2: Fine-grid analysis and automatic grouping

**Interfaces:** `analysis_cell_bounds(start, end, beats, grid, beats_per_bar, tempo)` returns ordered `(start, end)` pairs; `group_chord_cells(cells, np, options)` returns Auto events. `estimate_bars_from_audio` retains its signature and bar boundaries; new modes attach events after key-aware candidate normalization. Internal cells retain `_chroma` until public serialization.

- [ ] Write failing Python tests for a 4/4 bar 0–2 at 120 BPM: half-bar => [(0,1),(1,2)]; beat => four 0.5-second cells; half-beat => eight 0.25-second cells. Test irregular beats, missing-beat fallback, duplicate filtering, and clipped final cells.
- [ ] Add exact-crop tests: a short silent cell followed by a chord has zero evidence; no FFT minimum-length rule reads past cell end. Synthetic C then G yields two supported events while one sustained chord with a moving melody does not produce unsupported Auto flicker. Include Bass inversion and a confident one-cell passing chord.
- [ ] Run `py -3 -m unittest discover -s tests/python -p test_chord_timing.py`; confirm failures before implementing the new interfaces.
- [ ] Add normalized options `chord_timing` = `auto|fixed|legacy` and `chord_grid` = `half_bar|beat|half_beat`. Add an explicit timing algorithm version to analysis cache identity. Persist normalized options in analysis metadata; missing fields in saved UI settings use Legacy to describe old results, while new-analysis controls default to Auto/beat.
- [ ] Implement exact cell cropping and reuse Other/full-mix candidate ranking with Bass measured over the same interval. Compute global key from duration-weighted cell chroma. In Fixed retain each cell; in Legacy keep current bar behavior.
- [ ] Implement conservative Auto grouping: merge identical neighboring chord symbols; replace an isolated A–B–A cell only when B confidence is below 0.55 and A is an alternative within 0.05 score of B. Keep confident short changes and N.C. cells. Merge chroma by duration and recompute event evidence/ranking restricted to the retained symbol; preserve the original cells in analysis debug evidence for comparison. Treat these constants as first-version algorithm choices, pinned by tests, not additional UI knobs.
- [ ] Attach public events and their dominant-event compatibility summary, removing private NumPy values. Verify both fast and high-quality pipelines, including final-bar Bass cropping; updated cache identity distinguishes every mode/grid.
- [ ] Run `npm run test:python`; require the new synthetic tests and existing legacy tests to pass. Commit as `feat: analyze chord changes on beat subdivisions`.

## Task 3: Event-aware display, playback, and Local Study

**Interfaces:** add transient `state.selectedChordEventIndex`; extend `selectBar(index, seek, eventIndex = 0)` without breaking existing callers. All event time lookup uses Task 1 helpers. `openChordEventStudy(barIndex, eventIndex)` preserves the current study then opens the event's exact interval.

- [ ] Write failing renderer tests: one measure containing C 0–1/G 1–2 displays two chord labels and two correctly sized timeline regions; playback switches active event at 1 second while bar number remains 1; selecting G shows G evidence and alternatives.
- [ ] Add tests for chart transposition affecting every event symbol and alternative without changing times or raw evidence; a 2× tempo preview at 0.75 seconds highlights original time 1.5. Local Study opens the selected event interval, while Study this moment retains ±0.5 seconds.
- [ ] Run `node --test tests/js/chord-events.test.js tests/js/bars.test.js tests/js/study-ui.test.js`; observe the new consumer failures.
- [ ] Update `bars.js` chart/table renderers and evidence/detail/suggestion paths, `timeline.js` event regions and active highlighting, and `transpose.js` event symbol handling. Keep one visual measure and preserve all existing section/repeat/lyric labels. Convert preview playhead times once at the consumer boundary.
- [ ] Add the event-to-study action and accessible per-event selection controls. Reset event selection on chart replacement or when a bar's events disappear; legacy bars still behave as one event.
- [ ] Run the tests above plus existing transpose/timeline utility coverage. Commit as `feat: display and follow chords within each measure`.

## Task 4: Chord-event corrections and boundary editing

**Interfaces:** pure `splitChordEvent(events, index, time)`, `mergeChordEvents(events, index)`, `moveChordBoundary(events, index, time)` return event copies. Minimum edited event length is 0.05 seconds. Boundary index names the left event. Event edits update the compatibility summary but do not renumber bars.

- [ ] Write failing tests: split C 0–2 at 1 => two C events; moving the boundary to 1.25 preserves coverage; clamp to a 0.05-second minimum; merge adjacent events uses the left event's corrected symbol and records combined evidence as historical/stale rather than claiming a new analysis.
- [ ] Add tests for editing only the selected event chord/notes, preserving neighboring events and original analysis evidence. Musical bar split at a time clips/repartitions crossing events; bar merge combines ordered events without losing lyrics/repeats. Deleting or duplicating a bar must not share event object references or assign out-of-bar times.
- [ ] Run `node --test tests/js/chord-events.test.js tests/js/bars.test.js`; confirm failures.
- [ ] Implement helpers and focused renderer handlers. Add separately labeled Split Chord/Merge Chords controls and draggable internal timeline boundaries; retain existing measure-level operations. Preserve user corrections and mark time-adjusted evidence as historical until reanalysis.
- [ ] Run the focused tests and existing action utility tests. Commit as `feat: edit chord events without changing musical bars`.

## Task 5: Multi-chord exports and round-trip integration

**Interfaces:** add Python `bar_chord_events(bar, end_time)` matching the JS compatibility contract. Text displays successive symbols with beat offsets; CSV emits one row per event with bar number/start/end; JSON preserves event payloads; MusicXML emits multiple harmony elements with offsets inside the existing measure.

- [ ] Write failing export tests: C 0–1/G 1–2 in one 4/4 120-BPM bar retains both chords in every export; MusicXML G offset is two quarter-note beats within one measure. Include irregular beat timing, partial final bars, fractional half-beat offsets, and lyrics/repeats.
- [ ] Run `py -3 -m unittest discover -s tests/python -p test_export.py`; confirm new tests fail.
- [ ] Implement event-aware exports in `chordpilot_export.py`; select sufficient MusicXML divisions for fractional offsets and derive offsets from the chart beat grid, with BPM fallback. Preserve old charts' existing export behavior.
- [ ] Update renderer grid/iReal/ChordPro paths in `bars.js` to represent all chords with subdivisions rather than the compatibility summary. Add renderer export assertions and save/reopen tests preserving edited event intervals and history.
- [ ] Run `npm run test:python` and relevant renderer tests. Commit as `feat: preserve sub-bar chords in chart exports`.

## Task 6: Settings, regression checks, and real-song comparison

**Interfaces:** UI controls `chordTimingInput` and `chordGridInput`; `collectAnalysisOptions`/`applyAnalysisOptions` map to Task 2 option names. Session analysis options and backend cache identity must agree. Grid control is disabled in Legacy mode.

- [ ] Write failing tests for UI option defaults/round-trip, runtime forwarding, and cache invalidation when timing/grid changes. Add a full fixed/Auto/Legacy analysis-to-session-to-export test with a two-chord synthetic bar.
- [ ] Run the focused settings/runtime tests; confirm failures.
- [ ] Add controls under Analysis Options using approved labels. Wire `state.js`, `shell.js`, and `renderer.js`; document grid resolution, Auto behavior, fallback beats, and historical sessions in README. Keep Local Study's one-chord range analysis separate.
- [ ] Run the full JS and Python suites. Record environment-related baseline failures separately; never count exclusions as passed tests. Verify renderer interactions in a browser or supported app automation environment and save visual proof when using browser automation.
- [ ] Read the user's Waste Of Time session without modification. Analyze a short copied passage in Legacy, Fixed/beat, Fixed/half-beat, and Auto; compare timings and chord evidence. Save comparison artifacts in the workspace, never overwrite that session. Listen and mark a small reference passage before asserting musical accuracy; if source audio or listening is unavailable, report the validation limit explicitly.
- [ ] Request one final independent correctness review of the complete diff, repair important findings, rerun affected checks, and record results in a new validation document. Commit settings/docs as `feat: expose automatic and fixed chord timing controls`.

## Delivery

All six tasks form one coordinated feature; the new settings become available only after event display/edit/export is ready. No unrelated UI redesign, new transcription dependency, sample-accurate onset claims, automatic rewriting of existing sessions, or remote publication is included. Recommend native execution in this chat because the tasks share chart and renderer interfaces, followed by one independent whole-feature review.
