# Song Structure Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Replace fabricated sections with an editable source-time structure and opt-in acoustic boundaries/repeated groups.
**Architecture:** One optional `chart.structure` contains automatic intervals and a separate manual interval list. Python extracts acoustic evidence; renderer helpers own migration, edits and projection. Desktop and web reuse the shared runtime.
**Tech Stack:** Existing Python/NumPy/SciPy, plain JavaScript, Electron/Express; no new production dependencies.
**Spec:** `docs/superpowers/specs/2026-10-25-song-structure-design.md` (approved by the user).

## Global constraints

- Source seconds, occurrence IDs, repeated groups and musical roles stay separate.
- No fixed pop template, invented repeat signs, guessed semantic roles or accuracy percentages.
- Preserve manual/legacy labels, unrelated chart fields and unknown schema versions.
- Keep acoustic recognition experimental until held-out full-song evidence meets the release criteria.
- No semantic model installation or integration in the built-in changes.

## Review focus

1. Same-name adjacent occurrences remain separate in navigation and headings.
2. Reanalysis and bar edits retain source-time manual intervals.
3. Failed or stale jobs cannot erase successful data or update another song.
4. Silence/invalid grids/long files degrade without fabricated structure.
5. Registered media checks apply equally to the new web refresh path.

## Tasks and progress

### Task 1 — Honest drafts and interval lifecycle (Stage 1)

Files: new `backend/chordpilot_structure.py`, `src/renderer/song-structure.js`, matching Python/JS tests; analysis/common/actions/bars/shell/index integration.
Interfaces: Python `empty_structure(duration, status, diagnostic=None)`, `validate_segments(segments, duration)`, `project_sections(chart)`; JS `SongStructure.ensure(chart)`, `segments(chart)`, `project(chart, gridChanged=false)`, `editBar(chart,index,label)`, `preserve(chart, previous, chordsOnly=false)`.

- [x] Write and observe failing migration, boundary ownership, edits, invalid schema, reanalysis and honest-draft tests.
- [x] Implement the contract, remove the template/fixed repeats, wire all existing mutations and restore/save paths.
- [x] Run focused suites and preserve unrelated changes.

### Task 2 — Complete manual structure workflow (Stage 2)

Files: structure helper/inspector, prototype/chart navigation, chartRows/alphaTab/numbered/spreadsheet/text/MusicXML export.
Interfaces: `SongStructure.rename`, `split`, `joinPrevious`, `useDetected`, `navigation`; `section_id` accompanies compatibility names.

- [x] Observe failing split/join/rename/same-name navigation and export checks.
- [x] Implement occurrence controls and headings; retain original estimates and strip borrowed scores from edits.
- [x] Run focused lifecycle/export/notation checks and inspect UI.

### Task 3 — Experimental acoustic boundaries (Stage 3)

Files: backend structure/analysis/common/CLI; shared services, IPC/preload, web server/bridge; analysis options/UI.
Interfaces: `analyze_structure(path, grid, grouping=True)` returns a structure; `analyze-structure <audio> --grid -` (JSON on stdin); `analyzeStructure({audioPath,grid})` resolves source in shared runtime. Persist `structure_enabled: false` by default.

- [x] Observe failing actual-audio change/uniform/silence/invalid-grid and service tests.
- [x] Extract bounded full-mix features; select multiscale novelty peaks without forced phrase lengths.
- [x] Add isolated structure refresh with cache/error/job isolation and unchanged other chart data.
- [x] Run targeted Python/JS/service/web suites.

### Task 4 — Repeated groups (Stage 4)

Files: backend structure, evaluator/tests, group colors/navigation.
Interfaces: ordered descriptors and complete-link grouping produce nullable group letters and raw evidence.

- [x] Observe failing A–B–A, reversed harmony, texture negatives and silence checks.
- [x] Implement conservative deterministic grouping with versioned cache and evidence.
- [x] Replay synthetic audio and available recordings; record limitations separately from tests.

### Task 5 — Evaluator and release evidence (Stage 5)

Files: `scripts/testing/structure-benchmark.py`, structure fixtures, README/TODO, dated validation report.
Interfaces: source-time JSON references are evaluator-only; boundary one-to-one F1 at 0.5/3 s and duration-weighted pairwise group F1.

- [x] Observe evaluator tests failing on unmatched boundaries/arbitrary group letters.
- [x] Implement reproducible metrics and baseline comparison.
- [ ] Freeze independent full-song development/evaluation references before tuning on real recordings; default-release gate remains open.
- [x] Run available audio, full `npm test`, `npm run test:web`, UI verification and independent final review.
- [x] Record incomplete full-song reference coverage honestly; keep experimental default if the release gate is unmet.

## Execution ledger

- User authorized this staged implementation on 2026-10-25; no additional routine stage approvals are needed.
- Ruling: implement inline in the existing `codex/local-study` checkout — it contains the approved untracked spec and reusable local data/dependencies; preserve unrelated dirty files and avoid moving them.
- Ruling: keep changes reviewable in the working tree; do not stage/commit unrelated files or require Git metadata mutation to deliver the feature.
- Stages 6–7 remain a separate semantic feasibility experiment and conditional integration; no model benefit is assumed.
- Tasks 1–4: implementation and automated checks complete; live generated A–B–A, save/reopen, manual role/group independence and refresh retention checked.
- Task 5: evaluator and experimental delivery complete; independent full-song annotation/default promotion remain open. Overjoyed and Waste of Time outputs are smoke results only.
- Review fix pass: six Important findings reproduced and corrected with regressions; Windows cache paths now use a hashed revision component. Similarity interpolation uses source time; quiet-change/stationary-noise regression supports adaptive prominence.
- Final verification: `npm test` passed (461 JS pass / one opt-in test skipped; 269 Python pass), `npm run test:web` passed (125), and diff whitespace validation passed. Full PDF appearance and total-process resource measurements remain Stage 5 follow-up checks.
- Quality feedback: the user rejected the v3 song forms and manual correction. Raw-only reruns restore algorithm provenance but do not establish musical correctness. Treat v3 as an unsuccessful baseline.
- Stage 6 feasibility: an isolated All-In-One eight-fold ensemble ran on five full recordings using existing stems; a default-HTDemucs Waste of Time run provides the matching-preprocessing comparator. Native role/time predictions remain unedited. Full-pipeline and functional-only Waste of Time segments compare exactly equal. See `../validation/2026-10-25-semantic-structure-experiment.md` for limits and resources.
- Stage 6 quality gate and Stage 7 integration remain open: unsupported pre-/post-chorus roles, whole-song independent quality, padding/granularity, CPU/clean setup and production installation were not resolved by a successful model run. No further original-session overwrites or model default promotion in this experiment.
