# Seven screenshot review — 23 October 2026

Worked in order, with a desktop and narrow capture before advancing to the next
view. The supplied screenshots are preserved in `seven-images/` beside this file.
The original seven-view HTML and the earlier refined chord-card image remain
available. Existing piano, bass/guitar fretboards and MuseJazz chord font are kept.

| Image | View | Changes applied |
| --- | --- | --- |
| 1 | Home | Branded wider sidebar on Home, photographic dawn banner, larger colored shortcut icons, fuller resume card with actual playback control/progress, cover spacing, recent projects, quick actions, real jobs, local-only pinned saved sessions. |
| 2 | Song | Workspace links, larger two-row information form, compact source summary and replacement action, real saved-session path/folder, arrangement statistics/bands, stem icons/waveforms/Solo/Mute and linked volume menus, session actions and source metadata notes. |
| 3 | Local Study | Synchronized bar ruler, sections, normalized chord events and actual beat timestamps above the waveform; A/B boundary labels and playback cursor; focus-selection control; ranked candidates with confidence meters; grouped playback tools; actual saved studies table; original spectrum/piano evidence. |
| 4 | Analysis | Balanced settings/timeline/detail columns, collapsed optional analysis targets, visible Run/refresh section, section bands, original Full Mix and four stems, complete original Bar Detail. Retained the later chord-card decisions: name font, inline confidence/Edit, larger left notation, all alternatives. |
| 5 | Charts | Mode/format/context toolbar rows, matching SVG icons, section jumps, key/tempo/time context, bars-per-line and PDF, display-options disclosure, all alternatives and real key context in the review inspector. Existing alphaTab, chart types, guides, zoom, correction and verification remain. |
| 6 | Log | Active-task card, actual status/type/search filters, job table with known completion states, job detail, full-width live console, auto-scroll and text export. No invented percent, ETA, resource metrics or historical input metadata. |
| 7 | Help | Numbered four-step guide, verified actual keyboard shortcuts, annotated chart example, practical notation tips, four workflow cards with song waveforms, chart legend, troubleshooting and searchable technical reference. |

Some reference illustrations contain additional product features and sample data
(e.g. import from arbitrary chart PDFs, rich-text notes, video tutorial, system
resource telemetry). The implementation uses the existing supported application
flows and real metadata; it does not show interactive controls that promise these
unimplemented features. The offline preview remains explicitly synthetic.

## Inspection and corrections

- Per-view captures: `tmp/compact-ui/image-review/<view>/`, each at nominal window
  sizes 1672×941, 1366×768 and 600×800 (client area differs by OS frame).
- Final native Overjoyed inspection: `tmp/compact-ui/seven-view/seven-inspection.json`.
  No renderer errors; preserved piano/bass/guitar, nine detail sections, five
  waveform lanes, chord font, linked stem volume, correction and unchanged score.
  Original session JSON remained byte-for-byte unchanged.
- Final standalone inspection: `tmp/compact-ui/seven-html/inspection.json`.
  All seven views and five chart formats inspected offline with fonts ready;
  no script errors or external requests. Bass/drums/melody each render 16 demo
  measures; numbered and spreadsheet formats render through their own views.
  Feedback annotation remains functional.
- PDF evidence: `tmp/compact-ui/seven-view/pdf-inspection.json`. Final drum and
  two-bar chord exports were generated from the actual Overjoyed score.
- Reviewed fixes include saved-key candidate formatting for scale-degree roots,
  original-time cursor conversion when a tempo preview is playing, exact
  range labels rather than the playback helper's anticipatory bar selection,
  correct recent-project current marker, and newline-separated console export.
- No automated test suite or fresh music analysis was run for this UI change.
  Main application source and original sessions were not modified.

## Banner asset

File: `src/renderer/assets/workspace-dawn.png`. Generated using the built-in
image-generation tool; the original is retained in the generated-images folder.
The real application keeps each song's authentic album cover. Landscape covers
in the standalone review are illustrative placeholders for its synthetic songs.

Prompt:

> Use case: photorealistic-natural. Asset type: panoramic header background for
> the ChordPilot dark desktop music application. Create a cinematic, natural
> dawn photograph over layered mountain ridges, with a warm small sun at about
> 72 percent horizontal position, hazy golden horizon, dark navy blue foreground
> mountains. Wide panoramic landscape framing, usable at 1600 by 400, calm
> sophisticated mood matching a charcoal and teal desktop DAW. Keep left third
> darker with quiet negative space for white UI heading to be overlaid by code.
> Image only: absolutely no text, no typography, no icons, no interface, no frame,
> no watermark. Photographic landscape, not an illustration.
