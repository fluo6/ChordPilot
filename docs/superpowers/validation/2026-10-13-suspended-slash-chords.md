# Suspended and non-chord-bass slash voicings

Read-only verification of Waste Of Time bars 41–42, using cached Other/Bass
stems, key Ab, and chroma limits 65–1800 Hz. The stored bar starts are 93.459
and 95.789 seconds; bar 43 starts at 98.119. Original audio and the saved
session were not modified.

| Main region | Local Study result | Supported interpretation |
|---|---|---|
| 94.624–95.541 s | Eb9sus4 | Db–F–Ab over Eb, with Bb fifth evidence; Db/Eb is an upper-structure alternative |
| 95.541–98.119 s | B9sus4 | B–E–F#–A, with prominent C# ninth |

The earlier portion of bar 41 contains a Bb-bass carryover and a mixed
transition into Eb. Auto retains this evidence, then labels the main first
voicing C#/Eb (enharmonically Db/Eb) and the next B9sus4 across the bar line.
The user confirmed Eb9sus4 as an acceptable first-chord name. With Simplify
enabled, suspended ninths display as suspended sevenths; raw ninth names and
detected pitches remain saved.

## Shared fixes

- Use bundled PyChord's 7sus4 and 9sus4 formulas. Fourth/second suspensions
  contribute essential evidence; fifths are optional in suspended sevenths.
- Canonicalize PyChord's thirdless 11 audio candidate to 9sus4 because the
  formulas have the same pitch-class set. Preserve manually supplied labels.
- Permit non-chord-bass slash candidates for strong Bass evidence and a
  supported major/minor upper triad. Count the explicit bass in coverage.
- Reject explicit slash labels that contradict measured bass even when the
  proposed chord root agrees with that bass. Regression caught A7/E otherwise
  tying A7 on a passage with an A bass.
- Preserve suspension and slash bass in keyboard outlines and MusicXML.
  Update cache version and new Local Study algorithm version to v6.

Verification: 99 Python tests and 234 JavaScript tests passed (the two known
JavaScript baseline exclusions remain). Suspended formulas were checked in
all twelve roots, with aliases, slash evidence, and export degrees.
Previously checked opening regions still return Abmaj9, Gbmaj9, Fmaj9;
56.26–57.26 s still returns Eb7#9. No song-specific naming overrides were added.
