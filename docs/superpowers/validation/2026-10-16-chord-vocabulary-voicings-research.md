# Chord vocabulary and voicing subtitles: research proposal

Research only: no detector or UI behavior changed in this pass. Goal: expand conventional chord naming first, then identify useful voicing patterns without confusing harmonic identity with octave spacing.

## Findings from the current code

The backend uses bundled PyChord formulas, restricted by the candidate allowlist in `backend/chordpilot_common.py`. The library already contains 69, m69, dim7, mmaj7, 7b5, 7#5, 7b9, 7#11, 7b13, maj7#11 and several combined alterations. Reusing these formulas is preferable to adding another chord library.

Adding names to the allowlist alone is insufficient:

- `parse_candidate_symbol` splits at the first slash. It cannot distinguish the quality separator in C6/9 from a slash bass, or correctly handle C6/9/E.
- `normalize_quality_suffix` currently maps mmaj7 to maj7. Minor-major qualities must retain their minor third; aliases must preserve case-sensitive M versus m meanings.
- New altered fifths need the correct essential fifth metadata and scoring, rather than being treated like a missing optional perfect fifth.
- Keyboard chord membership, notation spelling, font formatting, simplification and editor parsing have their own paths. They must agree with the expanded formulas.
- Existing benchmark function agreement checks third, seventh and suspension, but not altered fifths. It cannot alone establish successful recognition of 7#5 or m7b5.
- `chordNotationPitches` picks one strongest octave per pitch class and adds a measured bass. This rendering-oriented reduction is unsuitable as the input to a drop-voicing classifier.

## Proposed first vocabulary batch

Existing supported major/minor/seventh/ninth/eleventh/thirteenth/add9/suspended families remain. Add these missing families before adding arbitrary alteration combinations:

| Display quality | Degrees relative to the harmonic root | PyChord key |
| --- | --- | --- |
| 6/9 | 1, 3, 5, 6, 9; no implied seventh | 69 |
| m6/9 | 1, b3, 5, 6, 9 | m69 |
| dim7 / °7 | 1, b3, b5, bb7 | dim7 |
| m(maj7) | 1, b3, 5, 7 | mmaj7 |
| 7(b5) | 1, 3, b5, b7 | 7b5 |
| 7(#5) | 1, 3, #5, b7 | 7#5 |
| 7(b9) | 1, 3, 5, b7, b9 | 7b9 |
| 7(#11) | 1, 3, 5, b7, #11 | 7#11 |
| 7(b13) | 1, 3, 5, b7, b13 | 7b13 |
| maj7(#11) | 1, 3, 5, 7, #11 | maj7#11 |

These are a proposed product scope, not an empirically ranked frequency list. Conventional added-note and alteration notation is described in [Open Music Theory: Chord Symbols](https://viva.pressbooks.pub/openmusictheory/chapter/chord-symbols/). In particular, add9 and 6/9 must not silently acquire a seventh. Input aliases should include 69/6add9/6/9, m69/m6/9, 7+5/7#5 and common parenthesized alterations. Keep half-diminished ø7 distinct from fully diminished °7.

Next batch, only after real-recording regressions: 9(#11), 13(#11), 13(b9), m(maj9), and specific two-alteration dominants such as 7(b9,#5) and 7(#9,#5). Do not interpret `alt` as a requirement to hear every possible alteration. An explicit measured alteration is more transparent than a broad altered-scale template.

Naming ambiguities remain: #5 and b13 can be enharmonic; missing/doubled notes and musical context affect the preferred label. Keep alternatives where justified. The expanded vocabulary must not turn weak partials into unsupported altered chords. Require distinctive tones, compare against simpler candidates and report uncertainty. Parsing/formula support and reliable automatic detection should be verified separately.

## Voicing subtitles

Keep the chord symbol as the main result, with an optional small subtitle derived from observed pitch registers. A voicing classifier should describe a measured pattern, not claim the performer's fingering, hand allocation, instrument or method of constructing it.

Recommended initial patterns:

| Subtitle | Necessary observation / constraint |
| --- | --- |
| So What shape | Five ordered voices with adjacent semitone distances 5,5,5,4; allow transposition, not arbitrary octave folding |
| Quartal shape | A supported sequence of fourth-spaced voices; identify the broader family when the specific five-note pattern is incomplete |
| Drop-2 pattern | An observed four-voice configuration matches a close-position chord with the second-highest voice lowered one octave |
| Drop-3 pattern | Corresponding match with the third-highest voice lowered an octave |
| Shell voicing | A sparse supported guide-tone structure, evaluated against the harmonic context; do not call every incomplete noisy chord a shell |
| Rootless shape | The upper accompaniment supports a chord without its root, and separate reliable bass/context supports the harmonic root |

Example: D3–G3–C4–F4–A4 gives the So What interval pattern. Relative to D it contains 1,11,b7,b3,5, so a Dm11 heading with a So What subtitle is appropriate when D is the supported root. The voicing label does not require every possible m11 extension. [Earl MacDonald: Fourths Piano Voicings](https://www.earlmacdonald.com/jazz-piano-lessons/fourths-piano-voicings/) documents this shape and its use over minor harmonies.

Example: close-position C4–E4–G4–B4 becomes G3–C4–E4–B4 when G4 is lowered. This is a drop-2 pattern of Cmaj7, regardless of an additional bass player's C2. [Berklee: Voice Leading for Guitar](https://online.berklee.edu/takenote/voice-leading-for-guitar/) explains drop-2 construction. Actual lowest bass and the lowest upper chord voice must be distinguished.

Potential display:

    Dm11
    So What shape · D3 G3 C4 F4 A4

    Cmaj7
    Possible drop-2 pattern · upper voices

These are illustrative outcomes, not newly validated detections in the supplied recordings.

## Evidence constraints and implementation order

Current detected MIDI pitches are spectral evidence and can include overtones. A whole-chord average can also combine sequential arpeggio notes that were never simultaneous. Voicing tags therefore need ordered, octave-specific, co-occurring accompaniment evidence; pitch classes alone or the rendered notation cannot establish them. Keep independent bass separate when matching upper voicings. Test sustained time slices before taking a union across a chord region. Abstain when voices/registers are uncertain; a subtitle can say `Possible` rather than presenting a definitive construction.

First implement and test the vocabulary batch across parsing, formulas, scoring, keyboard/score display and saved-study round trips. Then add conservative optional voicing subtitles, starting with So What/quartal and drop-2/drop-3 patterns. The subtitle should not feed back into chord scoring initially. Preserve the user preference for sensible sus-family names over equivalent upper-triad slash spellings.

Validation: synthetic all-key formula/alias tests; perfect versus altered fifth and dim7 versus m7b5 negatives; C6/9/E parsing; negative tests where the distinctive tone is absent; octave/order/co-occurrence tests for voicings; separate bass/doubling/arpeggio/overtone negatives. Re-run the existing Waste Of Time, Ballad, Overjoyed, Gravity, September, Virtual Insanity and Hero references. Report root, bass, third/seventh, altered fifth, extensions, timing and subtitle precision separately. Adding a formula does not by itself establish improved audio accuracy.
