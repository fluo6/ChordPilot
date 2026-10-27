"""Source-time song structure, independent of chord naming and bar numbering."""
from __future__ import annotations

import math
import hashlib
import json
import time

STRUCTURE_VERSION = 'builtin-novelty-v3'


def source_identity(path):
    digest=hashlib.sha256()
    with path.open('rb') as handle:
        for chunk in iter(lambda:handle.read(1024*1024),b''):digest.update(chunk)
    stat=path.stat()
    return {'source_hash':digest.hexdigest(),'source_fingerprint':{'size':stat.st_size,'mtime_ns':stat.st_mtime_ns}}


def empty_structure(duration, status, diagnostic=None):
    segments = [] if duration <= 0 or status == 'unavailable' else [
        {'id': 's1', 'start': 0., 'end': duration, 'group': None, 'role': None}]
    return {'version': 1, 'analysis': {'engine': 'none', 'status': status,
            'diagnostics': [diagnostic] if diagnostic else [], 'segments': segments},
            'manual_segments': None, 'stale': False}


def validate_segments(segments, duration):
    if not isinstance(segments, list) or not isinstance(duration, (float, int)) or not math.isfinite(duration) or duration < 0:
        return False
    if not segments:
        return duration == 0
    previous, ids = 0., set()
    for row in segments:
        if not isinstance(row, dict) or not isinstance(row.get('id'), str) or not row['id'] or row['id'] in ids:
            return False
        start, end = row.get('start'), row.get('end')
        if any(isinstance(t, bool) or not isinstance(t, (float, int)) or not math.isfinite(t) for t in (start, end)):
            return False
        if start != previous or end <= start or any(row.get(key) is not None and not isinstance(row[key], str) for key in ('label', 'role', 'group')):
            return False
        previous = end
        ids.add(row['id'])
    return previous == duration


def project_sections(chart):
    structure = chart.get('structure')
    if not isinstance(structure, dict) or structure.get('version') != 1:
        return chart
    analysis = structure.get('analysis') or {}
    rows = structure.get('manual_segments')
    if rows is None:
        rows = analysis.get('segments')
    duration = chart.get('duration', 0)
    if not validate_segments(rows, duration) and not (rows == [] and analysis.get('status') == 'unavailable'):
        return chart
    mode = structure.get('display_mode')
    if mode not in ('roles', 'groups', 'mixed'):
        mode = ('mixed' if any(r.get('label') for r in (structure.get('manual_segments') or []))
                else 'roles' if any(r.get('role') for r in rows) else 'groups')
    for index, bar in enumerate(chart.get('bars', [])):
        time = 0 if index == 0 else bar.get('start', 0)
        row = next((r for r in rows if r['start'] <= time < r['end'] or time == duration == r['end']), None)
        role = (row.get('role') or '').replace('_', ' ').capitalize() if row else ''
        if row and mode == 'roles':
            bar['section'] = role or 'Unclassified'
        elif row and mode == 'groups':
            bar['section'] = row.get('group') or 'Unlabelled'
        else:
            bar['section'] = (row.get('label') or role or row.get('group') or 'Unlabelled') if row else 'Unlabelled'
        if row:
            bar['section_id'] = row['id']
        else:
            bar.pop('section_id', None)
    return chart


def _unit(values, np):
    return values / np.maximum(np.linalg.norm(values, axis=-1, keepdims=True), 1e-12)


def _features(audio, sr, edges, np):
    """Four ordered samples per interval; FFT work and allocations are bounded."""
    frame = 2048
    window = np.hanning(frame)
    frequencies = np.fft.rfftfreq(frame, 1. / sr)
    selected = (frequencies >= 55) & (frequencies <= min(4000, sr * .48))
    hz = frequencies[selected]
    pitches = np.round(69 + 12 * np.log2(hz / 440)).astype(int) % 12
    bands = np.clip(np.floor(np.log(hz / 55) / np.log(4000 / 55) * 24).astype(int), 0, 23)
    rows, times = [], []
    for start, end in zip(edges[:-1], edges[1:]):
        for left, right in zip(np.linspace(start, end, 5)[:-1], np.linspace(start, end, 5)[1:]):
            crop = audio[int(left*sr):int(right*sr)]
            if not len(crop):
                rows.append(np.zeros(38)); times.append(left); continue
            starts = np.linspace(0, max(0, len(crop)-frame), min(32, max(1, len(crop)//512))).astype(int)
            frames = np.asarray([np.pad(crop[i:i+frame], (0, max(0, frame-len(crop[i:i+frame])))) for i in starts])
            spectrum = np.abs(np.fft.rfft(frames * window, axis=1))[:, selected].mean(axis=0)
            chroma = _unit(np.bincount(pitches, weights=spectrum, minlength=12), np)
            shape = np.bincount(bands, weights=spectrum, minlength=24)
            shape = _unit(np.log1p(100 * shape / max(float(shape.sum()), 1e-12)), np)
            rms = float(np.sqrt(np.mean(crop.astype(float)**2)))
            frame_levels = np.sqrt(np.mean(frames**2, axis=1))
            activity = float(frame_levels.std() / max(float(frame_levels.mean()), 1e-8))
            rows.append(np.r_[chroma, shape, rms, activity]); times.append(left)
    return np.asarray(rows), np.r_[times, edges[-1]]


def _distance(left, right, np):
    harmonic = 1 - np.sum(_unit(left[..., :12], np) * _unit(right[..., :12], np), axis=-1)
    texture = 1 - np.sum(_unit(left[..., 12:36], np) * _unit(right[..., 12:36], np), axis=-1)
    level = np.minimum(1., np.abs(np.log((left[...,36]+1e-6)/(right[...,36]+1e-6))) / 3)
    activity = np.minimum(1., np.abs(left[...,37] - right[...,37]))
    return .6 * harmonic + .3 * texture + .05 * level + .05 * activity


def group_segments(segments, features, times):
    import numpy as np
    descriptors, clusters = [], []
    floor = max(1e-6, float(features[:,36].max()) * .001) if len(features) else 1e-6
    for row in segments:
        indices = np.flatnonzero((times[:-1] >= row['start']) & (times[:-1] < row['end']))
        data = features[indices]
        if not len(data) or float(data[:,36].mean()) <= floor:
            row.update(group=None,role=None,evidence={**row.get('evidence',{}),'repeat_score':None});descriptors.append(None);continue
        positions = row['start'] + (np.arange(16)+.5) * (row['end']-row['start']) / 16
        centers = (times[indices]+times[indices+1]) / 2
        descriptor = np.stack([np.interp(positions,centers,data[:,column]) for column in range(38)], axis=1)
        index = len(descriptors);descriptors.append(descriptor)
        distances = {}
        for previous, other in enumerate(descriptors[:-1]):
            if other is not None:
                ratio = (row['end']-row['start']) / (segments[previous]['end']-segments[previous]['start'])
                distances[previous] = float(_distance(descriptor,other,np).mean()) + .1 * abs(math.log(ratio))
        # ponytail: conservative complete-link on section descriptors; benchmark
        # temporal alignment before relaxing matches for embellished repeats.
        match = next((group for group in clusters if all(distances.get(i,1.) <= .18 for i in group)), None)
        score = None
        if match is None:
            match = [];clusters.append(match)
        else:
            score = round(max(0.,1-max(distances[i] for i in match)),4)
        match.append(index)
        number = next(i for i, group in enumerate(clusters) if group is match) + 1
        letters = ''
        while number:
            number, digit = divmod(number-1,26);letters = chr(65+digit)+letters
        row.update(group=letters,role=None,evidence={**row.get('evidence',{}),'repeat_score':score})


def analyze_structure_audio(audio, sr, grid=None, grouping=True):
    import numpy as np
    started = time.perf_counter()
    if not isinstance(sr,(int,float)) or not math.isfinite(sr) or sr <= 0:
        raise ValueError('Structure analysis needs a valid sample rate.')
    audio = np.asarray(audio, dtype=np.float32)
    if audio.ndim != 1 or not np.isfinite(audio).all():
        raise ValueError('Structure analysis needs finite mono audio.')
    actual_duration = len(audio) / float(sr)
    grid = grid if isinstance(grid,dict) else {}
    declared = grid.get('duration',actual_duration)
    duration = float(declared) if isinstance(declared,(int,float)) and math.isfinite(declared) and abs(declared-actual_duration) <= .02 else actual_duration
    result = empty_structure(duration,'estimated')
    analysis = result['analysis'];analysis['engine'] = STRUCTURE_VERSION
    if not len(audio):
        analysis['status'] = 'insufficient_evidence';return result
    raw = [bar.get('start') for bar in grid.get('bars',[]) if isinstance(bar,dict)]
    valid_grid = bool(raw) and len(raw) <= 2048 and all(isinstance(t,(int,float)) and not isinstance(t,bool) and math.isfinite(t) and 0 <= t < duration for t in raw) and all(a < b for a,b in zip(raw,raw[1:]))
    if valid_grid:
        edges = sorted(set([0., *raw, duration]))
    else:
        # Max 2048 coarse intervals, 8192 feature bins, no square frame matrix.
        edges = np.linspace(0,duration,min(2048,max(1,math.ceil(duration)))+1).tolist()
        analysis['diagnostics'].append('Missing/invalid or oversized bar grid; fixed-time features used.')
    if len(edges) > 2049:
        edges = np.linspace(0,duration,2049).tolist();valid_grid=False
        analysis['diagnostics'].append('Long input coarsened to 2048 intervals.')
    features, times = _features(audio,sr,edges,np)
    averaged = features.reshape((-1,4,38)).mean(axis=1)
    n = len(averaged);novelty = np.zeros(n+1)
    for index in range(2,n-1):
        scores = [float(_distance(averaged[index-width:index].mean(axis=0),averaged[index:index+width].mean(axis=0),np))
                  for width in (2,4,8) if index >= width and n-index >= width]
        novelty[index] = max(scores,default=0.)
    median = float(np.median(novelty))
    mad = float(np.median(np.abs(novelty-median)))
    threshold = max(.025,median+2.5*mad)
    candidates = [i for i in range(2,n-1) if novelty[i] >= threshold and novelty[i] > novelty[i-1] and novelty[i] >= novelty[i+1]]
    chosen = []
    for i in sorted(candidates,key=lambda i:(-novelty[i],i)):
        if all(abs(i-j)>=2 for j in chosen):chosen.append(i)
    boundaries = [0,*sorted(chosen),n]
    rows = [{'id':f's{i+1}','start':edges[left],'end':edges[right],'group':None,'role':None,
             'evidence':{'boundary_score':round(float(novelty[left]),4) if left else None,'repeat_score':None}}
            for i,(left,right) in enumerate(zip(boundaries,boundaries[1:]))]
    if grouping:group_segments(rows,features,times)
    if float(features[:,36].max()) <= 1e-6:
        rows = [{'id':'s1','start':0.,'end':duration,'group':None,'role':None}]
        analysis['status'] = 'insufficient_evidence'
        analysis['diagnostics'].append('No audible structure evidence.')
    analysis.update(segments=rows,grid_signature=hashlib.sha256(json.dumps(edges).encode()).hexdigest()[:16],
        grid_basis=str(grid.get('bar_alignment') or 'supplied bar grid; downbeats unverified') if valid_grid else 'fixed-time fallback',
        parameters={'feature_bins':len(features),'boundary_threshold':round(threshold,4),'group_distance':.18},
        elapsed_seconds=round(time.perf_counter()-started,4))
    return result


def analyze_structure(path, grid=None, grouping=True):
    from pathlib import Path
    from chordpilot_audio import load_audio
    from chordpilot_cache import read_analysis_cache, write_analysis_cache
    from chordpilot_common import options_cache_suffix
    path = Path(path)
    # Only automatic evidence enters this cache, never the caller's manual map.
    safe_grid = {key:grid[key] for key in ('duration','bars','bar_alignment') if key in (grid or {})} if isinstance(grid,dict) else {}
    safe_grid['bars'] = [{'start':bar.get('start')} for bar in safe_grid.get('bars',[]) if isinstance(bar,dict)]
    mode = f'structure-{STRUCTURE_VERSION}-{options_cache_suffix({**safe_grid,"grouping":grouping})}'
    cached = read_analysis_cache(path,mode)
    if cached and cached.get('structure'):
        return cached['structure']
    audio,sr = load_audio(path)
    result = analyze_structure_audio(audio,sr,safe_grid,grouping)
    result['analysis'].update(source_identity(path))
    write_analysis_cache(path,{'structure':result,'analysis_engine':{}},mode)
    return result
