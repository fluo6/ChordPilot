const test = require("node:test");
const assert = require("node:assert/strict");

test('overtone settings preserve historical defaults and reject malformed weighted spectra', () => {
  const m = loadScript('src/renderer/study-model.js', ['studySettings', 'normalizeStudyRun', 'studyDetectionSettings']);
  assert.equal(m.studySettings({}).overtone_weighting, .5);
  assert.equal(m.studySettings({ overtone_weighting: 0 }).overtone_weighting, 0);
  const historical = m.normalizeStudyRun({ id: 'old', ...result(), algorithm_version: 'local-study-v9' });
  assert.equal(historical.settings.overtone_weighting, 0);
  assert.equal(m.studyDetectionSettings({}, 'local-study-v9').overtone_weighting, 0);
  assert.equal(m.studyDetectionSettings({ overtone_weighting: 1 }, 'local-study-v9').overtone_weighting, 1);
  assert.equal(m.studyDetectionSettings({}, 'local-study-v10').overtone_weighting, .5);
  assert.equal(m.normalizeStudyRun({ id: 'bad', ...result(), source_evidence: { other: { overtone_weighted_spectrum: {} } } }), null);
});
const { loadScript, plain } = require("./helpers/load-script");
const model = () => loadScript("src/renderer/study-model.js", ["studyRangeError", "advanceStudySelection", "normalizeStudies", "saveStudyRecord", "appendStudyRun", "compareStudyRuns", "createStudyState"]);
const result = (chord = "C") => ({ chord, chord_confidence: .8, pitch_confidence: .6, range: [1, 2], sources: ["other"], settings: { song_key: "C" }, evidence: { detected_notes: [{ note: "C", strength: .4 }] }, algorithm_version: "v1" });

test('saved study normalization retains simultaneous voicing snapshots without changing historical runs', () => {
  const { normalizeStudyRun } = loadScript('src/renderer/study-model.js', ['normalizeStudyRun']);
  const run = {id:'voicing',...result('Dm11'),algorithm_version:'local-study-v19'};
  run.evidence.voicing_frames = [{start:1,end:1.32,midis:[50,55,60,65,69]}];
  const loaded = normalizeStudyRun(JSON.parse(JSON.stringify(run)));
  assert.deepEqual(plain(loaded.evidence.voicing_frames),run.evidence.voicing_frames);
  loaded.evidence.voicing_frames[0].midis.push(72);
  assert.equal(run.evidence.voicing_frames[0].midis.length,5);
  assert.equal(normalizeStudyRun({id:'legacy',...result()}).evidence.voicing_frames,undefined);
});

test("simplified display does not invalidate new detections but retains legacy settings", () => {
  const m = model();
  const run = { ...result("Abmaj9"), algorithm_version: "local-study-v3", settings: { simplify_chords: true } };
  const changed = { ...run, settings: { simplify_chords: false } };
  assert.equal(m.compareStudyRuns(run, changed).sameInputs, true);
  assert.equal(m.compareStudyRuns({ ...run, algorithm_version: "local-study-v4" }, { ...changed, algorithm_version: "local-study-v4" }).sameInputs, true);
  assert.equal(m.compareStudyRuns({ ...run, algorithm_version: "local-study-v5" }, { ...changed, algorithm_version: "local-study-v5" }).sameInputs, true);
  assert.equal(m.compareStudyRuns({ ...run, algorithm_version: "local-study-v6" }, { ...changed, algorithm_version: "local-study-v6" }).sameInputs, true);
  assert.equal(m.compareStudyRuns({ ...run, algorithm_version: "local-study-v7" }, { ...changed, algorithm_version: "local-study-v7" }).sameInputs, true);
  assert.equal(m.compareStudyRuns({ ...run, algorithm_version: "local-study-v8" }, { ...changed, algorithm_version: "local-study-v8" }).sameInputs, true);
  assert.equal(m.compareStudyRuns({ ...run, algorithm_version: "local-study-v12" }, { ...changed, algorithm_version: "local-study-v12" }).sameInputs, true);
  assert.equal(m.compareStudyRuns({ ...run, algorithm_version: "local-study-v13" }, { ...changed, algorithm_version: "local-study-v13" }).sameInputs, true);
  for (const version of ["local-study-v14", "local-study-v19", "local-study-v26"]) {
    assert.equal(m.compareStudyRuns({ ...run, algorithm_version: version }, { ...changed, algorithm_version: version }).sameInputs, true);
  }
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

test("a study spanning arrangement chord changes shows clipped passages without inventing an onset", () => {
  const { studyChordOverlaps } = loadScript("src/renderer/study-model.js", ["studyChordOverlaps"]);
  const bars = [
    { chord_events: [{ start: 18.702, end: 19.354, chord: "F#maj7" }] },
    { chord_events: [{ start: 19.354, end: 20.006, chord: "Cm7b5" }, { start: 20.006, end: 20.659, chord: "Cm7b5" }] }
  ];
  assert.deepEqual(plain(studyChordOverlaps(bars, 19.1, 19.8)), [
    { start: 19.1, end: 19.354, chord: "F#maj7" },
    { start: 19.354, end: 19.8, chord: "Cm7b5" }
  ]);
  assert.deepEqual(plain(studyChordOverlaps(bars, 19.4, 19.8)), []);
  assert.deepEqual(plain(studyChordOverlaps([{ chord: "Cm7b5", start: 19.1 }], 19.1, 19.8)), []);
  assert.deepEqual(plain(studyChordOverlaps(bars, 20.55, 20.7)), []); // a short edge overlap alone is not a second chord
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

test('six-nine names and inversions survive saved study JSON and normalization', () => {
  const m = model();
  const saved = m.saveStudyRecord([], {name:'Six-nine',start:1,end:2,sources:['other','bass'],settings:{},corrected_chord:'Cm6/9/G'},
    [{id:'r1',...result('C6/9/E')}], null, 'today', () => 's69');
  const restored = m.normalizeStudies(JSON.parse(JSON.stringify(saved.studies)));
  assert.equal(restored[0].runs[0].chord,'C6/9/E');
  assert.equal(restored[0].corrected_chord,'Cm6/9/G');
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

test("saved spectra round-trip and malformed spectra cannot enter the renderer", () => {
  const m = model();
  const spectrum = { frequencies_hz: [20, 100, 440, 4500], magnitudes_db: [-80, -40, 0, -80], peaks: [{ midi: 69, note: "A4", frequency_hz: 440, level_db: 0 }] };
  const good = { id: "good", ...result(), source_evidence: { other: { spectrum } } };
  const bad = { id: "bad", ...result(), source_evidence: { other: { spectrum: { ...spectrum, frequencies_hz: [20, 440, 100, 4500] } } } };
  const restored = m.normalizeStudies(JSON.parse(JSON.stringify([{ id: "s1", start: 1, end: 2, sources: ["other"], runs: [good, bad] }])));
  assert.equal(restored[0].runs.length, 1);
  assert.deepEqual(plain(restored[0].runs[0].source_evidence.other.spectrum), spectrum);
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
    { id: "scoring", ...result(), evidence: { scoring_pitch_classes: [{ note: "C", accompaniment: 2, scored: NaN }] } },
    { id: "bass-weight", ...result(), evidence: { scoring_bass_weight: 2 } },
    { id: "midi", ...result(), evidence: { detected_pitches: [{ midi: 500, note: "C4", strength: .5, frequency_hz: 261.63 }] } }
  ];
  const record = { id: "s1", start: 1, end: 2, sources: ["other"], runs: [valid, ...invalid], selected_run_id: "digest" };
  const normalized = m.normalizeStudies([record]);
  assert.deepEqual(plain(normalized[0].runs.map((run) => run.id)), ["good"]);
  assert.equal(normalized[0].selected_run_id, "good");
});
