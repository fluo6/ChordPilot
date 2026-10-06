const test = require("node:test");
const assert = require("node:assert/strict");
const { loadScript, plain } = require("./helpers/load-script");

function environment(overrides = {}) {
  const helpers = loadScript("src/renderer/study-model.js", ["studyCopy", "studyRangeError", "advanceStudySelection", "studySettings", "studySourceNames", "createStudyState", "saveStudyRecord", "compareStudyRuns", "normalizeStudies"]);
  const state = { audio: { path: "song", url: "original" }, chart: { detected_key: "C", key: "D", stems: { ok: true, stems: [{ name: "bass", url: "bass-original" }, { name: "other", url: "other-original" }] } }, studies: [], study: helpers.createStudyState(), currentView: "song", editorPanel: "study", ...overrides.state };
  let panel;
  const loaded = loadScript("src/renderer/study.js", ["handleStudyWaveScroll", "zoomStudyWaveform", "handleStudyWaveWheel", "handleStudyRangeClick", "startStudyWaveDrag", "moveStudyWaveDrag", "finishStudyWaveDrag", "setStudyRange", "resetStudyState", "studySaveToken", "analyzeStudySelection", "saveCurrentStudy", "openStudy", "newStudy", "selectStudyRun", "studyCurrentRun"], {
    ...helpers, state, elements: { audioPlayer: { duration: 10 }, studyPanel: null },
    window: { chordPilot: overrides.bridge || {} },
    crypto: { randomUUID: (() => { let id = 0; return () => `id${++id}`; })() },
    setStatus() {}, appendLog() {}, openEditorPanel(value) { panel = value; },
    stopStudyPlayback() {}, ...overrides.globals
  });
  return { ...loaded, state, panel: () => panel };
}

test("modifier selection maps scroll/zoom body coordinates and opens study on completion", () => {
  const env = environment();
  const body = { getBoundingClientRect: () => ({ left: -100, width: 1000 }) };
  const click = (clientX, ctrlKey = true, metaKey = false) => ({ clientX, ctrlKey, metaKey, target: { closest: () => null }, preventDefault() {}, stopImmediatePropagation() {} });
  assert.equal(env.handleStudyRangeClick(click(200, false), body, 10, true), false);
  env.handleStudyRangeClick(click(200), body, 10, true);
  env.handleStudyRangeClick(click(100, false, true), body, 10, true);
  assert.deepEqual(plain([env.state.study.draft.start, env.state.study.draft.end]), [2, 3]);
  assert.equal(env.panel(), "study");
  env.handleStudyRangeClick(click(400), body, 10, true);
  assert.equal(env.state.study.selectionAnchor, 5);
});

test("study defaults keep missing stems explicit and result inputs stay immutable", () => {
  const env = environment();
  assert.deepEqual(plain(env.state.study.draft.sources), ["bass", "other"]);
  env.setStudyRange(1, 2);
  env.state.study.pendingRuns = [{ id: "r1", chord: "C", range: [1, 2] }]; env.state.study.selectedRunId = "r1";
  env.setStudyRange(2, 3);
  assert.deepEqual(plain(env.studyCurrentRun().range), [1, 2]);
  const token = env.studySaveToken(); env.state.study.draft.notes = "new note";
  assert.notEqual(env.studySaveToken(), token);
});

test("analysis snapshots captured inputs and discards results after song replacement", async () => {
  let resolve; let request;
  const env = environment({ bridge: { analyzeRange(payload) { request = payload; return new Promise((done) => { resolve = done; }); } } });
  env.setStudyRange(1, 2);
  const running = env.analyzeStudySelection();
  env.setStudyRange(2, 3);
  resolve({ chord: "C", chord_confidence: .8, pitch_confidence: .7, range: [1, 2], sources: ["bass", "other"], settings: request.options, evidence: { detected_notes: [] } });
  await running;
  assert.deepEqual(plain(env.studyCurrentRun().range), [1, 2]);
  assert.equal(env.state.study.draft.start, 2);
  const second = env.analyzeStudySelection();
  env.state.audio = { path: "new-song" }; env.resetStudyState();
  resolve({ chord: "G", range: [2, 3] }); await second;
  assert.equal(env.state.study.pendingRuns.length, 0);
});

test("saving and reopening restores history and corrections without mutating suggestions", async () => {
  const env = environment({ bridge: { async analyzeRange(payload) { return { chord: "C", chord_confidence: .8, pitch_confidence: .7, range: [payload.start, payload.end], sources: payload.sources, settings: payload.options, evidence: { detected_notes: [] } }; } } });
  env.setStudyRange(1, 2); await env.analyzeStudySelection();
  env.state.study.draft.corrected_chord = "C/E";
  env.saveCurrentStudy();
  const saved = env.state.studies[0];
  assert.equal(saved.runs.length, 1); assert.equal(saved.runs[0].chord, "C");
  env.setStudyRange(2, 3); env.openStudy(saved.id);
  assert.equal(env.state.study.draft.start, 2); // edited draft was kept with the same study
  assert.equal(env.state.study.draft.corrected_chord, "C/E");
  assert.equal(env.studyCurrentRun().chord, "C");
});

test("Save Session flushes pending runs and preserves dirty edits made during the save", async () => {
  const env = environment({ bridge: { async analyzeRange(payload) { return { chord: "C", range: [payload.start, payload.end], sources: payload.sources, settings: payload.options, evidence: { detected_notes: [] } }; } } });
  env.setStudyRange(1, 2); await env.analyzeStudySelection();
  let resolve; let payload;
  const { saveSession } = loadScript("src/renderer/actions.js", ["saveSession"], {
    state: env.state, studyCopy: (value) => plain(value), saveCurrentStudy: env.saveCurrentStudy, studySaveToken: env.studySaveToken,
    renderStudy() {}, syncMetaToState() {}, collectAnalysisOptions: () => ({}),
    elements: { audioPlayer: { currentTime: 0 }, analysisModeInput: { value: "draft" } },
    window: { chordPilot: { saveSession(value) { payload = value; return new Promise((done) => { resolve = done; }); } } },
    beginLoading: () => () => {}, setStatus() {}, rememberSession() {}, addJob() {}, showErrorDialog() {}
  });
  const saving = saveSession();
  assert.equal(payload.studies[0].runs[0].chord, "C");
  assert.equal(env.state.study.pendingRuns.length, 0);
  env.state.study.draft.notes = "edited while saving";
  resolve({ path: "session.json" }); await saving;
  assert.equal(env.state.study.dirty, true);
  assert.equal(payload.studies[0].notes, "");
  const second = saveSession(); resolve({ path: "session.json" }); await second;
  assert.equal(payload.studies[0].notes, "edited while saving");
  assert.equal(env.state.study.dirty, false);
});

test("New and opening another study retain successful runs after draft inputs become invalid", async () => {
  const env = environment({ bridge: { async analyzeRange(payload) { return { chord: "C", range: [payload.start, payload.end], sources: payload.sources, settings: payload.options, evidence: { detected_notes: [] } }; } } });
  env.setStudyRange(1, 2); await env.analyzeStudySelection();
  env.state.study.draft.sources = []; env.state.study.draft.notes = "keep this";
  env.newStudy();
  assert.equal(env.state.studies.length, 1);
  assert.equal(env.state.studies[0].runs.length, 1);
  assert.deepEqual(plain(env.state.studies[0].sources), ["bass", "other"]);
  assert.equal(env.state.studies[0].notes, "keep this");
  const first = env.state.studies[0].id;
  env.setStudyRange(3, 4); await env.analyzeStudySelection();
  env.state.study.draft.sources = []; env.setStudyRange(null, null);
  env.openStudy(first);
  assert.equal(env.state.studies.length, 2);
  assert.equal(env.state.studies[1].runs[0].range[0], 3);
  assert.equal(env.state.study.openStudyId, first);
  env.setStudyRange(null, null); env.state.study.draft.sources = [];
  env.state.study.draft.notes = "existing record edit";
  env.newStudy();
  assert.equal(env.state.studies[0].notes, "existing record edit");
  assert.equal(env.state.studies[0].runs.length, 1);
});

test("a failed study flush cannot save a session or clear its dirty state", async () => {
  let saved = false;
  const state = { audio: { path: "song" }, studies: [], study: { dirty: true, pendingRuns: [{ id: "r1" }] } };
  const { saveSession } = loadScript("src/renderer/actions.js", ["saveSession"], {
    state, saveCurrentStudy: () => null, studySaveToken: () => "unchanged", studyCopy: plain,
    syncMetaToState() {}, collectAnalysisOptions: () => ({}), renderStudy() {},
    elements: { audioPlayer: { currentTime: 0 }, analysisModeInput: { value: "draft" } },
    window: { chordPilot: { async saveSession() { saved = true; return { path: "session.json" }; } } },
    beginLoading: () => () => {}, setStatus() {}, setStudyMessage() {}, rememberSession() {}, addJob() {}, showErrorDialog() {}
  });
  await saveSession();
  assert.equal(saved, false);
  assert.equal(state.study.dirty, true);
});

module.exports = { environment };

function waveGesture() {
  const viewport = { scrollLeft: 100, scrollWidth: 1000, clientWidth: 400 };
  const body = { getBoundingClientRect: () => ({ left: -viewport.scrollLeft, width: 1000 }), setPointerCapture() {}, releasePointerCapture() {}, classList: { add() {}, remove() {} } };
  const event = (clientX, kind = "pan", extra = {}) => ({
    clientX, pointerId: 1, button: 0, preventDefault() {}, stopImmediatePropagation() {},
    target: { dataset: kind === "start" || kind === "end" ? { studyBoundary: kind } : {}, closest: (selector) => kind === "move" && selector === ".study-range-overlay" ? {} : null }, ...extra
  });
  return { viewport, body, event };
}

test("dragging the zoomed waveform pans without changing the selection or dirty state", () => {
  const env = environment(); const wave = waveGesture();
  env.setStudyRange(3, 5); env.state.study.dirty = false;
  assert.equal(env.startStudyWaveDrag(wave.event(300), wave.body, wave.viewport, 10), true);
  env.moveStudyWaveDrag(wave.event(200));
  assert.equal(wave.viewport.scrollLeft, 200);
  assert.deepEqual(plain([env.state.study.draft.start, env.state.study.draft.end]), [3, 5]);
  assert.equal(env.state.study.dirty, false);
  env.moveStudyWaveDrag(wave.event(2000)); assert.equal(wave.viewport.scrollLeft, 0);
  env.finishStudyWaveDrag(wave.event(2000));
  assert.equal(env.startStudyWaveDrag(wave.event(200, "pan", { ctrlKey: true }), wave.body, wave.viewport, 10), false);
});

test("dragging range edges updates original seconds and preserves valid minimum and snapshots", () => {
  const env = environment(); const wave = waveGesture(); env.setStudyRange(3, 5);
  env.state.study.pendingRuns = [{ id: "r1", chord: "C", range: [3, 5] }]; env.state.study.selectedRunId = "r1";
  env.startStudyWaveDrag(wave.event(200, "start"), wave.body, wave.viewport, 10);
  env.moveStudyWaveDrag(wave.event(100)); env.finishStudyWaveDrag(wave.event(100));
  assert.deepEqual(plain([env.state.study.draft.start, env.state.study.draft.end]), [2, 5]);
  assert.deepEqual(plain(env.studyCurrentRun().range), [3, 5]);
  env.startStudyWaveDrag(wave.event(400, "end"), wave.body, wave.viewport, 10);
  env.moveStudyWaveDrag(wave.event(-100)); env.finishStudyWaveDrag(wave.event(-100));
  assert.deepEqual(plain([env.state.study.draft.start, env.state.study.draft.end]), [2, 2.05]);
  assert.equal(env.state.study.dirty, true);
});

test("moving the selected range preserves its length and clamps to song boundaries", () => {
  const env = environment(); const wave = waveGesture(); env.setStudyRange(2, 4);
  env.startStudyWaveDrag(wave.event(200, "move"), wave.body, wave.viewport, 10);
  env.moveStudyWaveDrag(wave.event(2000));
  assert.deepEqual(plain([env.state.study.draft.start, env.state.study.draft.end]), [8, 10]);
  env.moveStudyWaveDrag(wave.event(-2000));
  assert.deepEqual(plain([env.state.study.draft.start, env.state.study.draft.end]), [0, 2]);
  env.finishStudyWaveDrag(wave.event(-2000));
  assert.equal(env.handleStudyRangeClick(wave.event(200, "pan", { ctrlKey: true }), wave.body, 10), true);
  assert.equal(env.state.study.selectionAnchor, null); // trailing click from the drag is swallowed
});

test("a gesture cannot edit a replacement song or continue after leaving the study tab", () => {
  const env = environment(); const wave = waveGesture(); env.setStudyRange(2, 4);
  env.startStudyWaveDrag(wave.event(200, "move"), wave.body, wave.viewport, 10);
  env.resetStudyState(); env.setStudyRange(5, 6); env.moveStudyWaveDrag(wave.event(300));
  assert.deepEqual(plain([env.state.study.draft.start, env.state.study.draft.end]), [5, 6]);
  env.startStudyWaveDrag(wave.event(200, "move"), wave.body, wave.viewport, 10);
  env.state.editorPanel = "arrange"; env.moveStudyWaveDrag(wave.event(300));
  assert.deepEqual(plain([env.state.study.draft.start, env.state.study.draft.end]), [5, 6]);
});

function zoomEnvironment() {
  const wave = waveGesture();
  const input = { value: "2.5", min: "1", max: "16", step: "0.5" };
  let width = 1000;
  wave.viewport.getBoundingClientRect = () => ({ left: 20 });
  wave.body.getBoundingClientRect = () => ({ width });
  const nodes = { studyWaveViewport: wave.viewport, studyWaveBody: wave.body, studyZoomInput: input };
  const env = environment({ globals: { document: { getElementById: id => nodes[id] } } });
  env.context.renderStudyWaveform = () => { width = Math.max(600, wave.viewport.clientWidth * Number(input.value)); wave.viewport.scrollWidth = width; };
  return { ...env, ...wave, input };
}

test("wheel zoom centers the selection, updates the slider, and leaves evidence unchanged", () => {
  const env = zoomEnvironment(); env.setStudyRange(6, 8); env.state.study.dirty = false;
  let prevented = false;
  env.handleStudyWaveWheel({ deltaY: -100, deltaX: 0, deltaMode: 0, clientX: 60, preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(Number(env.input.value), 3);
  assert.equal(env.viewport.scrollLeft, 640); // 7s / 10s * 1200px - 200px
  assert.equal(env.state.study.dirty, false);
  assert.deepEqual(plain([env.state.study.draft.start, env.state.study.draft.end]), [6, 8]);
  env.zoomStudyWaveform(16); assert.equal(env.viewport.scrollLeft, 4280);
  env.zoomStudyWaveform(0); assert.equal(Number(env.input.value), 1);
  assert.equal(env.viewport.scrollLeft, 200); // boundary-clamped center
});

test("after panning away wheel zoom preserves the mouse's time, until the range changes", () => {
  const env = zoomEnvironment(); env.setStudyRange(6, 8);
  env.startStudyWaveDrag(env.event(300), env.body, env.viewport, 10);
  env.moveStudyWaveDrag(env.event(200)); env.finishStudyWaveDrag(env.event(200));
  assert.equal(env.state.study.wavePanned, true);
  env.zoomStudyWaveform(5, 120); // mouse at 100px; original time at 300 / 1000
  assert.equal(env.viewport.scrollLeft, 500);
  env.setStudyRange(2, 3);
  env.zoomStudyWaveform(10, 120);
  assert.equal(env.viewport.scrollLeft, 800);
});

test("unselected zoom anchors under the mouse, and zero or horizontal wheel does not zoom", () => {
  const env = zoomEnvironment();
  env.zoomStudyWaveform(5, 120); assert.equal(env.viewport.scrollLeft, 300);
  const event = { deltaY: 0, deltaX: 100, clientX: 120, preventDefault() { throw new Error("horizontal scrolling stays native"); } };
  env.handleStudyWaveWheel(event); assert.equal(Number(env.input.value), 5);
  env.handleStudyWaveWheel({ ...event, deltaY: 10 }); assert.equal(Number(env.input.value), 5);
});

test("native scrolling detaches centering but programmatic zoom scrolling does not", () => {
  const env = zoomEnvironment(); env.setStudyRange(6, 8);
  env.zoomStudyWaveform(4);
  env.handleStudyWaveScroll(); assert.equal(env.state.study.wavePanned, false);
  env.viewport.scrollLeft += 50; // midpoint still visible, but user panned
  env.handleStudyWaveScroll(); assert.equal(env.state.study.wavePanned, true);
  env.zoomStudyWaveform(5);
  assert.equal(env.viewport.scrollLeft, 1262.5);
});
