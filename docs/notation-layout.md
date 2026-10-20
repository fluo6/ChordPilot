# Chart layout and playback following

Bass Notes / TAB and Drum Sheet now use alphaTab exclusively. There is no
notation renderer selector, comparison view or legacy chart fallback. Pitches
outside the detected 4/5-string tuning stay in complete standard notation with
diagnostics. Rendering failures offer Retry, and PDF export waits for a complete
score. Shared compact notation in the Analysis sidebar remains independent.
The development notes below also describe the earlier custom chart layouts.

Run `npm run smoke:notation` for a headless bass/drum rendering, playback,
table-refresh, retry and PDF check using synthetic musical events. Set
`CHORDPILOT_NOTATION_FIXTURES` to a local snapshot directory containing
`fixtures.json` and `full-bass-5.json` to include saved-song passages and the
75-bar Overjoyed regression. Snapshots and generated outputs are kept local.

The [transcription-review follow-up](superpowers/validation/2026-10-19-overjoyed-transcription-review.md)
adds selected-bar listening/corrections/verification, saved bass notation/TAB
modes, metadata-derived compact headings and current-note/hit highlighting.
Drum and bass chord labels now share collision handling. Spare width protects
sparse measures before adding space for density. Printed scores retain explicit
Unverified status while omitting review controls. Recognition accuracy and
separate kick/hands voices remain open work in TODO.md.

## Use

- Restart the development app to load the updated renderer. Open a song and the
  chart/Table view. No audio or chord reanalysis is needed for these display changes.
- Choose **Bars per line: 2 | 4** in the chart header. Four is the default.
  A new section starts a new line, so a section's last line can contain fewer bars.
  Short lines retain normal notation size and do not stretch across a whole page.
- The shared setting applies to chord charts, measure grids, drum sheets, bass
  score/TAB and ChordPro. It is disabled for the editable table, which uses rows.
  The application currently has no separate melody/lead-sheet renderer.
- Chart sheets fill the preview width with equal side margins. Chord charts and
  grids fit their parent panel and recalculate when its width changes. Bass
  systems reflow to fewer bars when needed, keeping their glyph size; exceptionally
  dense individual bars and drum notation can still require horizontal scrolling.
  Chord charts and grids use beat columns and duration lines;
  short colliding labels gain vertical space while retaining their onset guides.
  A label wider than its entire bar scales down to stay within that bar.
  PDF paper selection accounts for the visible sheet width.
- Choose **Auto-follow** beside Source Playback. It follows the active system
  when that system leaves the comfortable viewing area. Scrolling, scrollbar
  dragging, touch movement and navigation keys suspend following for eight
  seconds. **Resume following** returns sooner. Pausing stops automatic scrolling;
  seeking and playback restarts update highlighting from the actual audio time.
- Click a measure or its bar number to seek. The current measure remains
  highlighted with following disabled. Chord/measure grids also show a small
  position marker. Notation views highlight the current measure and detected hits.
- Click an individual chord to seek to its onset. Chord charts and grids place
  symbols at fractional beats using the measured timing map, with a line showing
  each event's duration. ChordPro preview gives explicit beat/duration annotations.
  These display changes preserve the stored audio timestamps and chord names.
- Save the session to retain density and Auto-follow preferences.

## Print and PDF

The chart header's **PDF** button exports the visible chart renderer using its
current density. Desktop uses Electron's PDF writer; web uses the browser print
dialog. Preview and print use the same rendered music and notation scale.

Systems are kept together on a page. Section labels stay with the following
system. Playback highlights and controls are omitted from print. Paper is A4
portrait when possible, A4 landscape for wider scores, and A3 landscape for dense
scores. An exceptionally wide system can use wider paper rather than reducing
every note's size. Choosing two bars per line generally reduces required width.

## Rendering changes

Drum notation uses a consistent staff, notehead scale and default upward stems,
with extra clearance when flags require it. Standard staff positions distinguish
kick, snare, toms, cross-head hi-hat and cymbals. Beams follow beats (or dotted
quarter groups in compound meter). Adjacent silent beats can share a rest;
detected attacks and their original timestamps are preserved.

Horizontal spacing reserves the actual room needed by noteheads, accidentals,
flags and stems, then distributes spare room by rhythmic duration. A short
subdivision no longer stretches its entire measure. Drum and bass chart systems
share this spacing calculation. Detail bass notation retains its existing beat
columns. All systems use one physical notation scale; dense lines can scroll
horizontally in the preview.

Native drum and bass systems are measured before drawing. Full lines share a
common width that fills the available reading area and accommodates the densest
line. Each measure keeps its minimum glyph clearance; spare space is divided
equally between measures, so dense passages do not take space away from simple
neighbours. Short lines use their fraction of the full width, expanding only if
their notation requires it. Window resizing recalculates spacing without scaling
the glyphs. Drum systems also use a shorter canvas and tighter inter-system gaps.

Shared section styling and bar numbering improve navigation, and supported
repeat barlines remain visible. Chord symbols, harmony, detected notes and saved
musical content were not changed by this work.

Playback following uses the application's existing original-audio position
(including tempo-preview conversion). It updates cached measure elements rather
than rebuilding the score on every playback tick. Repeat playback represented
by seeking the source audio is handled by the same position updates; printed
repeat symbols do not independently reorder the recording.

## Validation — 2026-10-19

- `npm run test:unit`: **353 passed**.
- Full drum and bass lines share a consistent right edge in both densities;
  minimum subdivision clearance and score/TAB alignment have regression checks.
- Real application renderer smoke: the full 105-bar Waste Of Time chart in both
  densities across five chart types; all measures present and music unchanged.
- SVG scale checked on every system: approximately 0.65 native units to CSS
  pixels, with less than 0.001 variation. Changing density never changes glyph size.
- Playback-position updates retained the existing score DOM. Manual scrollbar
  suspension, Resume, visible controls and clicking a measure to seek passed.
- Stress patterns: 32nd notes, simultaneous kick/snare/tom/cymbals, silent bars,
  section breaks after five and nine bars, repeats and short final systems. Both
  densities passed, with SVG contents inside their vertical bounds.
- Ten PDFs read back: all 105 bar numbers present in drum and bass exports and
  no system split between pages. First and last pages were rasterized for visual
  inspection, along with the dense stress example.
- Independent review found follow-resumption, scrollbar ownership, stale
  selection, hidden-panel and print-color issues; these were corrected.

Artifacts are in `outputs/notation-validation/`, including `drums-2.pdf`,
`drums-4.pdf`, `bass-2.pdf`, `bass-4.pdf`, previews, `results.json`,
`pdf-check.json`, `stress-check.json`, `follow-check.json` and `unit-tests.log`.

Reproduce the integration/print checks:

```powershell
npm run smoke:notation
npm run test:unit
```

The PDF read-back checker uses the locally available PyMuPDF package solely for
verification. No new runtime dependency was added to the application.

## Bass score readability — 2026-10-19

The bass chart now groups adjacent chord events that have the same displayed
symbol. For example, Fmaj7 → Fmaj9 → Fmaj13 prints once when Simplify Chords is
enabled; the underlying events stay separate. Hover text retains the original
names and time range, and clicking keeps the first original event's selection
index. Distinct labels use collision-free lanes inside their own measure, with
onset ticks anchored to the original times. Density and resizing share the chord
chart's label fitting logic.

Held bass notes near an eighth-note boundary settle onto that boundary for
notation. The tolerance is one sixth of a beat and applies only to holds lasting
at least half a beat. A gap after a hold joins the following attack only when it
is no longer than 50 ms or 0.12 beat, whichever is smaller. Short confirmed notes
retain the finer rhythm grid and separate attack identities. Raw saved pitches,
onsets, releases and detector confidence are unchanged; this is approximate
engraving, not a new transcription or removal of detection artifacts.

TAB numbers are larger, with matching font/glyph metrics. The clef and key
signature repeat on new systems; an unchanged time signature appears only at
the beginning of the chart. The sidebar score uses the same rhythm and TAB
component.

Liang Bo's screenshot passage, bars 57–68, is the regression case. At four bars
per line, five overlapping label pairs become zero, 32 displayed labels become
27, 19 internal ties become 10, and 24 rests become 19. The same 33 source events
remain represented. Both densities, narrow/wide resizing, seeking and unchanged
saved data are checked. Source JSON is read-only throughout this validation.

Verification: **361 JavaScript tests pass**; the full 105-bar Waste Of Time layout
passes across five renderers and both densities. Ten exported PDFs retain all
105 measures with complete systems. Sir Duke's two measured C#2 attacks remain
separate. Independent correctness review found no actionable issues.

Artifacts are under `outputs/bass-readability/`: `after-4.png`, `after-2.png`,
`before.json`, `after.json`, `bass-4.pdf`, `bass-2.pdf`, `unit-tests.log` and `full/`.
The before/after JSON records notation counts and label collisions; use the
current `after-*.png` for visual inspection.

```powershell
npm run smoke:notation
npm run test:unit
```

## Bass engraving and responsive systems — 2026-10-19

The shared measure allocator now uses equal widths whenever all glyph minimums
fit. A dense measure can exceed that equal share only when its minimum clearance
requires it; remaining measures share the available space evenly. This also
improves drum measure balance. Bass keeps the selected 2/4-bar density as its
maximum, re-engraving smaller systems when a line cannot fit at the normal scale.
New systems retain clefs, key signatures and cross-system ties. Short section
endings keep their proportion of the line. An extremely dense single measure may
still exceed a narrow panel rather than shrink its music.

TAB uses a 35-unit minimum stem length, with additional clearance for flags that
require it. Beams are level and rests occupy the rhythm lane above the strings.
The score-to-TAB gap accounts for the longest flag/stem; string spacing is 14
native units. Fret numbers use 15 pt Arial with matching native font metrics for
one- and two-digit numbers. Standard notes, TAB numbers, stems and chord onset
guides continue to share horizontal positions. Smaller beat guides and tighter
inter-system gaps keep navigation subordinate to the music.

Validation uses the current saved Overjoyed session, especially bars 29–40.
Both density settings at 1672 px and 1100 px window widths have no horizontal
overflow or clipped SVG ink. Logical score/TAB centres match; actual rendered
fret centres differ from notehead ink centres by less than half a CSS pixel.
The complete 75-bar song renders in both modes without changing musical data;
playback updates reuse the DOM and wheel scrolling suspends auto-follow.

Both PDF exports contain all 12 passage measures with complete systems. Every
PDF page was rasterized for visual review. **379 JavaScript tests pass.** Saved
source JSON hashes remain unchanged. Rhythm quantization and tuplet recognition
are unchanged; this work improves engraving, not transcription.

Evidence is under `outputs/bass-engraving/`: `after-4-1672.png`,
`after-2-1672.png`, narrow previews, `bass-4.pdf`, `bass-2.pdf`, rasterized pages,
`after.json`, `full-song.json`, `pdf-check.json` and `unit-tests.log`.

```powershell
npm run smoke:notation
npm run test:unit
```

The focused smoke requires the locally generated Liang Bo session artifact under
`outputs/session-refresh/2026-10-19-liangbo/`; it does not contain or inject
reference transcription labels. No reanalysis is needed to use the revised layout
with an existing session.

## Compact hybrid styling — 2026-10-19

The music retains black-and-white engraving. Shared chart navigation now uses
compact 12 px section markers, a thin left accent/divider and 11 px bar numbers.
Section banners no longer have a coloured background. The generic dark button
hover rule excludes paper-chart navigation, fixing the dark rectangle over bar
numbers; active bass measures use a 6% teal tint and a thin outline. Printing
removes playback tint and uses neutral grey navigation.

Bass-specific geometry stays in the bass component. TAB string spacing is
12 native units, making four-string TAB slightly shorter than the five-line
standard staff. Stem-aware clearance replaces the larger fixed staff/TAB gap.
The chart's SVG view box trims reserved whitespace to actual ink, including
flags, ties and ledger notes; selection hitboxes are excluded from that measurement.
Hidden renders retain a safe fallback and rebuild when shown. Note and fret
centres remain identical horizontally.

Chord symbols use 20 px text. When nearby labels fit inside a measure they share
one baseline; slight horizontal shifts have dotted leaders to their unchanged
onset anchors. Collision lanes remain available for genuinely crowded bars.
Bass measures receive spare horizontal room weighted by the square root of their
rhythm-event count, after all minimum glyph clearances are reserved. Drum spacing
retains its previous allocation. Both densities keep the same notation scale and
shared system width.

Measured on the same 12-bar Liang Bo passage:

| Property | Before | After |
| --- | --- | --- |
| Four-bar system heights | 219–255 px | 185–195 px |
| Two-bar system heights | 213–223 px | 168–185 px |
| Section marker height | 30 px | 21.8 px |
| Bar-number size | 10 px | 11 px |
| Bar-number hover background | Dark RGB 41/51/65 | Transparent |
| Label collisions / clipped systems | 0 / 0 | 0 / 0 |

The hover regression is checked with Chromium's forced `:hover` state. Playback
fill, neutral print styling, both densities, responsive widths, exact seeking,
unchanged musical events and source-file integrity are checked in the real app.
**363 JavaScript tests pass**. Full-song layout/export checks cover 105 measures,
five renderer types, both densities and ten PDFs. Sir Duke's measured repeated
C#2 pair and suggested positions remain intact. Independent review found no
actionable issue and verified packing bounds/spacing on 100,000 random cases.

Artifacts: `outputs/bass-polish/after-4.png`, `after-2.png`, `before.json`,
`after.json`, `layout.log`, `unit-tests.log`, `full/` and `pdf-check.log`.

```powershell
npm run smoke:notation
npm run test:unit
```
