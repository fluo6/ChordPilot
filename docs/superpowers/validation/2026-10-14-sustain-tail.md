# Experimental sustain-tail subtraction

Tail Reduction defaults to 0% (off). Auto and Fixed timing expose strength from 0–100% and power half-life from 0.1–3 seconds. Local Study exposes the same controls. Settings survive sessions/study history and distinguish cache entries.

For each FFT power bin, reduced power is `max(0, current − strength × 2^(−elapsed/halfLife) × previousOriginal)`. Timed analysis uses previous cell centers; its first cell is unchanged. Local Study uses an equally sized immediately preceding interval, clipped at source start, and fingerprints that context. Bass reference remains original, and Bass is not subtracted when combined with Other.

Measured attenuation reweights the established chroma extractor before candidate ranking/stabilization. Local Study similarly attenuates existing exact-pitch strengths. Zero or negligible removal preserves original feature evidence. Original spectra and detected notes remain saved beside reduced spectra. The reduced curve uses the original 0 dB reference; the chord-average curve uses reduced evidence. Captions report actual removed spectral power rather than treating the strength control as a fixed percentage of current volume. Playback audio is unchanged.

Validation:
- Eight new Python tests cover subtraction, strength/decay, unchanged inputs, first cell/off, silence, cache options, use in chord scoring, Local Study/context fingerprints, and unchanged exact pitches with silent context.
- JavaScript verifies controls/session options and original/reduced traces in Beat Detail and Local Study.
- Controlled Cmaj7-to-G7 audio: full subtraction removed lingering C/E highlights while preserving the G7 label.
- Waste Of Time 56.26–57.26s: 0/50/100% retained Eb7#9; 50% removed about 4.3% power and 100% about 8.4%.
- Ballad 6.9–7.4s: 0/50/100% retained Fmaj9; 50% removed about 19.3% and 100% about 27.0%.
- Hidden Electron preview verified both spectrum views using the saved song result. Review found a no-removal exact-pitch inconsistency; the fix was independently rechecked with no remaining important findings.
- Final suites: 115 Python and 250 JavaScript passed, with the same two pre-existing JavaScript exclusions. `git diff --check` passed.

This is a configurable decay estimate, not source separation. Sustained/arpeggiated tones can remain harmonically useful; compare against 0% before accepting a changed detection. Saved user sessions were read only during validation.
