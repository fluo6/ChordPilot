# Sub-bar chord implementation validation

Implemented by a user-requested Luna subagent, reviewed and verified by the parent.

## Delivered

- Auto changes, Fixed grid, and Legacy timing modes; half-bar, beat, and half-beat cells.
- Ordered chord events inside existing musical measures, with per-event evidence, alternatives, confidence, Bass reference, and a dominant-chord compatibility summary.
- Event-aware timeline, chart/table views, transposition, original-time playback highlighting, and exact-interval Local Study links.
- Individual chord corrections, split/merge, draggable and keyboard-adjustable boundaries, historical-evidence indication, and preservation through measure edits and session save/reopen.
- Multiple chords retained in TXT, CSV, JSON, and MusicXML, with legacy TXT/CSV compatibility and beat-aware fractional MusicXML offsets.

## Parent review and verification

- Reviewed changes relative to an inventory of pre-existing workspace modifications; those unrelated changes remain uncommitted.
- Corrected review findings in grid alignment, Auto score comparison, evidence preservation, stored-event editing, malformed legacy fallbacks, measure coverage, duplicated beat timestamps in export, same-lane drag filtering, replacement-chart gesture cancellation, playback around measure boundaries, and boundary focus/keyboard propagation.
- Final JavaScript command: `node --test --test-skip-pattern='environment defaults parse without starting the HTTP server|smoke CLI preserves its primary error and attempts directory cleanup when WAV removal fails' tests/js/*.test.js`: **229 passed, 0 failed**. Two pre-existing Windows cases are excluded, not counted as passed. Local HTTP tests required sandbox escalation and an accessible non-hidden workspace TEMP directory.
- Final Python command: `npm run test:python`, with `CHORDPILOT_PYTHON=C:\Python39\python.exe` and an accessible workspace TEMP directory: **83 passed**. Running the default QGIS Python inside the restricted sandbox failed on temporary-directory access; the explicit Python 3.9 run passed.
- `git diff --check` passed.

## Native Electron QA

Used the existing Electron runtime with isolated user data and a synthetic four-measure session, rather than the user's song session.

- Opened Analysis and verified timing/grid controls, two chord regions per bar, and selected-event evidence.
- Corrected only event 1.2 from G to D; event 1.1 stayed C.
- Opened Study this chord and verified its exact 1–2-second interval.
- Dragged the first internal boundary to approximately 1.3 seconds; neighboring bar intervals stayed unchanged and the edited evidence was marked historical.
- Saved to an isolated workspace session, restarted Electron, reopened it, and verified the D correction and Fixed/beat settings.
- Verified Legacy disables the grid selector.
- Repeated ArrowRight boundary edits changed the boundary from 1 to 1.05 to 1.10 seconds; playback stayed paused at 5 seconds and other boundaries remained 3, 5, and 7 seconds.
- Screenshot saved in the task visualization directory as `sub-bar-chord-events.jpg`.

## Real-song comparison and limits

`2026-10-12-sub-bar-session-comparison.json` contains a read-only four-bar comparison of the referenced Waste Of Time recording using its existing Other/Bass stems, in Legacy, Fixed/beat, Fixed/half-beat, and Auto modes. The original session and stems were not modified.

The comparison was not checked by listening; chord correctness and beat alignment in that recording remain musical validation tasks. Auto uses the configured grid and conservative evidence-based grouping, not sample-accurate onset detection.
