# Local Study Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users select, analyze, listen to, save, and revisit short song passages with chosen stems and preserved chord evidence.

**Architecture:** Add a shared range-analysis operation behind Electron IPC and the LAN web API. Keep serializable study records separate from temporary renderer selection and playback state. Reuse the current Python spectral/ranking helpers, renderer waveform/piano conventions, and version-1 session storage.

**Tech Stack:** Existing JavaScript, Electron, Express, Python, NumPy/SciPy, FFmpeg, Node test runner, and Python unittest; no new product dependencies.

**Spec:** `docs/superpowers/specs/2026-10-06-local-study-design.md` (approved in chat on 2026-10-06).

## Global Constraints

- Desktop and LAN browser runtimes use the same workflow.
- Default to Bass + Other when both are available.
- Full Mix is an explicit, mutually exclusive alternative to selecting individual stems.
- Endpoints refer to original source seconds and do not snap to bars or beats.
- Endpoints must satisfy `0 <= start < end <= duration`, be finite, and span at least 0.05 seconds; no additional hard maximum is imposed.
- Study analysis and its listening preview use original, untransposed source audio and stems.
- The initial feature returns one best chord for the entire selection, along with alternatives.
- Padding required for short FFT windows contains zeros, never samples beyond the requested end.
- Save Session persists studies; Save Study updates session memory and must not imply disk autosave.
- Old version-1 sessions load with no studies; successful runs are immutable snapshots.
- Missing sources/dependencies fail explicitly; no automatic Demucs, full-mix substitution, or fabricated draft results.
- Preserve unrelated existing working-tree edits; stage and commit only changes belonging to these tasks.

## Review Focus

1. A delayed result must not attach to a newly loaded song, and changing inputs during analysis must not relabel the response (Tasks 3 and 6).
2. Media can disappear after selection or while a web job waits; errors retain historical results and identify the unavailable source (Tasks 1 and 2).
3. Leaving Local Study while stem play promises are pending must stop all study players without altering Arrangement mute/solo/volume settings (Task 5).
4. A restored session can contain malformed study records or references to removed runs; loading must remain usable and valid history must survive (Task 3).
5. A song's chart may be transposed, reanalyzed, or have its cached stems cleared; study timestamps/results remain original and histories stay readable (Tasks 3, 5, and 7).

## File ownership and contracts

New files:

- `backend/chordpilot_study.py`: validated crop, spectral evidence, ranking, fingerprints, and algorithm version.
- `src/renderer/study-model.js`: pure selection, record/history, and comparison helpers; no DOM or media players.
- `src/renderer/study.js`: Local Study DOM, requests, waveform interaction, saved list, and run display.
- `src/renderer/study-playback.js`: original-source selection players and lifecycle, independent of Arrangement's players.
- `tests/python/test_study.py`, `tests/js/study-model.test.js`, `tests/js/study-ui.test.js`, and `tests/js/study-playback.test.js`: focused behavior tests using current harnesses.

Existing files receive integration changes at the functions named in each task. Avoid broad refactoring.

Renderer request: `analyzeRange({audioPath, sources, start, end, options})`.
`audioPath` is an actual source path on desktop and an opaque media ID in the web bridge. `sources` is an ordered, deduplicated array of semantic names: `full_mix`, `bass`, `other`, `vocals`, or `drums`.

Trusted service request: `services.analyzeRange({audioPath, sourcePaths, start, end, options})`, where `sourcePaths` maps selected semantic names to resolved paths. Adapters resolve sources from trusted song associations, not from caller-supplied stem paths.

Result shape: `{chord, chord_confidence, pitch_confidence, alternatives, evidence, source_evidence, bass_reference, range, sources, settings, key_context, input_fingerprints, algorithm_version}`. `evidence` follows the existing `{source, range, detected_notes, summary}` format; `source_evidence` maps semantic names to that format. Alternatives carry `{chord, score, raw_score, reasons}`. `key_context` is `{key, origin}` with origin `override`, `song`, or `selection`. Options carry the original song key separately as `song_key`; `known_key` is the optional study override. Returned settings contain normalized study options including these two values.

Fingerprint shape per semantic source: `{size, mtime_ns, sample_sha256}`; hash contiguous float32 decoded samples within the crop, with sample rate encoded into the digest input. Never serialize source paths into study results.

Study/run fields follow the spec. A run is `{id, created_at, ...result}`; its result's range/sources/settings are its immutable input snapshot. Renderer temporary state is `state.study = {draft, openStudyId, selectedRunId, selectionAnchor, selectMode, dirty, requestGeneration, busy, pendingRuns}` plus `state.studies`. Draft fields are `{name, start, end, sources, settings, notes, corrected_chord}`. `pendingRuns` holds successful unsaved runs until Save Study; analysis success marks the session dirty.

## Execution setup

- [ ] Read the spec and this plan; inspect `git status --short` and preserve the current uncommitted baseline. Apply the worktree skill at execution time, honoring the user's workspace preference. An isolated checkout must include necessary baseline edits rather than accidentally reverting to HEAD behavior.
- [ ] Run `npm test` and record the baseline. Confirm the Python runner reports the selected interpreter and that NumPy/SciPy signal tests actually run. Missing scientific dependencies must be resolved through the existing configured runtime before claiming spectral verification.
- [ ] Execute tasks in order. For existing files with unrelated edits, review and stage individual task hunks; never use `git add .` or include preexisting changes in task commits.

### Task 1: Exact-range Python analysis

**Files:** Create `backend/chordpilot_study.py`, `tests/python/test_study.py`; modify `backend/chordpilot_cli.py:main`.

**Interfaces:** Consume `load_audio`, `normalize_analysis_options`, `chroma_for_segment`, `estimate_bass_reference`, `rank_chord_candidates`, `chord_evidence`, `detected_pitch_confidence`, and `estimate_key_from_chroma`. Produce `validate_range(start, end, duration) -> tuple[float, float]` and `analyze_range(audio_path: str, source_paths: dict[str, str], start: float, end: float, raw_options: dict | None = None) -> dict`.

- [ ] Write `StudyRangeTests.test_rejects_invalid_ranges`, covering negative/NaN/infinite/out-of-duration endpoints, reversed/equal endpoints, 0.049 seconds rejected, and exactly 0.05 accepted. Use explicit assertions:
  ```python
  self.assertEqual(study.validate_range(1.0, 1.05, 2.0), (1.0, 1.05))
  with self.assertRaises(ValueError):
      study.validate_range(1.0, 1.049, 2.0)
  ```
  Add real WAV signal tests: identical inner audio with different outer notes returns identical chroma/evidence and crop digest; a short final crop cannot include a pitched tail outside the interval; silence returns N.C./empty notes. Test pure C/E/G tones and low E bass inversion using real extraction/ranking; C-family candidates must outrank unrelated F# candidates and bass evidence must identify E. Test equal normalized non-bass averaging, silent-source exclusion, Bass-only mode, and selected Bass exclusion from harmonic chroma when Other is present.
- [ ] Run `npm run test:python`. New tests must fail because the study module/CLI operation does not exist; distinguish missing NumPy/SciPy from the expected feature failure.
- [ ] Implement the two functions and `STUDY_ALGORITHM_VERSION = "local-study-v1"`. Validate source names, reject Full Mix combined with stems, empty sets, missing/short files, and decode failures. Load sources with existing decoding; crop with sample indices entirely inside the interval, then invoke helpers at local `[0, crop_duration]`. Hash cropped samples before zero padding. Normalize only supported study options; use override, original song key, or provisional selection key in that order. Rank with both neighbor symbols set to `None`; compute confidence using the current ranking formula, with zero confidence for silence. Return only serializable data in the specified shape. Do not touch whole-song caches or history.
- [ ] Add CLI `analyze-range audio_path --sources <JSON mapping> --start <seconds> --end <seconds> --options <JSON>`. Route exceptions through the current JSON error contract. Add a subprocess CLI test for successful WAV analysis and malformed ranges with nonzero exit/error JSON. Test deleting a selected stem between setup and invocation preserves an explicit failure.
- [ ] Run `npm run test:python`; expect all existing and new tests passing with signal tests executed. Commit task-owned changes as `feat: analyze exact audio ranges for local study`.

### Task 2: Shared service and runtime adapters

**Files:** Modify `src/runtime/chordpilot-services.js:createChordPilotServices`, `src/main/preload.js`, `src/main/main.js` IPC handlers, `src/renderer/web-bridge.js`, `src/web/app.js:createWebApp`, `src/web/storage.js:createStorage`; extend `tests/js/runtime-services.test.js`, `tests/js/web-bridge.test.js`, `tests/js/web-app.test.js`, `tests/js/web-storage.test.js`, and `tests/js/main-utilities.test.js`.

**Interfaces:** Produce renderer `window.chordPilot.analyzeRange(payload) -> Promise<Result>` and trusted `services.analyzeRange(payload) -> Promise<Result>`. Also produce `services.resolveStudySourcePaths(audioPath, names) -> object` for desktop and `storage.resolveStudySources(mediaId, names) -> object` for web.

- [ ] Write service test `range analysis sends exact inputs without whole-song analysis`, asserting spawned arguments include `analyze-range`, `--start`, `--end`, the selected resolved sources, and original key settings. Add failure propagation and a desktop IPC test that caller-supplied stem paths cannot override trusted resolution. In web tests upload two songs and register their distinct stems; assert selecting one song cannot resolve the other's stem and no backend job starts on invalid selection. Add a bridge test:
  ```javascript
  assert.equal(request.url, "/api/analyze-range");
  assert.deepEqual(request.body.sources, ["bass", "other"]);
  assert.equal(request.body.mediaId, sourceId);
  assert.equal(result.chord, "C/E");
  ```
- [ ] Run `node --test tests/js/runtime-services.test.js tests/js/web-bridge.test.js tests/js/web-app.test.js tests/js/web-storage.test.js tests/js/main-utilities.test.js`; expect new feature tests to fail.
- [ ] Implement `analyzeRange` via existing `runBackend` argument arrays, inheriting configured Python and FFmpeg handling. Maintain a service-local source/stem association map populated after successful `analyze` and `readSessionFile`; resolve desktop requested names from that map, or source audio for Full Mix. IPC channel is `study:analyzeRange`. Renderer provides names only, never trusted paths.
- [ ] Persist web stem associations in the original source media metadata as `study_stems: {semanticName: mediaId}` using existing atomic metadata writes. Add `storage.associateStudyStems(mediaId, stems) -> void` and call it after successful `/api/analyze` normalization. Resolution validates source kind, registered stem IDs/names, and existence. Keep metadata associations private. Old web sessions without associations permit Full Mix immediately and require rerunning existing stem analysis before stem studies; the UI must explain this migration case. Imported session JSON must not authorize arbitrary stem associations.
- [ ] Implement `POST /api/analyze-range` with `{mediaId, sources, start, end, options}`, resolve again inside the serial queue before work, pass trusted paths to services, and respond `{result}` after existing recursive path redaction. Publish sanitized study progress/error logs. Missing media while queued must return an explicit error without a fabricated result. Extend `web-bridge.js` to translate source ID and unwrap the response. Never accept stem IDs or paths from this route.
- [ ] Run the focused command above and `npm run test:web`; expect passing routes, bridge, ownership, and missing-media checks. Commit as `feat: expose local study analysis in desktop and web`.

### Task 3: Study state and session persistence

**Files:** Create `src/renderer/study-model.js`, `tests/js/study-model.test.js`; modify `src/renderer/state.js`, `src/renderer/actions.js:startProjectWithAudio/buildSessionPayload/saveSession/restoreSessionPayload`, `src/renderer/index.html` script order, and `src/web/storage.js:assertSessionSchema`; extend `tests/js/web-storage.test.js`, `tests/js/runtime-services.test.js`.

**Interfaces:** Produce `studyRangeError(start, end, duration) -> string`, `advanceStudySelection(anchor, time) -> {anchor, range}`, `normalizeStudies(value) -> Study[]`, `saveStudyRecord(studies, draft, pendingRuns, openStudyId, now, createId) -> {studies, study}`, `appendStudyRun(study, result, now, createId) -> Study`, and `compareStudyRuns(current, previous) -> object`. Helpers return copies and never mutate saved runs. Scripts load model before study UI and actions wiring.

- [ ] Write model tests for endpoint ordering/restarting selection, minimum 0.05 duration, safe empty old sessions, immutable appended results, corrected chord independence, and selecting a removed run falling back to the newest valid one. Pin snapshot behavior:
  ```javascript
  assert.equal(updated.runs[0].chord, "C");
  assert.equal(updated.runs[1].chord, "C/E");
  assert.equal(original.runs.length, 1);
  assert.equal(updated.corrected_chord, "Am7");
  ```
  Test null/non-array studies, invalid times, invalid nested runs, duplicate IDs, and NaN confidence defensively: malformed individual records are skipped without losing valid siblings; missing or invalid selected run IDs fall back safely. Add desktop and web JSON round trips asserting full valid history/settings survive and absent `studies` becomes `[]`. Server rejects a supplied non-array studies field.
- [ ] Run `node --test tests/js/study-model.test.js tests/js/web-storage.test.js tests/js/runtime-services.test.js`; expect feature failures.
- [ ] Implement helpers and initialize `state.studies`/`state.study` using the contract above. Add `studies` to `buildSessionPayload` and restored state; deep-copy history at serialization boundaries. Save Session must first include any successful unsaved current study runs through Task 6's `saveCurrentStudy`, so Analyze followed directly by Save Session preserves those runs. Mark dirty when draft/studies/runs change; only clear persistence-dirty after successful Save Session for the same captured snapshot. Failed/cancelled save retains it. `startProjectWithAudio` clears study state; same-song reanalysis retains it. Session restoration increments request generation. No new session schema version.
- [ ] Add tests with a deferred save promise and edits made before it resolves: later changes remain dirty. Test original-key defaults stay original after chart transposition, and replacing the song removes its prior studies. Normalization strips malformed source names/unsupported settings and never trusts stored paths as analysis inputs.
- [ ] Run focused tests above plus `node --test tests/js/ui-utilities.test.js`; expect passing. Commit as `feat: persist study selections and analysis history in sessions`.

### Task 4: Local Study tab, range selection, and piano evidence

**Files:** Create `src/renderer/study.js`, `tests/js/study-ui.test.js`; modify `src/renderer/index.html`, `src/renderer/styles.css`, `src/renderer/state.js:elements`, `src/renderer/shell.js:setEditorPanel/setView`, `src/renderer/timeline.js:buildLane`, `src/renderer/keyboard.js:handleKeyboardShortcut`, `src/renderer/bars.js:createPianoEvidence`, and `src/renderer/renderer.js` event initialization.

**Interfaces:** Produce `renderStudy() -> void`, `handleStudyRangeClick(event, body, duration, openWhenComplete = false) -> boolean`, `setStudyRange(start, end) -> void`, `resetStudyState() -> void`, `initializeStudy() -> void`. Extend `createPianoEvidence(bar, chordSymbol = bar?.chord, options = {})` with `options.pitchClassesOnly` and `options.bassNote`; current callers retain existing labels and behavior.

- [ ] Write UI tests for Ctrl/Command and visible-toggle two-click selection, reverse endpoint order, ordinary click fallthrough, and controls ignored. Verify coordinates use the actual scrollable waveform body's bounding rectangle, not viewport width; zoomed/scrolled clicks select correct seconds. Verify incomplete selection disables Analyze/Loop, Escape clears its anchor, and editing a timestamp marks displayed evidence stale. Defaults select Bass + Other; missing stems do not silently select Full Mix; unavailable sources identify the missing name. Piano tests assert pitch-only labels, text strengths, chord-tone outline, and independent bass marker.
- [ ] Run `node --test tests/js/study-ui.test.js tests/js/study-model.test.js tests/js/ui-utilities.test.js`; expect feature failures.
- [ ] Implement editor panel `study` and `.study-section`, nav text Local Study, waveform/ruler with range shading, Select Range button, editable millisecond inputs, source checkboxes, explicit Use Full Mix action, name/notes/corrected-chord fields, chord settings, empty result/history regions, and saved list. Use `textContent` for user/saved strings. Reuse source duration/waveform and current zoom conventions without fabricating fine waveform detail from coarse peaks. Full Mix analysis can open before any chart exists; audio metadata supplies duration.
- [ ] Attach modifier interception to waveform-lane bodies in capture phase before marker handlers; only handled modifier/selection clicks prevent normal behavior. Completing Arrangement selection opens the study panel; starting another selection does not erase saved history. Add Escape handling before existing meta-key early return. Seed settings from current effective analysis options, using `chart.detected_key` (falling back to `chart.native_key`, then the untransposed `chart.key` when initializing old sessions) rather than the transposed chart key.
- [ ] Implement optional piano options and result text rendering. Explain Pitch classes and Original audio in the study view. Missing web stem associations show that high-quality analysis needs rerunning. Navigation hooks render current state and will stop study playback through Task 5's interface when available.
- [ ] Run focused tests and `npm run test:unit`; expect no shortcut/bar evidence regressions. Commit as `feat: add local study selection and evidence interface`.

### Task 5: Original-source selection playback

**Files:** Create `src/renderer/study-playback.js`, `tests/js/study-playback.test.js`; modify study controls/script order and `src/renderer/study.js`, `src/renderer/shell.js`, `src/renderer/actions.js`, `src/renderer/keyboard.js`, `src/renderer/renderer.js` volume/rate integration.

**Interfaces:** Produce `playStudySelection({loop = false} = {}) -> Promise<boolean>`, `stopStudyPlayback() -> void`, `applyStudyPlaybackSettings() -> void`, and `isStudyPlaying() -> boolean`. Resolve original URLs from `state.audio`/`state.chart.stems`, never `state.audioPreview` or Arrangement player URLs.

- [ ] Write mocked-Audio tests proving start at `draft.start`, stop at end, loop to start, shared playback rate/volume, selected sources only, and original URLs under a transposed preview. Assert Arrangement mix is unchanged:
  ```javascript
  assert.equal(studyPlayers[0].src, originalOtherUrl);
  assert.equal(studyPlayers[0].currentTime, 2.25);
  assert.deepEqual(stemMixSnapshot(), beforeStudy);
  ```
  Add a deferred `play()` test: stop/navigation/song replacement before resolution leaves every study player paused, source Arrangement players paused, and previous Arrangement settings intact. Test rejected play and double clicks cannot start overlapping mixes; selecting Full Mix produces one player.
- [ ] Run `node --test tests/js/study-playback.test.js tests/js/ui-utilities.test.js`; expect feature failures.
- [ ] Implement independent original-source `Audio` players with a generation counter, one timeline master, bounded drift correction, and a requestAnimationFrame boundary check while playing. Pause Arrangement/source playback before starting; use frame checks plus media ended/timeupdate events to stop/loop. Resolve play promises against current generation; failure stops every study player and reports the source. Never modify `state.stemPlayers`, `state.soloStem`, mixer mute/volume, or preview URLs.
- [ ] Connect Play/Loop/Stop, Space within the study panel, global master volume/rate changes, and stop hooks for leaving the panel/view, source changes, session restoration, range/source edits, and window teardown. Pausing study playback stops all its players. Existing Arrangement playback remains usable when returning to Song.
- [ ] Run focused tests and `npm run test:unit`; expect passing. Commit as `feat: play and loop original audio study selections`.

### Task 6: Analyze, save, reopen, and compare results

**Files:** Modify `src/renderer/study.js`, `src/renderer/study-model.js` if comparison presentation requires a pure projection; extend `tests/js/study-ui.test.js`, `tests/js/study-model.test.js`.

**Interfaces:** Produce `analyzeStudySelection() -> Promise<void>`, `saveCurrentStudy() -> void`, `openStudy(id) -> void`, `deleteStudy(id) -> void`, and `selectStudyRun(runId) -> void`. Consume the adapter, model, piano, and playback interfaces from previous tasks.

- [ ] Write tests asserting Analyze captures exact range/source/settings, disables duplicate submission, and calls `analyzeRange` once. Defer a response, change the draft, then resolve: the run retains old input labels and the draft stays new. Replace the song before resolve: result does not attach and stale completion does not clear the new song's busy state. Fail a rerun: existing history/result and corrected chord remain intact. Save/reopen restores draft and selected run, alternatives fill correction without mutating the suggested chord, and selected history does not overwrite draft inputs. Analyze followed directly by Save Session must also persist successful pending runs.
- [ ] Run `node --test tests/js/study-ui.test.js tests/js/study-model.test.js`; expect new behavior tests to fail.
- [ ] Implement a captured-input request with generation/song-identity checks and study-specific progress/status, leaving the overall song chart untouched. Add successful run snapshots to `pendingRuns` for the current opened/unsaved study; Save Study merges them through the model. Opening/deleting another study or beginning a new study first saves current in-memory study edits when they contain successful runs, so changing list selection does not silently drop useful results; disk persistence still requires Save Session. Failures preserve inputs/history.
- [ ] Render selectable run history and a comparison table for suggested chord, confidence, key/settings, sources, interval, algorithm version, and detected notes. Label different-input comparisons and old fingerprints explicitly; a saved result is never claimed to be current audio evidence merely because it was reopened. Add rename/delete behavior, dirty badge, default range-based name, and copy: Studies are stored with this song when you Save Session. No chart bar changes follow study candidate selection.
- [ ] Run focused tests and `npm run test:unit`; expect passing. Commit as `feat: save and compare local study analysis runs`.

### Task 7: End-to-end verification and user documentation

**Files:** Modify `README.md` Local Study usage, approved spec status, and relevant existing web/runtime tests; record verification in `docs/superpowers/plans/2026-10-06-local-study-validation.md`.

**Interfaces:** No new product interfaces; verify the complete workflow against the approved spec.

- [ ] Add an HTTP integration test that uploads valid synthesized WAV audio, analyzes Full Mix through the real Python operation with configured service runtime, saves its study history, restarts/reopens server storage, and verifies range/chord/fingerprint/history. Make interpreter prerequisites explicit; skipping this test is not proof of audio correctness. Add a persisted stem-association restart test, old-session compatibility, missing original audio, and history surviving cache clearing.
- [ ] Run `npm test`, `npm run test:web`, and `git diff --check`. All must pass; record interpreter, executed signal-test count, and any existing baseline failures separately. Fix failures introduced by this feature and rerun affected checks.
- [ ] Verify the real browser and desktop flows: Arrangement Ctrl/Command selection at zoom/scroll; visible selection and timestamp edits; Bass + Other and explicit Full Mix; exact interval response; keyboard/text evidence; looping/end/Space; alternatives and corrected chord; Save Study then Save Session/reopen; rerun comparison; missing stems; original audio after transposition; navigation during pending analysis/playback. Inspect UI layout and existing Arrangement mixing and bar evidence. Use the computer-use skill for UI automation; capture actual observations, not assumptions.
- [ ] Document shortcuts, default source roles, original-audio behavior, pitch-class limits, Save Study versus Save Session, and migration for old web stem associations. Update spec status only when its acceptance requirements have been exercised. Record any blocked runtime checks as unverified rather than claiming completion.
- [ ] Review the complete diff against spec and the five Review Focus conditions. Commit only task changes as `docs: document and verify local chord studies`; apply verification-before-completion and finishing-a-development-branch workflows before the final delivery.

## Handoff

This plan awaits user review and execution-method selection. Recommend native
execution in this chat: the tasks share contracts and touch existing modified
files, so keeping implementation context together reduces coordination cost.
Subagent-driven execution remains available if the user prefers per-task
independent reviews. Do not start product implementation until this written
plan has been reviewed and the execution method selected.
