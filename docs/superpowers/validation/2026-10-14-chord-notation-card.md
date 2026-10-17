# Beat Detail chord notation card

The reference layout pairs a grand staff with a prominent chord name and smaller alternate readings. Beat Detail now uses that composition in the app's dark theme: engraved treble/bass staves on the left, MuseJazz Text chord lettering on the right, confidence and pencil controls directly below, and three alternate readings underneath. At the minimum sidebar width it stacks vertically. Existing spectrum, keyboard and Study this chord controls remain available.

The staff uses the same stabilized chord-average evidence as the keyboard. It selects the strongest measured octave for each supported chord pitch class at or above −24 dB relative power, plus the independently measured bass octave. It does not synthesize an ideal chord voicing or duplicate pitch classes into arbitrary octaves. Whole-note heads indicate pitch only, not note duration. This is a compact support view, not a complete transcription of every detected pitch or played melody.

Chord-relative spelling preserves flat roots, altered ninths such as D♯ in C7♯9, slash-bass spelling and enharmonic octave boundaries (B♯3 versus C4; C♭4 versus B3). Manual root case and surrounding whitespace are normalized. The supported pitch classes remain supplied by the existing keyboard chord formulas; recognition, ranking and analysis settings are unchanged.

Legacy sessions without exact MIDI evidence show Reanalyse for measured octaves. Empty measured evidence shows No measured chord support. Staff cache identity includes symbol, displayed MIDI notes, measured bass and evidence availability. Empty/cleared selections remove previous labels and hover text. Malformed optional pitch metadata is ignored by the new staff helper.

## Offline engraving

[VexFlow's official tutorial](https://github.com/0xfe/vexflow/wiki/Tutorial) documents the SVG staves, StaveNote chords and accidentals used here. The unmodified official npm `vexflow@4.2.5` Bravura browser build is vendored under `src/renderer/vendor/` (570,370 bytes), with its MIT notice and [Bravura's SIL OFL notice](https://raw.githubusercontent.com/steinbergmedia/bravura/master/LICENSE.txt). Help links the bundled notices. No renderer CDN or font download is needed.

Runtime SHA-256: `d632111c9dc0eedc095e22b1a61913c23c5d166865e4fece61e1554535de355e`.

## Verification

- Three new unit tests cover strongest-octave selection with measured bass, invalid pitch entries, legacy evidence, exact/legacy/cleared empty-state transitions, altered ninth spelling, flat keys, slash bass and enharmonic octaves. Missing functionality, stale empty-cache output, malformed metadata and whitespace spelling were observed failing before the corresponding fixes.
- Full JavaScript suite: 264 passed with the same two established exclusions. JavaScript syntax and `git diff --check` passed. No backend/scorer files were changed for this feature.
- Independent review passed 19 focused notation/editor/event tests and checked VexFlow formatting for both clefs, including A0/C8 bounds. The reviewer reported no remaining actionable issue after the data/spelling fixes.
- Browser QA used an isolated synthetic Abmaj9 voicing, with A♭2 bass and C4/E♭4/G4/B♭4 upper tones. These pitches are a layout fixture, not a transcription of the attached fixture audio. The real VexFlow SVG rendered successfully. Alternative selection and pencil editing updated the chord/staff together and preserved the edit behavior.
- Sidebar checks at widths 190, 236 and 340 px found no horizontal card overflow. An initial VexFlow inline-width overflow and a flex-basis clipping issue were corrected. The minimum width stacks staff and name; the normal and wider widths show them side by side.
- Preview: `.chordpilot-data/benchmarks/notation/sidebar-preview.jpg`. Temporary QA sessions/media remain isolated in the ignored benchmark directory; user sessions were not modified.

## Key signature option

The chord-card checkbox defaults on and uses the detected/native key of the original MIDI evidence, with chart key as a legacy fallback. Major/minor names and Unicode accidentals normalize to VexFlow key names; uncommon spellings use equivalent conventional signatures. Invalid/unknown keys disable the checkbox. This is a notation preference, independent of analysis settings or chord recognition. Its boolean value is saved as `ui.notationUseKeySignature`; older sessions default to enabled.

Both staves receive the signature. VexFlow's automatic accidental pass runs independently for each stave/voicing: signature-covered tones omit redundant marks, while chromatic notes receive sharps/flats or natural cancellations. Off uses a C/no-accidental signature state without drawing a signature. Note starts align after the clefs/signatures, and notation cache identity includes the active signature. The card retains its 200px height.

Validation: two additional regressions cover key normalization/source preference and cache invalidation. Full JavaScript suite: 266 passed with the same two established exclusions. Native engraving probes confirmed Ab diatonic suppression, E-natural and D-sharp in an Ab context, explicit flats with no signature, F#m and seven-sharp C# voicings. Independent review passed 59 focused tests and checked G/Ebm natural cancellations, F#m harmonic-minor E-sharp, Am chromatic G-sharp, and seven-accidental formatting. Browser QA showed the Ab signature on both staves, verified Off restores explicit flats, and saved/reopened an isolated session with Off correctly restored. Preview: `.chordpilot-data/benchmarks/notation/key-signature-preview.jpg`.
