const test = require('node:test');
const assert = require('node:assert/strict');
const { loadScript, plain } = require('./helpers/load-script');
const Vex = require('../../src/renderer/vendor/vexflow-bravura-4.2.5.js');

function notation() {
  const bars = loadScript('src/renderer/bars.js', ['chordToneSet', 'pianoLevelMap'], {
    PITCH_NAMES: ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'],
    ENHARMONIC_TO_PITCH: { DB:'C#', 'D#':'Eb', GB:'F#', 'G#':'Ab', 'A#':'Bb' }
  });
  return loadScript('src/renderer/chord-notation.js', ['chordNotationPitches', 'spellNotationPitch', 'renderDetailChordNotation', 'notationKeySignature'], {...bars, Vex});
}

test('six-nine and altered chord tones match detection and keep their spelling', () => {
  const bars = loadScript('src/renderer/bars.js', ['chordToneSet'], {
    PITCH_NAMES: ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'],
    ENHARMONIC_TO_PITCH: {DB:'C#','D#':'Eb',GB:'F#','G#':'Ab','A#':'Bb'}
  });
  for (const [symbol, expected] of [
    ['C6/9/E',['C','E','G','A','D']], ['Cm69',['C','Eb','G','A','D']],
    ['Cdim7',['C','Eb','F#','A']], ['Cmmaj7',['C','Eb','G','B']],
    ['C7b5',['C','E','F#','Bb']], ['C7#5',['C','E','Ab','Bb']], ['C7+5',['C','E','Ab','Bb']],
    ['C7b9',['C','E','G','Bb','C#']], ['C7#11',['C','E','G','Bb','F#']],
    ['C7b13',['C','E','G','Bb','Ab']], ['Cmaj7#11',['C','E','G','B','F#']],
    ['CM7#11',['C','E','G','B','F#']], ['CM7♯11',['C','E','G','B','F#']],
    ['C7(+5)',['C','E','Ab','Bb']],
    ['C9#11/E',['C','E','G','Bb','D','F#']],
    ['C13#11',['C','E','G','Bb','F#','A']],
    ['C13b9',['C','E','G','Bb','C#','A']],
    ['Cm(maj9)',['C','Eb','G','B','D']],
    ['C7b9#11',['C','E','G','Bb','C#','F#']],
    ['C7#9#11',['C','E','G','Bb','Eb','F#']]
  ]) assert.deepEqual([...bars.chordToneSet(symbol)], expected, symbol);
  assert.equal(notation().spellNotationPitch(66,'D6/9/F#').label, 'F♯4');
  assert.equal(notation().spellNotationPitch(68,'C7b13').label, 'A♭4');
  assert.equal(notation().spellNotationPitch(69,'Cdim7').label, 'B♭♭4');
  assert.equal(notation().spellNotationPitch(61,'C13b9').label, 'D♭4');
  assert.equal(notation().spellNotationPitch(66,'C13#11').label, 'F♯4');
});

test('staff uses strong measured chord support, preserves bass octave, and avoids fabricated notes', () => {
  const { chordNotationPitches } = notation();
  const frame = { bassMidi:44, evidence:{ detected_pitches:[
    {midi:44,strength:.05}, {midi:56,strength:1}, {midi:60,strength:.8},
    {midi:63,strength:.6}, {midi:67,strength:.4}, {midi:70,strength:.3},
    {midi:72,strength:.2}, {midi:64,strength:.5}, {midi:79,strength:.0001},
    {midi:200,strength:1}, {midi:44,strength:.01}
  ]}};
  assert.deepEqual(plain(chordNotationPitches(frame,'Abmaj9')), [44,56,60,63,67,70]);
  assert.deepEqual(plain(chordNotationPitches({evidence:{detected_notes:[{note:'Ab',strength:1}]}},'Abmaj9')), []);
  assert.deepEqual(plain(chordNotationPitches(frame,'N.C.')), []);
  assert.deepEqual(plain(chordNotationPitches({evidence:{detected_pitches:{}}},'Abmaj9')), []);
  assert.deepEqual(plain(chordNotationPitches({evidence:{detected_pitches:[null,{midi:60,strength:.5}]}},'Abmaj9')), [60]);
});

test('staff key uses detected/native key, supports minor keys, and can be disabled', () => {
  const { notationKeySignature } = notation();
  assert.equal(notationKeySignature({detected_key:'Ab',key:'D'}),'Ab');
  assert.equal(notationKeySignature({native_key:'F#m'}),'F#m');
  assert.equal(notationKeySignature({key:'E♭ minor'}),'Ebm');
  assert.equal(notationKeySignature({key:'D#'}),'Eb');
  assert.equal(notationKeySignature({key:'Dbm'}),'C#m');
  assert.equal(notationKeySignature({key:'C#'}),'C#');
  assert.equal(notationKeySignature({key:'Am'}),'Am');
  assert.equal(notationKeySignature({detected_key:'Ab'},false),'');
  assert.equal(notationKeySignature({key:'unknown'}),'');
  assert.equal(notationKeySignature(null),'');
});

test('staff cache invalidates when its key or key-signature toggle changes', () => {
  let draws=0;
  const container={replaceChildren(){draws++;},append(){},setAttribute(){},removeAttribute(){}};
  const state={chart:{detected_key:'Ab'},notationUseKeySignature:true};
  const {renderDetailChordNotation}=loadScript('src/renderer/chord-notation.js',['renderDetailChordNotation'],{
    chordToneSet:()=>new Set(),pianoLevelMap:()=>new Map(),Vex,state,
    document:{createElement:()=>({})},elements:{detailChordNotation:container}
  });
  const frame={evidence:{detected_pitches:[]}};
  renderDetailChordNotation(frame,'N.C.');
  renderDetailChordNotation(frame,'N.C.');
  assert.equal(draws,1);
  state.notationUseKeySignature=false;
  renderDetailChordNotation(frame,'N.C.');
  assert.equal(draws,2);
  state.notationUseKeySignature=true;
  state.chart.detected_key='F#m';
  renderDetailChordNotation(frame,'N.C.');
  assert.equal(draws,3);
});

test('empty staff updates between measured, legacy and cleared selections', () => {
  const container = { children:[], replaceChildren(){this.children=[];}, append(node){this.children.push(node);},
    setAttribute(){}, removeAttribute(){} };
  const document = { createElement:()=>({}) };
  const { renderDetailChordNotation } = loadScript('src/renderer/chord-notation.js', ['renderDetailChordNotation'], {
    chordToneSet:()=>new Set(), pianoLevelMap:()=>new Map(), document,
    elements:{ detailChordNotation:container }
  });
  renderDetailChordNotation({evidence:{detected_pitches:[]}},'N.C.');
  assert.equal(container.children[0].textContent,'No measured chord support');
  renderDetailChordNotation({evidence:{}},'N.C.');
  assert.equal(container.children[0].textContent,'Reanalyse for measured octaves');
  renderDetailChordNotation(null,'N.C.');
  assert.equal(container.children.length,0);
});

test('staff spelling preserves chord accidentals, altered ninths, and enharmonic octaves', () => {
  const { spellNotationPitch } = notation();
  assert.deepEqual(plain(spellNotationPitch(61,'Dbmaj7')), {key:'db/4', accidental:'b', label:'D♭4'});
  assert.deepEqual(plain(spellNotationPitch(63,'C7#9')), {key:'d#/4', accidental:'#', label:'D♯4'});
  assert.deepEqual(plain(spellNotationPitch(59,'Cbmaj7')), {key:'cb/4', accidental:'b', label:'C♭4'});
  assert.deepEqual(plain(spellNotationPitch(60,'G#maj7')), {key:'b#/3', accidental:'#', label:'B♯3'});
  assert.deepEqual(plain(spellNotationPitch(63,'C#/Eb')), {key:'eb/4', accidental:'b', label:'E♭4'});
  assert.deepEqual(plain(spellNotationPitch(68,' Dbmaj7 ')), {key:'ab/4', accidental:'b', label:'A♭4'});
  assert.deepEqual(plain(spellNotationPitch(68,'dbmaj7')), {key:'ab/4', accidental:'b', label:'A♭4'});
});
