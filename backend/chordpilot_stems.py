from chordpilot_common import *
from chordpilot_audio import audio_duration, load_audio, pcm_to_float, resolve_ffmpeg, waveform_peaks
from chordpilot_cache import cache_key, cache_root, stems_cache_dir

def stem_info(name: str, path: Path) -> dict[str, Any]:
    duration = audio_duration(path)
    return {
        "name": name,
        "path": str(path),
        "duration": round(duration, 3),
        "waveform": waveform_peaks(path),
        "status": "ready" if path.exists() else "missing",
    }

def find_existing_stems(stems_dir: Path) -> dict[str, Path]:
    found: dict[str, Path] = {}
    for name in STEM_NAMES:
        candidates = list(stems_dir.rglob(f"{name}.wav"))
        if candidates:
            found[name] = candidates[0]
    return found

def resolve_demucs_command() -> list[str] | None:
    configured = os.environ.get("CHORDPILOT_DEMUCS", "").strip()
    if configured:
        configured_path = Path(configured)
        if path_exists_or_denied(configured_path):
            return [str(configured_path)]
        return configured.split()

    demucs_exe = shutil.which("demucs")
    if demucs_exe:
        return [demucs_exe]

    user_scripts = Path.home() / "AppData" / "Roaming" / "Python" / f"Python{sys.version_info.major}{sys.version_info.minor}" / "Scripts"
    user_demucs = user_scripts / ("demucs.exe" if os.name == "nt" else "demucs")
    if path_exists_or_denied(user_demucs):
        return [str(user_demucs)]

    if importlib.util.find_spec("demucs"):
        return [sys.executable, "-m", "demucs"]

    return None

def path_exists_or_denied(path: Path) -> bool:
    try:
        return path.exists()
    except PermissionError:
        return True

def install_demucs_for_user() -> list[str] | None:
    if os.environ.get("CHORDPILOT_AUTO_INSTALL_DEMUCS", "1").strip().lower() in {"0", "false", "no"}:
        return None

    log("demucs: not found; installing for current user with pip")
    command = [sys.executable, "-m", "pip", "install", "--user", "demucs", "torchcodec"]
    completed = subprocess.run(command, capture_output=True, text=True, env=demucs_env())
    for line in (completed.stdout or "").splitlines():
        if line.strip():
            log(f"pip: {line.strip()}")
    for line in (completed.stderr or "").splitlines():
        if line.strip():
            log(f"pip: {line.strip()}")
    if completed.returncode != 0:
        raise RuntimeError("Automatic Demucs install failed. See analysis log for pip output.")

    return resolve_demucs_command()

def run_demucs(path: Path, options: dict[str, Any] | None = None) -> dict[str, Any]:
    options = options or dict(DEFAULT_ANALYSIS_OPTIONS)
    model_name = str(options.get("demucs_model", "htdemucs") or "htdemucs")
    stems_dir = stems_cache_dir(path) / model_name
    stems_dir.mkdir(parents=True, exist_ok=True)
    existing = find_existing_stems(stems_dir)
    if all(name in existing for name in STEM_NAMES):
        log("stems: using cached Demucs stems")
        return {
            "ok": True,
            "engine": "demucs cached",
            "directory": str(stems_dir),
            "stems": [stem_info(name, existing[name]) for name in STEM_NAMES],
        }

    ensure_demucs_available()

    try:
        return run_demucs_internal(path, stems_dir, model_name)
    except Exception as internal_error:
        log(f"demucs: internal tensor path failed - {internal_error}")
        log("demucs: trying command-line fallback")

    demucs_command = resolve_demucs_command()
    if not demucs_command:
        raise RuntimeError("Demucs is not installed. Install it with `python -m pip install demucs` or set CHORDPILOT_DEMUCS.")

    source = demucs_source_wav_path(path, 44100)
    if not source.exists():
        log("stems: decoding source for Demucs")
        decode_to_wav(path, source, 44100, 2)

    log("stems: running Demucs separation")
    command = [
        *demucs_command,
        "--name",
        model_name,
        "--out",
        str(stems_dir),
        "--device",
        "cpu",
        "--jobs",
        "1",
        str(source),
    ]
    completed = subprocess.run(command, capture_output=True, text=True, env=demucs_env())
    if completed.stdout:
        for line in completed.stdout.splitlines():
            if line.strip():
                log(f"demucs: {line.strip()}")
    if completed.stderr:
        for line in completed.stderr.splitlines():
            if line.strip():
                log(f"demucs: {line.strip()}")
    if completed.returncode != 0:
        details = demucs_error_summary(completed.stdout, completed.stderr)
        raise RuntimeError(f"Demucs failed with exit code {completed.returncode}: {details}")

    found = find_existing_stems(stems_dir)
    missing = [name for name in STEM_NAMES if name not in found]
    if missing:
        raise RuntimeError(f"Demucs finished but missing stems: {', '.join(missing)}")

    log("stems: separation complete")
    return {
        "ok": True,
        "engine": f"demucs {model_name}",
        "directory": str(stems_dir),
        "stems": [stem_info(name, found[name]) for name in STEM_NAMES],
    }

def ensure_demucs_available() -> None:
    if resolve_demucs_command():
        return
    if install_demucs_for_user():
        return
    raise RuntimeError("Demucs is not installed. Install it with `python -m pip install demucs` or set CHORDPILOT_DEMUCS.")

def demucs_source_wav_path(path: Path, target_sr: int) -> Path:
    return cache_root() / "decoded" / f"{cache_key(path)}-{target_sr}-stereo.wav"

def decode_to_wav(path: Path, output: Path, target_sr: int, channels: int) -> None:
    ffmpeg = resolve_ffmpeg()
    if not ffmpeg:
        raise RuntimeError("Demucs mode needs ffmpeg to decode audio.")
    command = [
        ffmpeg,
        "-y",
        "-v",
        "error",
        "-i",
        str(path),
        "-ac",
        str(channels),
        "-ar",
        str(target_sr),
        "-sample_fmt",
        "s16",
        str(output),
    ]
    completed = subprocess.run(command, capture_output=True, text=True)
    if completed.returncode != 0:
        raise RuntimeError((completed.stderr or completed.stdout or "ffmpeg decode failed").strip())

def load_demucs_mix(path: Path, target_sr: int) -> Any:
    scipy_io = __import__("scipy.io.wavfile", fromlist=["read"])
    np = __import__("numpy")
    source = demucs_source_wav_path(path, target_sr)
    if not source.exists():
        log(f"demucs: decoding stereo source {source.name}")
        decode_to_wav(path, source, target_sr, 2)
    sr, data = scipy_io.read(str(source))
    if sr != target_sr:
        raise RuntimeError(f"Demucs source decode returned {sr} Hz, expected {target_sr} Hz")
    audio = pcm_to_float(data, np)
    if audio.ndim == 1:
        audio = np.stack([audio, audio], axis=1)
    return audio.T.astype(np.float32)

def run_demucs_internal(path: Path, stems_dir: Path, model_name: str = "htdemucs") -> dict[str, Any]:
    np = __import__("numpy")
    scipy_io = __import__("scipy.io.wavfile", fromlist=["write"])
    torch = __import__("torch")
    apply_module = __import__("demucs.apply", fromlist=["apply_model"])
    pretrained = __import__("demucs.pretrained", fromlist=["get_model"])

    log(f"demucs: loading {model_name} model")
    model = pretrained.get_model(model_name)
    model.cpu()
    model.eval()
    sample_rate = int(getattr(model, "samplerate", 44100))
    sources = list(getattr(model, "sources", STEM_NAMES))
    mix_np = load_demucs_mix(path, sample_rate)
    mix = torch.from_numpy(mix_np)
    ref = mix.mean(0)
    ref_mean = ref.mean()
    ref_std = ref.std()
    if float(ref_std) < 1e-8:
        ref_std = torch.tensor(1.0)
    mix = (mix - ref_mean) / ref_std

    log("demucs: separating stems on CPU")
    with torch.no_grad():
        separated = apply_module.apply_model(
            model,
            mix.unsqueeze(0),
            split=True,
            overlap=0.25,
            device="cpu",
            num_workers=0,
            progress=False,
        )[0]
    separated = separated * ref_std + ref_mean

    output_dir = stems_dir / model_name / path.stem
    output_dir.mkdir(parents=True, exist_ok=True)
    written: dict[str, Path] = {}
    for index, name in enumerate(sources):
        audio = separated[index].detach().cpu().numpy().T
        audio = np.clip(audio, -1.0, 1.0)
        output_path = output_dir / f"{name}.wav"
        scipy_io.write(str(output_path), sample_rate, (audio * 32767).astype(np.int16))
        written[name] = output_path
        log(f"demucs: wrote {name}.wav")

    missing = [name for name in STEM_NAMES if name not in written]
    if missing:
        raise RuntimeError(f"Demucs internal path missing stems: {', '.join(missing)}")

    log("stems: separation complete")
    return {
        "ok": True,
        "engine": f"demucs {model_name} internal",
        "directory": str(stems_dir),
        "stems": [stem_info(name, written[name]) for name in STEM_NAMES],
    }

def demucs_error_summary(stdout: str, stderr: str) -> str:
    lines = []
    for text in [stderr or "", stdout or ""]:
        lines.extend([line.strip() for line in text.splitlines() if line.strip()])
    if not lines:
        return "no error output"
    return " | ".join(lines[-8:])

def demucs_env() -> dict[str, str]:
    env = os.environ.copy()
    ffmpeg = resolve_ffmpeg()
    if ffmpeg:
        ffmpeg_dir = str(Path(ffmpeg).parent)
        env["PATH"] = ffmpeg_dir + os.pathsep + env.get("PATH", "")
        env["FFMPEG_BINARY"] = ffmpeg
        log(f"demucs: using ffmpeg from {ffmpeg_dir}")
    return env
