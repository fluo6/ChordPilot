#!/usr/bin/env python3
"""ChordPilot analysis and export backend.

The MVP prefers real analysis libraries when available, but always returns a
draft chart so the Electron cleanup workflow remains usable.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import importlib.util
import json
import math
import os
import re
import site
import shutil
import subprocess
import sys
import tempfile
import wave
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Iterable
from xml.etree import ElementTree as ET


VENDOR_DIR = Path(__file__).resolve().parent / "vendor"
if VENDOR_DIR.exists() and str(VENDOR_DIR) not in sys.path:
    sys.path.insert(0, str(VENDOR_DIR))
try:
    USER_SITE_DIR = site.getusersitepackages()
    if USER_SITE_DIR and USER_SITE_DIR not in sys.path:
        sys.path.append(USER_SITE_DIR)
except Exception:
    pass
try:
    __import__("certifi_win32.wrapt_certifi")
    certifi = __import__("certifi")
    os.environ.setdefault("SSL_CERT_FILE", certifi.where())
    os.environ.setdefault("REQUESTS_CA_BUNDLE", certifi.where())
except Exception:
    pass

CHORD_CYCLE = ["C", "G", "Am", "F", "Dm", "Em", "F", "G"]
PITCH_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]
MAJOR_TEMPLATE = [1.0, 0.05, 0.2, 0.05, 0.75, 0.25, 0.05, 0.8, 0.05, 0.25, 0.05, 0.25]
MINOR_TEMPLATE = [1.0, 0.05, 0.2, 0.7, 0.05, 0.25, 0.05, 0.8, 0.25, 0.05, 0.25, 0.05]
ENHARMONIC_TO_PITCH = {
    "DB": "C#",
    "D#": "Eb",
    "GB": "F#",
    "G#": "Ab",
    "A#": "Bb",
}
CHORD_QUALITIES = {
    "": {"intervals": [0, 4, 7], "third": 4, "fifth": 7, "complexity": 0.05},
    "m": {"intervals": [0, 3, 7], "third": 3, "fifth": 7, "complexity": 0.05},
    "7": {"intervals": [0, 4, 7, 10], "third": 4, "fifth": 7, "complexity": 0.16},
    "maj7": {"intervals": [0, 4, 7, 11], "third": 4, "fifth": 7, "complexity": 0.18},
    "m7": {"intervals": [0, 3, 7, 10], "third": 3, "fifth": 7, "complexity": 0.16},
    "dim": {"intervals": [0, 3, 6], "third": 3, "fifth": 6, "complexity": 0.28},
    "aug": {"intervals": [0, 4, 8], "third": 4, "fifth": 8, "complexity": 0.3},
    "sus2": {"intervals": [0, 2, 7], "third": None, "fifth": 7, "complexity": 0.24},
    "sus4": {"intervals": [0, 5, 7], "third": None, "fifth": 7, "complexity": 0.24},
    "6": {"intervals": [0, 4, 7, 9], "third": 4, "fifth": 7, "complexity": 0.22},
    "m6": {"intervals": [0, 3, 7, 9], "third": 3, "fifth": 7, "complexity": 0.22},
    "m7b5": {"intervals": [0, 3, 6, 10], "third": 3, "fifth": 6, "complexity": 0.34},
}
MAJOR_SCALE_INTERVALS = {0, 2, 4, 5, 7, 9, 11}
MINOR_SCALE_INTERVALS = {0, 2, 3, 5, 7, 8, 10}
SECTION_PLAN = [
    ("Intro", 4),
    ("Verse", 8),
    ("Chorus", 8),
    ("Verse", 8),
    ("Chorus", 8),
    ("Bridge", 8),
    ("Chorus", 8),
    ("Outro", 4),
]
BACKEND_CACHE_VERSION = "2026-05-02-lyrics-reference-v1"
STEM_NAMES = ["vocals", "drums", "bass", "other"]
DEFAULT_ANALYSIS_OPTIONS = {
    "known_key": "",
    "min_bpm": 60,
    "max_bpm": 190,
    "beat_offset": 0.0,
    "onset_frame": 2048,
    "onset_hop": 512,
    "chroma_low_hz": 65.0,
    "chroma_high_hz": 1800.0,
    "chord_alternatives": 6,
    "simplify_chords": True,
    "chord_source": "auto",
    "demucs_model": "htdemucs",
    "require_stems": False,
    "use_cache": True,
    "lyrics_enabled": False,
    "lyrics_source": "auto",
    "lyrics_model": "tiny",
    "lyrics_language": "",
}


@dataclass
class Bar:
    number: int
    section: str
    chord: str
    start: float
    repeat_start: bool = False
    repeat_end: int = 0
    notes: str = ""
    lyrics: str = ""
    confidence: float | None = None

def respond(payload: dict[str, Any]) -> None:
    print(json.dumps(payload, indent=2))

def log(message: str) -> None:
    print(message, file=sys.stderr, flush=True)

def try_import(name: str) -> Any | None:
    try:
        return __import__(name)
    except Exception:
        return None

def clamp_number(value: Any, fallback: float, minimum: float, maximum: float) -> float:
    try:
        numeric = float(value)
    except Exception:
        return fallback
    return max(minimum, min(maximum, numeric))

def normalize_known_key(value: Any) -> str:
    clean = str(value or "").strip()
    if not clean or clean.lower() in {"auto", "detect", "unknown"}:
        return ""
    if clean.lower().endswith("minor"):
        clean = clean[:-5].strip() + "m"
    elif clean.lower().endswith("major"):
        clean = clean[:-5].strip()
    parsed = re.match(r"^([A-Ga-g])([#b]?)(m?)$", clean)
    if not parsed:
        return ""
    root = f"{parsed.group(1).upper()}{parsed.group(2)}"
    root = ENHARMONIC_TO_PITCH.get(root.upper(), root)
    if root not in PITCH_NAMES:
        return ""
    return f"{root}{parsed.group(3)}"

def normalize_analysis_options(raw: dict[str, Any] | None = None) -> dict[str, Any]:
    raw = raw or {}
    options = dict(DEFAULT_ANALYSIS_OPTIONS)
    options["known_key"] = normalize_known_key(raw.get("known_key", options["known_key"]))
    options["min_bpm"] = int(clamp_number(raw.get("min_bpm"), options["min_bpm"], 30, 240))
    options["max_bpm"] = int(clamp_number(raw.get("max_bpm"), options["max_bpm"], 60, 300))
    if options["max_bpm"] <= options["min_bpm"]:
        options["max_bpm"] = min(300, options["min_bpm"] + 40)
    options["beat_offset"] = round(clamp_number(raw.get("beat_offset"), options["beat_offset"], -2.0, 2.0), 3)
    options["onset_frame"] = int(clamp_number(raw.get("onset_frame"), options["onset_frame"], 512, 8192))
    options["onset_hop"] = int(clamp_number(raw.get("onset_hop"), options["onset_hop"], 128, 4096))
    options["chroma_low_hz"] = round(clamp_number(raw.get("chroma_low_hz"), options["chroma_low_hz"], 20, 500), 2)
    options["chroma_high_hz"] = round(clamp_number(raw.get("chroma_high_hz"), options["chroma_high_hz"], 500, 5000), 2)
    if options["chroma_high_hz"] <= options["chroma_low_hz"]:
        options["chroma_high_hz"] = options["chroma_low_hz"] + 500
    options["chord_alternatives"] = int(clamp_number(raw.get("chord_alternatives"), options["chord_alternatives"], 1, 12))
    options["simplify_chords"] = bool(raw.get("simplify_chords", options["simplify_chords"]))
    chord_source = str(raw.get("chord_source") or options["chord_source"]).strip().lower().replace("-", "_")
    if chord_source not in {"auto", "other", "accompaniment", "bass", "vocals", "drums", "full_mix"}:
        chord_source = "auto"
    options["chord_source"] = chord_source
    options["demucs_model"] = str(raw.get("demucs_model") or options["demucs_model"]).strip() or "htdemucs"
    options["require_stems"] = bool(raw.get("require_stems", options["require_stems"]))
    options["use_cache"] = bool(raw.get("use_cache", options["use_cache"]))
    options["lyrics_enabled"] = bool(raw.get("lyrics_enabled", options["lyrics_enabled"]))
    lyrics_source = str(raw.get("lyrics_source") or options["lyrics_source"]).strip().lower().replace("-", "_")
    if lyrics_source not in {"auto", "full_mix", "vocals"}:
        lyrics_source = "auto"
    options["lyrics_source"] = lyrics_source
    lyrics_model = str(raw.get("lyrics_model") or options["lyrics_model"]).strip().lower()
    if lyrics_model not in {"tiny", "base", "small"}:
        lyrics_model = "tiny"
    options["lyrics_model"] = lyrics_model
    lyrics_language = str(raw.get("lyrics_language") or options["lyrics_language"]).strip().lower()
    if lyrics_language in {"auto", "detect", "unknown"}:
        lyrics_language = ""
    if not re.match(r"^[a-z]{2,3}(-[a-z0-9]+)?$", lyrics_language):
        lyrics_language = ""
    options["lyrics_language"] = lyrics_language
    return options

def options_cache_suffix(options: dict[str, Any]) -> str:
    payload = json.dumps(options, sort_keys=True).encode("utf8")
    return hashlib.sha256(payload).hexdigest()[:10]
