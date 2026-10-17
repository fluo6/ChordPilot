const test = require('node:test');
const assert = require('node:assert/strict');
const { loadScript, plain } = require('./helpers/load-script');

function display(preferences = {}, chart = { key: 'C' }, storage = {}) {
  const state = { chart, chordDisplayPreferences: preferences };
  return loadScript('src/renderer/chord-display.js', [
    'formatChordDisplay', 'formatChordDisplayParts', 'normalizeChordDisplayPreferences', 'initializeChordDisplay'
  ], { state, elements: {}, localStorage: { getItem: () => storage.value || null, setItem: (_, value) => { storage.value = value; } } });
}

test('text and jazz spellings preserve chord identity and slash bass', () => {
  const text = display();
  assert.equal(text.formatChordDisplay('Dm11'), 'Dm11');
  const jazz = display({ style: 'jazz' });
  for (const [input, expected] of [['Dm11','D−11'],['Cmaj9/E','CΔ9/E'],['Bm7b5','Bø7'],['Bdim7','B°7'],['Caug','C+'],['Cmmaj7','C−Δ7'],['Cmmaj9','C−Δ9'],['C13b9','C13b9'],['C7b9#11','C7b9#11'],['C6/9/E','C6/9/E'],['N.C.','N.C.']]) {
    assert.equal(jazz.formatChordDisplay(input), expected);
  }
});

test('number roots and inversions use the supplied key without changing quality', () => {
  const numbers = display({ roots: 'tonic' });
  assert.equal(numbers.formatChordDisplay('Dm11'), '2m11');
  assert.equal(numbers.formatChordDisplay('F/A'), '4/6');
  assert.equal(numbers.formatChordDisplay('Eb7#9'), '♭3 7#9');
  assert.equal(numbers.formatChordDisplay('Dm11', 'D'), '1m11');
  assert.equal(display({roots:'tonic',style:'jazz'}).formatChordDisplay('Dm11'), '2−11');
  assert.equal(numbers.formatChordDisplay('C6/9/E'), '1 6/9/3');
});

test('minor tonic and relative-major numbering are both supported', () => {
  assert.equal(display({roots:'tonic'}, {key:'Am'}).formatChordDisplay('Am7'), '1m7');
  assert.equal(display({roots:'relative'}, {key:'Am'}).formatChordDisplay('Am7'), '6m7');
  assert.equal(display({roots:'relative'}, {key:'C#m'}).formatChordDisplay('C#m7'), '6m7');
  assert.equal(display({roots:'relative'}, {key:'E♭ minor'}).formatChordDisplay('Ebm7'), '6m7');
});

test('number notation falls back to letters without a valid key', () => {
  assert.equal(display({roots:'tonic'}, null).formatChordDisplay('Dm11'), 'Dm11');
  assert.equal(display({roots:'tonic'}, {key:'unknown'}).formatChordDisplay('Dm11'), 'Dm11');
});

test('six-nine aliases display consistently without confusing inversion bass', () => {
  assert.equal(display().formatChordDisplay('C69/E'), 'C6/9/E');
  assert.equal(display({style:'jazz'}).formatChordDisplay('Cm69/G'), 'C−6/9/G');
  assert.equal(display({roots:'tonic'}).formatChordDisplay('C69/E'), '1 6/9/3');
});

test('display preferences survive reload and tolerate invalid stored values', () => {
  const d = display({}, null, {value:'{"style":"jazz","roots":"relative"}'});
  d.initializeChordDisplay();
  assert.equal(d.formatChordDisplay('Dm11','C'), '2−11');
  assert.deepEqual(plain(d.normalizeChordDisplayPreferences({style:'bad',roots:'bad'})), {style:'text',roots:'letters'});
  assert.doesNotThrow(() => display({}, null, {value:'broken json'}).initializeChordDisplay());
});

test('chart labels use the preference while stored chord names remain canonical', () => {
  const state = {chart:{key:'C',analysis_engine:{options:{simplify_chords:false}}},chordDisplayPreferences:{style:'jazz',roots:'tonic'}};
  const formatter = loadScript('src/renderer/chord-display.js',['formatChordDisplay'],{state});
  const bars = loadScript('src/renderer/bars.js',['barChordText','displayChordSymbol'],{state,elements:{},formatChordDisplay:formatter.formatChordDisplay});
  const bar = {chord:'Dm11',confidence:.9,alternatives:[]};
  const before = JSON.stringify(bar);
  assert.equal(bars.barChordText(bar),'2−11');
  assert.equal(JSON.stringify(bar),before);
  state.chordDisplayPreferences={style:'text',roots:'letters'};
  assert.equal(bars.barChordText(bar),'Dm11');
});
