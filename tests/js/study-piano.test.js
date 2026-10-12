const test = require("node:test");
const assert = require("node:assert/strict");
const { loadScript } = require("./helpers/load-script");

function piano(evidence, options, playPianoNote = () => {}) {
  function node(tagName) {
    const value = { tagName, children: [], dataset: {}, listeners: {}, attributes: {}, style: { setProperty() {} },
      addEventListener(name, handler) { this.listeners[name] = handler; },
      setAttribute(name, value) { this.attributes[name] = value; },
      append(...items) { this.children.push(...items); }, appendChild(item) { this.children.push(item); } };
    const flags = new Set();
    value.classList = { toggle(name, enabled) { enabled ? flags.add(name) : flags.delete(name); }, contains(name) { return flags.has(name); } };
    return value;
  }
  const { createPianoEvidence } = loadScript("src/renderer/bars.js", ["createPianoEvidence"], {
    document: { createElement: node }, playPianoNote, formatConfidence: (value) => `${Math.round(value * 100)}%`,
    PITCH_NAMES: ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"],
    ENHARMONIC_TO_PITCH: { DB: "C#", "D#": "Eb", GB: "F#", "G#": "Ab", "A#": "Bb" },
    WHITE_KEYS: ["C", "D", "E", "F", "G", "A", "B"],
    BLACK_KEYS: [{ note: "C#", afterWhite: 0 }, { note: "Eb", afterWhite: 1 }, { note: "F#", afterWhite: 3 }, { note: "Ab", afterWhite: 4 }, { note: "Bb", afterWhite: 5 }], PIANO_OCTAVES: [3, 4]
  });
  const rendered = createPianoEvidence({ chord: "C", evidence }, "C", options);
  const all = (root) => [root, ...root.children.flatMap(all)];
  return all(rendered).filter((key) => key.className?.includes("piano-key "));
}

test("study piano spans 88 keys and highlights only measured MIDI pitches", () => {
  const keys = piano({ detected_pitches: [{ midi: 60, note: "C4", strength: .5 }, { midi: 61, note: "C#4", strength: .3 }, { midi: 40, note: "E2", strength: .2 }], detected_notes: [{ note: "C", strength: .5 }] }, { exactPitches: true, bassMidi: 40 });
  assert.equal(keys.length, 88);
  const byMidi = (midi) => keys.find((key) => Number(key.dataset.midi) === midi);
  assert.equal(byMidi(60).classList.contains("detected"), true);
  assert.equal(byMidi(61).classList.contains("detected"), true);
  assert.equal(byMidi(48).classList.contains("detected"), false);
  assert.equal(byMidi(72).classList.contains("detected"), false);
  assert.equal(byMidi(72).classList.contains("chord-tone"), false);
  assert.equal(byMidi(40).classList.contains("bass-tone"), true);
  assert.equal(byMidi(52).classList.contains("bass-tone"), false);
  assert.equal(byMidi(61).children[0].textContent, "C#4");
  assert.ok(byMidi(21)); assert.ok(byMidi(108));
});

test("legacy pitch class evidence does not invent octaves", () => {
  const keys = piano({ detected_notes: [{ note: "C", strength: .5 }] }, { pitchClassesOnly: true });
  assert.equal(keys.length, 12);
  assert.equal(keys.find((key) => key.className.includes("white-key")).children[0].textContent, "C");
});

test("all piano keys are accessible buttons that audition their exact MIDI pitch", () => {
  const played = [];
  const keys = piano({}, { exactPitches: true }, (midi) => played.push(midi));
  for (const midi of [21, 60, 61, 108]) {
    const key = keys.find((item) => Number(item.dataset.midi) === midi);
    assert.equal(key.tagName, "button");
    assert.equal(key.type, "button");
    assert.match(key.attributes["aria-label"], /^Play /);
    let stopped = false;
    key.listeners.keydown({ code: "Space", key: " ", stopPropagation() { stopped = true; } });
    assert.equal(stopped, true);
    key.listeners.click();
  }
  assert.deepEqual(played, [21, 60, 61, 108]);
});
