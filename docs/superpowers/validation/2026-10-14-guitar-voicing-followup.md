# One-beat guitar voicing follow-up

The follow-up screenshot changed Chord Grid from Half beat to One beat and Tail Reduction from 0% to 20%, with Sustained, key F, half-life 0.5 s, and Overtone Weighting 0%. The prior validation did not cover this exact combination. A cached-stem reproduction retained Gm9 but replaced the following C-root passage with Fmaj9.

## Root cause and changes

With post-tail evidence, the local C voicings won as Am7/C or Amadd9/C. Stability anchors required the local winning root to equal the measured low accompaniment note, so they did not recognize the strong C3 reference as a harmonic boundary. A matching-root candidate can now corroborate a boundary when within 0.35 raw-score units of the local winner and retaining all of its strong measured chord tones (at least 6% of normalized retained pitch strength, with chroma fallback when exact pitches are unavailable). Existing guide-tone, repeated-observation and nested-set checks remain.

Independent review found that the initial rule could relabel Cmaj9/E as Em7, including after root-position Cmaj9. The strong-tone guard fixes this: Em7 cannot discard a strongly measured C. Transposed constant-inversion and root-position-to-inversion regressions fail without the guard and pass with it.

The C voicing also exposed a scoring issue: a supported major third, minor seventh and thirteenth could lose to a sixth or upper-triad slash chord because the fifth/ninth were weak. Dominant13 now treats its seventh and thirteenth as essential and allows the fifth/ninth to be absent, only when the independently measured third/minor7/13 each reach 6% normalized chroma before any bass injection. Other quality formulas and missing-extension penalties remain. The shared scorer covers both timed analysis and Local Study. PyChord formulas are unchanged.

[Open Music Theory: Jazz Voicings](https://viva.pressbooks.pub/openmusictheory/chapter/jazz-voicings/) describes third/seventh voicing structures with ninths/thirteenths and omitted members; [Altered and Extended Chords](https://viva.pressbooks.pub/openmusictheory/chapter/altered-and-extended-dominant-chords/) describes extended dominant voicings in limited voice textures, including the thirteenth displacing the fifth. These support voicing compatibility, not an exact transcription of this recording.

Cache identity advances to sub-bar-v5 and Local Study to v12. Help documents the rules. Existing session results need Reanalyse Chords; existing stems can be reused.

## Attack evidence

The user's observation about sudden note-energy increases is supported by the measured peaks. Under the one-beat, 20% tail setting, C3 peak power rises from about 0.436 to 30.651 and E4 from 0.709 to 21.205 at approximately 3.41 s (about 18.5 and 14.8 dB). Bb3 then rises from 0.280 to 2.381 on the next beat; A4 rises from 0.590 to 4.299 on the subsequent beat. These are absolute peak-power comparisons on the same FFT grid and the filtered spectrum's original power reference, not changes in separately normalized chroma. The guitar voicing arrives over several plucks rather than all notes simultaneously.

This investigation measures those attacks; it does not introduce a new general onset-based recognizer. The present fixes prevent valid voicing evidence from being discarded by formula penalties and overly broad consolidation. Independent played notes versus overtones, weak note attacks, beat alignment and exact extension timing remain limitations.

## Verification

- Full Python suite: 133 passed. Full JavaScript suite: 259 passed with the same two established exclusions. Independent review passed 39 timing/extended-chord tests and found no remaining actionable issue. `git diff --check` passed.
- Root-boundary regression uses measured post-tail evidence and real candidate ranking in three transpositions. Extended-shell regression covers all twelve keys, missing fifth/ninth, and sixth/seventh controls when a defining tone is absent. Inversion regressions cover C and F.
- Cached Ballad stems on the actual drum-derived grid: 144 BPM, first beat 0.072 s. With exact screenshot settings, Gm9 lasts to 3.406 s; C13 is retained from 3.406–5.072 s; weaker continuation is C6 until 6.739 s; Fmaj9 follows. Dominant labels of bars 5–8 remain Fmaj9, with a brief edge estimate still present.
- Local Study, Bass + Other, 3.410–4.870 s, key F, 20% tail, 0% overtone: C13.
- Half-beat/one-beat grids and 0%/20% tail comparisons retain the C passage. Short ambiguous labels remain in some half-beat cells; this is not claimed as an exact transcription.
- Waste Of Time at both 0% and 20% tail, 0% overtone: opening 0.260–1.489 s remains Abmaj9; 56.260–57.260 s remains Eb7#9; 94.624–95.541 s remains Eb9sus4.

The user's session JSON and source audio were not modified. No song-specific root sequence or timings were hardcoded in production code.
