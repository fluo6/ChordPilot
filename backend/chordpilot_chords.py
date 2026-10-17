from __future__ import annotations

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
    slash_match = re.search(r"/([A-Ga-g][#b]?)$", clean)
    base, slash = (clean[:slash_match.start()], slash_match[1]) if slash_match else (clean, "")
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
    suffix = str(value or "").strip().replace("♯", "#").replace("♭", "b").replace("Δ", "maj")
    suffix = re.sub(r"\(([#b+]\d+)\)$", r"\1", suffix)
    suffix = suffix.replace("+5", "#5")
    suffix = suffix.replace("m(maj7)", "mmaj7").replace("mM7", "mmaj7")
    suffix = suffix.replace("m(maj9)", "mmaj9").replace("mM9", "mmaj9")
    suffix = re.sub(r"^([79])\(sus4\)$", r"\1sus4", suffix, flags=re.IGNORECASE)
    if re.match(r"^M(?:7|9|13)(?:[#b]|$)", suffix):
        return "maj" + suffix[1:]
    lower = suffix.lower().replace("minor", "m").replace("major", "maj")
    lower = lower.replace("min", "m").replace("-", "m").replace("Δ", "maj")
    lower = lower.replace("ø", "m7b5")
    lower = lower.replace("°", "dim")
    lower = {"69":"6/9", "6add9":"6/9", "m69":"m6/9", "m6add9":"m6/9", "o7":"dim7"}.get(lower, lower)
    if lower in CHORD_QUALITIES:
        return lower
    if "#" in lower or "/" in lower or re.search(r"b\d", lower):
        return lower  # Unsupported alterations must not silently become plain sevenths.
    if lower in {"", "maj", "major"}:
        return ""
    if lower in {"m", "mi"}:
        return "m"
    if lower in {"dom7", "dominant7"}:
        return "7"
    if lower in {"maj7", "ma7"}:
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
    if re.match(r"^m(?:$|\d|add|[#b(])", lower):
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
    symbols = local_candidate_symbols(chroma, np)
    library_symbols, libraries = library_candidate_symbols(chroma, np)
    symbols.update(library_symbols)

    parsed: dict[str, dict[str, Any]] = {}
    measured = chroma / (float(chroma.sum()) or 1.0)
    # The second vocabulary batch has large pitch sets. In diffuse mixtures,
    # those sets can cover unrelated notes and displace a clear simpler chord.
    # Keep manual parsing/export available, but propose one automatically only
    # when every defining pitch class is prominent in accompaniment evidence.
    strict_extensions = {'9#11', '13#11', '13b9', 'mmaj9', '7b9#11', '7#9#11'}
    for symbol in symbols:
        candidate = parse_candidate_symbol(symbol)
        if candidate:
            if candidate['quality'] in strict_extensions and any(
                float(measured[pc]) < .1 for pc in chord_tones_for_candidate(candidate)
            ):
                continue
            # PyChord's thirdless 11 formula is the same pitch set as 9sus4.
            # Use one name so identical voicings do not create false changes.
            if candidate["quality"] == "11":
                candidate["quality"] = "9sus4"
                candidate["symbol"] = chord_symbol_for(candidate["root"], "9sus4", candidate["bass"])
            parsed[candidate["symbol"]] = candidate

    bass_pc = bass_reference.get("pitch_class") if bass_reference else None
    bass_confidence = float(bass_reference.get("confidence", 0.0)) if bass_reference else 0.0
    if bass_pc is not None and bass_confidence >= 0.62:
        normalized = chroma / (float(chroma.sum()) or 1.0)
        for candidate in list(parsed.values()):
            tones = chord_tones_for_candidate(candidate)
            supported_upper_triad = (candidate["quality"] in {"", "m"}
                and all(float(normalized[pc]) >= .06 for pc in tones))
            if candidate["root"] != bass_pc and (bass_pc in tones or supported_upper_triad):
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

def blended_scoring_chroma(chroma: Any, bass_reference: dict[str, Any] | None, np: Any) -> tuple[Any, float]:
    """Pitch-class input shared by every candidate; separate from candidate-specific score terms."""
    normalized = chroma / (float(chroma.sum()) or 1.0)
    bass_pc = bass_reference.get("pitch_class") if bass_reference else None
    bass_confidence = float(bass_reference.get("confidence", 0.0)) if bass_reference else 0.0
    bass_weight = 0.3 * min(1.0, bass_confidence) if bass_pc is not None and bass_confidence >= 0.62 else 0.0
    if bass_weight:
        normalized = normalized * (1 - bass_weight)
        normalized[int(bass_pc)] += bass_weight
    return normalized, bass_weight


def scored_pitch_class_evidence(chroma: Any, bass_reference: dict[str, Any] | None, np: Any) -> dict[str, Any]:
    measured = chroma / (float(chroma.sum()) or 1.0)
    scored, bass_weight = blended_scoring_chroma(chroma, bass_reference, np)
    return {
        'scoring_pitch_classes': [
            {'note': name, 'accompaniment': round(float(measured[index]), 5), 'scored': round(float(scored[index]), 5)}
            for index, name in enumerate(PITCH_NAMES)
        ],
        'scoring_bass_weight': round(bass_weight, 5),
    }


def candidate_scoring_chroma(
    chroma: Any,
    candidate: dict[str, Any],
    bass_reference: dict[str, Any] | None,
    np: Any,
) -> tuple[Any, set[int]]:
    normalized, bass_weight = blended_scoring_chroma(chroma, bass_reference, np)
    tones = chord_tones_for_candidate(candidate)
    bass_pc = bass_reference.get("pitch_class") if bass_reference else None
    if bass_weight:
        if candidate.get("bass") == bass_pc:
            tones.add(int(bass_pc))
    return normalized, tones

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
    measured = chroma / (float(chroma.sum()) or 1.0)
    normalized, tones = candidate_scoring_chroma(chroma, candidate, bass_reference, np)
    bass_pc = bass_reference.get("pitch_class") if bass_reference else None
    bass_confidence = float(bass_reference.get("confidence", 0.0)) if bass_reference else 0.0
    root = int(candidate["root"])
    quality = CHORD_QUALITIES.get(str(candidate["quality"]), CHORD_QUALITIES[""])
    voiced_thirteenth = candidate['quality'] in {'13', '13#11', '13b9'} and all(
        float(measured[(root + interval) % 12]) >= .06 for interval in (4, 10, 9))
    # Sixth/ninth voicings can omit the fifth; every defining tone must be
    # measured in the accompaniment, rather than supplied by the bass blend.
    voiced_six_nine = candidate['quality'] in {'6/9', 'm6/9'} and float(normalized[(root + 7) % 12]) < .045 and all(
        float(measured[(root + interval) % 12]) >= .06
        for interval in (0, quality['third'], 9, 14))
    essential = [root]
    if quality.get("third") is not None:
        essential.append((root + int(quality["third"])) % 12)
    if quality.get("suspension") is not None:
        essential.append((root + int(quality["suspension"])) % 12)
        # Prefer the suspended dominant function over an upper-triad slash
        # only when the independent bass confirms its root.
        if bass_pc == root and bass_confidence >= 0.62:
            essential.extend((root + interval) % 12 for interval in quality["intervals"] if interval in {10, 14})
    if voiced_thirteenth:
        essential.extend((root + interval) % 12 for interval in (10, 9))
        if candidate['quality'] in {'13#11', '13b9'}:
            essential.append((root + (18 if candidate['quality'] == '13#11' else 13)) % 12)
    voiced_guide = None
    # Measured third/seventh shells can omit the perfect fifth. Use the same
    # fifth strength as the essential-tone penalty to avoid a threshold gap.
    if quality.get('third') is not None and quality.get('fifth') == 7 and not voiced_thirteenth:
        guide = 10 if 10 in quality['intervals'] else 11 if 11 in quality['intervals'] else None
        if guide is not None and float(normalized[(root + 7) % 12]) < .045 and all(
            float(measured[(root + interval) % 12]) >= .06 for interval in (quality['third'], guide)):
            voiced_guide = guide
            essential.append((root + guide) % 12)
    if quality.get("fifth") is not None and not quality.get("optional_fifth") and not voiced_thirteenth and not voiced_six_nine and voiced_guide is None:
        essential.append((root + int(quality["fifth"])) % 12)

    coverage = float(sum(float(normalized[pc]) for pc in tones))
    essential_strength = float(sum(float(normalized[pc]) for pc in essential))
    active_threshold = 0.055
    active = active_pitch_classes(normalized, np, threshold=active_threshold)
    unexplained = float(sum(float(normalized[pc]) for pc in active if pc not in tones))
    key_pcs = key_pitch_classes(key)
    key_fit = (sum(1 for pc in tones if pc in key_pcs) / max(1, len(tones)))

    score = 0.0
    reasons: list[str] = []
    score += coverage * 3.2
    reasons.append(f"covers {round(coverage * 100)}% of {'combined bass/accompaniment evidence' if bass_pc is not None and bass_confidence >= 0.62 else 'detected pitch energy'}")
    score += essential_strength * 1.55

    for pc in essential:
        strength = float(normalized[pc])
        # A proposed root should be an active note, not just diffuse coverage
        # that a larger relative chord happens to include. Low-note guidance is
        # already included in normalized evidence for every candidate.
        if strength >= (active_threshold if pc == root else 0.045):
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

    if quality.get('suspension') is not None:
        third = max(float(normalized[(root + 3) % 12]), float(normalized[(root + 4) % 12]))
        suspension = float(normalized[(root + quality['suspension']) % 12])
        if third >= .06 and suspension < .045:
            score -= .75
            reasons.append('clear third conflicts with unsupported suspension')

    complexity = float(quality.get("complexity", 0.25))
    score -= complexity * 0.45
    # Extensions need their own evidence, rather than absorbing spectral noise.
    for interval in quality["intervals"]:
        if interval == 14 and voiced_thirteenth:
            continue  # Jazz 13th voicings can omit the ninth; third, seventh and 13th must be measured.
        if interval in {9, 10, 11} or interval >= 12:
            pc = (root + interval) % 12
            # Added extensions need active measured support or confirmed
            # low-note guidance. Keep the existing combined-evidence gate so
            # blending cannot promote previously unsupported tones.
            unsupported_added_tone = interval >= 12 and float(measured[pc]) < active_threshold and not (
                bass_pc == pc and bass_confidence >= 0.62)
            if float(normalized[pc]) < 0.045 or unsupported_added_tone:
                score -= 0.35
                reasons.append(f"weak {PITCH_NAMES[pc]} extension")

    slash = candidate.get("bass")
    if bass_pc is not None and bass_confidence > 0:
        if slash is not None and (slash != bass_pc or bass_confidence < .62):
            score -= 0.65
            reasons.append("slash chord rejected: bass evidence is weak or mismatched")
        elif slash == bass_pc and bass_confidence >= 0.62:
            score += 0.26 * bass_confidence
            reasons.append("slash bass accepted from high-confidence bass stem")
        elif bass_pc == root:
            score += 0.32 * bass_confidence
            reasons.append("bass agrees with root")
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

def half_diminished_hint(chroma: Any, evidence: dict[str, Any], reference: dict[str, Any] | None,
                         np: Any, options: dict[str, Any]) -> dict[str, Any] | None:
    """Corroborate a registered diminished shell against a root harmonic family.

    This is deliberately narrower than inferring a chord from chroma: require
    all four voices and octave-confirmed root/minor third. A lower major third
    needs additional lower-root, level and frequency corroboration.
    """
    strength = float(options.get('overtone_weighting', .5))
    if strength <= 0 or float(chroma.sum()) <= 0:
        return None
    spectrum = evidence.get('overtone_weighted_spectrum', evidence.get('tail_reduced_spectrum', evidence.get('spectrum', {})))
    peaks = [p for p in spectrum.get('peaks', []) if p['level_db'] >= -24 and
        abs(1200 * math.log2(p['frequency_hz'] / (440 * 2 ** ((p['midi'] - 69) / 12)))) <= 30]
    by_midi = {}
    for peak in peaks:
        if peak['midi'] not in by_midi or peak['level_db'] > by_midi[peak['midi']]['level_db']:
            by_midi[peak['midi']] = peak
    measured = chroma / float(chroma.sum())
    for midi, fundamental in sorted(by_midi.items()):
        root = midi % 12
        if float(measured[root]) < .08 or any(float(measured[(root + n) % 12]) < floor
                for n, floor in ((3, .045), (6, .055), (10, .055))):
            continue
        if (reference or {}).get('confidence', 0) >= .62 and reference.get('pitch_class') != root:
            continue
        voices = [midi + n for n in (0, 3, 6, 10, 12, 15)]
        if any(voice not in by_midi for voice in voices):
            continue
        if any(abs(1200 * math.log2(by_midi[midi + n + 12]['frequency_hz'] /
                (2 * by_midi[midi + n]['frequency_hz']))) > 20 for n in (0, 3)):
            continue
        major = [p for p in peaks if p['midi'] % 12 == (root + 4) % 12]
        lower_major = [p for p in major if p['midi'] <= midi + 10]
        strong_major = [p for p in major if p['level_db'] >= -14]
        if lower_major:
            lower_root = by_midi.get(midi - 12)
            sub_root = by_midi.get(midi - 24)
            if not lower_root or not sub_root or any(abs(1200 * math.log2(upper['frequency_hz'] /
                    (2 * lower['frequency_hz']))) > 20 for lower, upper in ((sub_root, lower_root), (lower_root, fundamental))):
                continue
            # A fifth partial of a measured root two octaves below may sit
            # inside the voicing. Require a stronger minor third as well.
            if any(p['midi'] != midi + 4 or p['level_db'] > by_midi[midi + 3]['level_db'] - 3 or
                    abs(1200 * math.log2(p['frequency_hz'] / (5 * sub_root['frequency_hz']))) > 8 for p in lower_major):
                continue
            strong_major = [p for p in major if p['level_db'] >= -14 or p in lower_major]
        if not strong_major:
            continue
        # A fifth harmonic is ~14 cents below an equal-tempered major third.
        # Tight frequency agreement is corroboration, never proof of a partial.
        def root_partial(peak):
            ratio = peak['frequency_hz'] / fundamental['frequency_hz']
            if min(abs(1200 * math.log2(ratio / target)) for target in (1.25, 2.5, 5)) <= 8:
                return True
            # Measured octave partners can corroborate slightly stretched
            # higher partials without widening every root-ratio tolerance.
            return bool(lower_major and any(peak['midi'] > lower['midi'] and
                (peak['midi'] - lower['midi']) % 12 == 0 and
                abs(1200 * math.log2(peak['frequency_hz'] / (lower['frequency_hz'] *
                    2 ** ((peak['midi'] - lower['midi']) / 12)))) <= 8 for lower in lower_major))
        if not all(root_partial(p) for p in strong_major):
            continue
        outside = [p for p in peaks if midi <= p['midi'] <= midi + 10 and
            (p['midi'] - midi) % 12 not in {0, 3, 6, 10} and p['level_db'] >= -14 and p not in lower_major]
        if any(abs(1200 * math.log2(p['frequency_hz'] / (1.5 * fundamental['frequency_hz']))) > 8 for p in outside):
            continue
        # ponytail: bounded corroboration credit, not a trained note-probability model.
        return {'chord': chord_symbol_for(root, 'm7b5'), 'bonus': min(.65, 1.3 * strength),
            'voices': voices, 'harmonic_major_midis': [p['midi'] for p in strong_major],
            **({'lower_root_midi': midi - 12, 'fundamental_midi': midi - 24} if lower_major else {})}
    return None


def fading_chord_hint(chroma: Any, evidence: dict[str, Any], reference: dict[str, Any] | None,
                      early: dict[str, Any], ranked: list[dict[str, Any]], key: str,
                      np: Any, options: dict[str, Any]) -> dict[str, Any] | None:
    """Retain an evidenced early harmony when only its measured root is fading."""
    if (reference or {}).get('confidence', 0) >= .62 or not ranked or ranked[0]['chord'] == 'N.C.':
        return None
    initial, _ = rank_chord_candidates(np.asarray(early['chroma']), key, None, None,
        early.get('bass_reference'), np, options)
    if len(initial) < 2 or initial[0]['raw_score'] - initial[1]['raw_score'] < .12:
        return None
    symbol = initial[0]['chord']
    candidate = parse_candidate_symbol(symbol)
    target = next((item for item in ranked if item['chord'] == symbol), None)
    if not candidate or candidate['bass'] is not None or not target or symbol == ranked[0]['chord']:
        return None
    if ranked[0]['raw_score'] - target['raw_score'] > .45:
        return None
    quality = CHORD_QUALITIES[candidate['quality']]
    if quality['third'] is None:
        return None
    root = candidate['root']
    measured = chroma / (float(chroma.sum()) or 1)
    guides = [quality['third']] + [interval for interval in quality['intervals'] if interval in {9, 10, 11}]
    if candidate['quality'] in {'6/9', 'm6/9'}:
        guides.append(14)
    if any(float(measured[(root + interval) % 12]) < .06 for interval in guides):
        return None
    # A changing third can be audible in chroma yet too faint for the retained
    # MIDI list. Do not let a fading root preserve the earlier chord quality.
    if quality['third'] in {3, 4}:
        opposite = (root + 7 - quality['third']) % 12
        if opposite not in chord_tones_for_candidate(candidate) and float(measured[opposite]) >= .06:
            return None
    pitches = evidence.get('detected_pitches', [])
    strong = {pitch['midi'] % 12 for pitch in pitches if pitch['strength'] >= .06}
    if not strong or not strong.issubset(chord_tones_for_candidate(candidate)):
        return None
    for attack in early['evidence'].get('detected_pitches', []):
        if attack['midi'] % 12 != root or attack['strength'] < .08:
            continue
        retained = next((pitch for pitch in pitches if pitch['midi'] == attack['midi'] and pitch['strength'] >= .02), None)
        decay = early['root_decay'].get(str(attack['midi']), 1)
        expected_hz = 440 * 2 ** ((attack['midi'] - 69) / 12)
        if retained and any(abs(1200 * math.log2(pitch['frequency_hz'] / expected_hz)) > 30 for pitch in (attack, retained)):
            continue
        if retained and attack['strength'] >= retained['strength'] * 1.5 and 0 <= decay < .75:
            return {'chord': symbol, 'midi': attack['midi'], 'root_power_ratio': round(decay, 4),
                'early_range': early['evidence']['range'], 'bonus': .45}
    return None


def rank_chord_candidates(
    chroma: Any,
    key: str,
    previous_symbol: str | None,
    next_symbol: str | None,
    bass_reference: dict[str, Any] | None,
    np: Any,
    options: dict[str, Any],
    fading_hint: dict[str, Any] | None = None,
    registered_hint: dict[str, Any] | None = None,
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

    if registered_hint:
        target = next((item for item in scored if item['chord'] == registered_hint['chord']), None)
        if target:
            harmonic_pcs = {m % 12 for m in registered_hint.get('harmonic_major_midis', [])}
            if harmonic_pcs:
                target_candidate = parse_candidate_symbol(target['chord'])
                if target_candidate:
                    norm, tones = candidate_scoring_chroma(
                        chroma, target_candidate, bass_reference, np
                    )
                    active_threshold = 0.055
                    active = active_pitch_classes(norm, np, threshold=active_threshold)
                    harmonic_unexplained = sum(float(norm[pc]) for pc in active if pc in harmonic_pcs and pc not in tones)
                    if harmonic_unexplained > 0:
                        target['raw_score'] = round(target['raw_score'] + harmonic_unexplained * 1.85, 4)
                        unexplained_remaining = sum(float(norm[pc]) for pc in active if pc not in tones and pc not in harmonic_pcs)
                        target['reasons'] = [
                            (f"penalizes unexplained strong notes ({round(unexplained_remaining * 100)}%)" if unexplained_remaining >= 0.1 else None)
                            if r.startswith("penalizes unexplained strong notes") else r
                            for r in target['reasons']
                        ]
                        target['reasons'] = [r for r in target['reasons'] if r is not None]
            best_score = max(item['raw_score'] for item in scored)
            bonus = min(.65, max(0., float(registered_hint['bonus'])))
            if best_score - target['raw_score'] <= bonus:
                target['raw_score'] = round(target['raw_score'] + bonus, 4)
                target['reasons'] = ['registered half-diminished voices corroborate harmony; major-third peaks fit a measured root harmonic family', *target['reasons']][:5]

    if fading_hint:
        target = next((item for item in scored if item['chord'] == fading_hint['chord']), None)
        best_score = max(item['raw_score'] for item in scored)
        bonus = min(.45, max(0., float(fading_hint['bonus'])))
        if target and best_score - target['raw_score'] <= bonus:
            target['raw_score'] = round(target['raw_score'] + bonus, 4)
            target['reasons'] = ['early chord retained: measured root fades while chord tones persist', *target['reasons']][:5]
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
    end_sample = min(len(audio), max(start_sample, int(end * sr)))
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
