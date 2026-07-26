const test = require("node:test");
const assert = require("node:assert/strict");
const { loadScript, plain } = require("./helpers/load-script");

test("keyboard typing-target detection covers editable controls", () => {
  const { isTypingTarget, isSpaceTypingTarget } = loadScript(
    "src/renderer/keyboard.js",
    ["isTypingTarget", "isSpaceTypingTarget"],
    {}
  );
  for (const tagName of ["INPUT", "textarea", "Select"]) {
    assert.equal(isTypingTarget({ tagName }), true);
  }
  assert.equal(isTypingTarget({ tagName: "DIV", isContentEditable: true }), true);
  assert.equal(isTypingTarget({ tagName: "BUTTON" }), false);
  assert.equal(isTypingTarget(null), false);
  assert.equal(isSpaceTypingTarget({ tagName: "INPUT", type: "text" }), true);
  assert.equal(isSpaceTypingTarget({ tagName: "TEXTAREA" }), true);
  assert.equal(isSpaceTypingTarget({ tagName: "INPUT", type: "range" }), false);
  assert.equal(isSpaceTypingTarget({ tagName: "SELECT" }), false);
});

test("space toggles playback across non-text controls", async () => {
  let played = 0;
  let prevented = 0;
  const audioPlayer = {
    src: "file:///song.wav",
    paused: true,
    play() {
      played += 1;
      return Promise.resolve();
    },
    pause() {}
  };
  const { handleKeyboardShortcut } = loadScript("src/renderer/keyboard.js", ["handleKeyboardShortcut"], {
    elements: { audioPlayer },
    setStatus() {}
  });
  handleKeyboardShortcut({
    key: " ",
    code: "Space",
    target: { tagName: "INPUT", type: "range" },
    preventDefault() { prevented += 1; }
  });
  await Promise.resolve();
  assert.equal(played, 1);
  assert.equal(prevented, 1);

  handleKeyboardShortcut({
    key: " ",
    code: "Space",
    target: { tagName: "INPUT", type: "text" },
    preventDefault() { prevented += 1; }
  });
  assert.equal(played, 1);
  assert.equal(prevented, 1);
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

test("stem playback keeps source audible when stems cannot start", async () => {
  const audioPlayer = { currentTime: 4, muted: true, paused: false };
  const rejectedAudio = {
    currentTime: 4,
    muted: false,
    pause() {},
    play() { return Promise.reject(new Error("unavailable")); }
  };
  const state = {
    currentView: "song",
    editorPanel: "analysis",
    soloStem: null,
    stemPlayers: [{
      stem: { name: "vocals" },
      audio: rejectedAudio,
      soloBtn: null,
      muteBtn: null,
      muted: false
    }]
  };
  const { applyStemMix } = loadScript("src/renderer/stems.js", ["applyStemMix"], {
    state,
    elements: { audioPlayer }
  });
  assert.equal(await applyStemMix(), false);
  assert.equal(audioPlayer.muted, false);

  rejectedAudio.play = () => Promise.resolve();
  assert.equal(await applyStemMix(), true);
  assert.equal(audioPlayer.muted, true);
});

test("key changes trigger an audio preview and reject overlapping renders", () => {
  const state = { audioPreviewBusy: false };
  let changed = 0;
  let previewed = 0;
  let rendered = 0;
  const { changeKeyWithAudioPreview } = loadScript("src/renderer/actions.js", ["changeKeyWithAudioPreview"], {
    state,
    renderMeta() { rendered += 1; },
    setStatus(message) { state.status = message; },
    showErrorDialog() {}
  });

  assert.equal(changeKeyWithAudioPreview(() => { changed += 1; return true; }, () => { previewed += 1; }), true);
  assert.equal(changed, 1);
  assert.equal(previewed, 1);

  state.audioPreviewBusy = true;
  assert.equal(changeKeyWithAudioPreview(() => { changed += 1; return true; }, () => { previewed += 1; }), false);
  assert.equal(changed, 1);
  assert.equal(previewed, 1);
  assert.equal(rendered, 1);
  assert.match(state.status, /finish/);
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
