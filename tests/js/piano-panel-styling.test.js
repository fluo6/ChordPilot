const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..', 'src/renderer');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('generic compact panel controls exclude shared piano keys, including hover and border radius', () => {
  const css = read('prototype-workspace.css');
  assert.ok(css.includes('.prototype-shell :is(.prototype-panel,.home-view,.chart-meta,.source-panel) button:not(.piano-key) {'));
  assert.ok(css.includes('.prototype-panel button:not(.piano-key),.home-panel button:not(.piano-key),.prototype-shortcuts button {'));
  assert.ok(css.includes('.prototype-panel button:not(.piano-key):hover,.home-panel button:not(.piano-key):hover {'));
});

test('Passage Lab and Timeline use the same piano factory and Lab moves the existing component', () => {
  assert.match(read('study.js'), /const piano = createPianoEvidence\(/);
  assert.match(read('bars.js'), /detailKeyboard\?\.replaceChildren\(createPianoEvidence\(/);
  assert.match(read('prototype-workspace.js'), /panel\.lastChild\.append\(piano\)/);
  assert.doesNotMatch(read('prototype-workspace.css'), /\.piano-key\s*\{/);
});
