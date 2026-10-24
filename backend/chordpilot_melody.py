"""Optional local GAME inference. Never imported by ordinary song analysis."""
from __future__ import annotations

import contextlib
import hashlib
import json
import math
import os
import sys
import tempfile
from pathlib import Path

from chordpilot_audio import load_audio
from chordpilot_cache import cache_root, file_fingerprint
from chordpilot_common import log

MODEL_REVISION = 'GAME-1.0-small-code-1.0.3-decoder-1'
LANGUAGES = {'auto': 0, 'en': 1, 'ja': 2, 'yue': 3, 'zh': 4}
CORE_SECONDS = 20
CONTEXT_SECONDS = 2


def model_files() -> tuple[Path, Path]:
    root = Path(__file__).resolve().parents[1] / '.tool-cache' / 'melody'
    source = Path(os.environ.get('CHORDPILOT_MELODY_SOURCE') or root / 'GAME-1.0.3')
    weights = Path(os.environ.get('CHORDPILOT_MELODY_WEIGHTS') or root / 'game-small' / 'GAME-1.0-small' / 'model.pt')
    if not (source / 'inference' / 'me_infer.py').is_file() or not weights.is_file() or not (weights.parent / 'config.yaml').is_file():
        raise RuntimeError('Optional vocal model is not installed. Follow docs/melody-analysis.md to install GAME locally; normal chord analysis does not need it.')
    return source, weights


def decode_regions(durations, presence, pitches, duration: float, offset: float = 0) -> list[dict]:
    if not len(durations) == len(presence) == len(pitches) or not math.isfinite(duration) or duration <= 0:
        raise ValueError('Invalid vocal model region lengths or audio duration.')
    regions, cursor = [], 0.
    for length, voiced, pitch in zip(durations, presence, pitches):
        length, pitch = float(length), float(pitch)
        if not math.isfinite(length) or length < 0 or not math.isfinite(pitch):
            raise ValueError('Vocal model returned nonfinite pitch/timing evidence.')
        if not length:  # Batched model output uses zero-length padding regions.
            continue
        stop = cursor + length
        if cursor < duration:
            midi = math.floor(pitch + .5)
            if voiced and not 0 <= midi <= 127:
                raise ValueError(f'Vocal pitch {pitch:.3f} at {cursor + offset:.3f}s cannot be represented as MIDI. Original evidence was not substituted.')
            regions.append({'start': cursor + offset, 'end': min(duration, stop) + offset,
                            'voiced': bool(voiced), 'pitch_midi': pitch, **({'midi': midi} if voiced else {})})
        cursor = stop
    if cursor < duration - .03:
        raise ValueError(f'Vocal model regions do not cover the audio window ({cursor:.3f}s of {duration:.3f}s).')
    return regions


def append_core(events: list[dict], regions: list[dict], start: float, end: float) -> None:
    """Keep central predictions; join only independently sustained context seams."""
    for index, region in enumerate(regions):
        if not region['voiced'] or region['end'] <= start or region['start'] >= end:
            continue
        note = {'start': max(start, region['start']), 'end': min(end, region['end']), 'midi': region['midi'],
                'pitch_midi': region['pitch_midi'], 'source_indices': [region.get('source_index', index)],
                '_crosses_end': region['end'] > end + .02}
        previous = events[-1] if events else None
        if (previous and previous.get('_crosses_end') and region['start'] < start - .02
                and previous['midi'] == note['midi'] and abs(previous['end'] - note['start']) < 1e-6):
            previous['end'] = note['end']
            previous['source_indices'].extend(note['source_indices'])
            previous['_crosses_end'] = note['_crosses_end']
        else:
            events.append(note)


def validate_events(events: list[dict], duration: float) -> None:
    if not math.isfinite(duration) or duration <= 0 or not isinstance(events, list):
        raise ValueError('Invalid melody result duration or events.')
    previous = 0.
    for index, note in enumerate(events):
        start, end, midi = note.get('start'), note.get('end'), note.get('midi')
        if (not all(isinstance(n, (int, float)) and math.isfinite(n) for n in (start, end, midi))
                or not 0 <= start < end <= duration + 1e-6 or start < previous - 1e-6
                or int(midi) != midi or not 0 <= midi <= 127):
            raise ValueError(f'Invalid or overlapping vocal note {index + 1}: {note}. Previous result is preserved.')
        previous = end


def infer_events(stem: Path, source: Path, weights: Path, language: str):
    root = Path(__file__).resolve().parents[1] / '.tool-cache'
    configured = os.environ.get('CHORDPILOT_MELODY_PACKAGES', '')
    packages = [Path(p) for p in configured.split(os.pathsep) if p] if configured else [
        root / 'melody' / 'game-packages', root / 'melody' / 'packages', root / 'drum-packages']
    for folder in reversed([source, *packages]):
        if folder.is_dir() and str(folder) not in sys.path:
            sys.path.insert(0, str(folder))
    try:
        import numpy as np
        audio, sr = load_audio(stem, 44100)
        duration = len(audio) / sr
        if not len(audio) or float(np.max(np.abs(audio))) < 1e-7:
            return duration, [], []
        import torch
        import yaml
        from lib.config.schema import ModelConfig, InferenceConfig
        from inference.me_infer import SegmentationEstimationInferenceModel
    except ImportError as exc:
        raise RuntimeError(f'Optional melody dependencies are missing ({exc}). Follow docs/melody-analysis.md; use CHORDPILOT_MELODY_PYTHON for a separate environment.') from exc
    device = 'cuda' if os.environ.get('CHORDPILOT_TORCH_DEVICE') != 'cpu' and torch.cuda.is_available() else 'cpu'
    torch.set_num_threads(min(4, max(1, os.cpu_count() or 1)))
    torch.manual_seed(0)
    log(f'melody: loading optional GAME model on {device.upper()}')
    with contextlib.redirect_stdout(sys.stderr):
        config = yaml.safe_load((weights.parent / 'config.yaml').read_text(encoding='utf8'))
        model_config = ModelConfig.model_validate(config['model'])
        inference_config = InferenceConfig.model_validate(config['inference'])
        model_config.check(scope_mask=0); inference_config.check(scope_mask=0)
        if inference_config.features.audio_sample_rate != sr:
            raise ValueError('The configured vocal model uses an unsupported sample rate. Install the documented GAME-1.0-small checkpoint.')
        model = SegmentationEstimationInferenceModel(model_config, inference_config)
        checkpoint = torch.load(weights, map_location='cpu', weights_only=True)
        state = checkpoint.get('state_dict', {})
        if checkpoint.get('ema_state_dict') is not None:
            state.update(checkpoint['ema_state_dict'])
        model.load_state_dict(state, strict=True); model.eval().to(device)
    candidates, events = [], []
    core_size, context = CORE_SECONDS * sr, CONTEXT_SECONDS * sr
    for core in range(0, len(audio), core_size):
        stop = min(len(audio), core + core_size)
        left, right = max(0, core - context), min(len(audio), stop + context)
        log(f'melody: transcribing {core / sr:.1f}-{stop / sr:.1f}s of {duration:.1f}s')
        with torch.inference_mode(), contextlib.redirect_stdout(sys.stderr):
            durations, presence, pitches = model(
                torch.from_numpy(np.asarray(audio[left:right], dtype=np.float32)).unsqueeze(0).to(device),
                torch.tensor([[(right - left) / sr]], device=device),
                torch.tensor(.3, device=device), torch.tensor(2, device=device), torch.tensor(.2, device=device),
                language=torch.tensor([LANGUAGES[language]], device=device), t=torch.arange(8, dtype=torch.float32, device=device) / 8)
        regions = decode_regions(durations[0].cpu().tolist(), presence[0].cpu().tolist(), pitches[0].cpu().tolist(),
                                 (right - left) / sr, left / sr)
        for region in regions:
            region['source_index'] = len(candidates)
            region['window'] = [left / sr, right / sr]
            candidates.append(region)
        append_core(events, regions, core / sr, stop / sr)
    for event in events:
        event.pop('_crosses_end', None)
    return duration, candidates, events


def analyze_melody(stem_path: str, force: bool = False, language: str = 'auto') -> dict:
    stem = Path(stem_path)
    if not stem.is_file():
        raise ValueError('Vocal stem is unavailable. Prepare stems first.')
    language = language if language in LANGUAGES else 'auto'
    source, weights = model_files()
    identity = {'stem': file_fingerprint(stem), 'weights': file_fingerprint(weights),
                'config': file_fingerprint(weights.parent / 'config.yaml'), 'model': MODEL_REVISION, 'language': language,
                'source': [file_fingerprint(path) for path in sorted(source.rglob('*.py'))]}
    fingerprint = hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()
    directory = cache_root() / 'melody'; directory.mkdir(parents=True, exist_ok=True)
    cache = directory / f'{fingerprint}.json'
    if not force and cache.is_file():
        try:
            result = json.loads(cache.read_text(encoding='utf8'))
            validate_events(result['events'], result['duration'])
            if result.get('ok') and result.get('fingerprint') == fingerprint and isinstance(result.get('candidates'), list):
                log('melody: using cached vocal transcription')
                return {**result, 'cached': True}
        except (OSError, ValueError, KeyError, TypeError):
            pass
    duration, candidates, events = infer_events(stem, source, weights, language)
    validate_events(events, duration)
    result = {'ok': True, 'schema_version': 1, 'model': MODEL_REVISION, 'fingerprint': fingerprint, 'source': 'vocals',
              'duration': duration, 'language': language, 'candidates': candidates, 'events': events, 'cached': False,
              'diagnostics': [{'start': note['start'], 'midi': note['midi'],
                               'reason': f"Very short vocal event at {note['start']:.3f}s (MIDI {note['midi']}); review against the vocals stem."}
                              for note in events if note['end'] - note['start'] < .04]}
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf8', dir=directory, suffix='.tmp', delete=False) as output:
        temporary = Path(output.name)
        try:
            json.dump(result, output, allow_nan=False)
        except Exception:
            output.close(); temporary.unlink(missing_ok=True); raise
    try:
        temporary.replace(cache)
    finally:
        temporary.unlink(missing_ok=True)
    return result
