// Describe observed spacing, never a performer's fingering or hand allocation.
function voicingPattern(midis, symbol, offset = 0) {
  if (!Array.isArray(midis) || midis.length < 3 || midis.length > 5
      || midis.some(m => !Number.isInteger(m) || m < 21 || m > 108)) return '';
  const notes = [...new Set(midis)].sort((a, b) => a - b);
  if (notes.length !== midis.length) return '';
  const tones = new Set([...chordToneSet(symbol)].map(note => (pitchIndex(note) - offset + 120) % 12));
  if (notes.some(m => !tones.has(m % 12))) return '';
  const gaps = notes.slice(1).map((m, i) => m - notes[i]);
  if (gaps.join(',') === '5,5,5,4') return 'quartal · So What shape';
  if (gaps.every(gap => gap === 5)) return 'quartal shape';
  if (notes.length !== 4 || new Set(notes.map(m => m % 12)).size !== 4) return '';
  const rootName = chordSymbolParts(symbol).root.replaceAll('♯', '#').replaceAll('♭', 'b');
  const root = (pitchIndex(rootName) - offset + 120) % 12;
  const has = interval => tones.has((root + interval) % 12);
  const third = has(4) ? 4 : has(3) ? 3 : null;
  const fifth = has(7) ? 7 : has(6) ? 6 : has(8) ? 8 : null;
  const seventh = has(11) ? 11 : has(10) ? 10 : null;
  if (third === null || fifth === null || seventh === null) return '';
  const core = [0,third,fifth,seventh].map(i => (root + i) % 12).sort((a,b) => a-b);
  if (notes.some(m => !core.includes(m % 12))) return '';
  const matches = new Set();
  for (let inversion = 0; inversion < 4; inversion++) {
    const close = [...core.slice(inversion), ...core.slice(0,inversion).map(m => m + 12)];
    for (const drop of [2,3]) {
      const opened = close.map((m,i) => m - (i === 4 - drop ? 12 : 0)).sort((a,b) => a-b);
      if (opened.every((m,i) => m - opened[0] === notes[i] - notes[0])) matches.add(`drop-${drop} pattern`);
    }
  }
  return matches.size === 1 ? [...matches][0] : '';
}

function chordVoicing(frame, symbol, offset = 0) {
  if (!frame || frame.evidence_stale || !Number.isFinite(offset)) return null;
  // Never substitute average pitches: they may combine sequential arpeggio notes.
  const cells = Array.isArray(frame.debug?.cells) ? frame.debug.cells : [];
  const frames = frame.evidence?.voicing_frames ?? cells.flatMap(cell => cell?.evidence?.voicing_frames || []);
  if (!Array.isArray(frames) || frames.length < 2) return null;
  const votes = new Map();
  for (const snapshot of frames) {
    if (!snapshot || !Number.isFinite(snapshot.start) || !Number.isFinite(snapshot.end)
        || snapshot.end <= snapshot.start) continue;
    const pattern = voicingPattern(snapshot.midis, symbol, offset);
    if (!pattern) continue;
    const key = `${pattern}:${[...snapshot.midis].sort((a,b) => a-b).join(',')}`;
    const item = votes.get(key) || { pattern, midis: snapshot.midis, count: 0 };
    item.count++; votes.set(key, item);
  }
  const best = [...votes.values()].sort((a,b) => b.count - a.count)[0];
  if (!best || best.count < 2 || best.count / frames.length < .6) return null;
  return { label: `Possible ${best.pattern}`, midis: [...best.midis].sort((a,b) => a-b),
    support: best.count / frames.length };
}

function renderChordVoicing(container, frame, symbol, offset = 0) {
  if (!container) return;
  const result = chordVoicing(frame, symbol, offset);
  container.hidden = !result;
  container.textContent = result?.label || '';
  const names = ['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];
  container.title = result ? `${result.midis.map(m => `${names[m % 12]}${Math.floor(m / 12) - 1}`).join(' · ')}. Original accompaniment pitches; stable in ${Math.round(result.support * 100)}% of sampled slices. Spacing suggestion, not confirmed fingering.` : '';
}
