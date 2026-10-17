# Beat Detail spectrum

Beat Detail shows the frequency spectrum of the current analyzed timing cell, with note labels on the strongest peaks and hover details for frequency and relative level. Playback updates the plot at cell boundaries even if the chord label and beat number stay unchanged. Curve changes animate over 180 ms; reduced-motion preferences disable that animation.

Auto and Fixed analyses save 192 logarithmic frequency bins and up to 24 peaks per cell. The FFT and peak estimation are shared with Local Study. Spectra use the selected chord-analysis audio source, and labels can include overtones. Existing sessions require reanalysis to add this evidence; Legacy timing does not generate it.

Validation:
- Synthetic C4-to-E4 audio verifies that spectra change within a stable chord event.
- Renderer tests verify within-beat playback updates, curve morphing, and reduced motion.
- An isolated hidden Electron preview at 236 px panel width verified layout and actual movement of SVG animated points.
- Python suite: 106 passed.
- JavaScript suite: 243 passed, excluding the two existing environment-default and smoke-cleanup cases.
- `git diff --check` passed.
