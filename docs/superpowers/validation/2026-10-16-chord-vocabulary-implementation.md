# Common chord vocabulary, including 6/9

> Historical implementation snapshot. The later [six-nine voicing result](2026-10-16-six-nine-voicing-evidence.md) corrected Hero's D6/9 window; the E9 result below is no longer current. Virtual Insanity's B♭7♯5 versus B♭7♭13 remains open, with a [new measured diagnostic](2026-10-16-altered-fifth-reference.md).

Implemented the first vocabulary batch from the research proposal. PyChord remains the backend formula source; no new dependency is added. Recognition and Local Study share the same candidate catalog. Backend output uses `6/9` and `m6/9`; PyChord's `69`/`m69` names map to these spellings.

| Quality | Formula |
| --- | --- |
| 6/9 | 1, 3, 5, 6, 9 |
| m6/9 | 1, ♭3, 5, 6, 9 |
| dim7 | 1, ♭3, ♭5, ♭♭7 |
| m(maj7), canonical mmaj7 | 1, ♭3, 5, 7 |
| 7♭5 / 7♯5 | 1, 3, altered 5, ♭7 |
| 7♭9 | 1, 3, 5, ♭7, ♭9 |
| 7♯11 / 7♭13 | 1, 3, 5, ♭7, altered extension |
| maj7♯11 | 1, 3, 5, 7, ♯11 |

Existing 7♯9, ninths, elevenths, thirteenths and suspended dominants remain supported. A 6/9 has no seventh. `7♯5` and `7♭13` remain different formulas because the latter includes a perfect fifth. No fixed `alt` formula or voicing classifier is added in this batch.

Parsing recognizes a slash bass only when the final component is a note name, so `C6/9/E` keeps both its ninth and E bass. Aliases include `C69`, `C6add9`, `Cm69`, `C-6/9`, `C°7`, `Co7`, `Cm(maj7)`, `CmM7`, `CM7#11`, `C7+5` and single parenthesized alterations. Unsupported alterations remain rejected rather than silently becoming plain sevenths. Fixed the former minor-major-to-major-seventh normalization error. Transposition accepts compact diminished symbols too.

The keyboard formula sets, staff spelling, main chord card, Text/Jazz/number display and MusicXML preserve these qualities. MusicXML uses sixth plus added ninth, diminished-seventh, major-minor, and explicit altered degrees as appropriate. Staff spells diminished seventh as a double-flat seventh, ♯11 as an augmented fourth and ♭13 as a flattened sixth. Saved study JSON retains the complete symbol and inversion. Simplify Chords does not strip the 6/9 quality.

Scoring retains measured root/third/fifth requirements and supplies altered-fifth metadata. The existing missing-extension penalty also covers a missing sixth: below 4.5% normalized blended chroma, it costs 0.35. This prevents a missing sixth from being free when comparing 6/9 with add9. Synthetic tests verify that clear formulas can win in all twelve keys, and plain triads, sixths or add9 chords do not automatically become 6/9. These are controlled evidence tests, not a claim about recording transcription accuracy.

Timing analysis cache advances to `sub-bar-v11`, and Local Study to `local-study-v17`. Reanalyse Chords reuses available stems; saved results/history remain unchanged until reanalysis.

## Recording checks

Re-ran existing real-audio regressions with tail subtraction both off and at 20%: Waste Of Time still returns Abmaj9 at 0.260–1.489 s, Eb7#9 at 56.260–57.260 s, and Eb9sus4 at 94.624–95.541 s. Ballad still returns C13 at 3.410–4.870 s, and its timeline bars 5–8 remain Fmaj9.

General settings preserve the prior aggregate root/function results on the existing reference windows: Hero 16/19 roots and 10/19 functions; Virtual Insanity 5/12 roots and 1/12 functions. Those function metrics do not measure exact extensions or altered fifths. Some wrong labels gain extensions: for example a printed Hero B window changes from B7 to B7b9. No overall recording-quality improvement is claimed from vocabulary expansion.

The formerly unsupported Hero D6/9 window (13.8–16.0 s) still returns E9. Virtual Insanity's Bb7#5 window (9.0–10.5 s) changes from Bb7#9 to Bb7b13, which is still not an exact match. The formulas are now expressible, but root/voicing evidence in those recordings still needs work. The reference fixtures now include these windows, bringing their current totals to 20 and 13 respectively; historical reports used 19 and 12. The benchmark adds an exact canonical root/quality/bass comparison so a partial harmonic-function match cannot masquerade as full vocabulary agreement.

Diagnostic outputs are in ignored `.chordpilot-data/benchmarks/vocabulary-regressions.json` and `overjoyed/prior-regressions.json`.

## Verification

New tests first reproduced missing formulas, aliases, numeric-slash parsing, keyboard tones and display failures. Controlled all-key tests, absent-tone checks, MusicXML checks, exact comparison, study JSON round trip, transposition and frontend notation now pass. Final suite results: 168 Python checks and 303 JS checks, with the same two unrelated Windows/environment cases excluded from the established JS command. Independent review found alias/transposition gaps; those are fixed and covered.

Browser QA used a generated notation fixture, separate from recording accuracy checks. Verified C6/9/E on the timeline and chord card, measured sixth/ninth in the keyboard's tone set, and correct staff/bass spelling. Proof image: `.chordpilot-data/benchmarks/vocabulary-qa/six-nine-notation.png`. Test server uses isolated data and is stopped after QA. No commit or push is part of this task.
