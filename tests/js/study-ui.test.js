const test = require("node:test");
const assert = require("node:assert/strict");
const { loadScript, plain } = require("./helpers/load-script");

function environment(overrides = {}) {
  const helpers = loadScript("src/renderer/study-model.js", ["studyCopy", "studyRangeError", "advanceStudySelection", "studySettings", "studySourceNames", "createStudyState", "saveStudyRecord", "compareStudyRuns", "normalizeStudies"]);
  const state = { audio: { path: "song", url: "original" }, chart: { detected_key: "C", key: "D", stems: { ok: true, stems: [{ name: "bass", url: "bass-original" }, { name: "other", url: "other-original" }] } }, studies: [], study: helpers.createStudyState(), currentView: "song", editorPanel: "study", ...overrides.state };
  let panel;
  const loaded = loadScript("src/renderer/study.js", ["handleStudyRangeClick", "setStudyRange", "resetStudyState", "studySaveToken", "analyzeStudySelection", "saveCurrentStudy", "openStudy", "newStudy", "selectStudyRun", "studyCurrentRun"], {
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
