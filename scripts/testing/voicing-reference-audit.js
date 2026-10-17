// Audit saved real-audio snapshots without treating chord labels as voicing ground truth.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { loadScript } = require('../../tests/js/helpers/load-script');

const root = path.resolve(__dirname, '../..');
const args = process.argv.slice(2);
const fresh = args.includes('--fresh');
const source = args.find(arg => arg !== '--fresh')
  || path.join(root, '.chordpilot-data/benchmarks/voicing-reference-probe.json');
const names = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const bars = loadScript('src/renderer/bars.js', ['chordToneSet', 'chordSymbolParts', 'pitchIndex'], {
  PITCH_NAMES: names, ENHARMONIC_TO_PITCH: { DB: 'C#', 'D#': 'Eb', GB: 'F#', 'G#': 'Ab', 'A#': 'Bb' }
});
const { chordVoicing } = loadScript('src/renderer/chord-voicing.js', ['chordVoicing'], bars);
const python = String.raw`
import json, sys
from pathlib import Path
root = Path.cwd()
sys.path.insert(0, str(root / 'backend'))
from chordpilot_study import analyze_range
from chordpilot_common import normalize_analysis_options
audio_names = {'hero':'reference-95s.wav', 'virtual-insanity':'reference-95s.wav',
               'gravity':'gravity.wav', 'overjoyed':'intro-65s.wav', 'september':'september.wav'}
report = {}
for name, audio_name in audio_names.items():
    folder = root / '.chordpilot-data' / 'benchmarks' / name
    fixture = json.loads((root / 'tests' / 'fixtures' / 'chord-references' / (name + '.json')).read_text(encoding='utf-8'))
    stems = {s['name']:s['path'] for s in json.loads((folder / 'stems.json').read_text())['stems'] if s['name'] in ('other','bass')}
    report[name] = []
    for window in fixture['windows']:
        run = analyze_range(str(folder / audio_name), stems, window['start'], window['end'], normalize_analysis_options(fixture['settings']))
        report[name].append({'expected':window['chord'], 'chord':run['chord'],
                             'range':[window['start'],window['end']],
                             'evidence':{'voicing_frames':run['evidence'].get('voicing_frames',[])}})
    print(name + ': ' + str(len(report[name])) + ' windows', file=sys.stderr, flush=True)
print(json.dumps(report))
`;
const scan = fresh ? spawnSync(process.env.PYTHON || 'python', ['-c', python],
  { cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }) : null;
if (scan?.error || (scan && scan.status !== 0)) throw new Error(scan?.stderr || String(scan?.error));
if (scan?.stderr) process.stderr.write(scan.stderr.split(/\r?\n/)
  .filter(line => /: \d+ windows$/.test(line)).join('\n') + '\n');
const runs = JSON.parse(fresh ? scan.stdout : fs.readFileSync(source, 'utf8'));
const results = {};
for (const [name, rows] of Object.entries(runs)) {
  const found = [];
  let snapshots = 0;
  let nonempty = 0;
  let windowsWithPitchEvidence = 0;
  let windowsWithTwoSnapshots = 0;
  for (const row of rows) {
    const frames = row.evidence?.voicing_frames || [];
    snapshots += frames.length;
    nonempty += frames.filter(item => item.midis?.length).length;
    if (frames.some(item => item.midis?.length)) windowsWithPitchEvidence++;
    if (frames.length >= 2) windowsWithTwoSnapshots++;
    const measured = chordVoicing({ evidence: { voicing_frames: frames } }, row.chord);
    const reference = chordVoicing({ evidence: { voicing_frames: frames } }, row.expected);
    if (measured || reference) found.push({ range: row.range, referenceChord: row.expected,
      detectedChord: row.chord, measuredLabel: measured?.label || null,
      referenceLabel: reference?.label || null, midis: measured?.midis || reference?.midis });
  }
  results[name] = { windows: rows.length, snapshots, nonempty, windowsWithPitchEvidence,
    windowsWithTwoSnapshots,
    labeledWithDetectedChord: found.filter(item => item.measuredLabel).length,
    labeledWithReferenceChord: found.filter(item => item.referenceLabel).length, found };
}
console.log(JSON.stringify({ source: fresh ? 'fresh analysis' : source, results }, null, 2));
