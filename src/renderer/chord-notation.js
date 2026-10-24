function chordNotationPitches(frame, symbol) {
  const tones = chordToneSet(symbol);
  if (!tones.size) return [];
  const strengths = new Map();
  const pitches = Array.isArray(frame?.evidence?.detected_pitches) ? frame.evidence.detected_pitches : [];
  for (const pitch of pitches) {
    if (!pitch || typeof pitch !== 'object') continue;
    if (Number.isInteger(pitch.midi) && pitch.midi >= 21 && pitch.midi <= 108
      && Number.isFinite(pitch.strength) && pitch.strength > 0) {
      strengths.set(pitch.midi, Math.max(strengths.get(pitch.midi) || 0, pitch.strength));
    }
  }
  const levels = pianoLevelMap(frame?.evidence, strengths, true);
  const strongest = new Map();
  const names = ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
  for (const [midi, strength] of strengths) {
    if (!tones.has(names[midi % 12]) || levels.get(midi) < -24) continue;
    const previous = strongest.get(midi % 12);
    if (previous === undefined || strength > strengths.get(previous)) strongest.set(midi % 12, midi);
  }
  // Keep the independently measured bass octave, even if an upper doubling is stronger.
  const midis = new Set(strongest.values());
  if (strengths.has(frame?.bassMidi)) midis.add(frame.bassMidi);
  return [...midis].sort((a, b) => a - b);
}

function spellNotationPitch(midi, symbol) {
  const letters = 'CDEFGAB';
  const natural = [0,2,4,5,7,9,11];
  const clean = String(symbol).trim().replaceAll('♭','b').replaceAll('♯','#')
    .replace(/^([a-g])/, letter => letter.toUpperCase()).replace(/\/([a-g])/, (_, letter) => `/${letter.toUpperCase()}`);
  const match = /^([A-G])([#b]?)(.*?)(?:\/([A-G])([#b]?))?$/.exec(clean);
  const rootLetter = match ? letters.indexOf(match[1]) : 0;
  const root = (natural[rootLetter] + (match?.[2] === '#' ? 1 : match?.[2] === 'b' ? -1 : 0) + 12) % 12;
  const interval = (midi % 12 - root + 12) % 12;
  const degrees = [0,1,1,2,2,3,4,4,4,5,6,6];
  if (match?.[3].includes('#9')) degrees[3] = 1;
  if (match?.[3].includes('#11')) degrees[6] = 3;
  if (match?.[3].includes('b13')) degrees[8] = 5;
  if (/^(dim|°|o)/.test(match?.[3] || '')) degrees[9] = 6;
  let letter = (rootLetter + degrees[interval]) % 7;
  if (match?.[4]) {
    const bassLetter = letters.indexOf(match[4]);
    const bass = (natural[bassLetter] + (match[5] === '#' ? 1 : match[5] === 'b' ? -1 : 0) + 12) % 12;
    if (midi % 12 === bass) letter = bassLetter;
  }
  let alteration = (midi % 12 - natural[letter] + 12) % 12;
  if (alteration > 6) alteration -= 12;
  const accidental = alteration > 0 ? '#'.repeat(alteration) : 'b'.repeat(-alteration);
  const octave = Math.floor((midi - alteration) / 12) - 1;
  return { key: `${letters[letter].toLowerCase()}${accidental}/${octave}`, accidental,
    label: `${letters[letter]}${accidental.replaceAll('#','♯').replaceAll('b','♭')}${octave}` };
}

function notationKeySignature(chart, enabled = true) {
  if (!enabled) return '';
  const text = String(chart?.detected_key || chart?.native_key || chart?.key || '').trim()
    .replaceAll('♭','b').replaceAll('♯','#');
  const match = /^([A-Ga-g])([#b]?)(?:\s*(m|minor|major))?$/i.exec(text);
  if (!match) return '';
  let key = `${match[1].toUpperCase()}${match[2]}${['m','minor'].includes(match[3]?.toLowerCase()) ? 'm' : ''}`;
  const aliases = { 'D#':'Eb','G#':'Ab','A#':'Bb','E#':'F','B#':'C','Fb':'E',
    Dbm:'C#m',Gbm:'F#m',Cbm:'Bm',Fbm:'Em','E#m':'Fm','B#m':'Cm' };
  key = aliases[key] || key;
  try { Vex.Flow.keySignature(key); return key; } catch (_) { return ''; }
}

function renderDetailChordNotation(frame, symbol) {
  const container = elements.detailChordNotation;
  if (!container) return;
  const chart = typeof state !== 'undefined' ? state.chart : null;
  const useKey = typeof state === 'undefined' || state.notationUseKeySignature !== false;
  const detectedKey = notationKeySignature(chart);
  const keySignature = useKey ? detectedKey : '';
  if (elements.detailKeySignatureInput) {
    elements.detailKeySignatureInput.checked = useKey;
    elements.detailKeySignatureInput.disabled = !detectedKey;
    elements.detailKeySignatureInput.setAttribute('aria-label', detectedKey ? `Use key signature: ${detectedKey}` : 'No key available');
  }
  if (elements.detailKeySignatureLabel) elements.detailKeySignatureLabel.textContent = detectedKey
    ? `Key: ${detectedKey.replace('#','♯').replace('b','♭')}` : 'No key';
  const midis = chordNotationPitches(frame, symbol);
  const signature = JSON.stringify([Boolean(frame), symbol, midis, frame?.bassMidi,
    Array.isArray(frame?.evidence?.detected_pitches), keySignature]);
  if (container._notationSignature === signature) return;
  container._notationSignature = signature;
  container.replaceChildren();
  container.title = '';
  if (!frame) { container.removeAttribute('aria-label'); return; }
  if (!midis.length) {
    const empty = document.createElement('span');
    empty.className = 'chord-notation-empty';
    empty.textContent = Array.isArray(frame.evidence?.detected_pitches)
      ? 'No measured chord support' : 'Reanalyse for measured octaves';
    container.append(empty);
    container.setAttribute('aria-label', empty.textContent);
    return;
  }
  const spelled = midis.map(midi => ({ ...spellNotationPitch(midi, symbol), midi }));
  const label = `${keySignature ? `Key signature ${keySignature}. ` : ''}Chord support: ${spelled.map(pitch => pitch.label).join(', ')}`;
  container.setAttribute('aria-label', label);
  container.title = `${label}. Strongest measured octave per chord tone (at least −24 dB), plus measured bass. Whole-note heads indicate pitches, not duration.`;
  try {
    const { Renderer, Stave, StaveNote, StaveConnector, Voice, Formatter, Accidental } = Vex.Flow;
    // A compact grand staff keeps the glyphs legible in the narrow inspector.
    const treble = new Stave(10, 30, 180).addClef('treble');
    const bass = new Stave(10, 150, 180).addClef('bass');
    if (keySignature) [treble, bass].forEach(stave => stave.addKeySignature(keySignature));
    const noteStart = Math.max(treble.getNoteStartX(), bass.getNoteStartX());
    // Allow extra room for wide key signatures and chord accidentals.
    const width = Math.max(200, noteStart + 90);
    const renderer = new Renderer(container, Renderer.Backends.SVG);
    renderer.resize(width, 260);
    const context = renderer.getContext();
    context.setFillStyle('#d8e1ec'); context.setStrokeStyle('#8d9caf');
    [treble, bass].forEach(stave => { stave.setWidth(width - 20); stave.setNoteStartX(noteStart); stave.setContext(context).draw(); });
    new StaveConnector(treble, bass).setType(StaveConnector.type.BRACE).setContext(context).draw();
    const voices = [], notes = [];
    for (const [clef, stave, pitches] of [
      ['treble', treble, spelled.filter(pitch => pitch.midi >= 60)],
      ['bass', bass, spelled.filter(pitch => pitch.midi < 60)]
    ]) {
      if (!pitches.length) continue;
      const note = new StaveNote({ clef, keys: pitches.map(pitch => pitch.key), duration: 'w', align_center: true });
      pitches.forEach((pitch, index) => {
        if (pitch.midi === frame.bassMidi) note.setKeyStyle(index, { fillStyle: '#f6c65b', strokeStyle: '#f6c65b' });
      });
      note.setStave(stave);
      notes.push(note);
      voices.push({ stave, voice: new Voice({ num_beats: 4, beat_value: 4 }).addTickables([note]) });
    }
    const allVoices = voices.map(item => item.voice);
    // Each stave has its own accidental state; a fresh chord resets to its key.
    allVoices.forEach(voice => Accidental.applyAccidentals([voice], keySignature || 'C'));
    new Formatter().joinVoices(allVoices).format(allVoices, width - noteStart - 20);
    voices.forEach(({ voice, stave }) => voice.draw(context, stave));
    const ys = notes.flatMap(note => note.getYs());
    const top = Math.min(10, ...ys.map(y => y - 24));
    const bottom = Math.max(250, ...ys.map(y => y + 24));
    const svg = container.querySelector('svg');
    svg.setAttribute('viewBox', `0 ${top} ${width} ${bottom - top}`);
    svg.setAttribute('height', String(bottom - top));
    svg.setAttribute('aria-hidden', 'true');
  } catch (error) {
    container.replaceChildren();
    container.textContent = spelled.map(pitch => pitch.label).join(' · ');
    console.warn('Chord staff unavailable:', error.message);
  }
}
