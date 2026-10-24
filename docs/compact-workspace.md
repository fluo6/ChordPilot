# Compact workspace UI

Isolated branch: `codex/compact-daw-ui`. Based on the complete working checkout,
including its uncommitted melody, spreadsheet and beat-alignment work.

Reference: Improve Drum Chart, latest response: compact-only DAW layout;
Analysis keeps all four stems and the complete Bar / Beat Detail pane;
Charts keeps the separate Why This Chord inspector. The visible reference
preview and latest reply were recovered; HTML download was blocked by browser
permission. The reference is design guidance, not a source of application data.

## Changes

- 52px navigation rail by default, expandable labels; compact flat surfaces.
- Shared source transport in Song, Analysis, Study, Charts and Log.
- Collapsible Analysis settings leave space for the original arrangement lanes.
- Independently scrolling, collapsible Bar Detail and chord evidence inspectors.
- Both panel dividers support pointer dragging and keyboard arrow keys.
- Charts Read / Review / Edit layouts, real section jump buttons, existing
  chart formats, mixer and editing controls. Escape leaves Read mode.
- Compact Home, Study and Help, wrapping controls on small screens.
- Local UI preferences are separate from song JSON. No backend, music data,
  engraving algorithms, stem routing or session payload changes.

The original checkout and original session JSON files are not changed by this
UI update. Launch `Start ChordPilot QA.bat` from this worktree to review it.

## Visual inspection

The actual Overjoyed session was opened in a temporary Electron profile.
22 screen captures cover Home, Song, Analysis, Charts, Local Study, Log and Help;
window sizes 1600x900, 1366x768, 900x760 and 600x800; six score/table formats;
and Read / Review / Edit layouts. No renderer console errors were recorded.
The captured page widths showed no page-wide horizontal overflow. Timeline,
section navigation, full keyboards/fretboards and the editable data table retain
local scrolling where it is useful. Narrow screens stack inspectors below the
workspace instead of cropping them.

Screens and measured geometry: `tmp/compact-ui/screens/inspection.json`.
UI-only diff: `tmp/compact-ui/compact-ui-only.patch`.
Original source snapshots: `tmp/compact-ui/baseline/`.
Source comparison: `tmp/compact-ui/change-manifest.json`. The tracked waveform
file had checkout CRLF normalization; source content matched the main checkout.
The source session JSON remained byte-for-byte unchanged during UI inspection.
No automated test suite or new audio analysis was run for this layout update.
The existing waveform sizing expectation was aligned with the new 56px default (112px at 2x). No new tests were added or run.

## Small review and cleanup (22 October)

- Fixed Read -> Inspector so the panel opens even when previously closed.
- Divider dragging now updates width only, without rescanning song sections or
  synchronising unrelated controls on every pointer movement.
- Removed the redundant document-wide navigation click handler; navigation
  accessibility state updates through the existing view lifecycle.
- Consolidated duplicated arrangement-toolbar CSS; kept the chart toolbar
  visible while scrolling the editable table.

A focused native UI inspection recorded the restored inspector, keyboard
divider adjustment, real Verse section jump, Home navigation state and narrow
layout. No renderer errors were recorded; source session and original checkout
were unchanged. Details: `tmp/compact-ui/screens/cleanup-inspection.json`.

## Morning review artifact

Generated after 5am Sydney, 22 October: outputs/uiux/ChordPilot-Compact-UI-Review-2026-10-22.html. A standalone synthetic-data snapshot with embedded assets and selector-specific feedback tools. Native offline inspection: 15 captures, no script errors or external requests; all 16 bass/drum/melody measures rendered. Evidence: tmp/compact-ui/morning-html/inspection.json.


## Further Table / Charts update from the confirmed reference

- Added quick Chords / Bass + TAB / Drums / Melody buttons and retained all nine
  formats in the existing selector. Performance / Review / Edit share one score.
- Added 75–150% screen zoom, reset and Clean/Detailed guide presentation.
  Notes, durations, warnings and source musical events are unchanged by these.
- Collapsed lyric reference by default, retained linked stem mixer controls,
  and moved the existing transcription event editor into the scrolling inspector.
- Inspector now shows selected measure context, instrument-specific review status,
  listening/stop, verification, progress, evidence disclosure and an Edit-mode
  chord correction form. These call the existing review/correction functions.
- Alternative chord selection now uses the same correction history mechanism,
  preserving the original detection and clearing stale model confidence.
- Print preparation excludes screen zoom and restores it after PDF export.

Native UI inspection used a temporary copy of the actual Overjoyed session:
11 captures, no renderer errors or page-wide overflow; two/four bar layouts,
100/125% zoom, Performance/Review/Edit, bass/drums, verification and correction.
PDF export contained 77 measure labels across 11 pages; preparation zoom was 1.0,
restored screen zoom 1.25; score data was unchanged by printing. The sample PDF
was rendered and inspected. Source session JSON stayed byte-for-byte unchanged.
No automated test suite or fresh music analysis was run.

The refreshed standalone HTML was inspected separately: all screens, five score
formats, all 16 synthetic bass/drum/melody measures, feedback attachment and narrow
layout; no script errors or external requests. The preceding HTML is preserved
as outputs/uiux/ChordPilot-Compact-UI-Review-2026-10-22-before-table-update.html.

Evidence: tmp/compact-ui/screens/charts-v2-inspection.json and
 tmp/compact-ui/morning-html/inspection.json.
Focused change: tmp/compact-ui/table-ui-only.patch.


## Further Analysis layout arrangement

- Moved the existing Analysis controls into a collapsible left dock, freeing the
  timeline from the previous settings row. Grouped controls into Sources & stems,
  Timing & key, Chords & filtering and Lyrics. Run/refresh actions stay accessible.
- Reused the original inputs and listeners. The dock separation-mode selector
  updates the existing Song selector in both directions; backend options are unchanged.
- Grouped track tools and placed less frequent playback controls in a disclosure.
  Default waveform heights use available vertical space; explicit user sizes remain
  intact. Resize, keyboard adjustment and reset use the same displayed height.
- Retained the full Bar / Beat Detail inspector, piano, bass/guitar fretboards,
  drum notes and spectrum. Added previous/next-bar inspection and a section jump.
  The chord notation has room to display without an internal clipping scroll area.
- Inspector width survives narrow windows. Both side docks can collapse without
  changing grid placement. Timeline Fit now fits the song; zoom leaves Fit mode.
- Saved Analysis dock preferences separately from song data, with an isolated key
  in the standalone HTML. Refreshed the existing review artifact and retained its
  previous version with the before-analysis-update suffix.

Native UI inspection used the actual Overjoyed session at 1600, 1366 and 600px,
including dock/inspector collapse, settings, playback menu, linked separation mode,
bar navigation, waveform resizing/reset, Fit/zoom and return to Charts. No renderer
errors or page-wide overflow were recorded. All four stems and Full Mix remained
present. The source score and original session JSON were unchanged.
The standalone HTML was inspected offline with all screens and five chart formats.
No automated test suite or new music analysis was run for this layout change.

Evidence: tmp/compact-ui/screens/analysis-v3-inspection.json,
tmp/compact-ui/morning-html/inspection.json and tmp/compact-ui/analysis-change-manifest.json.
Focused change: tmp/compact-ui/analysis-ui-only.patch.


## Seven-view reference update — 23 October 2026

Reference: docs/ui-reference/ChordPilot_Seven_View_Prototype.html, copied from the
supplied HTML. Refined the shared header/transport, labelled rail, Home dashboard,
Song/session columns, Analysis dock and timeline, Charts workspace, Local Study,
Log and Help. Kept the existing piano, bass/guitar fretboards and MuseJazz chord
font. Original controls and listeners are reused; no transcription data changed.

The Analysis chord card gives notation more space, keeps name/confidence/Edit
inline and shows all alternatives as subtle pills. The complete original Bar
Detail inspector and all stems remain available. Added optional analysis-target
selection using the existing operations; chord refresh runs before dynamically
checking stem dependencies, so a replacement chart cannot erase newly prepared
stems. No analysis runs just by visiting a view.

Mobile docks use separate visibility preferences, close buttons and Escape.
Desktop accessibility state is restored after resizing. Native source playback,
shared per-stem volumes, chart formats and PDF export remain in place. Print rules
account for the shared shell so the score remains visible in exported PDFs.

Native inspection used the real Overjoyed session at 1600, 1366 and 600px across
all seven screens. No renderer errors or page-wide horizontal overflow were
recorded. Piano, both fretboards, five waveform lanes and all nine detail sections
were present. Linked stem volumes and chord correction were inspected without
writing the original session. Drums at four bars and chords at two bars exported
valid PDFs (four and seven A3 pages respectively); first pages were visually
inspected and contained the score. Original JSON stayed byte-for-byte unchanged.

The standalone 23 October HTML was inspected offline with all seven screens,
five chart formats and annotation controls: no script errors or external requests.
It uses only synthetic demo content and silent playback. No automated test suite
or new music analysis was run for this layout change. Review feedback fixed the
analysis task ordering and mobile-to-desktop accessibility issues before handover.

Evidence: tmp/compact-ui/seven-change-manifest.json and the inspection records
listed there. Focused patch: tmp/compact-ui/seven-ui-only.patch. The earlier
22 October artifact is retained with the before-seven-view suffix.

### Chat image and icon follow-up

Read the Improve Drum Chart chat again. The reader exposed one actual attached
chord-card image (preserved as docs/ui-reference/chat-chord-card.png). Its key
control, large left notation and unchanged chord name/font are retained; later
written refinements place Edit and confidence inline and expose all alternatives.
Generated per-view images are empty content references in the reader, so they
have not been visually inspected. They require a user upload/export for coverage.

Aligned all seven rail symbols and Home shortcut icons with the supplied HTML's
SVG artwork, including Charts as a score page and Local Study as loop arrows.
Added matching icons to header/session actions, quick actions, relevant panel
headings and the Help workflow. Icons are decorative and retain visible text,
original event listeners and keyboard behavior. No icon library was added.

Re-inspected the offline preview and actual Overjoyed UI after the icon changes:
no renderer errors or external requests; desktop/narrow layouts and score formats
remain available. Piano, bass/guitar artwork and chord font remain unchanged.


## Follow-up against all seven screenshots

Applied the screenshots one by one in the user's supplied order. Detailed
comparison, preserved reference images, generated banner prompt and inspection
records: docs/ui-reference/2026-10-23-seven-image-review.md.

The refreshed HTML includes Home, Song, Local Study, Analysis, Charts, Log and
Help refinements. Earlier 23 October HTML is preserved with the before-images
suffix. No original session files or main-checkout application code changed.
