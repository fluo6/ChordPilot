# Stabilized evidence comparison in Beat Detail

Beat Detail averages detected notes across the continuous span of the same selected chord, including adjacent bars. Chord changes, gaps, and evidence-source changes end the span. The keyboard and its audition levels use this passage evidence. Its outlines still represent the selected chord formula; averaging does not replace observed notes with a formula.

The spectrum overlays a dashed teal current-cell curve and a solid amber chord-average curve. Peak labels represent the average. Each curve uses its own relative 0 dB peak; the overlay compares spectral shape rather than absolute recording volume. Current-cell changes retain their existing visual animation.

Spectra average linear power weighted by cell duration. New analyses retain the original peak power to restore differences in recording level between cells before averaging. Older spectra without that reference use duration-weighted relative power. Existing saved spectra can show the comparison immediately; reanalysis adds recording-level weighting. Legacy sessions without measured pitches or spectra show pitch classes with a reanalysis prompt.

Validation: tests cover duration and reference-level weighting, silence, two labelled curves, reduced motion, and combining same-chord cells across bars without crossing a chord change. A hidden Electron preview verified both curves and the averaged keyboard. Full suites: 107 Python and 249 JavaScript passed, with the same two pre-existing JavaScript exclusions.

## Measured keyboard octaves and bass

Timed analysis and Local Study now share the same exact-pitch extractor. Timed cells retain measured accompaniment pitches and original bass pitches; tail reduction reweights accompaniment pitches alongside chroma. Beat Detail averages both sources by cell duration without discarding weak measured pitches a second time. Both keyboards share emphasis, relative dB, and an orange marker for the lowest measured pitch matching the bass reference. Different analysis windows may still produce different strengths.

Beat Detail displays C1–B4 using the existing keyboard component and preserves horizontal scroll during updates. Exact-pitch highlighting never copies a pitch into other octaves. Older spectral evidence can supply accompaniment pitch estimates, but missing bass octaves require reanalysis and are explicitly labelled. Analysis cache versioning requests fresh pitch metadata without invalidating existing stem separation.

Read-only validation against the opening Waste Of Time passage (0.260–1.489 s) returned Abmaj9 and measured Ab1 in both analyses. A hidden Electron preview confirmed Ab1 highlighting, 48 keys starting at C1, and horizontal scrolling. Tests cover source averaging, weak bass retention, matching highlight rules, measured octave isolation, and truthful legacy pitch-class fallback. Full suites: 116 Python and 257 JavaScript passed, using the same two pre-existing JavaScript exclusions. Independent review found no remaining issues in these fixes.
