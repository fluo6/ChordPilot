const test = require('node:test');
const assert = require('node:assert/strict');
const { loadScript, plain } = require('./helpers/load-script');
const names = ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
const bars = loadScript('src/renderer/bars.js', ['chordToneSet', 'chordSymbolParts', 'pitchIndex'], {
  PITCH_NAMES: names, ENHARMONIC_TO_PITCH: { DB:'C#', 'D#':'Eb', GB:'F#', 'G#':'Ab', 'A#':'Bb' }
});
const { chordVoicing, voicingPattern, renderChordVoicing } = loadScript('src/renderer/chord-voicing.js', ['chordVoicing', 'voicingPattern', 'renderChordVoicing'], bars);
const frame = (midis, count = 4) => ({ evidence: { voicing_frames: Array.from({length: count}, (_, i) => ({
  start: i * .16, end: i * .16 + .32, midis
})) }});

test('So What and quartal shapes preserve actual registers in every key', () => {
  for (let shift = 0; shift < 12; shift++) {
    const midis = [50,55,60,65,69].map(midi => midi + shift);
    const result = chordVoicing(frame(midis), `${names[(2 + shift) % 12]}m11`);
    assert.equal(result.label, 'Possible quartal · So What shape');
    assert.deepEqual(plain(result.midis), midis);
    assert.equal(chordVoicing(frame(midis.slice(0,3)), `${names[(2 + shift) % 12]}m11`).label, 'Possible quartal shape');
  }
  assert.equal(chordVoicing(frame([50,55,60,65,81]), 'Dm11'), null);
  assert.equal(chordVoicing(frame([50,55,60,65,69]), 'D'), null);
});

test('drop patterns use four actual upper voices and ignore independent bass evidence', () => {
  for (let shift = 0; shift < 12; shift++) {
    for (const [midis, label] of [[[55,60,64,71], 'Possible drop-2 pattern'], [[52,60,67,71], 'Possible drop-3 pattern']]) {
      const input = frame(midis.map(m => m + shift));
      input.bass_reference = { midi: 36 + shift, confidence: .95, detected_pitches: [{midi:36+shift,strength:1}] };
      assert.equal(chordVoicing(input, `${names[shift]}maj7`).label, label);
    }
  }
  assert.equal(chordVoicing(frame([60,64,67,71]), 'Cmaj7'), null);
  assert.equal(chordVoicing(frame([36,55,60,64,71]), 'Cmaj7'), null);
  assert.equal(chordVoicing(frame([55,60,64,71]), 'Cm7'), null);
});

test('legacy averages, mixed voicings, short support and stale evidence abstain', () => {
  assert.equal(chordVoicing({ evidence: {detected_pitches: [50,55,60,65,69].map(midi => ({midi,strength:.2}))} }, 'Dm11'), null);
  assert.equal(chordVoicing(frame([50,55,60,65,69], 1), 'Dm11'), null);
  const mixed = frame([50,55,60,65,69]);
  mixed.evidence.voicing_frames[0].midis = [];
  mixed.evidence.voicing_frames[1].midis = [];
  assert.equal(chordVoicing(mixed, 'Dm11'), null);
  assert.equal(chordVoicing({...frame([50,55,60,65,69]), evidence_stale: true}, 'Dm11'), null);
  assert.equal(chordVoicing(frame([50,55,60,65,69]), 'N.C.'), null);
  assert.equal(chordVoicing({debug:{cells:{}}}, 'Dm11'), null);
  assert.equal(chordVoicing({evidence:{voicing_frames:{}}}, 'Dm11'), null);
});

test('cell snapshots survive grouping without combining sequential note sets', () => {
  const input = {debug: {cells: [frame([50,55,60,65,69], 2), frame([50,55,60,65,69], 2)]}};
  assert.equal(chordVoicing(input, 'Dm11').label, 'Possible quartal · So What shape');
  const sequential = {debug: {cells: [frame([50,55]),frame([60,65,69])]}};
  assert.equal(chordVoicing(sequential, 'Dm11'), null);
  const grouped = { ...frame([50,55,60,65,69]), debug: { cells: [{evidence:{voicing_frames:[]}}] } };
  assert.equal(chordVoicing(grouped, 'Dm11').label, 'Possible quartal · So What shape');
});

test('chart transposition compares original audio evidence with its original chord', () => {
  assert.equal(chordVoicing(frame([50,55,60,65,69]), 'Em11', 2).label, 'Possible quartal · So What shape');
  assert.equal(chordVoicing(frame([50,55,60,65,69]), 'Em11', 0), null);
});

test('subtitle exposes measured notes and clears when evidence becomes unavailable', () => {
  const container = {};
  renderChordVoicing(container, frame([50,55,60,65,69]), 'Dm11');
  assert.equal(container.hidden, false);
  assert.equal(container.textContent, 'Possible quartal · So What shape');
  assert.match(container.title, /D3.*G3.*C4.*F4.*A4/);
  renderChordVoicing(container, null, 'N.C.');
  assert.equal(container.hidden, true);
  assert.equal(container.textContent, '');
  assert.equal(container.title, '');
  assert.equal(chordVoicing(frame([48,60,67,72]), 'C'), null); // harmonic/octave doublings
});
