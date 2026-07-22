const test = require("node:test");
const assert = require("node:assert/strict");
const { loadScript, plain } = require("./helpers/load-script");

test("keyboard typing-target detection covers editable controls", () => {
  const { isTypingTarget } = loadScript("src/renderer/keyboard.js", ["isTypingTarget"], {});
  for (const tagName of ["INPUT", "textarea", "Select"]) {
    assert.equal(isTypingTarget({ tagName }), true);
  }
  assert.equal(isTypingTarget({ tagName: "DIV", isContentEditable: true }), true);
  assert.equal(isTypingTarget({ tagName: "BUTTON" }), false);
  assert.equal(isTypingTarget(null), false);
});

test("timeline labels adapt to width and export source", () => {
  const state = {
    chart: { title: "Song", bars: Array.from({ length: 64 }, (_, index) => ({ number: index + 1, chord: "C" })) },
    audio: { path: "source.wav", name: "source" }, audioPreview: null
  };
  const timeline = loadScript("src/renderer/timeline.js", ["barRegionLabel", "barLabelInterval", "audioExportSourceForLane"], {
    state,
    elements: {}, document: {},
    timelineBodyWidth: () => 800,
    barChordText: (bar) => bar.chord || "N.C."
  });
  assert.equal(timeline.barRegionLabel({ number: 2, chord: "Am" }, 1, 20), "2. Am");
  assert.equal(timeline.barRegionLabel({ number: 2, chord: "Am" }, 1, 6), "2");
  assert.equal(timeline.barRegionLabel({ number: 2, chord: "Am" }, 1, 2), "");
  assert.equal(timeline.barLabelInterval(), 5);
  assert.deepEqual(plain(timeline.audioExportSourceForLane("Full Mix", null)), { path: "source.wav", label: "Song - full mix" });
  assert.deepEqual(plain(timeline.audioExportSourceForLane("vocals", { stem: { name: "vocals", path: "vocals.wav" } })), { path: "vocals.wav", label: "Song - vocals" });
  assert.equal(timeline.audioExportSourceForLane("other", null), null);
});

test("stem source-playback mode depends on the active editor", () => {
  const state = { currentView: "song", editorPanel: "arrange" };
  const { isSourcePlaybackMode } = loadScript("src/renderer/stems.js", ["isSourcePlaybackMode"], { state, elements: {} });
  assert.equal(isSourcePlaybackMode(), true);
  state.editorPanel = "chart";
  assert.equal(isSourcePlaybackMode(), false);
  state.currentView = "home";
  state.editorPanel = "arrange";
  assert.equal(isSourcePlaybackMode(), false);
});

test("copying lyrics preserves manual edits and maps matching bars", () => {
  const { copyExistingLyricsToBars } = loadScript("src/renderer/actions.js", ["copyExistingLyricsToBars"], {});
  const target = [{ number: 1 }, { number: 2, lyrics: "new" }, { number: 3 }];
  const source = [{ number: 1, lyrics: "old one", lyrics_source: "manual", lyric_confidence: 0.9 }, { number: 2, lyrics: "old two" }];
  copyExistingLyricsToBars(target, source);
  assert.deepEqual(plain(target), [
    { number: 1, lyrics: "old one", lyrics_source: "manual", lyric_confidence: 0.9 },
    { number: 2, lyrics: "old two", lyrics_source: "" },
    { number: 3 }
  ]);
});
