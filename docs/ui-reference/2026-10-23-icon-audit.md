# Icon review — 23 October 2026

## Scope

Follow-up to the seven supplied view screenshots: replace crude or ambiguous UI
symbols, remove mixed font-glyph controls and make sizing/alignment consistent.
Changes remain in the compact-daw-ui worktree. The main checkout source, original
song sessions, piano, bass/guitar fretboards, musical SVGs and chord font are preserved.

## Changes

- Bundled a small static Lucide subset, pinned at commit
  `20aef31db93fe4d9f398dbb15b120d99c48eef95`. No runtime network or package dependency.
  Original Song music note and the reference's solid Log tile bars are retained.
- Correct guitar, drum, musical keyboard, microphone, clock, pencil, folder,
  search and document symbols. Shared 24-unit artwork, round strokes and explicit
  intrinsic SVG dimensions prevent browser-dependent sizing.
- Consistent 16px controls, 22px navigation, larger Home tiles and Help headings.
  Text-only header actions follow the references; instrument visualization is unchanged.
- Replace font-glyph arrows, menu dots, grips and close controls with SVGs.
  Refresh dynamic controls after original panel handlers change their contents.
- Retain accessible control labels and decorative SVG semantics. Avoid generic
  flex layout on complex workflow cards. Space icons beside documentation links.
- Exclude notation preview disclosures from UI decoration and hide decorative
  icons in print. This fixes the extra print space encountered during icon validation.

## Inspection evidence

- Final standalone snapshot: seven views, 40-icon comparison gallery, desktop
  and narrow layouts; no script errors or external requests.
- Every visible audited icon has valid bounds; every audited icon-only button
  has an accessible label. Expanded/collapsed/restored arrows update correctly.
- Bass, drums and melody each display all 16 synthetic measures; numbered and
  spreadsheet formats remain available. Feedback annotation works.
- Native read-only Overjoyed inspection: original piano/bass/guitar present,
  MuseJazz Text chord font retained, nine Bar Detail sections and five stem lanes.
  Linked stem volume and temporary correction checked; original session unchanged.
- Final native PDF inspection: drums at four bars per line, 144351 bytes, four A3
  pages, notation visible on page one; chord chart at two bars per line, 89712 bytes.
  In-memory musical data and original session file unchanged by export.
- JavaScript syntax checks and Git whitespace check completed without errors.
  No automated application test suite or new transcription analysis was run.

## Review artifacts

- `outputs/uiux/ChordPilot-Icon-Review-2026-10-23.html`: previous/updated icon sheet.
- `outputs/uiux/ChordPilot-Compact-UI-Review-2026-10-23.html`: interactive full app preview.
- `tmp/compact-ui/icon-audit/inspection.json`: final runtime inspection evidence.
- `tmp/compact-ui/icon-only.patch`: diff against pre-icon snapshots for review.
- `src/renderer/vendor/lucide/icons-source.json`: source names and pinned SVG artwork.
- `src/renderer/vendor/lucide/LICENSE.txt`: complete license attribution.

Lucide source: https://github.com/lucide-icons/lucide/tree/20aef31db93fe4d9f398dbb15b120d99c48eef95/icons
License: https://lucide.dev/license
