from chordpilot_common import *

def cache_root() -> Path:
    root = Path(tempfile.gettempdir()) / "ChordPilot"
    (root / "decoded").mkdir(parents=True, exist_ok=True)
    (root / "analysis").mkdir(parents=True, exist_ok=True)
    (root / "stems").mkdir(parents=True, exist_ok=True)
    (root / "history").mkdir(parents=True, exist_ok=True)
    return root

def file_fingerprint(path: Path) -> dict[str, Any]:
    stat = path.stat()
    return {
        "path": str(path.resolve()),
        "size": stat.st_size,
        "mtime_ns": stat.st_mtime_ns,
        "version": BACKEND_CACHE_VERSION,
    }

def cache_key(path: Path) -> str:
    payload = json.dumps(file_fingerprint(path), sort_keys=True).encode("utf8")
    return hashlib.sha256(payload).hexdigest()

def decoded_wav_cache_path(path: Path, target_sr: int) -> Path:
    return cache_root() / "decoded" / f"{cache_key(path)}-{target_sr}.wav"

def analysis_cache_path(path: Path, mode: str = "fast") -> Path:
    return cache_root() / "analysis" / f"{cache_key(path)}-{mode}.json"

def read_analysis_cache(path: Path, mode: str = "fast") -> dict[str, Any] | None:
    cache_path = analysis_cache_path(path, mode)
    if not cache_path.exists():
        log("cache: analysis miss")
        return None
    try:
        payload = json.loads(cache_path.read_text(encoding="utf8"))
        payload["analysis_engine"]["cache"] = "analysis cache hit"
        log(f"cache: analysis hit {cache_path.name}")
        return payload
    except Exception:
        log("cache: analysis read failed; recomputing")
        return None

def write_analysis_cache(path: Path, payload: dict[str, Any], mode: str = "fast") -> None:
    cache_path = analysis_cache_path(path, mode)
    cache_path.write_text(json.dumps(payload, indent=2), encoding="utf8")
    log(f"cache: wrote analysis {cache_path.name}")

def append_history(payload: dict[str, Any]) -> None:
    history_path = cache_root() / "history" / "analysis-history.jsonl"
    row = {
        "title": payload.get("title"),
        "source_path": payload.get("source_path"),
        "duration": payload.get("duration"),
        "tempo": payload.get("tempo"),
        "key": payload.get("key"),
        "bars": len(payload.get("bars", [])),
        "engine": payload.get("analysis_engine", {}),
    }
    with history_path.open("a", encoding="utf8") as handle:
        handle.write(json.dumps(row) + "\n")
    log("history: appended analysis record")

def stems_cache_dir(path: Path) -> Path:
    target = cache_root() / "stems" / cache_key(path)
    target.mkdir(parents=True, exist_ok=True)
    return target
