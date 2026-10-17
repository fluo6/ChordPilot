# Virtual Insanity piano and extended-chord reference

> Historical 12-window baseline. [Vocabulary implementation](2026-10-16-chord-vocabulary-implementation.md) added 7#5 and the thirteenth Bb7#5 fixture window; the recognizer still returns Bb7b13 there. [Current 13-window counts](../../../TODO.md#reference-baseline) supersede the counts and unsupported-quality statements below.

Source: [CHORDS-LIBRARY — Virtual Insanity / Jamiroquai](https://www.youtube.com/watch?v=H0WCL4qc4-Y). Checked the score and chord highlights in the provided 1080p video. Analysed the first 95 seconds using htdemucs Other and Bass stems. Automatic tempo is 92 BPM; key is fixed to concert Eb minor. The intro has a fermata and the score later includes 2/4 bars, so the current automatic 4/4 bar grouping is not a full meter validation.

The durable fixture `tests/fixtures/chord-references/virtual-insanity.json` contains 12 supported opening chord windows. Labels and approximate times were read from the video, with 0.1 s highlight resolution; these are not an independently authoritative transcription. Cb is stored as B. Printed Gb11 is compared as the recognizer's canonical thirdless Gb9sus4, with the original label retained. A thirteenth diagnostic window has printed Bb7#5: it is explicitly separated because the production candidate vocabulary does not support that quality. PyChord already provides its formula (0,4,8,10), but the app's candidate allowlist omits it.

## Local comparisons

These counts exclude Bb7#5; root/third/seventh agreement on its Bb7 comparison proxy must not be mistaken for recognizing the augmented fifth. Chord function compares root, third, seventh and suspension. Extra extensions may therefore match function without matching the printed symbol exactly.

| Settings | Roots | Functions |
| --- | ---: | ---: |
| General | 5/12 | 1/12 |
| Piano evidence settings | 6/12 | 1/12 |
| Unfiltered | 5/12 | 1/12 |
| Reverb / FX evidence settings | 6/12 | 1/12 |
| Other + Bass, chroma 110–900 Hz, no tail/overtone reduction | 8/12 | 4/12 |
| Full Mix, General | 3/12 | 0/12 |
| Full Mix, chroma 110–900 Hz, no tail/overtone reduction | 7/12 | 2/12 |

Local Study does not apply timeline grid/stability, so the Piano/Reverb rows compare only the corresponding tail and overtone settings. A larger-window FFT or peak-only pitch chroma probe also did not solve the ambiguity.

## Automatic timeline comparisons

Ran the actual automatic song analysis separately over the 95-second crop, measuring duration overlap with the same 12 manually selected windows (10.05 seconds total). These are selected-window overlap rates, not whole-song accuracy. Chord boundaries and events outside these windows are unscored.

| Settings | Root overlap | Function overlap | Events in 95 seconds |
| --- | ---: | ---: | ---: |
| General | 42.0% | 22.1% | 129 |
| Piano / Sustained Keys | 19.6% | 19.6% | 116 |
| Fast Changes | 40.1% | 14.5% | 214 |
| 110–900 Hz, half beat, Detailed, no tail/overtone reduction | 52.2% | 11.8% | 227 |
| 110–900 Hz, half beat, Balanced, 20% tail reduction, no overtone reduction | 46.9% | 16.2% | 146 |

No proposed setting improves both roots and functions over General on this sample. Do not promote the narrower band or existing Piano preset as a validated solution, or change global defaults based on these measurements.

## Observed limitations

- Minor and half-diminished passages acquire dominant 9/13 labels. The small-frame chroma includes energy between real peaks and upper partials; changing feature extraction alone did not consistently recover the expected harmony.
- At 0.3–1.1 s, a very weak Bass stem contains a roughly 49.93 Hz tone classified as G1 at 96.5% periodicity confidence. RMS is about 0.000112 versus Other 0.002572, enough to pass the relative gate. It can create false major-third/slash-bass evidence for an Eb-minor passage. This is a suspect background/separation tone, not confirmed played G1. Periodicity confidence does not prove musical relevance. Disabling bass alone does not solve the other errors.
- Some passages lack reliable low-note guidance; expected roots can be absent or weak in the separated accompaniment. Printed harmony may describe a larger musical span than a short local crop.
- Bb7#5 cannot currently be returned. Current output Bb7#9 does not count as recognizing its altered fifth, even when root/third/seventh agree.

No production scoring, preset defaults or model changes were made in this reference pass. Previous song behavior is therefore unchanged. Retain this fixture to measure future changes to background-tone rejection, minor/diminished evidence and the altered-dominant vocabulary.

Diagnostic scripts, extracted frames and result JSON are ignored under `.chordpilot-data/benchmarks/virtual-insanity/`: `preset-local-results.json`, `source-probe.json`, `feature-probe.json`, `timeline-presets.json` and `timeline-focused.json`. Supported fixture labels parse successfully; both benchmark unit tests pass. The generic `scripts/testing/chord-reference-benchmark.py` can reproduce the 12 supported local windows with the saved mix/Other/Bass paths; unsupported quality is recorded separately.
