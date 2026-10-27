# Waste of Time: structure failure and model experiment

## Song evidence

The recording under review is 9m88's **浪費時間 / Waste of Time**, from
*Beyond Mediocrity*. The artist's [Bandcamp page](https://9m88baba.bandcamp.com/track/waste-of-time)
identifies the song and its authorship. Its lyrics are not a timestamped score.

[Shazam's section-tagged lyrics](https://www.shazam.com/song/1669885342/waste-of-time)
distinguish verses, pre-choruses, choruses, a refrain and an outro. This is useful
external evidence that the song has functional structure; it is not an
independently verified boundary annotation. Consecutive blocks marked chorus
need not be separate large-scale occurrences. No reliable published bar-by-bar
or timestamped form chart was located. No lyrics are reproduced here.

Neither web text nor the user's expected intro length is an inference input.
That feedback makes this song a development example; it cannot be called a
held-out evaluation song after tuning against it.

## Confirmed failure of the built-in detector

`builtin-novelty-v3` compares averaged full-mix chroma, spectral shape, level and
activity. It has no trained musical-role classifier. Its A/B/C values are
acoustic clusters, not intro/verse/chorus labels. The complete-link grouping also
depends on the already selected intervals, so missing boundaries corrupt the
meaning of later group comparisons.

With the actual saved Waste of Time bar grid, its first estimated interval is
0–99.12 seconds. A local change at 19.10 seconds scores approximately 0.0382,
below the song-wide cutoff of 0.05065. Several neighboring changes have similar
scores. Lowering this cutoff to force that one known transition would admit
other weak changes and would not solve musical-role recognition.

The five raw runs and the rejected manual-correction history are recorded in
`outputs/song-structure/algorithm-only-2026-10-25/` and `waste-intro-check/`.
The manual correction was removed from the actual saved session. The v3 output
is an unsuccessful baseline, not an acceptable recognition result.

## Better comparator

[All-In-One](https://github.com/mir-aidj/all-in-one) and its
[paper](https://arxiv.org/abs/2307.16425) jointly predict functional boundaries
and labels using separated audio spectrograms and long-range learned context.
The label set includes intro, verse, chorus, bridge, outro, break, instrumental
and solo, plus start/end padding. **Pre-chorus and post-chorus are unsupported**;
no mapping from an A/B letter or web lyric heading may manufacture those roles.

The isolated Windows experiment uses the maintained
[all-in-one-infer](https://github.com/openmirlab/all-in-one-infer) implementation
with pure PyTorch neighborhood attention, avoiding a compiled NATTEN dependency.
It consumes the author's pretrained `harmonix-all` eight-fold ensemble, with
unchanged weights and default functional postprocessing. The
[author's weight repository](https://huggingface.co/taejunkim/allinone) advertises
MIT; model repository revision is `379e5fd010b3fdd0ee8381ff8cbcfa51d70b5c19`.
The inference package is MIT and madmom-infer's decoder is BSD-2-Clause. This is
an experiment, not a completed distribution/dependency review.

Experiment dependencies are confined to `tmp/structure-neural-deps`; model
weights to `tmp/structure-model-cache`. The global Python environment and
ChordPilot production dependencies are unchanged. Existing MDX-extra stems are
reused for the first feasibility probe; the model's training preprocessing used
HTDemucs, so this difference must be reported and investigated before claiming
a matched-preprocessing benchmark. Inputs to the model are spectrograms only,
with no chart grid, section labels, expected counts, lyrics or web text.

Package pins for the probe: all-in-one-infer 3.1.0, madmom-infer 0.2.0,
demucs-infer 4.4.0, hydra-core 1.3.7, omegaconf 2.3.1,
huggingface-hub 0.36.2, NumPy 1.26.4, SciPy 1.13.1,
Numba 0.60.0, llvmlite 0.43.0, torch/torchaudio 2.5.1+cu121.

## Required interpretation

Keep raw predictions and provenance. Report actual role names, boundaries,
resource use and failures. Do not rename groups to verse/chorus, force an
eight-bar intro, count a successful import as recognition quality, or claim
accuracy from section counts. Compare the complete five songs and inspect
unsupported/ambiguous roles. Independent complete-song references and a
song-separated evaluation remain necessary for a general quality claim.
