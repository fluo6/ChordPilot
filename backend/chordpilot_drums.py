"""Optional ADTOF transcription. Imported only by the explicit drum command."""
from __future__ import annotations

import contextlib
import hashlib
import importlib.util
import json
import math
import os
import sys
import tempfile
from pathlib import Path

from chordpilot_audio import load_audio
from chordpilot_cache import cache_root, file_fingerprint
from chordpilot_common import log

MODEL_REVISION = 'adtof-pytorch-85c192e-v1'
LABELS = {35: 'kick', 38: 'snare', 47: 'tom', 42: 'hihat', 49: 'cymbal'}
FPS = 100


def model_weights() -> Path:
    # An optional local install is visible only inside this analysis process.
    configured_packages = os.environ.get('CHORDPILOT_DRUM_PACKAGES')
    packages = Path(configured_packages) if configured_packages else (
        None if os.environ.get('CHORDPILOT_DRUM_PYTHON') else Path(__file__).resolve().parents[1] / '.tool-cache' / 'drum-packages')
    if packages and packages.is_dir() and str(packages) not in sys.path:
        sys.path.insert(0, str(packages))
    configured = os.environ.get('CHORDPILOT_DRUM_WEIGHTS')
    if configured:
        weights = Path(configured)
    else:
        spec = importlib.util.find_spec('adtof_pytorch')
        if not spec or not spec.origin:
            raise RuntimeError('Drum model is not installed. Follow docs/drum-analysis.md to install the optional ADTOF model for the backend Python environment.')
        weights = Path(spec.origin).parent / 'data' / 'adtof_frame_rnn_pytorch_weights.pth'
    if not weights.is_file():
        raise RuntimeError('Drum model weights are missing. Reinstall the optional ADTOF package or set CHORDPILOT_DRUM_WEIGHTS.')
    return weights


def events_from_peaks(peaks, activations, duration):
    events = []
    for column, (midi, instrument) in enumerate(LABELS.items()):
        for time in peaks.get(midi, []):
            time = float(time)
            if not math.isfinite(time) or not 0 <= time < duration:
                continue
            frame = min(activations.shape[1] - 1, max(0, round(time * FPS)))
            score = float(activations[0, frame, column])
            if math.isfinite(score):
                events.append({'time': round(time, 4), 'instrument': instrument, 'score': round(max(0., min(1., score)), 4)})
    return sorted(events, key=lambda event: (event['time'], list(LABELS.values()).index(event['instrument'])))


def infer_events(stem: Path, weights: Path):
    import numpy as np
    audio, sr = load_audio(stem, 44100)
    duration = len(audio) / sr
    if not len(audio) or float(np.max(np.abs(audio))) < 1e-7:
        return duration, []
    # Load dependencies after checking silence; nothing is imported by normal analysis.
    import torch
    from adtof_pytorch import calculate_n_bins, create_frame_rnn_model, PeakPicker
    from adtof_pytorch.audio import create_adtof_processor
    from adtof_pytorch.post_processing import FRAME_RNN_THRESHOLDS

    device = 'cuda' if os.environ.get('CHORDPILOT_TORCH_DEVICE') != 'cpu' and torch.cuda.is_available() else 'cpu'
    torch.set_num_threads(min(4, max(1, os.cpu_count() or 1)))
    with contextlib.redirect_stdout(sys.stderr):
        model = create_frame_rnn_model(calculate_n_bins())
        checkpoint = torch.load(str(weights), map_location='cpu', weights_only=True)
        model.load_state_dict(checkpoint.get('model_weights', checkpoint), strict=True)
    model.eval().to(device)
    processor = create_adtof_processor()
    # Bounded windows keep long songs within memory; overlap gives the bidirectional
    # network context on both sides. Keep only the central frames of each window.
    blocks = []
    step, context = 30, 2
    for start in range(0, math.ceil(duration), step):
        left = max(0, start - context)
        right = min(duration, start + step + context)
        segment = audio[round(left * sr):round(right * sr)]
        feature = processor.apply_filterbank(processor.compute_stft(segment)).T
        x = torch.from_numpy(feature.copy()).float()[None, :, :, None].to(device)
        with torch.inference_mode():
            pred = model(x).cpu().numpy()
        begin = round((start - left) * FPS)
        end = begin + min(step * FPS, math.ceil((duration - start) * FPS))
        blocks.append(pred[:, begin:end, :])
        log(f'drums: transcribed {min(start + step, duration):.1f}/{duration:.1f}s')
    activations = np.concatenate(blocks, axis=1)
    peaks = PeakPicker(thresholds=FRAME_RNN_THRESHOLDS, fps=FPS).pick(activations, labels=list(LABELS))[0]
    return duration, events_from_peaks(peaks, activations, duration)


def analyze_drums(stem_path: str, force: bool = False) -> dict:
    stem = Path(stem_path)
    if not stem.is_file():
        raise ValueError('Drum stem is unavailable. Prepare stems first.')
    weights = model_weights()
    identity = {'stem': file_fingerprint(stem), 'weights': file_fingerprint(weights), 'model': MODEL_REVISION,
                'keras_gru': os.environ.get('ADTOF_USE_KERAS_GRU', '0')}
    fingerprint = hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()
    directory = cache_root() / 'drums'
    directory.mkdir(parents=True, exist_ok=True)
    cache = directory / f'{fingerprint}.json'
    if not force and cache.is_file():
        try:
            result = json.loads(cache.read_text(encoding='utf8'))
            if result.get('ok') and isinstance(result.get('events'), list):
                log('drums: using cached transcription')
                return {**result, 'cached': True}
        except (OSError, ValueError):
            pass
    log('drums: loading optional ADTOF model')
    duration, events = infer_events(stem, weights)
    result = {'ok': True, 'version': 1, 'model': MODEL_REVISION, 'fingerprint': fingerprint,
              'duration': round(duration, 4), 'classes': list(LABELS.values()), 'events': events, 'cached': False}
    # Replace atomically so an interrupted run cannot destroy an earlier result.
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf8', dir=directory, suffix='.tmp', delete=False) as output:
        json.dump(result, output)
        temporary = Path(output.name)
    try:
        temporary.replace(cache)
    finally:
        temporary.unlink(missing_ok=True)
    return result
