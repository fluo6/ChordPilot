from chordpilot_common import *

def root_index_from_symbol(symbol: str) -> int | None:
    clean = (symbol or "").strip().split("/")[0]
    if not clean or clean == "N.C.":
        return None
    if len(clean) >= 2 and clean[1] in {"#", "b"}:
        root = clean[:2]
    else:
        root = clean[:1]
    return PITCH_NAMES.index(root) if root in PITCH_NAMES else None

def normalize_pitch_name(note: str) -> str:
    clean = str(note or "").strip()
    if not clean:
        return ""
    root = clean[:2] if len(clean) >= 2 and clean[1] in {"#", "b"} else clean[:1]
    normalized = root[:1].upper() + root[1:]
    return ENHARMONIC_TO_PITCH.get(normalized.upper(), normalized)

def pitch_index_from_name(note: str) -> int | None:
    normalized = normalize_pitch_name(note)
    return PITCH_NAMES.index(normalized) if normalized in PITCH_NAMES else None

def parse_candidate_symbol(symbol: str) -> dict[str, Any] | None:
    clean = str(symbol or "").strip().replace(" ", "")
    if not clean or clean.upper() in {"N.C.", "NC"}:
        return None
    base, slash = (clean.split("/", 1) + [""])[:2] if "/" in clean else (clean, "")
    root_text = base[:2] if len(base) >= 2 and base[1] in {"#", "b"} else base[:1]
    root = pitch_index_from_name(root_text)
    if root is None:
        return None
    suffix = base[len(root_text):]
    quality = normalize_quality_suffix(suffix)
    if quality not in CHORD_QUALITIES:
        return None
    bass = pitch_index_from_name(slash) if slash else None
    if slash and bass is None:
        return None
    return {
        "symbol": f"{PITCH_NAMES[root]}{quality}" + (f"/{PITCH_NAMES[bass]}" if bass is not None else ""),
        "root": root,
        "quality": quality,
        "bass": bass,
    }

def normalize_quality_suffix(value: str) -> str:
    suffix = str(value or "").strip()
    lower = suffix.lower().replace("minor", "m").replace("major", "maj")
    lower = lower.replace("min", "m").replace("-", "m").replace("Δ", "maj")
    lower = lower.replace("ø", "m7b5")
    if lower in {"", "maj", "major"}:
        return ""
    if lower in {"m", "mi"}:
        return "m"
    if lower in {"dom7", "dominant7"}:
        return "7"
    if lower in {"maj7", "ma7", "mmaj7"}:
        return "maj7"
    if lower in {"m7", "min7"}:
        return "m7"
    if lower in {"dim", "o"}:
        return "dim"
    if lower in {"aug", "+"}:
        return "aug"
    if lower in {"sus", "sus4"}:
        return "sus4"
    if lower in {"sus2"}:
        return "sus2"
    if lower in {"6", "m6", "m7b5"}:
        return lower
    if "m7b5" in lower or "half" in lower:
        return "m7b5"
    if "maj7" in lower:
        return "maj7"
    if lower.startswith("m") and "7" in lower:
        return "m7"
    if lower.startswith("m"):
        return "m"
    if "7" in lower:
        return "7"
    return lower

def chord_tones_for_candidate(candidate: dict[str, Any]) -> set[int]:
    quality = CHORD_QUALITIES.get(candidate.get("quality", ""), CHORD_QUALITIES[""])
    root = int(candidate["root"])
    return {(root + int(interval)) % 12 for interval in quality["intervals"]}

def chord_symbol_for(root: int, quality: str, bass: int | None = None) -> str:
    symbol = f"{PITCH_NAMES[root]}{quality}"
    if bass is not None and bass != root:
        symbol = f"{symbol}/{PITCH_NAMES[bass]}"
    return symbol

def detected_pitch_confidence(chroma: Any, np: Any) -> float:
    total = float(chroma.sum())
    if total <= 0:
        return 0.0
    normalized = chroma / total
    ordered = np.sort(normalized)[::-1]
    top_sum = float(ordered[:4].sum()) if len(ordered) else 0.0
    margin = float(ordered[0] - ordered[3]) if len(ordered) > 3 else float(ordered[0]) if len(ordered) else 0.0
    confidence = (top_sum * 0.68) + (margin * 1.25)
    return round(max(0.0, min(0.98, confidence)), 3)

def key_pitch_classes(key: str) -> set[int]:
    clean = str(key or "C").strip()
    root_text = clean[:2] if len(clean) >= 2 and clean[1] in {"#", "b"} else clean[:1]
    root = pitch_index_from_name(root_text) or 0
    intervals = MINOR_SCALE_INTERVALS if clean.lower().endswith("m") else MAJOR_SCALE_INTERVALS
    return {(root + interval) % 12 for interval in intervals}

def active_pitch_classes(chroma: Any, np: Any, threshold: float = 0.045) -> list[int]:
    if float(chroma.sum()) <= 0:
        return []
    normalized = chroma / (float(chroma.sum()) or 1.0)
    top = float(normalized.max()) if len(normalized) else 0.0
    floor = min(0.09, max(threshold, top * 0.28))
    return [int(index) for index in np.argsort(normalized)[::-1] if float(normalized[int(index)]) >= floor][:7]

def local_candidate_symbols(chroma: Any, np: Any, include_complex: bool = True) -> set[str]:
    qualities = list(CHORD_QUALITIES.keys()) if include_complex else ["", "m", "7", "maj7", "m7"]
    symbols: set[str] = set()
    active = set(active_pitch_classes(chroma, np))
    for root in range(12):
        for quality in qualities:
            info = CHORD_QUALITIES[quality]
            tones = {(root + int(interval)) % 12 for interval in info["intervals"]}
            if not active or active.intersection(tones):
                symbols.add(chord_symbol_for(root, quality))
    return symbols

def library_candidate_symbols(chroma: Any, np: Any) -> tuple[set[str], list[str]]:
    active = active_pitch_classes(chroma, np)
    if not active:
        return set(), []
    notes = [PITCH_NAMES[index] for index in active]
    symbols: set[str] = set()
    libraries: list[str] = []

    try:
        analyzer = __import__("pychord.analyzer", fromlist=["find_chords_from_notes"])
        found = analyzer.find_chords_from_notes(notes)
        libraries.append("pychord")
        for item in found or []:
            symbols.add(str(item))
    except Exception:
        pass

    try:
        music21_chord = __import__("music21.chord", fromlist=["Chord"])
        music21_harmony = __import__("music21.harmony", fromlist=["chordSymbolFigureFromChord"])
        chord = music21_chord.Chord(notes)
        figure = music21_harmony.chordSymbolFigureFromChord(chord)
        libraries.append("music21")
        if figure:
            symbols.add(str(figure))
    except Exception:
        pass

    return symbols, libraries

def generate_chord_candidates(chroma: Any, bass_reference: dict[str, Any] | None, np: Any, options: dict[str, Any]) -> tuple[list[dict[str, Any]], list[str]]:
    simplify = bool(options.get("simplify_chords", True))
    symbols = local_candidate_symbols(chroma, np, include_complex=not simplify)
    library_symbols, libraries = library_candidate_symbols(chroma, np)
    symbols.update(library_symbols)

    parsed: dict[str, dict[str, Any]] = {}
    for symbol in symbols:
        candidate = parse_candidate_symbol(symbol)
        if candidate:
            parsed[candidate["symbol"]] = candidate

    bass_pc = bass_reference.get("pitch_class") if bass_reference else None
    bass_confidence = float(bass_reference.get("confidence", 0.0)) if bass_reference else 0.0
    if bass_pc is not None and bass_confidence >= 0.62:
        for candidate in list(parsed.values()):
            if candidate["root"] != bass_pc and bass_pc in chord_tones_for_candidate(candidate):
                slash = dict(candidate)
                slash["bass"] = int(bass_pc)
                slash["symbol"] = chord_symbol_for(int(candidate["root"]), str(candidate["quality"]), int(bass_pc))
                parsed[slash["symbol"]] = slash

    return list(parsed.values()), libraries

def chord_root_distance_bonus(root: int, other_symbol: str | None) -> float:
    other = root_index_from_symbol(str(other_symbol or ""))
    if other is None:
        return 0.0
    distance = min((root - other) % 12, (other - root) % 12)
    if distance == 0:
        return 0.18
    if distance in {5, 7}:
        return 0.12
    if distance in {1, 2}:
        return 0.05
    return -0.03 if distance == 6 else 0.0

def score_chord_candidate(
    candidate: dict[str, Any],
    chroma: Any,
    key: str,
    previous_symbol: str | None,
    next_symbol: str | None,
    bass_reference: dict[str, Any] | None,
    np: Any,
    options: dict[str, Any],
) -> dict[str, Any]:
    normalized = chroma / (float(chroma.sum()) or 1.0)
    tones = chord_tones_for_candidate(candidate)
    root = int(candidate["root"])
    quality = CHORD_QUALITIES.get(str(candidate["quality"]), CHORD_QUALITIES[""])
    essential = [root]
    if quality.get("third") is not None:
        essential.append((root + int(quality["third"])) % 12)
    if quality.get("fifth") is not None:
        essential.append((root + int(quality["fifth"])) % 12)

    coverage = float(sum(float(normalized[pc]) for pc in tones))
    essential_strength = float(sum(float(normalized[pc]) for pc in essential))
    active = active_pitch_classes(chroma, np, threshold=0.055)
    unexplained = float(sum(float(normalized[pc]) for pc in active if pc not in tones))
    key_pcs = key_pitch_classes(key)
    key_fit = (sum(1 for pc in tones if pc in key_pcs) / max(1, len(tones)))

    score = 0.0
    reasons: list[str] = []
    score += coverage * 3.2
    reasons.append(f"covers {round(coverage * 100)}% of detected pitch energy")
    score += essential_strength * 1.55

    for pc in essential:
        strength = float(normalized[pc])
        if strength >= 0.045:
            score += 0.12
        else:
            score -= 0.33
            reasons.append(f"missing weak {PITCH_NAMES[pc]} essential tone")

    if key_fit >= 0.75:
        score += 0.22
        reasons.append(f"fits key {key}")
    else:
        score -= 0.12

    continuity = chord_root_distance_bonus(root, previous_symbol) + chord_root_distance_bonus(root, next_symbol)
    score += continuity
    if continuity > 0.05:
        reasons.append("continues smoothly from neighboring chords")

    if unexplained > 0:
        penalty = unexplained * 1.85
        score -= penalty
        if unexplained >= 0.1:
            reasons.append(f"penalizes unexplained strong notes ({round(unexplained * 100)}%)")

    complexity = float(quality.get("complexity", 0.25))
    if bool(options.get("simplify_chords", True)):
        score -= complexity * 1.25
        if complexity > 0.2:
            reasons.append("simplify mode prefers triads and sevenths")
    else:
        score -= complexity * 0.45

    bass_pc = bass_reference.get("pitch_class") if bass_reference else None
    bass_confidence = float(bass_reference.get("confidence", 0.0)) if bass_reference else 0.0
    slash = candidate.get("bass")
    if bass_pc is not None and bass_confidence > 0:
        if bass_pc == root:
            score += 0.32 * bass_confidence
            reasons.append("bass agrees with root")
        elif slash == bass_pc and bass_confidence >= 0.62:
            score += 0.26 * bass_confidence
            reasons.append("slash bass accepted from high-confidence bass stem")
        elif slash is not None:
            score -= 0.65
            reasons.append("slash chord rejected: bass evidence is weak or mismatched")
        else:
            score -= 0.12 * bass_confidence
    elif slash is not None:
        score -= 0.7
        reasons.append("slash chord suppressed without clear bass evidence")

    score = round(float(score), 4)
    return {
        "chord": candidate["symbol"],
        "raw_score": score,
        "score": 0.0,
        "reasons": reasons[:5],
    }

def rank_chord_candidates(
    chroma: Any,
    key: str,
    previous_symbol: str | None,
    next_symbol: str | None,
    bass_reference: dict[str, Any] | None,
    np: Any,
    options: dict[str, Any],
) -> tuple[list[dict[str, Any]], list[str]]:
    if float(chroma.sum()) <= 0:
        return ([{"chord": "N.C.", "raw_score": 0.0, "score": 0.0, "reasons": ["no strong pitched notes"]}], [])
    candidates, libraries = generate_chord_candidates(chroma, bass_reference, np, options)
    scored = [
        score_chord_candidate(candidate, chroma, key, previous_symbol, next_symbol, bass_reference, np, options)
        for candidate in candidates
    ]
    if not scored:
        chord, confidence = estimate_chord(chroma, np)
        return ([{"chord": chord, "raw_score": confidence, "score": confidence, "reasons": ["fallback template estimate"]}], libraries)

    scored.sort(key=lambda item: item["raw_score"], reverse=True)
    best = float(scored[0]["raw_score"])
    worst = float(scored[min(len(scored) - 1, 8)]["raw_score"]) if len(scored) > 1 else best - 1.0
    spread = max(0.65, best - worst)
    for item in scored:
        relative = (float(item["raw_score"]) - worst) / spread
        item["score"] = round(max(0.02, min(0.98, relative * 0.88 + 0.08)), 3)
    return scored, libraries

def normalize_bars_chords(bars: list[dict[str, Any]], key: str, np: Any, options: dict[str, Any], chord_source: str, bass_source: str | None = None) -> None:
    provisional: list[str] = []
    per_bar_libraries: list[list[str]] = []
    for bar in bars:
        ranked, libraries = rank_chord_candidates(bar["_chroma"], key, None, None, bar.get("bass_reference"), np, options)
        provisional.append(ranked[0]["chord"])
        per_bar_libraries.append(libraries)

    limit = int(options.get("chord_alternatives", 6))
    for index, bar in enumerate(bars):
        previous_symbol = provisional[index - 1] if index > 0 else None
        next_symbol = provisional[index + 1] if index + 1 < len(provisional) else None
        ranked, libraries = rank_chord_candidates(
            bar["_chroma"],
            key,
            previous_symbol,
            next_symbol,
            bar.get("bass_reference"),
            np,
            options,
        )
        libraries = sorted(set(libraries + per_bar_libraries[index]))
        best = ranked[0]
        pitch_confidence = detected_pitch_confidence(bar["_chroma"], np)
        chord_confidence = round(max(0.0, min(0.98, float(best["score"]) * 0.72 + pitch_confidence * 0.28)), 3)
        alternatives = [
            {
                "chord": item["chord"],
                "score": item["score"],
                "raw_score": item["raw_score"],
                "reasons": item.get("reasons", []),
            }
            for item in ranked[:limit]
        ]
        bar["chord"] = best["chord"]
        bar["confidence"] = chord_confidence
        bar["chord_confidence"] = chord_confidence
        bar["pitch_confidence"] = pitch_confidence
        bar["alternatives"] = alternatives
        bar["debug"] = {
            "chord_tones_source": chord_source,
            "bass_reference_source": bass_source or "none",
            "detected_notes": bar.get("evidence", {}).get("detected_notes", []),
            "pitch_confidence": pitch_confidence,
            "chosen_chord": best["chord"],
            "chosen_score": best["score"],
            "alternatives": alternatives,
            "bass_reference": bar.get("bass_reference"),
            "library_candidates": libraries or ["internal templates"],
            "selection_reasons": best.get("reasons", []),
        }

def chord_alternatives(chroma: Any, np: Any, limit: int = 6) -> list[dict[str, Any]]:
    if float(chroma.sum()) <= 0:
        return []
    templates = [("major", np.asarray(MAJOR_TEMPLATE)), ("minor", np.asarray(MINOR_TEMPLATE))]
    norm_chroma = chroma / (np.linalg.norm(chroma) or 1.0)
    scored = []
    for root in range(12):
        for quality, template in templates:
            rolled = np.roll(template, root)
            rolled = rolled / (np.linalg.norm(rolled) or 1.0)
            suffix = "" if quality == "major" else "m"
            scored.append({
                "chord": f"{PITCH_NAMES[root]}{suffix}",
                "score": round(float(np.dot(norm_chroma, rolled)), 3),
            })
    return sorted(scored, key=lambda item: item["score"], reverse=True)[:limit]

def chord_evidence(chroma: Any, start: float, end: float, source: str, np: Any) -> dict[str, Any]:
    total = float(chroma.sum())
    if total <= 0:
        return {
            "source": source,
            "range": [round(float(start), 3), round(float(end), 3)],
            "detected_notes": [],
            "summary": "No strong pitched notes detected in this bar.",
        }

    normalized = chroma / total
    order = np.argsort(normalized)[::-1][:6]
    notes = [
        {
            "note": PITCH_NAMES[int(index)],
            "strength": round(float(normalized[int(index)]), 3),
        }
        for index in order
        if float(normalized[int(index)]) > 0.02
    ]
    note_names = ", ".join(item["note"] for item in notes[:4]) if notes else "none"
    return {
        "source": source,
        "range": [round(float(start), 3), round(float(end), 3)],
        "detected_notes": notes,
        "summary": f"Strongest pitch classes in this range: {note_names}.",
    }

def chroma_for_segment(audio: Any, sr: int, start: float, end: float, np: Any, options: dict[str, Any] | None = None) -> Any:
    options = options or dict(DEFAULT_ANALYSIS_OPTIONS)
    start_sample = max(0, int(start * sr))
    end_sample = min(len(audio), max(start_sample + 2048, int(end * sr)))
    segment = audio[start_sample:end_sample]
    frame = 4096
    hop = 2048
    chroma = np.zeros(12, dtype=np.float64)

    if len(segment) < frame:
        padded = np.zeros(frame, dtype=np.float32)
        padded[:len(segment)] = segment
        segment = padded

    window = np.hanning(frame)
    freqs = np.fft.rfftfreq(frame, 1.0 / sr)
    valid = (freqs >= float(options.get("chroma_low_hz", 65.0))) & (freqs <= float(options.get("chroma_high_hz", 1800.0)))
    pitch_classes = np.round(12 * np.log2(freqs[valid] / 440.0) + 69).astype(int) % 12

    for offset in range(0, max(1, len(segment) - frame + 1), hop):
        chunk = segment[offset:offset + frame]
        if len(chunk) < frame:
            break
        spectrum = np.abs(np.fft.rfft(chunk * window))[valid]
        for pc in range(12):
            chroma[pc] += float(spectrum[pitch_classes == pc].sum())

    if chroma.sum() > 0:
        chroma = chroma / chroma.sum()
    return chroma

def estimate_chord(chroma: Any, np: Any) -> tuple[str, float]:
    if float(chroma.sum()) <= 0:
        return "N.C.", 0.0

    best_name = "N.C."
    best_score = -1.0
    second_score = -1.0
    templates = [("major", np.asarray(MAJOR_TEMPLATE)), ("minor", np.asarray(MINOR_TEMPLATE))]
    norm_chroma = chroma / (np.linalg.norm(chroma) or 1.0)

    for root in range(12):
        for quality, template in templates:
            rolled = np.roll(template, root)
            rolled = rolled / (np.linalg.norm(rolled) or 1.0)
            score = float(np.dot(norm_chroma, rolled))
            if score > best_score:
                second_score = best_score
                best_score = score
                suffix = "" if quality == "major" else "m"
                best_name = f"{PITCH_NAMES[root]}{suffix}"
            elif score > second_score:
                second_score = score

    confidence = max(0.0, min(0.95, best_score - max(second_score, 0.0) + 0.35))
    if confidence < 0.18:
        return "N.C.", confidence
    return best_name, confidence

def estimate_key_from_chroma(chroma: Any, np: Any) -> str:
    chord, _confidence = estimate_chord(chroma, np)
    return chord if chord != "N.C." else "C"

def estimate_key_with_essentia(path: Path) -> str | None:
    essentia = try_import("essentia")
    if not essentia:
        return None

    try:
        standard = __import__("essentia.standard", fromlist=["MonoLoader", "KeyExtractor"])
        audio = standard.MonoLoader(filename=str(path))()
        key, scale, _strength = standard.KeyExtractor()(audio)
        suffix = "" if scale.lower() == "major" else "m"
        return f"{key}{suffix}"
    except Exception:
        return None
