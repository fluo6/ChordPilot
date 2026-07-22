from chordpilot_common import *


def generate_lyrics_reference(
    source_path: Path,
    stems_result: dict[str, Any] | None,
    options: dict[str, Any],
    duration: float,
) -> dict[str, Any]:
    lyrics_path, source_label = select_lyrics_source(source_path, stems_result, options)
    if not lyrics_path.exists():
        return lyrics_unavailable(f"{source_label} file not found")

    model_name = str(options.get("lyrics_model", "tiny") or "tiny")
    language = str(options.get("lyrics_language") or "").strip().lower()
    language_label = language or "auto"
    log(f"lyrics: transcribing {source_label} with model {model_name}, language {language_label}")

    errors: list[str] = []
    for engine_name, transcriber in [
        ("faster-whisper", transcribe_with_faster_whisper),
        ("openai-whisper", transcribe_with_openai_whisper),
    ]:
        if not importlib.util.find_spec("faster_whisper" if engine_name == "faster-whisper" else "whisper"):
            errors.append(f"{engine_name} not installed")
            continue
        try:
            lines, detected_language = transcriber(lyrics_path, model_name, duration, language)
            log(f"lyrics: {len(lines)} reference lines")
            return {
                "ok": True,
                "engine": engine_name,
                "source": source_label,
                "source_path": str(lyrics_path),
                "model": model_name,
                "language": detected_language or language,
                "language_mode": "specified" if language else "detected",
                "lines": lines,
            }
        except Exception as exc:
            errors.append(f"{engine_name}: {exc}")
            log(f"lyrics: {engine_name} unavailable - {exc}")

    return lyrics_unavailable("; ".join(errors) or "no lyric transcription backend available")


def select_lyrics_source(
    source_path: Path,
    stems_result: dict[str, Any] | None,
    options: dict[str, Any],
) -> tuple[Path, str]:
    requested = str(options.get("lyrics_source", "auto")).replace("-", "_")
    stems = {
        stem.get("name"): Path(stem.get("path"))
        for stem in (stems_result or {}).get("stems", [])
        if stem.get("name") and stem.get("path")
    }

    if requested in {"auto", "vocals"} and stems.get("vocals"):
        return stems["vocals"], "vocals stem"

    if requested == "vocals":
        try:
            from chordpilot_stems import run_demucs

            log("lyrics: preparing vocals stem")
            generated = run_demucs(source_path, options)
            for stem in generated.get("stems", []):
                if stem.get("name") == "vocals" and stem.get("path"):
                    return Path(stem["path"]), "vocals stem"
        except Exception as exc:
            log(f"lyrics: vocals stem unavailable - {exc}")

    return source_path, "full mix"


def transcribe_with_faster_whisper(
    audio_path: Path,
    model_name: str,
    duration: float,
    language: str = "",
) -> tuple[list[dict[str, Any]], str]:
    module = __import__("faster_whisper", fromlist=["WhisperModel"])
    try:
        model = module.WhisperModel(model_name, device="cpu", compute_type="int8", local_files_only=True)
        log(f"lyrics: using cached faster-whisper {model_name} model")
    except Exception:
        log(f"lyrics: cached faster-whisper {model_name} model missing; trying online download")
        model = module.WhisperModel(model_name, device="cpu", compute_type="int8")
    segments, info = model.transcribe(
        str(audio_path),
        beam_size=1,
        vad_filter=True,
        word_timestamps=False,
        language=language or None,
    )
    detected_language = getattr(info, "language", None) or language or ""
    lines = []
    for segment in segments:
        text = clean_lyric_text(getattr(segment, "text", ""))
        if not text:
            continue
        start = clamp_time(getattr(segment, "start", 0.0), duration)
        end = clamp_time(getattr(segment, "end", start + 1.0), duration)
        lines.append({
            "start": start,
            "end": max(start + 0.05, end),
            "text": text,
            "confidence": lyric_confidence(
                getattr(segment, "no_speech_prob", None),
                getattr(segment, "avg_logprob", None),
            ),
            "language": detected_language,
        })
    return lines, detected_language


def transcribe_with_openai_whisper(
    audio_path: Path,
    model_name: str,
    duration: float,
    language: str = "",
) -> tuple[list[dict[str, Any]], str]:
    whisper = __import__("whisper")
    model = whisper.load_model(model_name, device="cpu")
    result = model.transcribe(str(audio_path), fp16=False, verbose=False, language=language or None)
    detected_language = str(result.get("language") or language or "")
    lines = []
    for segment in result.get("segments", []):
        text = clean_lyric_text(segment.get("text", ""))
        if not text:
            continue
        start = clamp_time(segment.get("start", 0.0), duration)
        end = clamp_time(segment.get("end", start + 1.0), duration)
        lines.append({
            "start": start,
            "end": max(start + 0.05, end),
            "text": text,
            "confidence": lyric_confidence(segment.get("no_speech_prob"), segment.get("avg_logprob")),
            "language": detected_language,
        })
    return lines, detected_language


def apply_lyrics_to_bars(bars: list[dict[str, Any]], lines: list[dict[str, Any]], duration: float) -> None:
    if not bars:
        return

    groups: list[list[str]] = [[] for _bar in bars]
    for line in lines:
        text = clean_lyric_text(line.get("text", ""))
        if not text:
            continue
        midpoint = (float(line.get("start", 0.0)) + float(line.get("end", line.get("start", 0.0)))) / 2.0
        index = bar_index_at_time(bars, midpoint, duration)
        if index is not None:
            groups[index].append(text)

    for index, bar in enumerate(bars):
        if groups[index]:
            bar["lyrics"] = " / ".join(groups[index])
            bar["lyrics_source"] = "auto"
        elif "lyrics" not in bar:
            bar["lyrics"] = ""


def bar_index_at_time(bars: list[dict[str, Any]], seconds: float, duration: float) -> int | None:
    for index, bar in enumerate(bars):
        start = float(bar.get("start", 0.0) or 0.0)
        end = float(bars[index + 1].get("start", duration) or duration) if index + 1 < len(bars) else duration
        if seconds >= start and seconds < max(start, end):
            return index
    return len(bars) - 1 if bars else None


def lyrics_unavailable(error: str) -> dict[str, Any]:
    log(f"lyrics: unavailable - {error}")
    return {
        "ok": False,
        "engine": "lyrics unavailable",
        "error": error,
        "lines": [],
    }


def clean_lyric_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def clamp_time(value: Any, duration: float) -> float:
    try:
        numeric = float(value)
    except Exception:
        numeric = 0.0
    return round(max(0.0, min(max(0.0, duration), numeric)), 3)


def lyric_confidence(no_speech_prob: Any, avg_logprob: Any) -> float:
    try:
        speech_score = 1.0 - float(no_speech_prob)
    except Exception:
        speech_score = 0.55
    try:
        log_score = (float(avg_logprob) + 1.2) / 1.2
    except Exception:
        log_score = 0.55
    score = (max(0.0, min(1.0, speech_score)) * 0.7) + (max(0.0, min(1.0, log_score)) * 0.3)
    return round(max(0.0, min(0.98, score)), 3)
