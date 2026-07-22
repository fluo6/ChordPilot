from chordpilot_common import *
from chordpilot_cache import decoded_wav_cache_path

def audio_duration(path: Path) -> float:
    try:
        audio, sr = load_audio(path)
        return len(audio) / float(sr)
    except Exception:
        if path.suffix.lower() == ".wav":
            try:
                with wave.open(str(path), "rb") as handle:
                    frames = handle.getnframes()
                    rate = handle.getframerate()
                    if rate:
                        return frames / float(rate)
            except Exception:
                pass
        return 180.0

def load_audio(path: Path, target_sr: int = 22050) -> tuple[Any, int]:
    scipy_io = __import__("scipy.io.wavfile", fromlist=["read"])
    signal = __import__("scipy.signal", fromlist=["resample_poly"])
    np = __import__("numpy")

    if path.suffix.lower() == ".wav":
        log(f"audio: loading WAV {path.name}")
        sr, data = scipy_io.read(str(path))
        audio = pcm_to_float(data, np)
    else:
        ffmpeg = resolve_ffmpeg()
        if not ffmpeg:
            raise RuntimeError("Non-WAV analysis needs bundled ffmpeg or ffmpeg on PATH.")
        decoded_path = decoded_wav_cache_path(path, target_sr)
        if not decoded_path.exists():
            log(f"decode: ffmpeg -> temp WAV ({decoded_path.name})")
            command = [
                ffmpeg,
                "-y",
                "-v",
                "error",
                "-i",
                str(path),
                "-ac",
                "1",
                "-ar",
                str(target_sr),
                "-sample_fmt",
                "s16",
                str(decoded_path),
            ]
            completed = subprocess.run(command, capture_output=True, text=True)
            if completed.returncode != 0:
                message = (completed.stderr or completed.stdout or "ffmpeg decode failed").strip()
                raise RuntimeError(message)
        else:
            log(f"decode: using cached WAV {decoded_path.name}")
        log("audio: loading decoded WAV")
        sr, data = scipy_io.read(str(decoded_path))
        audio = pcm_to_float(data, np)
        sr = target_sr

    if audio.ndim > 1:
        audio = audio.mean(axis=1)

    audio = np.asarray(audio, dtype=np.float32)
    if sr != target_sr and len(audio):
        gcd = math.gcd(int(sr), int(target_sr))
        audio = signal.resample_poly(audio, target_sr // gcd, sr // gcd).astype(np.float32)
        sr = target_sr

    if len(audio):
        peak = float(np.max(np.abs(audio)))
        if peak > 1.0:
            audio = audio / peak

    return audio, sr

def resolve_ffmpeg() -> str | None:
    configured = os.environ.get("CHORDPILOT_FFMPEG", "").strip()
    if configured and Path(configured).exists():
        return configured
    local_candidates = [
        Path(__file__).resolve().parents[1] / "node_modules" / "ffmpeg-static" / "ffmpeg.exe",
        Path(__file__).resolve().parents[1] / "node_modules" / "ffmpeg-static" / "ffmpeg",
    ]
    for candidate in local_candidates:
        if candidate.exists():
            return str(candidate)
    return shutil.which("ffmpeg")

def waveform_peaks(path: Path, bins: int = 320) -> list[float]:
    np = __import__("numpy")
    try:
        audio, _sr = load_audio(path)
    except Exception as exc:
        log(f"waveform: failed for {path.name}: {exc}")
        return []

    if len(audio) == 0:
        return []

    mono = np.abs(audio)
    chunks = np.array_split(mono, min(bins, len(mono)))
    peaks = [round(float(chunk.max() if len(chunk) else 0.0), 4) for chunk in chunks]
    peak_max = max(peaks) if peaks else 0.0
    if peak_max > 0:
        peaks = [round(value / peak_max, 4) for value in peaks]
    return peaks

def pcm_to_float(data: Any, np: Any) -> Any:
    if np.issubdtype(data.dtype, np.floating):
        return data.astype(np.float32)
    if np.issubdtype(data.dtype, np.integer):
        limit = max(abs(np.iinfo(data.dtype).min), np.iinfo(data.dtype).max)
        return data.astype(np.float32) / float(limit)
    return data.astype(np.float32)
