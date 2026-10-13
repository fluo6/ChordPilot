const test = require("node:test");
const assert = require("node:assert/strict");
const { loadScript, plain } = require("./helpers/load-script");
const model = () => loadScript("src/renderer/study-model.js", ["studyRangeError", "advanceStudySelection", "normalizeStudies", "saveStudyRecord", "appendStudyRun", "compareStudyRuns", "createStudyState"]);
const result = (chord = "C") => ({ chord, chord_confidence: .8, pitch_confidence: .6, range: [1, 2], sources: ["other"], settings: { song_key: "C" }, evidence: { detected_notes: [{ note: "C", strength: .4 }] }, algorithm_version: "v1" });

test("simplified display does not invalidate new detections but retains legacy settings", () => {
  const m = model();
  const run = { ...result("Abmaj9"), algorithm_version: "local-study-v3", settings: { simplify_chords: true } };
  const changed = { ...run, settings: { simplify_chords: false } };
  assert.equal(m.compareStudyRuns(run, changed).sameInputs, true);
  assert.equal(m.compareStudyRuns({ ...run, algorithm_version: "local-study-v4" }, { ...changed, algorithm_version: "local-study-v4" }).sameInputs, true);
  assert.equal(m.compareStudyRuns({ ...run, algorithm_version: "local-study-v5" }, { ...changed, algorithm_version: "local-study-v5" }).sameInputs, true);
  assert.equal(m.compareStudyRuns({ ...run, algorithm_version: "local-study-v6" }, { ...changed, algorithm_version: "local-study-v6" }).sameInputs, true);
  assert.equal(m.compareStudyRuns({ ...run, algorithm_version: "local-study-v2" }, { ...changed, algorithm_version: "local-study-v2" }).sameInputs, false);
});

test("range selection orders endpoints and validates exact 50ms minimum", () => {
  const m = model();
  assert.deepEqual(plain(m.advanceStudySelection(3, 1)), { anchor: null, range: [1, 3] });
  assert.deepEqual(plain(m.advanceStudySelection(null, 4)), { anchor: 4, range: null });
  assert.equal(m.studyRangeError(1, 1.05, 2), "");
  assert.ok(m.studyRangeError(1, 1.049, 2));
  assert.ok(m.studyRangeError(NaN, 2, 3));
  assert.ok(m.studyRangeError(0, 4, 3));
});

test("saved runs preserve algorithm evidence independently from corrections and newer inputs", () => {
  const m = model(); let next = 0;
  const initial = m.saveStudyRecord([], { name: "", start: 1, end: 2, sources: ["other"], settings: {}, notes: "", corrected_chord: "Am7" }, [{ id: "r1", created_at: "today", ...result() }], null, "today", () => `id${++next}`).study;
  const newer = m.appendStudyRun(initial, result("C/E"), "tomorrow", () => "r2");
  assert.equal(newer.runs[0].chord, "C"); assert.equal(newer.runs[1].chord, "C/E");
  assert.equal(initial.runs.length, 1); assert.equal(newer.corrected_chord, "Am7");
  assert.equal(newer.selected_run_id, "r2");
  assert.equal(m.compareStudyRuns(newer.runs[1], newer.runs[0]).sameInputs, true);
  const changed = { ...newer.runs[1], range: [2, 3] };
  assert.equal(m.compareStudyRuns(changed, newer.runs[0]).sameInputs, false);
});

test("malformed sessions discard only invalid study records and restore valid history", () => {
  const m = model(); const run = { id: "r1", ...result() };
  const item = { id: "s1", name: "Example", start: 1, end: 2, sources: ["other"], settings: {}, runs: [run, { id: "bad", ...result(), chord_confidence: NaN }], selected_run_id: "gone" };
  const normalized = m.normalizeStudies([null, item, { ...item }, { id: "bad", start: -1, end: 0 }]);
  assert.equal(normalized.length, 1); assert.equal(normalized[0].runs.length, 1);
  assert.equal(normalized[0].selected_run_id, "r1");
  assert.deepEqual(plain(m.normalizeStudies(undefined)), []);
  run.chord = "F"; assert.equal(normalized[0].runs[0].chord, "C");
});

test("saving edits preserves the selected historical run", () => {
  const m = model();
  const record = { id: "s1", start: 1, end: 2, sources: ["other"], settings: {}, runs: [{ id: "r1", ...result() }, { id: "r2", ...result("C/E") }], selected_run_id: "r1" };
  const saved = m.saveStudyRecord([record], record, [], "s1", "today", () => "unused");
  assert.equal(saved.study.selected_run_id, "r1");
});

test("octave evidence survives normalization and serialization independently from pitch classes", () => {
  const m = model();
  const pitch = { midi: 60, note: "C4", strength: .7, frequency_hz: 261.63 };
  const record = { id: "s1", start: 1, end: 2, sources: ["other"], runs: [{ id: "r1", ...result(), evidence: { detected_notes: [{ note: "C", strength: .7 }], detected_pitches: [pitch] }, source_evidence: { other: { detected_pitches: [pitch] } }, algorithm_version: "local-study-v2" }] };
  const restored = m.normalizeStudies(JSON.parse(JSON.stringify([record])));
  assert.equal(restored[0].runs[0].evidence.detected_pitches[0].midi, 60);
  assert.equal(restored[0].runs[0].source_evidence.other.detected_pitches[0].note, "C4");
  assert.equal(restored[0].runs[0].algorithm_version, "local-study-v2");
});

test("malformed nested run evidence is skipped without losing valid history", () => {
  const m = model();
  const valid = { id: "good", ...result() };
  const invalid = [
    { id: "notes", ...result(), evidence: { detected_notes: "broken" } },
    { id: "note", ...result(), evidence: { detected_notes: [null] } },
    { id: "alternatives", ...result(), alternatives: [null] },
    { id: "reasons", ...result(), alternatives: [{ chord: "C", score: .8, reasons: "broken" }] },
    { id: "fingerprint", ...result(), input_fingerprints: { other: null } },
    { id: "digest", ...result(), input_fingerprints: { other: { sample_sha256: 12 } } },
    { id: "pitches", ...result(), evidence: { detected_pitches: "broken" } },
    { id: "midi", ...result(), evidence: { detected_pitches: [{ midi: 500, note: "C4", strength: .5, frequency_hz: 261.63 }] } }
  ];
  const record = { id: "s1", start: 1, end: 2, sources: ["other"], runs: [valid, ...invalid], selected_run_id: "digest" };
  const normalized = m.normalizeStudies([record]);
  assert.deepEqual(plain(normalized[0].runs.map((run) => run.id)), ["good"]);
  assert.equal(normalized[0].selected_run_id, "good");
});
