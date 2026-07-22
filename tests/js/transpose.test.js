const test = require("node:test");
const assert = require("node:assert/strict");
const { loadScript, plain } = require("./helpers/load-script");

const PITCH_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const ENHARMONIC_TO_PITCH = { DB: "C#", "D#": "Eb", GB: "F#", "G#": "Ab", "A#": "Bb" };

function load(chart = null) {
  const state = { chart, tuningReferenceHz: 440 };
  return loadScript("src/renderer/transpose.js", [
    "transposeModulo", "wrapTransposeOffset", "transposeNormalizePitchName", "transposePitchIndex",
    "transposePitchName", "keyOffsetBetween", "transposeKeyName", "ensureChartKeyState",
    "ensureChartTempoState", "chartKeyText", "detectedKeySuffix", "audioTempoRate",
    "clampTuningReferenceHz", "tuningCents", "tuningSemitones", "formatCents",
    "transposeChordText", "transposeChordChoice", "transposeBarChordFields", "transposeChartBySemitones"
  ], {
    PITCH_NAMES, ENHARMONIC_TO_PITCH, state,
    elements: {},
    hasChart: () => Boolean(state.chart?.bars?.length)
  });
}

test("pitch arithmetic wraps positive and negative values", () => {
  const t = load();
  assert.equal(t.transposeModulo(13), 1);
  assert.equal(t.transposeModulo(-1), 11);
  assert.equal(t.transposeModulo(-9, 7), 5);
  assert.equal(t.wrapTransposeOffset(12), 0);
  assert.equal(t.wrapTransposeOffset(25), 1);
  assert.equal(t.wrapTransposeOffset(-25), -1);
  assert.equal(t.wrapTransposeOffset("bad"), 0);
});

test("pitch normalization handles case and enharmonics", () => {
  const t = load();
  const cases = { db: "C#", "D#": "Eb", gb: "F#", "G#": "Ab", "A#": "Bb", "E#": "F", "B#": "C", Cb: "B", Fb: "E", f: "F", "": "" };
  for (const [input, expected] of Object.entries(cases)) {
    assert.equal(t.transposeNormalizePitchName(input), expected);
  }
  assert.equal(t.transposePitchIndex("Db"), 1);
  assert.equal(t.transposePitchIndex("H"), -1);
});

test("pitch and key transposition preserves suffixes and chooses shortest offset", () => {
  const t = load();
  assert.equal(t.transposePitchName("B", 1), "C");
  assert.equal(t.transposePitchName("C", -1), "B");
  assert.equal(t.transposePitchName("H", 2), "H");
  assert.equal(t.keyOffsetBetween("C", "F#"), 6);
  assert.equal(t.keyOffsetBetween("C", "B"), -1);
  assert.equal(t.keyOffsetBetween("bad", "C"), 0);
  assert.equal(t.transposeKeyName("Am", 2), "Bm");
  assert.equal(t.transposeKeyName("Db major", -1), "C major");
  assert.equal(t.transposeKeyName("unknown", 2), "unknown");
});

test("chart key and tempo state initializes and normalizes offsets", () => {
  const chart = { key: "D", native_key: "C", key_offset: 13, tempo: 90 };
  const t = load(chart);
  t.ensureChartKeyState(chart);
  t.ensureChartTempoState(chart);
  assert.equal(chart.detected_key, "C");
  assert.equal(chart.key_offset, 1);
  assert.equal(chart.detected_tempo, 90);
  assert.equal(chart.native_tempo, 90);
  assert.equal(t.chartKeyText(chart), "D (+1)");
  assert.equal(t.detectedKeySuffix({ detected_key: "F#m" }), "m");
  assert.equal(t.audioTempoRate(), 1);
});

test("tuning helpers clamp and format musically useful values", () => {
  const t = load();
  assert.equal(t.clampTuningReferenceHz(390), 400);
  assert.equal(t.clampTuningReferenceHz(500), 480);
  assert.equal(t.clampTuningReferenceHz("bad"), 440);
  assert.equal(t.formatCents(0.049), "0 cents");
  assert.equal(t.formatCents(12.34), "+12.3 cents");
  assert.equal(t.formatCents(-12.36), "-12.4 cents");
  t.context.state.tuningReferenceHz = 880;
  assert.ok(t.tuningCents() > 150 && t.tuningCents() < 151);
  assert.ok(t.tuningSemitones() > 1.5 && t.tuningSemitones() < 1.51);
});

test("chord text transposition handles roots, slash bass, lists, and no-chord", () => {
  const t = load();
  assert.equal(t.transposeChordText("Cmaj7/G", 2), "Dmaj7/A");
  assert.equal(t.transposeChordText("Am D7 | G", -2), "Gm C7 | F");
  assert.equal(t.transposeChordText("(Bb7), Eb/G", 1), "(B7), E/Ab");
  assert.equal(t.transposeChordText("N.C.", 5), "N.C.");
  assert.equal(t.transposeChordText("/", 5), "/");
  assert.equal(t.transposeChordText(null, 5), "");
});

test("bar transposition updates every stored chord choice", () => {
  const bar = {
    chord: "C",
    alternatives: [{ chord: "Am", score: 0.7 }],
    debug: { chosen_chord: "G/B", alternatives: [{ chord: "F" }] }
  };
  const chart = { bars: [bar] };
  const t = load(chart);
  t.transposeChartBySemitones(2);
  assert.deepEqual(plain(bar), {
    chord: "D",
    alternatives: [{ chord: "Bm", score: 0.7 }],
    debug: { chosen_chord: "A/C#", alternatives: [{ chord: "G" }] }
  });
  t.transposeBarChordFields(null, 2);
});
