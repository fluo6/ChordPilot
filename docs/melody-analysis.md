# Optional vocal Lead Sheet

Select **Lead Sheet** under Charts, then **Analyse Melody**. This uses a prepared vocals stem; **Prepare Vocal Stem** runs the existing stem preparation step when needed. Melody extraction is optional and does not run with ordinary chord analysis. Results are estimates: review backing vocals, breaths, octave errors and repeated syllables against the vocal stem before marking bars verified.

The lead sheet uses alphaTab treble notation, existing chords/sections, 2/4 bars per line, audio seeking/highlighting and PDF export. Display transposition follows the chord chart while original vocal pitches/times remain in the session. The review editor uses original vocal pitches. Lyrics remain line-level references; instrumental leads and syllable alignment are not included.

## Model and terms

This optional integration uses [GAME](https://github.com/openvpi/GAME) source v1.0.3 and its [GAME-1.0-small pretrained checkpoint](https://github.com/openvpi/GAME/releases/tag/v1.0.0). The source repository is MIT; the published weights use **CC BY-NC-SA 4.0**. The model is an optional local installation, not part of ChordPilot's application package. Review the linked terms for your intended use, particularly before distributing or commercially using the weights.

No model is downloaded by opening a session, selecting the view or running ordinary analysis. New sessions without melody results work normally. Missing optional model/dependency errors include setup guidance; previous usable results survive a failed reanalysis.

## Windows setup

Install a standard Python 3.12 interpreter, then run from the ChordPilot project folder:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup-melody.ps1 -AcceptNonCommercialWeights
```

The script creates `.tool-cache/melody/venv`, downloads version-pinned source and weights with SHA-256 checks, and installs CPU inference dependencies there. It preserves existing source/weights. Downloads can be substantial because PyTorch is included. Supply `-Python 'C:/path/to/python.exe'` if the `py -3.12` launcher is unavailable; use a standard interpreter whose virtual environments work independently.

Restart ChordPilot after setup. The shared runtime automatically uses that optional environment for melody commands only. GPU installation can instead use a separate compatible PyTorch environment configured below; CPU inference is the validated local path.

## Manual/custom installation

The backend supports these environment variables:

| Variable | Meaning |
| --- | --- |
| `CHORDPILOT_MELODY_PYTHON` | Optional interpreter; overrides automatic project-local virtual-environment discovery |
| `CHORDPILOT_MELODY_SOURCE` | Extracted GAME v1.0.3 source folder containing `inference/me_infer.py` |
| `CHORDPILOT_MELODY_WEIGHTS` | GAME-1.0-small `model.pt`, with its original `config.yaml` beside it |
| `CHORDPILOT_MELODY_PACKAGES` | Optional package directories separated by the platform path separator; normally unnecessary with a dedicated environment |
| `CHORDPILOT_TORCH_DEVICE` | `cpu` forces CPU inference; otherwise CUDA is used when available |
| `CHORDPILOT_CACHE_DIR` | Existing ChordPilot backend cache location; melody entries are under `melody/` |

Linux/macOS users can create `.tool-cache/melody/venv` with Python 3.12, install the inference packages listed in the PowerShell script, and extract the same archives into the documented locations. The runtime detects `venv/bin/python`. These platforms' model installations have not been validated in the local Windows run.

For development, the existing local benchmark package directories can also be used without changing global Python packages. They are ignored by Git and excluded from packaging.

## Headless analysis

```powershell
python backend/chordpilot.py analyze-melody 'C:/path/to/prepared/vocals.wav' --language en
```

Use the optional interpreter above if necessary. Supported language hints are `en`, `zh`, `yue`, `ja`, and `auto` (unknown language ID). The UI uses the session's detected/specified lyric language when available, otherwise `auto`; it does not run speech recognition merely to obtain a hint. `--force` bypasses the acoustic cache.

The JSON result includes original model regions, decoded monophonic notes, continuous pitch estimates, model/source identity and diagnostics. It does not provide calibrated accuracy percentages. Context windows limit memory use; adjacent notes are joined across a processing seam only when both windows identify a sustained note. Reattacks remain separate. Acoustic results are cached by stem/model/source-code/configuration/language identity and replaced atomically.

Rhythmic notation is derived separately using the current beat map. Sustains are tied across bars, rests fill unvoiced intervals, and supported triplets are retained. Events too short to represent on the display grid are reported in **Melody review notes**, with their source evidence retained. The model can still make genuine musical errors; quantization does not prove correctness.

Lead-sheet rhythm spelling prefers a straight sixteenth-note grid and fewer tied fragments. Triplets require three consecutive attacks supporting the same subdivision; one off-grid release does not establish a tuplet. Adjacent-bar evidence preserves groups crossing a barline. Editing a neighbouring melody bar invalidates verification because it can change both ties and rhythmic interpretation. These display choices do not rewrite the original detected pitches or timings; short ornaments that cannot fit the display grid remain in the evidence and diagnostics.

Use **Save Session** to retain results and review corrections. Original sessions are not overwritten by analysis until explicitly saved. **Reanalyse Melody** replaces predictions after a successful run; old corrections/verification become stale when their evidence basis changes.

## Readable performance view

The Lead Sheet defaults to **1/16** rhythm precision and **Clean chords**. Choose **1/32** to inspect finer timing. These settings are saved with the session and never change detected pitches or source timings. Changing rhythm precision requires a fresh notation review, while preserving manual pitch/timing corrections. Clean chords changes labels only: it reduces supported extensions, removes redundant same-root slash basses and combines adjacent identical displayed labels. Real slash basses and altered dominant details remain; hover a label to inspect its original chord symbols.

Lead-sheet notation is larger than the bass/drum view, with a subtle measure tint and thin playback cursor. The existing 2/4 bars-per-line options and section headings remain. **Melody review notes** and marked bar numbers identify excessive tie chains, very short values, dense tuplets and unusually dense note sequences. These checks request listening/review; they do not delete difficult music. Full-bar rests are retained where the model detected no singing. No syllable alignment or repeated-section structure is invented from the audio.

### Optional accompaniment audit (developer tool)

`scripts/testing/audit-melody-voice.py` can independently classify the original full mix in five-second windows using the official [PANNs Cnn6 implementation](https://github.com/qiuqiangkong/audioset_tagging_cnn) and [checkpoint](https://zenodo.org/records/3987831). This is a separate local audit, not an Analyse Melody dependency or automatic download. Its uncalibrated activations cannot distinguish the lead singer from backing vocals and overlap with quiet singing. Low singing/high instrument evidence therefore produces **possible accompaniment leakage** warnings only; it never removes notes.

Supply a local `--model-dir` containing the official `models.py`, `pytorch_utils.py`, `class_labels_indices.csv`, `Cnn6.pth`, and compatible optional torchlibrosa packages under `packages/`. Use a Python environment with the existing audio dependencies, PyTorch and NumPy. The script verifies the checkpoint SHA-256 and writes a separate report:

```powershell
python scripts/testing/audit-melody-voice.py 'C:/path/song.chordpilot-session.json' --model-dir 'C:/path/panns' --output 'C:/path/voice-review.json'
```

A reviewed report may be attached as `chart.melody.voice_review`. The renderer accepts it only for its matching melody fingerprint; reanalysis retains it only when the fingerprint and original notes are unchanged. Model code/weights and song-derived artifacts are not included in the application package.
