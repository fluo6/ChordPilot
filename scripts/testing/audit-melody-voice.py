"""Optional AudioSet accompaniment audit; outputs review evidence, never notes."""
import argparse
import csv
import hashlib
import json
import sys
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('session', type=Path)
    parser.add_argument('--model-dir', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    model_dir = args.model_dir.resolve()
    checkpoint = model_dir / 'Cnn6.pth'
    if hashlib.sha256(checkpoint.read_bytes()).hexdigest() != '8a17541944f2623a2a0164e072ac2f915dcedca99968083cc44bfbc7eb682275':
        raise ValueError('PANNs checkpoint does not match the verified official Cnn6 model.')
    sys.path[:0] = [str(model_dir), str(model_dir / 'packages'), str(root / '.tool-cache/drum-packages'), str(root / 'backend')]
    import numpy as np
    import torch
    from models import Cnn6
    from chordpilot_audio import load_audio

    session = json.loads(args.session.read_text(encoding='utf-8-sig'))
    melody = session['chart']['melody']
    audio_path = Path(session['audio']['path'])
    labels = [row['display_name'] for row in csv.DictReader((model_dir / 'class_labels_indices.csv').open(encoding='utf8'))]
    if len(labels) != 527:
        raise ValueError('Expected the official 527 AudioSet labels.')
    vocal_names = {'Singing', 'Male singing', 'Female singing', 'Child singing', 'Synthetic singing', 'Choir', 'Humming', 'Chant', 'Mantra', 'Rapping', 'Yodeling'}
    instrument_names = {'Musical instrument', 'Piano', 'Electric piano', 'Synthesizer', 'Organ', 'Guitar', 'Violin, fiddle', 'Flute', 'String section', 'Saxophone'}
    vocal_indices = [i for i, name in enumerate(labels) if name in vocal_names]
    instrument_indices = [i for i, name in enumerate(labels) if name in instrument_names]
    torch.set_num_threads(4)
    model = Cnn6(32000, 1024, 320, 64, 50, 14000, 527)
    model.load_state_dict(torch.load(checkpoint, map_location='cpu', weights_only=True)['model'], strict=True)
    model.eval()
    audio, sr = load_audio(audio_path, 32000)
    intervals = []
    with torch.inference_mode():
        for start in range(0, len(audio), 5 * sr):
            stop = min(len(audio), start + 5 * sr)
            clip = np.asarray(audio[start:stop], dtype=np.float32)
            if len(clip) < 5 * sr:
                clip = np.pad(clip, (0, 5 * sr - len(clip)))
            scores = model(torch.from_numpy(clip).unsqueeze(0))['clipwise_output'][0].numpy()
            intervals.append({'start': start / sr, 'end': stop / sr,
                              'singing': float(max(scores[vocal_indices])),
                              'instruments': float(max(scores[instrument_indices])),
                              'speech': float(scores[labels.index('Speech')]),
                              'top_tags': {labels[i]: float(scores[i]) for i in np.argsort(scores)[-5:][::-1]}})
    result = {'schema_version': 1, 'method': 'PANNs Cnn6 AudioSet review; scores are uncalibrated activations',
              'melody_fingerprint': melody['fingerprint'], 'input': 'original full mix',
              'audio_sha256': hashlib.sha256(audio_path.read_bytes()).hexdigest(),
              'checkpoint_sha256': hashlib.sha256(checkpoint.read_bytes()).hexdigest(),
              'intervals': intervals,
              'scope': 'Whole recording, non-overlapping 5-second windows. Does not identify the lead singer among multiple voices.'}
    args.output.write_text(json.dumps(result, indent=2, allow_nan=False), encoding='utf8')
    print(json.dumps({'intervals': len(intervals), 'output': str(args.output)}))


if __name__ == '__main__':
    main()
