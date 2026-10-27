"""Capture pinned author-model features, without changing retained predictions."""
import os
from pathlib import Path
import sys
import json
import hashlib
import subprocess
import time
import importlib.util
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'outputs/song-structure'
OUT = BASE / 'representation-stages/features'
OUT.mkdir(parents=True, exist_ok=True)
for folder in ['tmp/structure-neural-deps', 'tmp/songformer-deps', 'tmp/songformer-adapted']:
    sys.path.insert(0, str(ROOT / folder))
os.environ.update(SONGFORMER_LOCAL_DIR=str(ROOT / 'tmp/songformer-adapted'),
                  HF_HOME=str(ROOT / 'tmp/structure-model-cache'), HF_HUB_OFFLINE='1',
                  TRANSFORMERS_OFFLINE='1', OMP_NUM_THREADS='6',
                  NUMBA_CACHE_DIR=str(ROOT / 'tmp/structure-model-cache/numba'))
os.environ['PATH'] = str(ROOT / 'node_modules/ffmpeg-static') + os.pathsep + os.environ['PATH']
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')
import torch
import numpy as np
import soundfile as sf
from configuration_songformer import SongFormerConfig
from modeling_songformer import SongFormerModel

torch.set_num_threads(6)
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
read = lambda p: json.loads(Path(p).read_text(encoding='utf-8'))
helper = ROOT / 'scripts/testing/structure-feature-capture.py'
spec = importlib.util.spec_from_file_location('feature_capture', helper)
capture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(capture)
weights = ROOT / 'tmp/songformer-inspect/model.safetensors'
verification = read(weights.with_name('weights-verification.json'))
assert weights.stat().st_size == verification['bytes']
assert sha(weights) == '8dcabf4ea19973edd51b9e5794004775fa7e8de3ecfa07eb1dbce00f516ce7f7'
model_dir = ROOT / 'tmp/songformer-adapted'
assert sha(model_dir / 'model.safetensors') == sha(weights)
code_paths = [Path(__file__), helper] + list(model_dir.rglob('*.py')) + list(model_dir.glob('*.json'))
code_hashes = {str(p.relative_to(ROOT)): sha(p) for p in code_paths}
config = SongFormerConfig.from_pretrained(str(model_dir), local_files_only=True)
assert config.win_size == config.hop_size == 420
print('Loading pinned author checkpoint, offline fp32', flush=True)
model, info = SongFormerModel.from_pretrained(str(model_dir), config=config,
    local_files_only=True, low_cpu_mem_usage=False, output_loading_info=True)
assert not any(info.get(k) for k in ('missing_keys', 'unexpected_keys', 'mismatched_keys', 'error_msgs'))
model.to('cuda').eval()
original_infer = model.songformer.infer
chunks = []


def captured_infer(*args, **kwargs):
    index = len(chunks)
    start = index * config.hop_size
    chunk_duration = min(duration - start, config.win_size)
    tensor = kwargs['input_embeddings']
    # Copy only; the original tensor reaches the unmodified structural head.
    values = tensor.detach().cpu().numpy().copy()
    item = capture.save_features(OUT / (slug + '.features-' + str(index) + '.npz'),
                                 values, chunk_duration, start)
    del values
    result = original_infer(*args, **kwargs)
    logits = {k: v.detach().cpu().numpy() for k, v in result[1].items()}
    logits_path = OUT / (slug + '.logits-' + str(index) + '.npz')
    np.savez_compressed(logits_path, **logits)
    previous = BASE / 'songformer-experiment' / (slug + '.logits-' + str(index) + '.npz')
    with np.load(previous, allow_pickle=False) as cached:
        comparison = {}
        for key, value in logits.items():
            comparison[key] = capture.compare_logits(value, cached[key])
    item['head_logit_comparison'] = comparison
    item['head_logits_file'] = logits_path.name
    item['head_logits_sha256'] = sha(logits_path)
    chunks.append(item)
    print(slug, 'captured', item['shape'], 'head check', comparison, flush=True)
    return result


model.songformer.infer = captured_infer
for owner, name in [(model.muq, 'forward'), (model.musicfm, 'get_predictions')]:
    original = getattr(owner, name)
    def timed(*args, _original=original, _name=name, **kwargs):
        started = time.perf_counter()
        print(slug, _name, list(args[0].shape), flush=True)
        result = _original(*args, **kwargs)
        torch.cuda.synchronize()
        print(slug, _name, 'finished', round(time.perf_counter() - started, 1), flush=True)
        return result
    setattr(owner, name, timed)

for slug in sys.argv[1:]:
    assert slug and all(c.isalnum() or c == '-' for c in slug)
    source = BASE / 'model-comparison/media' / (slug + '.mp3')
    native_path = BASE / 'songformer-experiment' / (slug + '.raw.json')
    retained_path = BASE / 'songformer-experiment' / (slug + '.consensus-v3.json')
    native = read(native_path)
    source_hash = sha(source)
    assert native['source_hash'] == source_hash
    retained_hash = sha(retained_path)
    decoded = OUT / (slug + '.wav')
    subprocess.run([str(ROOT / 'node_modules/ffmpeg-static/ffmpeg.exe'), '-v', 'error', '-y',
                    '-i', str(source), '-ac', '1', '-ar', '24000', str(decoded)], check=True)
    audio, sr = sf.read(decoded, dtype='float32')
    assert sr == 24000 and audio.ndim == 1
    duration = len(audio) / sr
    assert abs(duration - native['duration']) < 1 / sr
    chunks.clear()
    started = time.perf_counter()
    torch.cuda.reset_peak_memory_stats()
    with torch.inference_mode():
        prediction = model(audio)
    torch.cuda.synchronize()
    assert chunks and sha(source) == source_hash and sha(retained_path) == retained_hash
    report = {'schema_version': 1, 'source_hash': source_hash, 'duration': duration,
        'decoded_audio_sha256': sha(decoded), 'checkpoint_sha256': sha(weights),
        'source_code_sha256': code_hashes, 'retained_prediction_sha256': retained_hash,
        'native_prediction_unchanged': prediction == native['segments'],
        'all_head_logits_within_tolerance': all(c['within_float_tolerance'] for x in chunks
                                               for c in x['head_logit_comparison'].values()),
        'chunks': list(chunks), 'elapsed_seconds': time.perf_counter() - started,
        'peak_cuda_allocated_bytes': torch.cuda.max_memory_allocated(),
        'completed_at': datetime.now(timezone.utc).isoformat(),
        'inference_inputs': 'Full-mix audio only; no labels, references, sessions or lyrics.',
        'preprocessing': 'FFmpeg mono 24kHz PCM16 -> float32, unchanged author fp32 forward.',
        'limitation': 'General musical SSL features; melody discrimination is not established.'}
    (OUT / (slug + '.json')).write_text(json.dumps(report, indent=2, allow_nan=False) + '\n')
    assert report['all_head_logits_within_tolerance'], 'Head logits differ; inspect report before reuse'
    assert report['native_prediction_unchanged'], 'Native decoded result changed; inspect report'
    print(slug, 'VERIFIED', round(report['elapsed_seconds'], 1), 'seconds', flush=True)
assert {str(p.relative_to(ROOT)): sha(p) for p in code_paths} == code_hashes
print('ALL CAPTURES VERIFIED', flush=True)
