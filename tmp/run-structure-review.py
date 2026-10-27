"""Fresh headless predictions and separate review sessions; never edits inputs."""
import copy
import hashlib
import json
import os
import pathlib
import shutil
import subprocess
import sys
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'outputs/song-structure/headless-2026-10-25'
OUT.mkdir(parents=True, exist_ok=True)
(OUT / 'media').mkdir(exist_ok=True)
sys.path.insert(0, str(ROOT / 'backend'))
from chordpilot_structure import STRUCTURE_VERSION, project_sections, validate_segments

TRACKS = [
    ('overjoyed', 'Overjoyed', 'Stevie Wonder', 'outputs/Overjoyed - Drum Sheet.chordpilot-session.json'),
    ('waste-of-time', 'Waste of Time', '9m88', 'outputs/Waste Of Time - Drum Sheet.chordpilot-session.json'),
    ('i-love-you-3000', 'I Love You 3000', 'Stephanie Poetri', 'outputs/iloveyou3000-timing/updated.chordpilot-session.json'),
    ('ballad', 'Ballad / 輸情歌', 'J.Sheon', 'outputs/session-refresh/2026-10-19/ballad.chordpilot-session.json'),
    ('liangbo', '曾经是情侣', '梁博 / Liang Bo', 'outputs/session-refresh/2026-10-19-liangbo/liangbo.chordpilot-session.json'),
]

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

run = datetime.now(timezone.utc).isoformat()
cache = ROOT / 'tmp' / ('structure-review-cache-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%f'))
env = {**os.environ, 'PYTHONIOENCODING': 'utf-8', 'CHORDPILOT_CACHE_DIR': str(cache)}
manifest = {'algorithm': STRUCTURE_VERSION, 'created_at': run, 'scope': 'Fresh structure-only inference on original full mixes, with existing bar grids. No independent references; outputs are unverified estimates.', 'tracks': []}

for slug, title, artist, relative in TRACKS:
    source_session = ROOT / relative
    before = digest(source_session)
    session = json.loads(source_session.read_text(encoding='utf-8-sig'))
    chart = session['chart']
    source = pathlib.Path(chart['source_path'])
    assert source.is_file(), source
    report_path = OUT / (slug + '.report.json')
    command = [sys.executable, str(ROOT / 'scripts/testing/structure-benchmark.py'), '--audio', str(source), '--grid', str(source_session), '--output', str(report_path)]
    completed = subprocess.run(command, cwd=ROOT, env=env, capture_output=True, text=True, encoding='utf-8')
    (OUT / (slug + '.run.log')).write_text(completed.stdout + '\n' + completed.stderr, encoding='utf-8')
    if completed.returncode:
        raise RuntimeError(slug + ': ' + completed.stderr[-2000:])
    assert 'cache: analysis miss' in completed.stderr, 'Expected a fresh prediction, not a cache hit'
    report = json.loads(report_path.read_text(encoding='utf-8'))
    structure = report['prediction']
    segments = structure['analysis']['segments']
    assert validate_segments(segments, chart['duration']), slug
    assert all(row.get('role') is None for row in segments)
    original_chart = copy.deepcopy(chart)
    chart['structure'] = structure
    project_sections(chart)
    # Everything outside the new interval map and its bar-heading projection
    # must be equal to the original, including chord/drum/timing detail.
    checked = copy.deepcopy(chart)
    checked.pop('structure', None)
    original_chart.pop('structure', None)
    for value in (checked, original_chart):
        for bar in value.get('bars', []):
            bar.pop('section', None)
            bar.pop('section_id', None)
    assert checked == original_chart, 'Structure refresh changed unrelated chart data'
    session['saved_at'] = run
    session_file = slug + '.chordpilot-session.json'
    (OUT / session_file).write_text(json.dumps(session, ensure_ascii=False, indent=2, allow_nan=False), encoding='utf-8')
    media_file = 'media/' + slug + source.suffix.lower()
    shutil.copyfile(source, OUT / media_file)
    assert digest(OUT / media_file) == structure['analysis']['source_hash']
    assert digest(source_session) == before, 'Input session changed'
    rows = []
    bars = chart['bars']
    for i, row in enumerate(segments):
        start_bar = 1 if row['start'] == 0 else min(range(len(bars)), key=lambda b: abs(float(bars[b]['start']) - row['start'])) + 1
        rows.append({**row, 'occurrence': i+1, 'start_bar': start_bar})
    track = {'id': slug, 'title': title, 'artist': artist, 'duration': chart['duration'], 'bar_count': len(bars), 'segments': rows, 'groups': sorted({row['group'] for row in rows if row.get('group')}), 'status': structure['analysis']['status'], 'diagnostics': structure['analysis'].get('diagnostics', []), 'grid_basis': structure['analysis'].get('grid_basis'), 'media': media_file, 'session': session_file, 'report': report_path.name, 'original_session': relative, 'original_session_sha256': before, 'elapsed_seconds': round(report['elapsed_seconds'], 3), 'source_hash': structure['analysis']['source_hash']}
    manifest['tracks'].append(track)
    print(json.dumps({key: track[key] for key in ('id', 'status', 'duration', 'groups', 'elapsed_seconds')} | {'sections': len(rows)}, ensure_ascii=True), flush=True)

(OUT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2, allow_nan=False), encoding='utf-8')
print(str(OUT), flush=True)
