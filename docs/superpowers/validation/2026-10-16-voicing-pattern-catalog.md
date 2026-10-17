# Voicing pattern catalog

Research sources checked 16 October 2026. This catalog distinguishes observable pitch/register patterns from contextual or stylistic interpretations. A shape can admit multiple harmonic names, and a spectral peak is not proof of a played note.

| Family | Meaning / recognition requirement | Product status |
| --- | --- | --- |
| Quartal · So What shape | A specific member of the quartal family: five simultaneous ordered voices, gaps 5–5–5–4 semitones; example D3–G3–C4–F4–A4. The top major third distinguishes it from a pure fourth stack. Chord-compatible spacing, not a claim about hands or performer. | First detector |
| Quartal shape | Three to five ordered voices spaced by perfect fourths. Broader quartal harmony can include other intervals; this initial detector uses the strict shape. | First detector |
| Drop-2 | Second voice from the top of a close four-note seventh chord lowered one octave. Check inversions and exact registers. | First detector |
| Drop-3 | Third voice from the top lowered one octave. | First detector |
| Drop-2+4 | Second and fourth voices lowered one octave from four-way close. Distinct from drop-2 and drop-3. | Catalogued; not yet detected |
| Close position / four-way close | Compact upper chord voices, distinct from a separately supplied bass. | Catalogued; not yet detected |
| Open / spread | Describes distribution over registers rather than one universal chord formula. State the actual intervals before assigning a more specific name. | Catalogued; not yet detected |
| Shell voicings | Sparse root/third/seventh or sixth structures. Two-note root+third, root+seventh/sixth and wider tenth variants are also taught as shells; not limited to exactly three notes. | Needs contextual detector |
| Rootless A/B positions | Typically four middle-register notes; A often has the third lowest, B the seventh lowest. There are family-specific exceptions containing roots. Absence of a detected root alone is insufficient proof. | Needs reliable bass/context |
| Upper-structure triads | An identifiable upper triad over a lower harmonic structure, often guide tones. Requires both layers and their register separation. | Needs contextual detector |
| Stacked thirds | An identifiable third-built spacing structure; not just a generic extended chord symbol. | Catalogued; not yet detected |
| Kenny Barron chord | A named wide voicing family included in Levine's teaching catalog. Verify the specific interval/register example before assigning the label. | Catalogued; not yet detected |

## Sources and scope

- [Earl MacDonald, Fourths Piano Voicings](https://www.earlmacdonald.com/jazz-piano-lessons/fourths-piano-voicings/): major and dominant fourth-based voicings, and the So What pattern with three ascending fourths plus a major third. Its use over minor seventh/ninth/eleventh harmonies supports naming the shape separately from the chord symbol.
- [Earl MacDonald, Left Hand Shells](https://www.earlmacdonald.com/jazz-piano-lessons/left-hand-shells/): multiple small, large and three-note shell configurations. Avoid defining shells as one rigid three-note shape.
- [Earl MacDonald, Rootless Left Hand Piano Voicings](https://www.earlmacdonald.com/jazz-piano-lessons/rootless-left-hand-piano-voicings/): A/B positions, register, exceptions, and the ambiguity of identical pitches under different roots. A Bill Evans association does not establish a performer's style from a single frame.
- [Berklee, Guitar Chords 101](https://online.berklee.edu/courses/guitar-chords-101/): drop-2, drop-3 and guide-tone voicings as established families.
- [Berklee, There Are No Shortcuts](https://college.berklee.edu/bt/203/lesson.html): explicit drop-2+4 construction, four-way close, and separate arpeggiation examples. Sequential arpeggiation must not be silently treated as simultaneous voicing evidence.
- [Berklee, Piano Voicing Techniques](https://online.berklee.edu/takenote/basic-piano-voicing-techniques/): guide tones, sixth/seventh distinctions, altered fifths and register considerations.
- [Mark Levine, How to Voice Standards at the Piano: The Menu, publisher/distributor sample](https://www.jazzbooks.com/mm5/samples/D-HVSP.pdf): primary author text and notation documenting rootless/left-hand voicings, upper structures, fourth chords, So What, stacked thirds and the Kenny Barron chord. The sample supports this family list; it is not permission to reproduce its score examples.

## Detection policy

The first four labels are optional **Possible …** subtitles. They do not influence chord ranking or confidence. A 320 ms snapshot compares two 160 ms halves; both must retain the same three to five well-tuned pitches after existing sustain/overtone attenuation. Matching FFT sets alone can still contain a fast repeated arpeggio. A further sine/cosine least-squares fit in eight 40 ms slices requires every candidate voice to retain at least 20% of its maximum fitted amplitude throughout the snapshot. This is a conservative persistence heuristic, not proof of individual played notes.

Never combine bass-stem notes with upper accompaniment, fold octaves, select arbitrary chord-compatible subsets, or classify the rendered score's reduced notes. Require at least two supporting snapshots and 60% support for the same shape and register. Automatic analysis samples the grouped chord event, rather than individual grid cells, so a sustained chord remains eligible with a half-beat grid. A 400 ms fixed beat can supply two overlapping snapshots; shorter isolated events can abstain. Old sessions without snapshots remain unlabeled until reanalysed. Dense arrangements, doublings, fast changes and weak notes can cause abstention.

Style labels such as “Bill Evans”, “McCoy Tyner” or “Red Garland” should not be inferred from a single generic chord. Prefer precise observable labels and teach the stylistic associations in Help.

## Implementation and validation

The first four optional subtitles are implemented in the existing Beat Detail chord card and Local Study. Hover text lists original measured pitches and sampled-slice support. The fixed card height, main chord, confidence and edit controls remain in place. Snapshot metadata is saved with the analysis evidence. Legacy runs without metadata abstain; no octave/voicing is reconstructed from old pitch-class averages. Chart transposition compares against original audio pitches using the chart offset. Local Study retains its original-key context.

The backend shares `voicing_frames_for_crop` between Local Study and final grouped timeline events. It uses selected sustain attenuation and overtone weighting. The further 40 ms amplitude check uses NumPy least squares on sine/cosine bases at the candidate frequencies; it adds no dependency. Harmonic partials can still appear as pitches, so labels remain suggestions and do not assert a performer's technique. Recognition of shells, rootless A/B, upper structures and other catalogued families is deferred.

Cache versions: `local-study-v19` and `sub-bar-v13`. Reanalyse Chords or Analyze Selection to populate snapshots; existing saved chord labels are not silently rewritten.

Verification:

- 178 Python tests pass, including sustained shapes, extra voices, noise, changing voices, slow/fast repeated arpeggios, retained power, absolute timestamps, source separation and both grid integration cases.
- 310 JavaScript tests pass in the established suite (the two previously documented Windows/environment exclusions remain). The focused 17 voicing/study-model checks also pass after the malformed-metadata guard.
- All-key So What/quartal/drop-2/drop-3 register tests; negative close position, incompatible harmony, octave-folding, doubled/harmonic notes, weak support, stale/legacy and malformed metadata cases.
- Existing actual-audio predictions are unchanged in all 83 checked windows: Hero 20, Virtual Insanity 13, Gravity 16, Overjoyed 21 and September 13. These are chord-regression checks, not manually verified voicing-label precision measurements. Existing D6/9 recognition is retained.
- Independent review found and reproduced the repeated-arpeggio false positive and short-grid omission; regression tests first failed, then passed after the temporal check and group-level extraction. Review confirmed both fixes.
- Browser QA loaded an isolated generated-tone fixture, opened its saved Local Study and checked the subtitle/hover text and the fixed-height Beat Detail card. The fixture's Dm11 heading is explicitly set for layout QA, not a claim of automatic Dm11 recognition. Proof image: `.chordpilot-data/benchmarks/voicing-qa/voicing-subtitle.png`.

The remaining precision work is calibration against manually checked real voicings. Dense mixes may produce no subtitle; that is preferable to claiming unsupported voice allocation or fingering.
