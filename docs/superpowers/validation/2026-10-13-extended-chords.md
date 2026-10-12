# Extended chord and bass validation

The accepted improvement uses bundled PyChord formulas for common ninths, elevenths, thirteenths, and added ninths. Candidate scoring remains local. Simplify is now a display preference: raw chords, alternatives, corrections, saved evidence and exports retain full symbols. Local Study v3 ignores this preference when checking whether detection inputs match; older runs retain their original semantics.

Bass estimation now finds interpolated spectral peaks, aggregates overlapping windows across the selected interval, and includes frequencies down to 27 Hz. It no longer spreads each coarse FFT bin into a different pitch class. Extension notes require evidence, reducing invented extensions on clean triads. Auto suppresses an isolated added ninth only when it lasts at most a beat and is weaker than the third/fifth; strong ninths, sustained ninths, seventh extensions and fixed-grid changes remain distinct.

## Original song comparison

Read the cached Other/Bass stems referenced by `浪費時間 Waste Of Time [w_jtUvdBjFo].chordpilot-session.json`, with chroma limits 65–1800 Hz and key Ab. The original session and audio were not modified. Narrow-window rankings use the same following Cm7 context as the earlier diagnosis.

| Window | Previous result | New bass | New highest-ranked chord |
|---|---|---|---|
| 0.255–0.546 s | Cm7; bass A | Ab | Abmaj9 |
| 0.255–0.838 s | Cm7; bass A | Ab | Abmaj9 |
| 0.255–1.420 s | Cm7 in earlier fine-grid comparison | Ab | Cm9; Abmaj9 second |

Actual Auto/beat analysis using the saved beat grid starts with Abmaj9 at 0.255–0.838 s. Later first-bar cells rank Cm9, Bbm9 and Fmaj13. These later labels were not independently verified by listening. The change is not a hard-coded correction for this recording; wider windows remain ambiguous.

## Verification

- Synthetic chromatic bass notes with harmonics, whole-interval aggregation, silence, exact extended formulas, aliases, clean triads, display-independent ranking, MusicXML extensions and conservative Auto grouping.
- Renderer tests cover full extended keyboard tones, simplified labels preserving raw chords, and new/legacy Local Study input comparison.
- Independent code review found and verified fixes for major-extension aliases and overly broad added-ninth smoothing.
- Final backend suite: 90 tests passed using Python 3.9. The installed SciPy emits its existing NumPy compatibility warning.
- Final JavaScript suite: 231 tests passed with the two previously documented baseline failures excluded.
- Native UI verification was attempted using an isolated Electron profile, but a stable target window could not be obtained. Renderer behavior was verified through automated tests.
