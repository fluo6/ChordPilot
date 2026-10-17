# Hero: piano, strings and reverb reference

> Historical 19-window baseline. Later [vocabulary support](2026-10-16-chord-vocabulary-implementation.md) added D6/9, and [measured voicing evidence](2026-10-16-six-nine-voicing-evidence.md) corrected the 13.8–16.0 s selection. [Current 20-window counts](../../../TODO.md#reference-baseline) supersede the unsupported-quality and score statements below.

Source: [CHORDS-LIBRARY — Hero / Mariah Carey](https://www.youtube.com/watch?v=Y02UJ35PvXY), supplied after the duplicated first link was clarified. Checked the 1080p chord score/highlights; analysed the first 95 seconds with existing htdemucs Other/Bass separation. The durable fixture is `tests/fixtures/chord-references/hero.json`.

## Reference scope

Nineteen manually selected verse/chorus windows cover 23.9 seconds. Purple highlight times were sampled every 0.25 s; they are approximate, and the two short inversion windows are less certain. Key E, 4/4. The first highlighted lyric entry is around 9.25 s, and the preceding instrumental intro is unscored. These comparisons do not establish whole-song accuracy.

Printed A/B is compared as B9sus4 with its optional fifth omitted: B,A,C#,E are its root, seventh, ninth and suspended fourth. This matches the user's requested suspended-dominant naming preference. Original chart spelling remains in the fixture. Other inversions retain their printed harmonic roots.

Printed D6/9 at 13.8–16.0 s is recorded separately because the app's candidate vocabulary does not support 6/9. It is not counted among the 19 supported windows. The diagnostic D proxy checks only root/third/seventh, not the sixth/ninth; it cannot count as exact recognition of D6/9.

## Local windows

| Settings | Root matches | Function matches |
| --- | ---: | ---: |
| General | 16/19 | 10/19 |
| Piano evidence settings | 16/19 | 11/19 |
| Unfiltered | 16/19 | 10/19 |
| Reverb / FX evidence settings | 15/19 | 11/19 |
| Tail 20%, half-life 0.8 s, no overtone reduction | 15/19 | 11/19 |
| Tail 40%, half-life 0.8 s, no overtone reduction | 15/19 | 11/19 |

Function checks distinguish third, seventh and suspension, rather than requiring an exact extension string. Local Study does not apply the timeline's grid or chord-stability pass. Increasing subtraction to 40% did not improve the selected windows. Results include major-seventh additions to printed add9 harmonies and incorrect roots at short inversions; chart-versus-performance extension ambiguity remains.

## Timeline comparisons

Ran actual automatic analysis over the 95-second crop. Percentages are duration overlap with the 19 selected reference windows, not 95 seconds of verified score. Updated derived metrics use the explicit A/B → B9sus4 canonicalization; stored audio predictions were not changed.

| Settings | BPM | Root overlap | Function overlap | Events in 95 s |
| --- | ---: | ---: | ---: | ---: |
| General | 123 | 89.79% | 60.66% | 136 |
| Piano / Sustained Keys | 123 | 61.11% | 28.76% | 103 |
| Reverb / FX | 123 | 84.43% | 51.61% | 105 |
| General, BPM range 60–90 | 62 | 89.87% | 60.77% | 76 |
| Reverb / FX, BPM range 60–90 | 62 | 71.83% | 49.66% | 67 |
| Half beat, Balanced, tail 20%, half-life 0.8 s, no overtone reduction, BPM 60–90 | 62 | 77.86% | 55.93% | 67 |

Recommendation for this reference: **General, key E, BPM minimum 60 / maximum 90**; retain 65–1800 Hz chroma, Detailed stability, no tail subtraction, 50% overtone weighting. Approximately 62 BPM agrees with the score's roughly four-second four-beat bars. This is a useful starting point, not a validated universal R&B/reverb preset. The slower grid nearly preserves chord agreement while giving the expected bar scale. Event count is diagnostic, not an accuracy score. The existing Piano and Reverb presets did not improve this sample's timeline; do not change global preset defaults based on the small local gain in seventh/extension agreement.

## Tempo-range bug fixed

`estimate_tempo_from_envelope` searched inside the requested range, then unconditionally doubled values below 80 or halved those above 180. This could turn Hero's approximately 62 BPM result into 123 BPM even with maximum BPM 90. Octave preference now respects the supplied bounds; fallback and rounded output also remain within them. Default octave preference is preserved when allowed.

Four regression tests first reproduced slow/high-range and short-input failures, then passed with the fix. They cover slow maximum, fast minimum, default octave preference and both fallback paths. Timing cache version advances to `sub-bar-v10`; Local Study remains `local-study-v16` because its local feature extraction is unchanged.

Actual recording regressions with the default 60–190 range preserve every previous tempo: September 126, Gravity 123, Overjoyed 83, Virtual Insanity 92, Hero 123, Waste Of Time 103 and Ballad 144. The bounded Hero case changes 123 → 62 as intended. No chord-scoring, bass-filter or preset-default changes were made.

Verification: 163 Python tests passed; the tempo regression file also passes after adding the second fallback assertion. The JS analysis-settings round-trip check passes. JSON fixture labels parse successfully; whitespace checks pass. Ignored reports/scripts are under `.chordpilot-data/benchmarks/hero/`, including `comparison-summary.json`, `tempo-regressions.json`, `timeline-slow-fixed.json` and local preset probes. The generic chord reference benchmark reproduces the supported local windows; unsupported D6/9 stays separately documented.
