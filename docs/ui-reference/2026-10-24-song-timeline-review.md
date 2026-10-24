# Song / Timeline consolidation — implementation and validation

Date: 24 October 2026. Worktree: `compact-daw-ui`, branch `codex/compact-daw-ui`.

## Implemented

- Sidebar: Home, Timeline, Charts, Lab, Log, Help. Legacy `arrange` callers and saved routes normalize to Timeline; Home Continue opens Timeline.
- Small info toggle beside the non-clickable song title. Teal active state, tooltip, focus styling and expanded state. Compact key/BPM/time readouts focus the existing fields when there is room.
- Song Details moves the original title, transpose/key, tempo, time, source audio, separation mode, tuning, audio preview and editing/export nodes. Original listeners and IDs remain. Artist, album and genre are read-only. Source-only musical fields are read-only until a chart exists.
- Source metadata, artwork, existing metadata lookup and file information remain available. Notes bind to `state.audio.comment`, saved by the existing session payload. Session file location is shown.
- Song Details replaces Bar / Beat Detail in its Timeline slot without changing the selected bar or stored visibility preference. Info, Close and Escape close it; Bar Detail switches explicitly back. Charts/Lab use the same panel as an overlay.
- Analysis Setup and Song Details alternate without clearing their controls. Modal file/session dialogs retain Escape priority. Narrow Song Details fills the workspace, with internal scrolling.
- Removed duplicate Song overview, arrangement summary, stems, session actions and their obsolete styles/helpers. Existing five Timeline audio lanes, complete Bar / Beat Detail markup, piano/fretboards, alphaTab, audio/backend operations and PDF functions are retained.

## Evidence

- 40 focused Node tests passed: Song Details, Analysis Setup, piano panel styling and study piano.
- State/DOM-double tests cover repeated switching at 1600/1366/600, readonly metadata, source-only behavior, form node identity/listeners, modal Escape, Analysis Setup coexistence, and native save/restore functions with JSON serialization.
- The original Overjoyed session was read only. Its chart data remains identical through repeated inspector state switches at the three target widths, and its file bytes remain unchanged. This is a Node state check, not native-app playback validation.
- A fresh independent source review identified source-card grid compression and Escape interception by the background drawer. Both were fixed and regression-tested; follow-up review found no new consequential issue.
- All application scripts and standalone preview scripts were syntax checked. The complete Bar / Beat Detail HTML is unchanged. Whitespace checks passed.

## Remaining manual validation

The browser tool explicitly rejected local-file access and forbade alternate-browser, Electron, CDP or local-server workarounds. Therefore rendered layout at 1600/1366/600, actual keyboard/tab traversal, live playback/transposition, native file dialogs, live backend processing, and PDF output were **not** visually or end-to-end validated. No before/after screenshots are claimed.

The offline review uses a clearly labelled synthetic silent project. It is not analysis output and does not replace production code. The actual implementation is in the worktree, launchable through `Start ChordPilot Compact UI.bat`.

Review artifact: `outputs/uiux/ChordPilot-Timeline-Song-Details-2026-10-24.html`. Open Song Details with the info icon beside the title; Timeline starts with the normal Bar Detail inspector. Main checkout source and original song sessions were not modified by this task. Nothing committed or pushed.
