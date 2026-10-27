# Semantic structure feasibility experiment

## Result and scope

The built-in v3 detector is not an adequate musical-role recognizer. A separate
All-In-One benchmark now runs on this Windows machine and produces untouched
functional predictions for all five review songs. This is evidence of a runnable
alternative with interpretable output, **not** proof of correct song forms.

This executes the feasibility portion of Stage 6. Independent whole-song
annotations, semantic quality evaluation and Stage 7 app integration remain
unfinished. The app's built-in engine and the five original saved sessions were
not changed by this experiment. No default promotion or recognition-accuracy
claim is made.

The [song-specific research](../../research/2026-10-25-waste-of-time-structure.md)
links the artist's song/lyrics page, section-tagged lyric evidence and primary
model sources. No reliable published timestamped form chart was located. Web
lyrics and user expectations were not inputs to inference.

## Waste of Time: actual output

The previous v3 baseline groups the opening 0–99.12 seconds together. With
the author's frozen `harmonix-all` ensemble and HTDemucs preprocessing, the
first functional predictions are:

| Raw role | Start | End |
| --- | --- | --- |
| start | 0.00 s | 0.30 s |
| intro | 0.30 s | 18.50 s |
| verse | 18.50 s | 42.64 s |
| verse | 42.64 s | 58.50 s |
| chorus | 58.50 s | 77.91 s |
| chorus | 77.91 s | 98.48 s |
| verse | 98.48 s | 122.62 s |
| inst | 122.62 s | 141.46 s |
| verse | 141.46 s | 160.29 s |
| chorus | 160.29 s | 179.11 s |
| chorus | 179.11 s | 199.68 s |
| chorus | 199.68 s | 223.84 s |
| chorus | 223.84 s | 245.62 s |
| end | 245.62 s | 252.26 s |

These are predictions, including potentially wrong labels. In particular, the
model has **no pre-chorus/post-chorus/refrain class**, although the external lyric
tags use some of those distinctions. Do not relabel its verse/instrumental
segments from the lyric tags. Consecutive verse/chorus rows are preserved as
separate native model intervals rather than silently merged or renamed.

The actual saved bar 9 starts at 19.10 seconds; the model predicts its transition
at 18.50 seconds. That 0.60-second difference remains untouched. No boundary was
snapped to the user's expected eight bars. The model's final 252.26-second edge
reflects its 100 Hz feature framing, approximately 7 ms beyond the decoded audio;
no session interval adapter was applied in this experiment.

## Controlled comparisons

- Full upstream orchestration using existing MDX-extra stems: 14 intervals,
  190.17 s for feature extraction, forward pass and beat/section postprocessing.
- Functional branch only with the same stems and model: **all 14 section
  boundaries and labels are exactly equal** to the complete pipeline. It skips
  the independent metrical DBN decoder, which ChordPilot does not need when
  retaining its existing bar grid.
- Repeated with the model's default HTDemucs preprocessing, overlap 0.25,
  float32: the role sequence and intro boundary are unchanged. One internal
  boundary moves by 0.01 s (58.51 to 58.50). There is no basis here to claim a
  semantic accuracy gain from changing separation alone.

The matching-preprocessing run decoded the original MP3 with bundled FFmpeg to
44.1 kHz stereo PCM16 WAV, then ran default HTDemucs without reference labels.
The initial direct-MP3 attempt lacked a compatible decoder and failed before
inference; WAV input resolved that error. No user audio was uploaded to an
external inference service.

## Complete-song probes

| Recording | MDX-extra probe intervals | Elapsed, one instrumented run | Peak functional CUDA allocations |
| --- | --- | --- | --- |
| Waste of Time | 14 | 74.70 s | 872 MiB |
| Overjoyed | 11 | 99.45 s | 869 MiB |
| I Love You 3000 | 12 | 74.51 s | 828 MiB |
| Ballad | 10 | 65.40 s | 852 MiB |
| Liang Bo | 21 | 243.91 s | 1,481 MiB |

Waste of Time's HTDemucs probe took 200.07 s including separation and feature
extraction, with 872 MiB peak **functional inference** CUDA allocations. This
memory number excludes the preceding separation stage and is not total process
RSS. Model initialization was measured separately and varied substantially
(40–217 s), especially under concurrent probes. These are single runs with shared
GPU contention, not speed medians or production latency promises. CPU-only
inference and a clean-machine installation have not been benchmarked.

## Artifacts and verification

- `outputs/song-structure/model-comparison/index.html`: playable comparison,
  defaulting to Waste of Time's HTDemucs role predictions; five songs, six model
  runs and the old v3 baseline selectable.
- `outputs/song-structure/model-comparison/verification.json`: exact raw source
  intervals preserved, complete contiguous model partitions, matching source
  hashes, no original session writes, no manually inserted answers.
- Raw outputs and provenance: `neural-functional-experiment/` for five songs,
  `neural-htdemucs-experiment/` for the controlled Waste of Time run, and
  `neural-experiment/` for the full-pipeline Waste of Time comparison.
- `tmp/benchmark-neural-structure.py`: local probe driver. It consumes audio
  spectrograms only; no chart labels, bar grid, expected counts, lyrics or web
  text enter the model. Weights and functional decoding are unchanged upstream.
- `tmp/build-semantic-review.py`: verifies raw outputs and assembles the review.
- Review JavaScript passed `node --check`. Browser verification covers loaded
  audio, playback from three seconds before the predicted transition, method
  switching between v3 and functional results, and all five song selectors.

No new production dependencies were added. The isolated experiment uses
`tmp/structure-neural-deps` and `tmp/structure-model-cache`; package pins, original
weight repository revision and license notes are in the research document.
Code/weight licenses were inspected for feasibility; packaging, redistribution,
dependency updates and optional-model setup still require the Stage 7 work.

## Decision

Keep v3 as an unsuccessful baseline. Do not spend another threshold change
trying to turn its letter clusters into song functions. Continue with a learned
functional detector as the candidate, retaining raw model evidence and separate
role/group identities. Validate whole songs, unsupported roles, padding and
same-role phrase granularity before adapting or promoting these predictions in
the app. The listening comparison is for examining those actual errors, not for
claiming that the model has solved recognition.

## Subsequent user-requested session update

The user subsequently requested importing the new predictions into the five
original session JSONs. That import is now complete and verified. Waste of Time
uses the HTDemucs probe; the other four use the cached-stem probes shown in the
comparison. `analysis.raw_segments` retains the exact native labels and times.
The effective interval list maps supported roles to the existing schema;
Start/End/Break retain their labels, and `inst` displays as Instrumental. No
pre-chorus label, manual overlay or A/B repeat group is invented.

Only the last 100 Hz frame-rounded endpoint is clipped to the exact source
duration (1.9–8.7 ms across these recordings); internal boundaries are unchanged.
The source identity, model revision, preprocessing and clipping are recorded in
each session. Chords, lyrics, drums, notes, repeats, beat/bar timing and other
session data compare equal before and after import, excluding structure, its
projected bar headings and the save timestamp. Both the Python interval validator
and renderer save/reopen helper accepted all five files. After writing, each
original file's hash equals its verified prepared copy.

Import provenance is in `outputs/song-structure/semantic-session-update/`.
This changes saved results only; the app's future structure-analysis engine
remains the built-in implementation until the optional model integration is done.
