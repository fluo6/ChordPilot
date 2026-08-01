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

test("rendered stems use transposed previews and preserve lane mix", () => {
  const createdAudio = [];
  function FakeAudio(url) {
    this.url = url;
    this.src = url;
    this.currentTime = 0;
    this.pause = () => {};
    createdAudio.push(this);
  }
  const state = {
    audioPreview: {
      stems: {
        ok: true,
        stems: [
          { name: "vocals", path: "preview-vocals.wav", url: "file:///preview-vocals.wav" },
          { name: "drums", path: "preview-drums.wav", url: "file:///preview-drums.wav" }
        ]
      }
    },
    soloStem: "vocals",
    stemPlayers: [{
      stem: { name: "vocals" },
      audio: { pause() {}, src: "old" },
      muted: true,
      volume: 0.34
    }]
  };
  const { renderStems } = loadScript("src/renderer/stems.js", ["renderStems"], {
    state,
    elements: { audioPlayer: { muted: true } },
    Audio: FakeAudio,
    appendLog() {},
    renderTimeline() {},
    applyMasterVolume() {},
    applyPlaybackRate() {},
    applyStemMix() {}
  });

  renderStems({
    ok: true,
    stems: [
      { name: "vocals", path: "source-vocals.wav", url: "file:///source-vocals.wav" },
      { name: "drums", path: "source-drums.wav", url: "file:///source-drums.wav" }
    ]
  });

  assert.equal(state.stemPlayers.length, 2);
  assert.equal(state.stemPlayers[0].stem.path, "preview-vocals.wav");
  assert.equal(state.stemPlayers[0].stem.source_path, undefined);
  assert.equal(state.stemPlayers[0].muted, true);
  assert.equal(state.stemPlayers[0].volume, 0.34);
  assert.equal(state.soloStem, "vocals");
  assert.deepEqual(createdAudio.map((audio) => audio.url), ["file:///preview-vocals.wav", "file:///preview-drums.wav"]);
});

test("transposed preview mix stays audible when matching preview stems are missing", () => {
  const state = {
    audioPreview: {
      path: "preview-mix.wav",
      url: "file:///preview-mix.wav",
      stems: {
        ok: true,
        stems: []
      }
    },
    soloStem: null,
    stemPlayers: [{
      stem: { name: "vocals" },
      audio: { pause() {}, src: "old" },
      muted: false,
      volume: 0.8
    }]
  };
  const logs = [];
  const { renderStems } = loadScript("src/renderer/stems.js", ["renderStems"], {
    state,
    elements: { audioPlayer: { muted: true } },
    Audio: function FakeAudio(url) {
      this.src = url;
      this.pause = () => {};
    },
    appendLog(message) { logs.push(message); },
    renderTimeline() {},
    applyMasterVolume() {},
    applyPlaybackRate() {},
    applyStemMix() {}
  });

  renderStems({ ok: true, stems: [{ name: "vocals", path: "vocals.wav", url: "file:///vocals.wav" }] });
  assert.equal(state.stemPlayers.length, 0);
  assert.equal(state.soloStem, null);
  assert.equal(state.audioPreview.url, "file:///preview-mix.wav");
  assert.match(logs.at(-1), /preview mix/);
});

test("stem player recovery restores controls when timeline renders after transpose", () => {
  const state = {
    audioPreview: null,
    soloStem: null,
    stemPlayers: []
  };
  const { ensureStemPlayersForTimeline } = loadScript("src/renderer/stems.js", ["ensureStemPlayersForTimeline"], {
    state,
    elements: { audioPlayer: { muted: true } },
    Audio: function FakeAudio(url) {
      this.src = url;
      this.pause = () => {};
    }
  });

  assert.equal(ensureStemPlayersForTimeline({
    ok: true,
    stems: [{ name: "bass", path: "bass.wav", url: "file:///bass.wav" }]
  }), true);
  assert.equal(state.stemPlayers.length, 1);
  assert.equal(state.stemPlayers[0].stem.name, "bass");
  assert.equal(ensureStemPlayersForTimeline({
    ok: true,
    stems: [{ name: "drums", path: "drums.wav", url: "file:///drums.wav" }]
  }), false);
  assert.equal(state.stemPlayers[0].stem.name, "bass");
});

test("key changes trigger an audio preview and reject overlapping renders", () => {
  const state = { audioPreviewBusy: false };
  let changed = 0;
  let previewed = 0;
  let rendered = 0;
  let previewOptions = null;
  const { changeKeyWithAudioPreview } = loadScript("src/renderer/actions.js", ["changeKeyWithAudioPreview"], {
    state,
    renderMeta() { rendered += 1; },
    setStatus(message) { state.status = message; },
    showErrorDialog() {}
  });

  assert.equal(changeKeyWithAudioPreview(() => { changed += 1; return true; }, (options) => { previewOptions = options; previewed += 1; }), true);
  assert.equal(changed, 1);
  assert.equal(previewed, 1);
  assert.equal(previewOptions.silentMissingSource, true);

  state.audioPreviewBusy = true;
  assert.equal(changeKeyWithAudioPreview(() => { changed += 1; return true; }, () => { previewed += 1; }), false);
  assert.equal(changed, 1);
  assert.equal(previewed, 1);
  assert.equal(rendered, 1);
  assert.match(state.status, /finish/);
});

test("key changes keep chart transpose when preview source is unavailable", async () => {
  const state = { audioPreviewBusy: false };
  let dialogs = 0;
  let changed = 0;
  const { changeKeyWithAudioPreview, isMissingAudioPreviewSourceError } = loadScript(
    "src/renderer/actions.js",
    ["changeKeyWithAudioPreview", "isMissingAudioPreviewSourceError"],
    {
      state,
      renderMeta() {},
      setStatus(message) { state.status = message; },
      showErrorDialog() { dialogs += 1; }
    }
  );

  assert.equal(isMissingAudioPreviewSourceError(new Error(
    "Error invoking remote method 'audio:process': Error: Choose an audio file before applying audio preview."
  )), true);

  assert.equal(changeKeyWithAudioPreview(
    () => { changed += 1; return true; },
    () => Promise.reject(new Error("Choose an audio file before applying audio preview."))
  ), true);

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(changed, 1);
  assert.equal(dialogs, 0);
  assert.match(state.status, /source audio is unavailable/);
});

test("audio preview bundle renders available stems with the same transpose settings", async () => {
  const calls = [];
  const { processAudioPreviewBundle } = loadScript("src/renderer/actions.js", ["processAudioPreviewBundle"], {
    window: {
      chordPilot: {
        processAudio(payload) {
          calls.push(payload);
          return Promise.resolve({
            path: `${payload.audioPath}.preview.wav`,
            url: `file:///${payload.audioPath}.preview.wav`,
            semitones: payload.semitones,
            tempoRate: payload.tempoRate
          });
        }
      }
    }
  });

  const result = await processAudioPreviewBundle("mix.wav", [
    { name: "vocals", path: "vocals.wav", url: "file:///vocals.wav", waveform: [0.2] },
    { name: "drums" }
  ], 3, 1.25);

  assert.deepEqual(plain(calls), [
    { audioPath: "mix.wav", semitones: 3, tempoRate: 1.25 },
    { audioPath: "vocals.wav", semitones: 3, tempoRate: 1.25 }
  ]);
  assert.equal(result.path, "mix.wav.preview.wav");
  assert.deepEqual(plain(result.stems.stems), [{
    name: "vocals",
    path: "vocals.wav.preview.wav",
    url: "file:///vocals.wav.preview.wav",
    waveform: [0.2],
    source_path: "vocals.wav",
    semitones: 3,
    tempoRate: 1.25
  }]);
});

test("manual audio preview relinks missing source and retries", async () => {
  const calls = [];
  const state = {
    audio: { path: "missing.wav", url: "file:///missing.wav", name: "Old" },
    chart: { key: "D", detected_key: "C", key_offset: 2, tempo: 120, detected_tempo: 120, bars: [{ chord: "D" }] },
    audioPreview: null,
    audioPreviewBusy: false
  };
  const elements = {
    audioPlayer: { src: "file:///missing.wav", currentTime: 0, paused: true },
    analyzeBtn: { disabled: true },
    loadingText: { textContent: "" }
  };
  let cleared = 0;
  let rendered = 0;
  const { applyAudioPreview } = loadScript("src/renderer/actions.js", ["applyAudioPreview"], {
    state,
    elements,
    window: {
      chordPilot: {
        chooseAudio() {
          return Promise.resolve({ path: "linked.wav", url: "file:///linked.wav", name: "Linked" });
        },
        processAudio(payload) {
          calls.push({ audioPath: payload.audioPath, semitones: payload.semitones, tempoRate: payload.tempoRate });
          if (calls.length === 1) {
            return Promise.reject(new Error("Choose an audio file before applying audio preview."));
          }
          return Promise.resolve({ path: "preview.wav", url: "file:///preview.wav", semitones: payload.semitones, tempoRate: payload.tempoRate });
        }
      }
    },
    hasChart() { return true; },
    syncMetaToState() {},
    ensureChartKeyState() {},
    ensureChartTempoState() {},
    tuningSemitones() { return 0; },
    audioTempoRate() { return 1; },
    beginLoading() { return () => {}; },
    updateAudioPreviewState() {},
    clearStems() { cleared += 1; },
    setMediaPlaybackRate() {},
    renderTimeline() { rendered += 1; },
    tuningCents() { return 0; },
    formatCents() { return "0 cents"; },
    setStatus(message) { state.status = message; },
    showErrorDialog(error) { state.dialog = error; },
    updateProjectIdentity() {},
    renderSourceInfo() {}
  });

  await applyAudioPreview();

  assert.deepEqual(plain(calls), [
    { audioPath: "missing.wav", semitones: 2, tempoRate: 1 },
    { audioPath: "linked.wav", semitones: 2, tempoRate: 1 }
  ]);
  assert.equal(state.audio.path, "linked.wav");
  assert.equal(state.audioPreview.path, "preview.wav");
  assert.equal(elements.analyzeBtn.disabled, false);
  assert.equal(cleared, 1);
  assert.equal(rendered, 1);
  assert.equal(state.dialog, undefined);
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
