const test = require("node:test");
const assert = require("node:assert/strict");
const { loadScript, plain } = require("./helpers/load-script");

function load(chart, inputs = {}) {
  const state = { chart, metronomeVolume: 0.45 };
  return loadScript("src/renderer/metronome.js", [
    "metronomeBeatsPerBar", "metronomeSecondsPerBeat", "collectMetronomeTicks",
    "collectGridMetronomeTicks", "playMetronomeClick"
  ], {
    state,
    elements: {
      timeInput: { value: inputs.time || "4/4" },
      tempoInput: { value: inputs.tempo || "120" },
      audioPlayer: { paused: true }
    },
    window: {},
    setStatus: (message) => { state.status = message; }
  });
}

test("meter and tempo values are parsed and clamped", () => {
  assert.equal(load({ time_signature: "7/8", tempo: 240 }).metronomeBeatsPerBar(), 7);
  assert.equal(load({ time_signature: "20/4", tempo: 400 }).metronomeBeatsPerBar(), 16);
  assert.equal(load({ time_signature: "bad", tempo: 20 }).metronomeSecondsPerBeat(), 2);
  assert.equal(load(null, { time: "3/4", tempo: "60" }).metronomeBeatsPerBar(), 3);
});

test("grid ticks include boundaries and accent each bar", () => {
  const m = load(null);
  assert.deepEqual(plain(m.collectGridMetronomeTicks(0.4, 2.1, 0.5, 4)), [
    { time: 0.5, accented: false, key: "grid:1:0.500" },
    { time: 1, accented: false, key: "grid:2:1.000" },
    { time: 1.5, accented: false, key: "grid:3:1.500" },
    { time: 2, accented: true, key: "grid:4:2.000" }
  ]);
});

test("chart-aligned ticks respect bar boundaries and invalid bars", () => {
  const chart = { tempo: 120, time_signature: "4/4", bars: [{ start: 0 }, { start: 2 }, { start: "bad" }] };
  const ticks = plain(load(chart).collectMetronomeTicks(1.4, 2.6));
  assert.deepEqual(ticks.map((tick) => tick.time), [1.5, 2, 2.5]);
  assert.deepEqual(ticks.map((tick) => tick.accented), [false, true, false]);
});

test("click scheduling validates context and silent volume", () => {
  const m = load(null);
  m.playMetronomeClick(null, 1, true);
  assert.equal(m.context.state.status, "Metronome click could not be scheduled");

  let created = 0;
  const context = { createOscillator: () => { created += 1; return {}; } };
  m.context.state.metronomeVolume = 0;
  m.playMetronomeClick(context, 1, true);
  assert.equal(created, 0);
});
