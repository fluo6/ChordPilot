# ChordPilot

ChordPilot is an Electron desktop MVP for creating editable chord charts from MP3/WAV files. Electron handles file selection, audio preview, cleanup, and export buttons. Python performs the analysis and export work through a simple JSON command line contract.

See [TODO.md](TODO.md) for open work, deferred features, known limitations and the current validation baseline.

## Features

- Select MP3/WAV audio from the desktop app.
- Run a Python analysis backend to estimate key, BPM, time signature, bars, chords, and rough sections.
- Detect and edit supported chord changes inside a measure, with Auto changes, Fixed grid, and Legacy one-chord-per-bar timing modes.
- Choose fast full-mix analysis or high-quality Demucs stem separation, using accompaniment for chord tones and Bass for root/inversion evidence.
- View estimated bass rhythm in score/TAB, preserving separately measured same-pitch reattacks after a short mute. Fast notes, effects and suggested fingerings still need listening checks; see the [paired Sir Duke benchmark](docs/superpowers/validation/2026-10-19-sir-duke-bass-benchmark.md).
- Optionally run pretrained drum transcription and view a Drum Sheet in the Analysis sidebar, continuous chart, and table summary. See [drum analysis setup](docs/drum-analysis.md).
- Bass Notes / TAB and Drum Sheet use alphaTab by default, with Current and side-by-side comparison available in the Notation selector. Both support 2/4 bars per line, playback highlighting and PDF export. Unplayable TAB pitches remain in complete standard notation, with diagnostics and the existing renderer available as a fallback.
- Review chords, bass notes and drum hits by bar: listen, inspect original evidence, edit events and mark verified. Reviews and bass notation/TAB display preferences save with the session. See [review validation and limitations](docs/superpowers/validation/2026-10-19-overjoyed-transcription-review.md).
- Edit key, tempo, time signature, section names, bar numbers, chord symbols, repeats, and notes.
- Split, merge, add, duplicate, and delete bars while listening to the audio.
- Export cleaned charts to TXT, CSV, JSON, and MusicXML.

## Chord timing

Under **Analysis Options**, choose **Auto changes** to keep supported chord changes
inside each bar, **Fixed grid** to retain a chord for every subdivision cell, or
**Legacy, one per bar** for the original bar-level analysis. New analysis defaults
to Auto changes with a **One beat** grid. **Half bar** and **Half beat** provide
coarser or finer cells. Beat boundaries follow the detected beat timestamps; when
the beat detector has gaps, the grid falls back to the song tempo. Auto groups
matching neighbors and suppresses only a weak isolated passing estimate; a brief
confident change and silence remain separate events.

Older sessions without timing options continue to display their saved bar chords
and are identified as Legacy when reopened. Changing a chord event preserves its
original analysis evidence and marks timing-adjusted evidence as historical.

## Local Study

Open **Local Study** to inspect one short passage without changing the song's
chord chart. Hold **Ctrl** (or **Command** on macOS) and click the start and end
on a waveform, or enable **Select Range** and click twice. Selection also works
on Song waveform lanes and opens the study tab. Start/End fields accept precise
seconds; select at least 0.05 seconds.

In Local Study, **drag the waveform to pan**, **drag the highlighted selection
to move the range**, or **drag either edge to resize it**. Zoom in for finer
control. Range edits update Start/End immediately and keep existing analysis
history intact; analyze again to get results for the changed interval.

**Bass + Other** is the default: Other supplies harmonic notes and Bass supplies
root or inversion evidence. Choose other available stems or explicitly **Use
Full Mix**. Prepare stems through high-quality song analysis when needed; old
browser sessions may need that analysis run again to register their stems.
Study analysis requires NumPy/SciPy and the existing audio decoder and reports
unavailable dependencies rather than generating a draft chord.

**Analyze Selection** returns one chord suggestion, alternatives, confidence,
and a scrollable **88-key piano (A0–C8)**. New runs estimate octave-specific
pitches such as C3 and C5, and highlight only those detected keys, including
selected bass notes. Older runs retain their pitch-class evidence; reanalyze
to get octave highlights. **Play Selection**, **Loop Selection**, and Space audition the selected
original sources; chart transposition and pitch-shift previews do not change
study audio or evidence. Master volume and playback speed remain adjustable.

Name the passage, add notes or an optional corrected chord, and **Save Study**.
Then **Save Session** to persist it with the song. Save Session also includes
successful unsaved study runs. Open saved studies from the tab's list; every
successful rerun preserves its original inputs and results. Use the history
and comparison selectors to inspect differences across settings or algorithm
versions. History stays readable when audio or stems are unavailable.

## Setup

Install Node dependencies:

```powershell
npm install
```

Optional Python dependencies improve analysis quality:

```powershell
python -m pip install essentia librosa soundfile music21
```

High-quality stem mode additionally needs Demucs in the Python environment used by ChordPilot:

```powershell
python -m pip install demucs
```

If Demucs is installed in a different environment, set `CHORDPILOT_PYTHON` or `CHORDPILOT_DEMUCS` before launching the app.
When High Quality Stems mode runs and Demucs is missing, ChordPilot will try `python -m pip install --user demucs` automatically for the current user unless `CHORDPILOT_AUTO_INSTALL_DEMUCS=0` is set.

The MVP works without those libraries by falling back to a deterministic draft chart. For production analysis, install ffmpeg and add it to PATH. Later builds can bundle the backend with PyInstaller so users do not need a separate Python installation.

If multiple Python installations are present, point the app at the correct interpreter:

```powershell
$env:CHORDPILOT_PYTHON="C:\Path\To\python.exe"
npm start
```

For embedded distributions that need an explicit runtime home, also set `CHORDPILOT_PYTHONHOME`.

## Run

```powershell
npm start
```

### YouTube links on Windows

Paste a YouTube link and select **Start From Link**. If the downloader, audio conversion tools, or a compatible JavaScript runtime are missing, ChordPilot shows a confirmation popup. Select **Download & Install** to download the required tools from their official GitHub releases. The app verifies each download, shows setup progress, and continues the same YouTube link automatically. No restart, terminal commands, or administrator access are needed.

Automatic tool setup supports 64-bit Windows and stores its tools under ChordPilot's user data folder. Existing compatible tools are reused. You can cancel without losing the pasted link; if setup fails, select **Start From Link** again to retry. This setup covers YouTube tools (yt-dlp, FFmpeg/FFprobe, and Deno when no compatible Node.js or Deno is available). Python analysis dependencies follow the setup instructions above.

## Run in a browser on your LAN

The Docker runtime serves the full ChordPilot workflow to browsers on the same trusted local network. Build and start it from the repository root:

```bash
docker compose up -d --build
docker compose ps
```

On Linux, find the host computer's LAN address with:

```bash
hostname -I
```

From another laptop on the same network, open `http://<host-ip>:2712`. If the page is not reachable, allow inbound TCP port `2712` through the host computer's firewall and check that the laptops are not on an isolated guest or client network. The Compose port is published on all host interfaces.

This service has no authentication, TLS, or per-user isolation. Use it only on a trusted LAN and do not expose it directly to the public internet. Anyone who can reach the selected port can upload and download audio, inspect stored sessions, and start CPU-intensive analysis work.

Inspect health and follow logs with:

```bash
docker compose ps
docker compose logs -f chordpilot
```

To use a different host port, set `CHORDPILOT_PORT` when starting the stack, then open that port in the browser and firewall:

```bash
CHORDPILOT_PORT=2713 docker compose up -d --build
```

The default upload limit is 512 MiB. Override it in bytes with `CHORDPILOT_UPLOAD_LIMIT_BYTES` when starting Compose.

All uploads, sessions, downloaded models, generated files, and analysis caches live in the `chordpilot-data` named volume. Stopping and removing the service preserves that volume:

```bash
docker compose down
```

Use the following only when you intentionally want to delete all ChordPilot uploads, sessions, models, generated files, and caches:

```bash
docker compose down -v
```

High-quality Demucs analysis runs on the CPU and can be slow. Its first run downloads the selected Demucs model into the persistent data volume; later runs reuse it. The current Python 3.11 audio dependency stack uses an amd64 Essentia wheel, so the Compose service targets `linux/amd64`. An ARM64 host therefore needs amd64 emulation (QEMU/binfmt, normally included with Docker Desktop), and the initial image build and analysis will be substantially slower under emulation.

**Hardware Recommendations for Better Performance:**
For significantly faster High-Quality analysis (stem separation), we strongly recommend running the native Desktop app (Electron) directly on a machine with a dedicated GPU or Apple Silicon. If you prefer to use this Docker LAN runtime, you can manually configure Docker for GPU passthrough (e.g., via the NVIDIA Container Toolkit) and update the backend script (`chordpilot_stems.py`) to use `device="cuda"` instead of `"cpu"`. Note that Docker Desktop for Mac does not support GPU passthrough to Linux containers.

Run the host-published API smoke test after the service is healthy:

```bash
npm run smoke:web
```

To verify that a saved session survives a container restart, record the first smoke run's session ID, restart the service, wait until it is healthy, and verify the same state file:

```bash
npm run smoke:web -- --state-file /tmp/chordpilot-smoke-session.json
docker compose restart chordpilot
docker compose ps
npm run smoke:web -- --verify-existing-session /tmp/chordpilot-smoke-session.json
```

`--verify-existing-session` also accepts the session ID printed by the first smoke run directly. Set `CHORDPILOT_WEB_URL` when testing a non-default port or a remote host, for example `CHORDPILOT_WEB_URL=http://127.0.0.1:2713 npm run smoke:web`.

## Build desktop apps

Install dependencies once with `npm install` or `npm ci`, then build on the operating system you are targeting.

Build an unpacked app for the current operating system:

```text
npm run build
```

Platform-specific commands are also available:

```text
npm run build:win
npm run build:mac
```

Reusable build helpers perform dependency checks, select an architecture, run packaging, and verify the output:

```powershell
# Windows x64 unpacked app
.\scripts\build-windows.ps1

# Windows ARM64 distributable ZIP, installing dependencies first
.\scripts\build-windows.ps1 -Mode distribution -Architecture arm64 -InstallDependencies
```

```bash
# macOS unpacked app for the current Mac architecture
bash scripts/build-macos.sh

# Apple Silicon DMG + ZIP, installing dependencies first
bash scripts/build-macos.sh --distribution --arch=arm64 --install
```

The same helpers can be launched through `npm run build:tool:win` and `npm run build:tool:mac`. Build verification can also be rerun independently with `npm run verify:build` and explicit `--platform`, `--architecture`, and `--mode` arguments.

The Windows build creates `dist/win-unpacked/ChordPilot.exe` and refreshes the repository shortcut as `ChordPilot - Windows.lnk`. The macOS build creates `ChordPilot.app` under `dist/mac*` and refreshes `ChordPilot - macOS.app` as a local symlink to the newest app bundle.

Create distributable archives or installers with:

```text
npm run dist:win
npm run dist:mac
```

Distribution artifacts include a platform suffix, for example `ChordPilot-0.1.0-Windows-x64.zip` or `ChordPilot-0.1.0-macOS-arm64.dmg`.

### macOS requirements

Run macOS builds on a Mac. Install Node.js and Python 3, then install the optional command-line tools used by the full feature set:

```bash
brew install python yt-dlp ffmpeg
python3 -m pip install demucs
```

ChordPilot checks the standard Apple Silicon and Intel Homebrew locations for Python, yt-dlp, and ffmpeg. An unsigned local build may need to be opened once with Finder's **Open** command. Public distribution should use an Apple Developer certificate and notarization.

Repository maintainers can also run the manual **Build macOS** workflow from GitHub Actions and download the generated artifact without owning a Mac. Choose `arm64` for Apple Silicon or `x64` for Intel Macs.

## Unit tests

Run the complete JavaScript and Python unit-test suite:

```text
npm test
```

Use `npm run test:unit` for the Electron/renderer tests or `npm run test:python` for the backend tests. The Python test launcher follows ChordPilot's interpreter rules and supports `CHORDPILOT_PYTHON` plus `CHORDPILOT_PYTHONHOME` when an explicit runtime is needed.

## Backend CLI

Analyse audio:

```powershell
python backend/chordpilot.py analyze "song.wav"
```

Export a chart:

```powershell
python backend/chordpilot.py export chart.json musicxml out.musicxml
```

Run a backend smoke test:

```powershell
npm run check:python
```

## Notes

The analysis pipeline is intentionally layered:

- Essentia, when available, is used for BPM/key style descriptors.
- librosa, when available, is used for duration and beat tracking.
- Chordino/NNLS Chroma can be added later as an external command stage.
- A fallback generator returns a useful editable chart when analysis dependencies are absent or audio decoding fails.

## Chart layout and playback

The chart header has a shared **Bars per line: 2 | 4** selector (default **4**)
for chord charts, measure grids, bass score/TAB, drum sheets and ChordPro text.
Section boundaries start a new system. Layout preferences are saved with the
session. The editable table retains its normal row layout.

Use **Auto-follow** beside Source Playback to keep the active system visible.
Manual scrolling pauses following for eight seconds; **Resume following** returns
sooner. The current measure stays highlighted when following is off. Measures
remain clickable for seeking.

The chart header's **PDF** button exports the current renderer and density.
In the web app it opens the browser print dialog; choose Save as PDF. Paper size
adapts between A4 portrait/landscape and A3 for dense notation so notes remain
readable. See [notation layout](docs/notation-layout.md) for details and validation.

## How analysis works

**Fast** analyzes the decoded mix. **High Quality Stems** separates vocals, drums, bass and accompaniment with Demucs, then estimates chord tones primarily from accompaniment and uses Bass as separate root/inversion evidence. The selected chord source, instrument/FX preset, timing grid, stability and spectral controls are available under Analysis Options. The result is an editable estimate; percentages are heuristic ranking scores, not calibrated probabilities.

Choose presets by instrument, arrangement, playing style and effects: mixed instruments, clean guitar arpeggios, sustained keys, rhythmic piano/keys, layered reverb or short articulated changes. Genre examples in the descriptions help identify the sound. Every preset shares the same chord vocabulary, and saved sessions retain the actual analysis values. [Current preset calibration and audio-only session audit](docs/superpowers/validation/2026-10-19-promises-molina-benchmark.md).

Beat timing now follows detected attacks throughout the recording; rounded display BPM does not rebuild the grid. **Reanalyse Chords** updates an older session with the new timing and can reuse existing stems. **Beat Offset (seconds)** shifts timing, while **First Downbeat** selects which tracked beat begins the first full bar and retains earlier beats in a pickup bar. Automatic analysis still assumes 4/4 and does not confidently identify musical downbeats. See the [timing validation](docs/superpowers/validation/2026-10-19-tempo-bar-validation.md) for measured results and remaining limitations.

Reanalyse Chords uses the available decoded audio and stems without rerunning Demucs; Reanalyse All + Stems repeats separation. Local Study analyzes an exact selected interval and saves its input settings and evidence alongside later reruns. Its full-range result may differ from a grouped timeline event at a chord change. See [TODO.md](TODO.md) for current algorithm limitations and [reference run instructions](docs/superpowers/validation/reference-runs.md) for reproducible checks.
