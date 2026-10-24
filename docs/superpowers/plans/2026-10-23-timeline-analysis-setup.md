# Timeline Analysis Setup implementation plan

**Goal:** Implement the user's approved naming and setup UX in the current worktree.
**Architecture:** Preserve internal routes and existing control nodes. One hidden-state
drawer overlays the existing workspace. Existing analysis functions perform all processing.
**Stack:** Existing DOM, CSS, Electron and backend bridge; no new dependencies.
**Spec:** User request and docs/ui-reference/ChordPilot-Compact-UI-v2-Timeline-Passage-Lab.html.

## Constraints and decisions
- Scope: Timeline/Lab naming and Analysis Setup only; Passage Lab features deferred.
- Main checkout, musical components and original sessions remain untouched.
- Reuse Lyrics enabled checkbox as the primary Lyrics target to avoid conflicting values.
- On a new audio project, Chords establishes the timeline before optional stem analyses.
- Nonmodal labelled drawer: focus Hide on opening, Escape/Hide returns to opener.
- Always start hidden; do not restore obsolete settingsOpen preference.
- No automated test suite requested: use manual browser QA and non-destructive native inspection.

## Tasks
- [x] Trace existing listeners, configuration and initial/reanalysis/backend flows.
- [x] Rename visible navigation/headings without changing route identifiers.
- [x] Replace persistent/mobile settings state with one temporary drawer.
- [x] Present targets/preset/collapsed advanced options and one Run Selected action.
- [ ] Inspect actual saved Overjoyed renderer at 1600/1366/600; verify five lanes and inspector.
- [ ] Manually check both openers, Hide/reopen, keyboard, target/preset persistence and widths.
- [x] Check operation dispatch before IPC processing; do not fabricate results or write sessions.
- [x] Refresh standalone review and document limitations/evidence.

## Review focus
Source-only projects, missing source audio, busy jobs, old settings preferences,
and viewport changes must not leave an inaccessible drawer or enabled invalid run.

Browser QA blocked by local file URL policy. Visual/width checklist remains pending; source interaction/dispatch checks pass.

Final static review resolved the stale heading listener and checkbox Space issue. 12 focused checks pass; visual QA remains blocked.
