# Rhythmic bass score and TAB

The sidebar's whole-note pitch preview is replaced by aligned VexFlow score and TAB voices. They show whole, half, quarter, eighth and sixteenth values, single dots, rests, rhythmic stems/beams and ties. Holds crossing a bar line receive partial outgoing/incoming ties, even though only one bar is visible. The existing four/five-string switch, sounding-to-written octave transposition, key-signature option, compact centered engraving and current-note color remain.

`bassRhythm` maps detected note starts and ends through a complete per-bar beat map, or evenly through the bar duration when that map is unavailable, then rounds to a sixteenth-note grid. Both voices fill the same time signature exactly. Offbeat holds split at beat boundaries; compound 6/8 groups use dotted-quarter pulses. Very short detections that collapse on the grid are omitted. No detected times, chord evidence, analysis settings or playback audio are changed. Highlighting and hover times retain the original source-note identity and times.

Rhythm is an estimate, not a performance transcription: triplets/swing are approximated by this grid; unvoiced detection gaps appear as rests; an incorrect meter or beat grid gives incorrect notation. Old sessions can use their coarse cell timing immediately, and Reanalyse Chords can refresh independent note timing from existing stems. No reanalysis is needed for sessions already containing `bass_events`.

Native engraving fixes include preserving the same tick positions in score and TAB, consistent accidentals over the whole bar, upward TAB beams so they stay inside the SVG, a copied/adapted TAB-clef baseline for four/five strings, through-stave TAB stems and no stem on a whole note. Bounds account for low notes, upper stems and the additional fifth string. Timing/meter edits invalidate the cached engraving. Cross-bar continuation is reconstructed from the complete saved track so original per-bar clipping does not invent reattacks.

Verification:

- 15 focused bass tests pass, including dotted notes, rests, beat-boundary ties, cross-bar ties, 6/8, irregular beat maps, clipped/sub-grid detections, shared native voice tick totals and alignment, bass transposition and stemless whole notes.
- Full established JavaScript run: 287 passed. The unrestricted project command still reaches the same two pre-existing failures: `environment defaults parse without starting the HTTP server` (Unix executable expectations on Windows) and `smoke CLI preserves its primary error and attempts directory cleanup when WAV removal fails` (Node blocks port 1 before injected cleanup). Backend algorithms were not changed by this task.
- Browser QA used Gravity's measured 6/8 bass events plus an isolated 4/4 fixture containing dotted eighth/sixteenth pairs, rests, syncopated tied notes and a hold across the next bar. Four/five-string engraving and moving source-note highlighting were checked; no renderer warnings/errors or fallback text were reported. Screenshot: `.chordpilot-data/benchmarks/gravity/rhythmic-bass-preview.png`.
- Independent review identified the missing cross-bar ties; that case now has a regression test and was confirmed fixed.

## Layout refinement

Score notehead centres and TAB numeral centres now share proportional onset positions. Uniform beat columns reserve the full duration of the final note before the closing barline; native accidental/flag metrics expand the measure when necessary. Quiet beat counts, connected left/right barlines, more separation between the staves and capped beam slopes clarify the part. Dense measures retain horizontal scrolling. TAB numerals stay on their string lines with native background knockouts. Explicit group classes restore current-number colouring and automatic note scrolling despite VexFlow's `vf-` class prefix.

- 17 focused bass tests pass, including new centre-alignment, proportional spacing, final-hold space, double-digit fret and compound beat-column cases.
- Established JavaScript suite: 289 passed, excluding the same two unrelated Windows failures documented above. Final spacing refinements were rechecked with all 17 bass tests.
- Browser QA checked four-string syncopation/rests/outgoing ties and five-string whole-bar holds/incoming ties. Visible glyph bounds differ by less than 0.3 screen pixels, including after rendering the initial hidden Analysis view. No console warnings/errors. Full-measure preview: `.chordpilot-data/benchmarks/gravity/bass-layout-preview.png` (synthetic layout fixture, not a transcription claim).
- Independent review found no blocking issues; an additional 144 meter/key/tuning/content combinations produced finite widths and aligned native centres. Native SVG font measurement was deliberately avoided during hidden rendering because it caches zero-width glyphs.
