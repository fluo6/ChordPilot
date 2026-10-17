const test = require("node:test");
const assert = require("node:assert/strict");
const { loadScript } = require("./helpers/load-script");

function piano(evidence, options, playPianoNote = () => {}, playPianoNotes = () => {}) {
  function node(tagName) {
    const value = { tagName, children: [], dataset: {}, listeners: {}, attributes: {}, style: { setProperty(name, value) { this[name] = value; } },
      addEventListener(name, handler) { this.listeners[name] = handler; },
      setAttribute(name, value) { this.attributes[name] = value; },
      append(...items) { this.children.push(...items); }, appendChild(item) { this.children.push(item); } };
    const flags = new Set();
    value.classList = { toggle(name, enabled) { enabled ? flags.add(name) : flags.delete(name); }, contains(name) { return flags.has(name); } };
    return value;
  }
  const { createPianoEvidence } = loadScript("src/renderer/bars.js", ["createPianoEvidence"], {
    document: { createElement: node }, playPianoNote, playPianoNotes, formatConfidence: (value) => `${Math.round(value * 100)}%`,
    PITCH_NAMES: ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"],
    ENHARMONIC_TO_PITCH: { DB: "C#", "D#": "Eb", GB: "F#", "G#": "Ab", "A#": "Bb" },
    WHITE_KEYS: ["C", "D", "E", "F", "G", "A", "B"],
    BLACK_KEYS: [{ note: "C#", afterWhite: 0 }, { note: "Eb", afterWhite: 1 }, { note: "F#", afterWhite: 3 }, { note: "Ab", afterWhite: 4 }, { note: "Bb", afterWhite: 5 }], PIANO_OCTAVES: [3, 4]
  });
  const chord = options?.chord || "C";
  const rendered = createPianoEvidence({ chord, evidence }, chord, options);
  const all = (root) => [root, ...root.children.flatMap(all)];
  const nodes = all(rendered);
  const keys = nodes.filter((key) => key.className?.includes("piano-key "));
  keys.playButton = nodes.find((key) => key.className === "piano-play-detected");
  return keys;
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

test('legacy Beat Detail stays a pitch-class view even with a requested octave range', () => {
  const keys = piano({ detected_notes: [{ note: 'C', strength: .5 }] },
    { stabilized: true, pitchClassesOnly: true, octaves: [1, 2, 3, 4] });
  assert.equal(keys.length, 12);
  assert.equal(keys.filter(key => key.classList.contains('detected')).length, 1);
  assert.equal(keys.find(key => key.className.includes('white-key')).children[0].textContent, 'C');
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

test("play detected notes uses measured octaves, deduplicates notes, and disables empty evidence", () => {
  const played = [];
  const keys = piano({ detected_pitches: [{ midi: 40, strength: .2 }, { midi: 60, strength: .5 }, { midi: 60, strength: .3 }, { midi: 61, strength: .2 }] }, { exactPitches: true }, undefined, (midis) => played.push([...midis]));
  assert.equal(keys.playButton.textContent, "Play detected notes");
  assert.equal(keys.playButton.disabled, false);
  keys.playButton.listeners.click();
  assert.deepEqual(played, [[40, 60, 61]]);
  assert.equal(piano({}, { exactPitches: true }).playButton.disabled, true);
});

test('spectral dB controls key styling, key audition, and group playback', () => {
  const played = [], groups = [];
  const keys = piano({ detected_notes: [{ note: 'C', strength: .5 }, { note: 'E', strength: .4 }],
    spectrum: { peaks: [{ midi: 60, level_db: 0 }, { midi: 64, level_db: -20 }] } }, {},
    (midi, db) => played.push([midi, db]), (midis, levels) => groups.push({ midis: [...midis], levels }));
  const c = keys.find(key => Number(key.dataset.midi) === 48);
  const e = keys.find(key => Number(key.dataset.midi) === 52);
  assert.ok(Number(c.style['--note-strength']) > Number(e.style['--note-strength']));
  assert.match(e.title, /-20.*dB/);
  e.listeners.click();
  assert.deepEqual(played, [[52, -20]]);
  keys.playButton.listeners.click();
  assert.equal(groups[0].levels[48], 0);
  assert.equal(groups[0].levels[52], -20);
});

test('Beat Detail extends the shared keyboard down to C1 and retains chord-tone outlines', () => {
  const keys = piano({ detected_notes: [{ note: 'C', strength: .4 }, { note: 'E', strength: .3 }, { note: 'F#', strength: .2 }] }, { stabilized: true });
  assert.equal(keys.length, 48);
  assert.equal(keys.find(key => Number(key.dataset.midi) === 24).children[0].textContent, 'C1');
  assert.equal(keys.find(key => Number(key.dataset.midi) === 36).children[0].textContent, 'C2');
  assert.equal(keys.find(key => Number(key.dataset.midi) === 47).children[0].textContent, 'B2');
  assert.equal(keys.find(key => Number(key.dataset.midi) === 48).children[0].textContent, 'C3');
  assert.equal(keys.find(key => Number(key.dataset.midi) === 60).children[0].textContent, 'C4');
  assert.equal(keys.find(key => Number(key.dataset.midi) === 48).classList.contains('chord-tone'), true);
  assert.equal(keys.find(key => Number(key.dataset.midi) === 54).classList.contains('chord-tone'), false);
  assert.equal(keys.find(key => Number(key.dataset.midi) === 54).classList.contains('detected'), true);
  assert.equal(keys.find(key => Number(key.dataset.midi) === 55).classList.contains('detected'), false);
});

test('Beat Detail emphasizes measured chord support while retaining muted and weak evidence', () => {
  const played = [];
  const keys = piano({ detected_notes: [{ note: 'C', strength: .5 }, { note: 'E', strength: .1 }, { note: 'F#', strength: .4 }],
    spectrum: { peaks: [{ midi: 60, level_db: 0 }, { midi: 64, level_db: -32 }, { midi: 66, level_db: -3 }] } },
    { stabilized: true }, (midi, db) => played.push([midi, db]));
  const c = keys.find(key => Number(key.dataset.midi) === 48);
  const e = keys.find(key => Number(key.dataset.midi) === 52);
  const fs = keys.find(key => Number(key.dataset.midi) === 54);
  assert.equal(c.classList.contains('support-highlight'), true);
  assert.equal(e.classList.contains('support-highlight'), false);
  assert.equal(fs.classList.contains('support-highlight'), false);
  assert.equal(fs.classList.contains('detected'), true);
  assert.ok(Number(fs.style['--note-strength']) < Number(c.style['--note-strength']) * .2);
  assert.ok(Number(e.style['--note-strength']) <= .05);
  fs.listeners.click();
  assert.deepEqual(played, [[54, -3]]);
});

test('C1–B4 uses measured Ab1 rather than copying Ab across octaves', () => {
  const keys = piano({ detected_pitches: [{ midi: 32, note: 'Ab1', strength: .5 }, { midi: 63, note: 'Eb4', strength: .5 }] },
    { exactPitches: true, stabilized: true, octaves: [1, 2, 3, 4], chord: 'Abmaj9', bassMidi: 32 });
  assert.equal(keys.length, 48);
  assert.ok(keys.find(key => Number(key.dataset.midi) === 24));
  assert.ok(keys.find(key => Number(key.dataset.midi) === 71));
  const ab = keys.find(key => Number(key.dataset.midi) === 32);
  assert.equal(ab.classList.contains('detected'), true);
  assert.equal(ab.classList.contains('bass-tone'), true);
  assert.equal(ab.classList.contains('support-highlight'), true);
  assert.equal(keys.find(key => Number(key.dataset.midi) === 44).classList.contains('detected'), false);
});

test('the same evidence has matching highlighting in Beat Detail and Local Study', () => {
  const evidence = { detected_pitches: [{ midi: 60, strength: .5 }, { midi: 64, strength: .02 }, { midi: 66, strength: .4 }] };
  const detail = piano(evidence, { exactPitches: true, stabilized: true, octaves: [1, 2, 3, 4] });
  const local = piano(evidence, { exactPitches: true, focusEvidence: true });
  for (const midi of [60, 64, 66]) {
    const a = detail.find(key => Number(key.dataset.midi) === midi);
    const b = local.find(key => Number(key.dataset.midi) === midi);
    assert.equal(a.style['--note-strength'], b.style['--note-strength']);
    assert.equal(a.classList.contains('support-highlight'), b.classList.contains('support-highlight'));
  }
});
