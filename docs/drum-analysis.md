# Optional drum analysis

**Analyse Drums** transcribes a prepared drum stem using the pretrained ADTOF
PyTorch model. It runs only when requested. Regular chord analysis does not load
this model or transcribe drums.

## Use

1. Open audio and create a chart, or reopen a saved session.
2. In Analysis, use **Prepare Drum Stem** / **Prepare Stems** if a drum stem is
   missing. This runs the existing Demucs separation without replacing the chart.
3. Select **Analyse Drums**. Existing results are cached; **Reanalyse** explicitly
   runs the model again. A failed rerun keeps the previous result.
4. Open **Drum Sheet** in the Analysis sidebar for the selected bar, or choose
   **Drum Sheet** in the chart selector for continuous staff systems with chords.
   The table's **Drums** column summarizes hits per bar.
5. **Save Session** stores the original-time hits with the chart. Reopening the
   session displays them without another analysis job. Chord reanalysis preserves
   drum results and marks them stale if the associated stem changes or is missing.

The five labels are kick, snare, grouped toms, hi-hat, and grouped cymbals/ride.
K / S / T / H / C in the table refer to these groups. Simultaneous instruments
share an onset in the score. The display quantizes hits to the chart's beat grid;
raw onset times remain in session JSON. Closely spaced hits of the same instrument
can share a displayed note. Note lengths are rhythmic notation, not measured decay.
Model scores are activation values, not calibrated accuracy percentages.

Open **Review transcription** above the chart to listen to a selected bar or drum
stem, inspect original events, edit hit times/classes, reset edits and explicitly
mark that instrument's bar verified. Manual corrections and review notes are saved
alongside the original model output. Changed evidence invalidates verification;
near-barline hits include neighbouring review context and link to their owning bar
for editing. Unverified status stays in printed charts. The
[Overjoyed study](superpowers/validation/2026-10-19-overjoyed-transcription-review.md)
distinguishes transient support from unverified instrument classes. Notation still
uses one composite rhythmic voice; separate kick/hands voices remain future work.

## Install separately

Use Python 3.10 or newer (3.12 recommended) and Git. The optional installation
includes PyTorch and model weights and can be substantially larger than the app.
From the repository directory in PowerShell:

```powershell
py -3.12 -m venv .tool-cache/drum-python
& ./.tool-cache/drum-python/Scripts/python.exe -m pip install "git+https://github.com/xavriley/ADTOF-pytorch.git@85c192e78f716ea0b111cc8a5ee4a8f6a3a4f8a9"
$env:CHORDPILOT_DRUM_PYTHON = (Resolve-Path ./.tool-cache/drum-python/Scripts/python.exe).Path
npm start
```

On macOS/Linux use the environment's `bin/python` and export the corresponding
`CHORDPILOT_DRUM_PYTHON` path before launching. For the web app, configure this on
the server. This interpreter is used only for drum transcription; stem separation
continues to use the existing Demucs setup. Restart the app after changing its
environment variables.

An installation in the normal backend interpreter also works. For a separate
package directory, `CHORDPILOT_DRUM_PACKAGES` adds that directory only to the drum
process. When no dedicated interpreter is configured, the development checkout
also recognizes `.tool-cache/drum-packages`.
`CHORDPILOT_DRUM_WEIGHTS` can point to the compatible checkpoint; the ADTOF package
is still required. Missing weights cause an explicit error instead of inference
with random weights. `CHORDPILOT_TORCH_DEVICE=cpu` forces CPU execution.

If setting `CHORDPILOT_DRUM_PACKAGES`, use packages built for the same Python
version as the selected interpreter.

## Model and limitations

Notation rounds hits within 35 ms or 6% of the neighboring beat interval (whichever
is smaller) onto a nearby beat before assigning them to a bar. The same display
position is used when engraving, including partial final bars; original event
timestamps remain unchanged for playback, evidence and saving. Genuine short
pickups outside that tolerance retain their rhythmic position. Reanalyse Chords
to replace an older uniform beat grid before judging the drum notation. See the
[timing validation](superpowers/validation/2026-10-19-tempo-bar-validation.md).

Integration is pinned to upstream revision
`85c192e78f716ea0b111cc8a5ee4a8f6a3a4f8a9`. It uses the supplied five-class
thresholds, strict checkpoint loading, and 30-second inference windows with
two seconds of context on each side. Cached results depend on stem and checkpoint
file identity (path, size, modification time) and the integration revision.

The model does not distinguish individual toms, open/closed hats, or crash/ride.
Timing and instrument recognition are estimates; separation artifacts and an
incorrect beat grid can affect the result. No annotated accuracy benchmark has
been completed for ChordPilot. A local 12-second separated-stem run returned
34 estimated kick/snare events; this confirms inference runs, not hit accuracy.

The original [ADTOF project](https://github.com/MZehren/ADTOF) declares
CC BY-NC-SA 4.0. The [PyTorch port](https://github.com/xavriley/ADTOF-pytorch)
converts its weights. Optional model files stay outside this repository and
default app packages; review upstream licensing before redistributing them.

See the [research notes](superpowers/validation/2026-10-18-optional-drum-transcription-research.md)
for alternatives and source references.
