const test = require("node:test");
const assert = require("node:assert/strict");
const { loadScript, plain } = require("./helpers/load-script");

function load(overrides = {}) {
  const state = { chart: null, selectedIndex: -1, ...overrides.state };
  return loadScript("src/renderer/formatters.js", [
    "formatSeconds", "formatConfidence", "confidenceClass", "cloneBar",
    "getSelectedBar", "secondsPerBar"
  ], {
    state,
    hasChart: () => Boolean(state.chart?.bars?.length),
    syncMetaToState: () => {},
    ...overrides
  });
}

test("formatSeconds handles finite, rounded, and invalid values", () => {
  const { formatSeconds } = load();
  assert.equal(formatSeconds(1.234), "1.23");
  assert.equal(formatSeconds(1.235), "1.24");
  assert.equal(formatSeconds(-0.004), "0");
  assert.equal(formatSeconds(NaN), "0");
  assert.equal(formatSeconds(Infinity), "0");
  assert.equal(formatSeconds("2.5"), "0");
});

test("confidence formatting and classes cover thresholds", () => {
  const { formatConfidence, confidenceClass } = load();
  assert.equal(formatConfidence(0), "0%");
  assert.equal(formatConfidence("0.456"), "46%");
  assert.equal(formatConfidence(null), "0%");
  assert.equal(formatConfidence("bad"), "-");
  assert.equal(confidenceClass(undefined), "confidence unknown");
  assert.equal(confidenceClass(0.249), "confidence low");
  assert.equal(confidenceClass(0.25), "confidence medium");
  assert.equal(confidenceClass(0.449), "confidence medium");
  assert.equal(confidenceClass(0.45), "confidence high");
});

test("cloneBar creates an independent deep copy", () => {
  const { cloneBar } = load();
  const original = { chord: "C", alternatives: [{ chord: "Am" }] };
  const clone = cloneBar(original);
  clone.alternatives[0].chord = "F";
  assert.deepEqual(plain(clone), { chord: "C", alternatives: [{ chord: "F" }] });
  assert.equal(original.alternatives[0].chord, "Am");
});

test("selected bar and seconds per bar use chart state safely", () => {
  const chart = { tempo: 120, time_signature: "3/4", bars: [{ chord: "C" }] };
  const loaded = load({ state: { chart, selectedIndex: 0 } });
  assert.equal(loaded.getSelectedBar().chord, "C");
  assert.equal(loaded.secondsPerBar(), 1.5);

  loaded.context.state.selectedIndex = -1;
  assert.equal(loaded.getSelectedBar(), null);
  loaded.context.state.chart = { tempo: 0, time_signature: "bad", bars: [{}] };
  assert.equal(loaded.secondsPerBar(), 2);
});
