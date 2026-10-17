const test = require('node:test');
const assert = require('node:assert/strict');
const { loadScript } = require('./helpers/load-script');

test('pencil editing opens and focuses the inline field and closes back to notation', () => {
  let focused = false, selected = false, expanded;
  const input = { disabled: false, hidden: true, focus() { focused = true; }, select() { selected = true; } };
  const display = { hidden: false };
  const { setDetailChordEditing } = loadScript('src/renderer/bars.js', ['setDetailChordEditing'], {
    state: { selectedIndex: 2, selectedChordEventIndex: 1 },
    elements: { detailChordInput: input, detailChordDisplay: display, detailChordEditBtn: { setAttribute(_name, value) { expanded = value; } } }
  });
  setDetailChordEditing(true);
  assert.equal(input.hidden, false);
  assert.equal(display.hidden, true);
  assert.equal(input._editTarget, '2:1');
  assert.ok(focused && selected);
  assert.equal(expanded, 'true');
  setDetailChordEditing(false);
  assert.equal(input.hidden, true);
  assert.equal(display.hidden, false);
  assert.equal(expanded, 'false');
  input.disabled = true;
  setDetailChordEditing(true);
  assert.equal(input.hidden, true);
});

