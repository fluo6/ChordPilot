# Bass-supported roots and refined Auto timing

Confident Bass evidence now contributes up to 30% of the combined pitch-class
evidence used by every chord candidate. This supplies a root omitted by the
Other stem while still allowing supported inversions such as C/E. Bass below
the confidence threshold does not enter that blend. Existing extension-note
requirements remain in place.

Auto refines supported bass-root transitions inside bars using local 180 ms
windows, sampled at 20 ms intervals. Searches are bounded within neighboring
cells and leave at least 80 ms in each cell. Continuous transitions are
interpolated; after a brief ambiguous attack, the first stable new pitch is
used. Old grid times and supporting brackets remain in event debug evidence.
Fixed-grid analysis and musical bar boundaries retain their requested timing.
Strong bass-supported passing changes are protected from flicker smoothing.
Near-duplicate beat/end times are collapsed to prevent zero-length events
after millisecond serialization.

## Waste Of Time comparison

Read the same cached Other/Bass stems; original audio and the saved session
were not modified. With Auto/beat, key Ab and chroma limits 65–1800 Hz:

| Approximate range | Detected chord |
|---|---|
| 0.255–1.494 s | Abmaj9 |
| 1.494–2.316 s | Gbmaj9 (canonical stored spelling F#maj9) |
| 2.316–4.427 s | Fmaj9, continuing across the 2.586 s bar boundary |
| 4.427–4.916 s | Gbmaj9 passing return |

The first two bars analyzed in approximately 0.45 s after loading the stems.
Local Study on the four previously checked regions also returns the same
root families. The 56.26–57.26 s passage still returns Eb7#9.
These timing estimates follow stable bass evidence, not an independently
verified manual onset transcription, particularly during noisy attacks.

Cache/timing versions were advanced, and new Local Study results record v5.
Saved historical runs remain unchanged and need reanalysis to refresh.

## Regression checks

97 Python tests passed: root-omitted major seventh/ninth voicings in twelve
keys, clear inversions, weak Bass evidence, off-grid changes, brief passing
chords, fixed grids, late mixed-cell transitions, silence, and rounded tails.
234 JavaScript tests passed with the two previously documented exclusions.
