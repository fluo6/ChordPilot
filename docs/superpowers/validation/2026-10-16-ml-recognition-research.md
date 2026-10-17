# Learned models for ChordPilot: initial research

Research only, 16 October 2026. No models installed, training started, runtime benchmarks run or product behavior changed. This is a shortlist and proposed evaluation, not evidence that ML improves our recordings.

## Recommendation

Start with a **hybrid benchmark: pretrained note/onset evidence plus the existing chord scorer**. Keep the current pipeline as the baseline and fallback. Consider fine-tuning only after this establishes a useful gain and exposes specific remaining errors. Training an end-to-end audio model from scratch is premature.

ChordPilot already uses a learned Demucs model for stem separation (`backend/chordpilot_stems.py`, `run_demucs_internal`). Its subsequent chroma extraction, bass tracking and chord ranking mostly use hand-designed rules. The choice is therefore where to add learned evidence, rather than whether the entire app should use ML.

Our recent failures involve note identity, harmonics, staggered attacks, sustain and selection boundaries. My inference is that learning **which notes start and remain active over time** is a better first target than replacing the chord-name dictionary. Better acoustic evidence could serve the keyboard, bass score/TAB and chord analysis together. This remains untested on our material. A note transcriber still cannot decide every harmonic function from notes alone, and MIDI key release is not the same as the end of audible pedal/reverb sustain.

## Candidates from primary sources

| Candidate | Verified capability | Proposed role and limitation |
| --- | --- | --- |
| [Spotify Basic Pitch](https://github.com/spotify/basic-pitch) | Lightweight polyphonic audio-to-MIDI model, pitch bends, raw model outputs and note events. Original TensorFlow model also has ONNX/TFLite/CoreML versions; the project documents ONNX as its default Windows runtime. Code is Apache-2.0. | First general note/onset baseline, run separately on Bass and Other. Authors say it works best on one instrument at a time; mixed Other, stem artifacts, faint extensions and bass octave errors must be measured. It produces notes, not chord names. |
| [High-resolution piano transcription](https://github.com/bytedance/piano_transcription) | PyTorch piano note/pedal transcription with pretrained inference and training instructions. The repository lists Apache-2.0 for its code. | Piano-specific comparator for Virtual Insanity. Do not assume piano performance transfers to guitar, strings or a dense separated accompaniment. Older reference dependencies need an isolated compatibility check. |
| [BTC chord recognition](https://github.com/jayg996/BTC-ISMIR19) | Transformer chord recognizer; its [configuration](https://github.com/jayg996/BTC-ISMIR19/blob/master/run_config.yaml) supports 25- and 170-class output setups. | Optional direct chord baseline. A fixed output vocabulary must be audited against our 6/9, maj9, 13, altered/suspended and slash requirements; “170 classes” does not mean 170 chord qualities or unrestricted extensions. |
| [MT3](https://github.com/magenta/mt3) | Multi-instrument transcription with pretrained models. Its README says training is not easily supported and points to T5X training setup. | Later comparator if mixed-instrument transcription is the demonstrated bottleneck. Higher integration scope than the first note-evidence experiment. |

Code licenses do not by themselves settle checkpoint, training-data or redistributed-audio permissions; check the exact artifacts selected before adoption.

There is research support for retaining harmonic structure in a learned recognizer: [McFee and Bello, ISMIR 2017](https://archives.ismir.net/ismir2017/paper/000077.pdf) explicitly addresses rare-class scarcity and learns structured root/quality representations. If we eventually train our own chord model, compare factorized root, bass and chord-tone/extension outputs against a flat symbol classifier. This is a proposed experiment, not an implemented architecture or a guarantee of recognizing unseen extensions.

## Data is the main constraint

The current 83 approximate chord windows across five references are a regression set, not a substantial training corpus. They lack exhaustive note/onset/offset labels, and some video highlights cross performed transitions. Existing model predictions must not silently become ground truth.

For future training, curate verified Local Studies with audio/stem identity, time range, actual notes and octave, note attacks/releases where checked, chord root/function/extensions, instrument/FX tags, annotation uncertainty and provenance. Distinguish naming preferences from acoustic corrections. Split by song/recording **before** cropping or transposition; augmented versions and overlapping crops must stay in the same split. Reserve untouched recordings for final evaluation and record known pretrained-data overlap where possible.

Useful public data to assess:

- [Slakh2100](https://www.slakh.com/): aligned MIDI and synthesized multitrack audio, including separate instruments and rendered effects; the site lists CC BY 4.0. Useful for exact note labels and controlled mixtures. Synthetic-to-real and synthetic-to-Demucs-stem differences remain.
- [MAESTRO](https://magenta.tensorflow.org/datasets/maestro): about 200 hours of aligned acoustic piano/MIDI with pedal information; mostly classical repertoire. Its published dataset license is **CC BY-NC-SA 4.0**, so it is not interchangeable with unrestricted training data. It does not provide jazz chord-function labels.
- Controlled renderings of our chord vocabulary with varied voicings, instruments, velocity, sustain, EQ and reverb can supplement verified real performances. Use suitable source assets and hold out both musical material and timbres; synthetic success alone cannot establish real-song accuracy.

## Smallest next experiment

1. Freeze the current algorithm and annotated test windows. Prepare an offline, isolated pretrained Basic Pitch comparison on existing Bass/Other crops, plus a piano-specific comparator if worthwhile. Record checkpoint/version, settings, dependency footprint and CPU/GPU time. Do not connect it to default product results yet.
2. Evaluate note precision/recall, octave errors, false overtone notes, missed loud notes, onset/offset errors and sustained-tail false re-attacks. Separately compare chord root, bass/inversion, function, exact extensions and change timing. Preserve passing chords and all previous successful passages; include unseen recordings beyond the repeatedly tuned five songs.
3. Compare current evidence alone, learned evidence alone and an explicit hybrid with the same chord vocabulary. Preserve raw spectra and label learned probabilities separately from dB; they are not interchangeable. Do not present model outputs as calibrated confidence without calibration checks.
4. Adopt an optional evidence source only if it improves held-out results with acceptable latency and no material regressions. If remaining errors justify customization, collect the corresponding labels and fine-tune an existing model or train a small temporal/ranking component before considering full retraining. Rootless voicing work remains deferred under VOI-02.

TensorFlow is viable, but framework choice does not solve label quality, vocabulary or domain mismatch. PyTorch already participates in the Demucs path; ONNX may simplify a pretrained Windows inference trial. Choose based on the winning model and measured deployment cost, not by adding another framework in advance. There is no measured speed or accuracy comparison for ChordPilot yet.
