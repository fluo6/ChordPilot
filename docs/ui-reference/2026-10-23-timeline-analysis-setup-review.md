# Timeline / Analysis Setup review — 23 October 2026

## Approved scope

Implemented the supplied Timeline + Passage Lab HTML as a UI reference. Existing
routes `analysis` and `study` remain. Main navigation now says Timeline and Lab;
the full study heading and tooltip say Passage Lab. Further Lab features are deferred.

## Implementation

- Reuse the existing analysis panel and every advanced form control. It is now
  a labelled nonmodal Analysis Setup drawer, hidden at startup on all widths.
- Settings, Timeline Analyze, header Analyze and Home/Song Analyze Audio reveal
  the same panel. They never dispatch processing. Hide/Escape returns focus to
  the opener; leaving Timeline closes the drawer without resetting its controls.
- Drawer uses absolute positioning and `width:min(376px,100%)`; it does not occupy
  a grid column. Remove the old settings-width deduction from inspector resizing.
  Timeline and Bar Detail keep their existing columns and preferred widths.
- Targets, preset, collapsed advanced groups and one Run Selected footer form the
  main workflow. Hidden legacy action nodes retain existing listeners and state
  references. They are not duplicated visible Run/Reanalyse actions.
- The original saved Lyrics checkbox is the Lyrics target, preserving its ID,
  settings persistence and event listeners while avoiding conflicting values.
- Source-only projects use the existing initial `analyzeAudio` operation. Chords
  creates timing; Lyrics can run in that operation and optional stems are required
  when selected. Existing charts use their existing chord/lyric refresh operations.
- Drum/melody processing still uses the existing optional pretrained operations,
  preparing stems when needed. Failure stops subsequent tasks. Busy, missing-source
  and invalid source-only selections cannot dispatch processing.
- Starting Run Selected hides the drawer and uses the existing Log/progress system.
- Remove the old heading-click collapse handler and preserve native checkbox Space
  activation inside the drawer, preventing the global playback shortcut from taking it.
- No backend implementation, music rendering, fretboard/piano, audio, session data,
  chord typography or extra Lab features changed.

## Verification and limitations

- `node --test tests/js/analysis-setup.test.js`: 12 focused checks passed. These use
  isolated in-memory state and backend spies that reject before processing; they
  do not generate mock musical results or invoke expensive model analysis.
- Verified repeated open/Hide, return focus, unchanged configuration values,
  all five operation dispatch paths, initial Chords+Lyrics options, missing-stem
  dependency handling, failure stop, busy/missing-source guards and source wiring.
- JavaScript syntax and Git whitespace checks passed; all 240 original HTML control
  IDs are retained. Independent source review found two issues (heading handler and
  checkbox Space); both were reproduced with failing regression checks and fixed.
- Regenerated the offline full preview from the application source. Analyze openers
  remain interactive; processing/file operations are still explicitly blocked there.
- Manual browser QA at 1600, 1366 and 600px could not be completed: the browser tool
  rejected the local file URL under its protocol policy (only HTTP/HTTPS allowed).
  No alternate browser/transport was used to bypass that block. Pixel layout,
  actual native keyboard traversal and absence of runtime renderer errors at
  those widths remain unverified for this pass.
- No live backend/model run or original-session write was performed. Function
  dispatch checks do not establish successful model execution or end-to-end output.
- Earlier seven-view/icon screenshots are historical, not evidence of this pass.

## Manual acceptance checklist

At 1600x900, 1366x768 and 600x800: confirm hidden startup; open with Settings and
Analyze; change preset/targets/advanced values; Hide/reopen several times; use Tab,
Enter/Space and Escape; resize while open; compare timeline/inspector widths before
and after; inspect all five waveform lanes and all Bar Detail sections. On a real
audio project, run selected supported targets and check the existing Log progress.

Preview: outputs/uiux/ChordPilot-Compact-UI-Review-2026-10-23.html
App: Start ChordPilot Compact UI.bat
Focused source diff: tmp/compact-ui/analysis-setup-only.patch
