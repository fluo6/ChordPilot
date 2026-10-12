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

test("piano audition plays the requested pitch, respects mute, and releases audio nodes", () => {
  const voices = [];
  let resumes = 0;
  const state = { masterVolume: 0.5 };
  const context = {
    currentTime: 3, state: "suspended", destination: {},
    createPeriodicWave(real, imaginary) { return { real, imaginary }; },
    resume() { resumes += 1; this.state = "running"; return Promise.resolve(); },
    createOscillator() {
      const voice = { frequency: { setValueAtTime(value) { voice.hz = value; } },
        setPeriodicWave(wave) { this.wave = wave; },
        connect() {}, start(time) { this.started = time; }, stop(time) { this.stopped = time; },
        disconnect() { this.disconnected = true; } };
      voices.push(voice); return voice;
    },
    createGain() {
      const gain = { gain: { setValueAtTime() {}, linearRampToValueAtTime(value) { gain.peak = value; }, exponentialRampToValueAtTime() {} },
        connect() {}, disconnect() { this.disconnected = true; } };
      voices.at(-1).gainNode = gain; return gain;
    }
  };
  const m = loadScript("src/renderer/metronome.js", ["playPianoNote"], {
    state, window: { AudioContext: function () { return context; } }, setStatus() {}
  });
  m.playPianoNote(69); m.playPianoNote(60); m.playPianoNote(61);
  assert.equal(resumes, 1);
  assert.equal(voices[0].hz, 440);
  assert.ok(Math.abs(voices[1].hz - 261.626) < .001);
  assert.ok(Math.abs(voices[2].hz - 277.183) < .001);
  assert.ok(voices.every((voice) => voice.stopped > voice.started && voice.stopped - voice.started < 1));
  assert.equal(voices[0].gainNode.peak, .075);
  voices[0].onended();
  assert.equal(voices[0].disconnected, true); assert.equal(voices[0].gainNode.disconnected, true);
  m.playPianoNote(33);
  assert.equal(voices[3].hz, 55);
  assert.ok(voices[3].wave.imaginary[2] > .2, "low notes have audible upper harmonics");
  assert.ok(voices[3].gainNode.peak > voices[0].gainNode.peak, "low notes receive bounded volume compensation");
  assert.ok(voices[3].gainNode.peak <= .15);
  assert.equal(voices[0].type, "triangle", "upper notes retain their existing sound");
  state.masterVolume = 0;
  m.playPianoNote(60); m.playPianoNote(20); m.playPianoNote(109); m.playPianoNote(NaN);
  assert.equal(voices.length, 4);
});
