# ChordPilot

ChordPilot is an Electron desktop MVP for creating editable chord charts from MP3/WAV files. Electron handles file selection, audio preview, cleanup, and export buttons. Python performs the analysis and export work through a simple JSON command line contract.

## Features

- Select MP3/WAV audio from the desktop app.
- Run a Python analysis backend to estimate key, BPM, time signature, bars, chords, and rough sections.
- Choose a fast full-mix analysis path now, with a planned high-quality stem-separated path for cleaner results.
- Edit key, tempo, time signature, section names, bar numbers, chord symbols, repeats, and notes.
- Split, merge, add, duplicate, and delete bars while listening to the audio.
- Export cleaned charts to TXT, CSV, JSON, and MusicXML.

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

## Analysis Plan

ChordPilot should support two analysis modes:

### Fast Mode

Fast mode keeps the current MVP behavior: decode the selected MP3/WAV, analyze the full mix directly, estimate tempo, beat grid, bars, key, and rough chords, then open the editable cleanup table. This mode is intended for quick drafts and low-friction iteration.

Fast mode output remains:

- Editable bar-by-bar chord chart.
- Estimated key, BPM, and time signature.
- Rough sections and bar starts.
- Chord confidence where available.
- Manual cleanup for chords, bars, section names, repeats, key changes, split/merge bars, and exports.

### High-Quality Mode

High-quality mode should be optional because it is slower and heavier. After the user uploads an MP3/WAV, the backend should run Demucs to separate the track into stems such as:

- `vocals`
- `drums`
- `bass`
- `other` or accompaniment
- optionally full mix reference

The Electron UI should show the separated stems before relying on the analysis result. Each stem should appear as its own waveform lane with:

- Stem name and render status.
- Solo, mute, and volume controls.
- Linked playback with the original track.
- Per-stem waveform display.
- Beat/bar marker overlay where available.
- Clear warnings if a stem is missing, quiet, clipped, or likely low quality.

The user should be able to inspect the stems, solo the accompaniment/bass/drums, and decide whether the separation is good enough before accepting the high-quality analysis.

High-quality analysis should use stems this way:

- Use the `other`/accompaniment stem for chord recognition, reducing noise from vocals and drums.
- Use the `bass` stem to infer root movement and improve chord choices and inversions.
- Use the `drums` stem or full mix for tempo, beat, and downbeat detection.
- Use the full mix as a fallback when a stem is weak or unusable.
- Preserve chord alternatives and confidence scores where the recognizer can provide them.

The final result should still open in the same cleanup workflow:

- Editable key, BPM, time signature, and key changes.
- Editable sections, bar numbers, chord symbols, repeats, and notes.
- Waveform-linked beat and bar markers.
- Split/merge/add/duplicate/delete bars while listening.
- Chord confidence and alternatives where possible.
- Export to TXT, CSV, JSON, and MusicXML.

### Backend Shape

The Python backend should keep the existing JSON command contract and add a high-quality analysis command or option, for example:

```powershell
python backend/chordpilot.py analyze "song.mp3" --mode high-quality
```

The high-quality pipeline should cache heavy artifacts under the temp cache:

- Decoded source WAV.
- Demucs stem files.
- Stem waveform summaries.
- Beat/downbeat grid.
- Chord/root estimates.
- Final draft chart JSON.

This keeps repeat analysis fast and makes the log panel useful for showing progress through decode, separation, waveform rendering, beat tracking, chord recognition, and chart generation.
