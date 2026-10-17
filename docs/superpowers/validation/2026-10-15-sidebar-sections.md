# Collapsible and reorderable Beat Detail sections

Seven stable native details sections wrap the existing Chord, Piano, Bass Notes, Frequency Spectrum, Bar Settings, Lyrics and Notes controls. A dedicated grip supports native drag-and-drop before/after another section and Alt + Up/Down keyboard movement. Native summary keyboard activation is isolated from the global playback shortcut. Only wrappers move; existing control listeners and evidence renderers remain attached.

Session UI state stores section order and collapsed keys. Restoration filters unknown/duplicate keys and appends newly introduced or missing sections in default order. Older sessions start with all sections open.

Verification on 2026-10-15:

- Regression tests cover normalization, malformed/legacy layouts, before/after movement, no-op/invalid drops and preservation of collapsed state.
- JavaScript suite: 275 passed with the two established environment/cleanup exclusions.
- Browser drag moved Bass Notes above Chord, with collapsed Chord/Piano preserved. Alt + Up moved Piano above Chord.
- Save/reopen restored order and collapsed state; Space on the Chord header expanded it while audio remained paused.
- Live playback reached C2 inside reordered Bass Notes while Chord/Piano remained collapsed.
- Final independent review found no remaining actionable issues.
- Screenshot: `.chordpilot-data/benchmarks/notation/sidebar-sections-preview.jpg`.
