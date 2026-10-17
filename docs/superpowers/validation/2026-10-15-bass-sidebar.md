# Bass sidebar validation

The Beat Detail sidebar includes a bass fretboard and bass-clef pitch score with TAB. Four-string E–A–D–G and five-string B–E–A–D–G tuning are supported over 24 frets; the instrument choice is saved with the session. The fretboard uses an original generated rosewood texture packaged locally.

Every measured bass pitch in the selected bar receives one lowest-fret suggested position. Amber markers show the bar's note set and teal marks the note at the playback cursor; the matching score head and TAB number also turn teal. The note set refreshes at bar boundaries. Scrollable fretboard and notation keep a new active note visible, while manual panning is retained between changes.

Source bass-reference MIDI octaves and original cell times drive the preview. Chord symbols are never used to invent a bass octave. Consecutive repeated pitches merge; missing evidence leaves gaps. Manual chord-boundary moves, splits and merges preserve source-cell timing. Notes outside the instrument's range are explicitly marked × in TAB. The score is written one octave above sounding pitch; whole-note heads preview pitches rather than claiming a rhythmic transcription.

Verification on 2026-10-15:

- Six focused regressions cover standard tuning, exact octaves, range handling, cell timing/gaps, chord edits, VexFlow/TAB alignment with seven accidentals, and independent bass playback updates.
- JavaScript suite: 273 passed using the two previously established environment/cleanup exclusions.
- Browser fixtures verified bar refresh, low B/C/D on five strings, saved/reopened five-string preference, and live playback reaching C2 with MIDI 36 highlighted teal.
- Sidebar widths 520 and 236 px fit their containers with independent fretboard/score scrollbars; no page-width overflow.
- Native VexFlow positioning and independent code review resolved score origins and edited-boundary timing; final review found no remaining actionable issues.
- UI fixture pitches are synthetic and are not a transcription of the accompanying sample audio. Screenshot: `.chordpilot-data/benchmarks/notation/bass-fretboard-preview.jpg`.
