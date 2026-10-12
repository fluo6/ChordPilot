const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
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

test("sampled piano uses nearby recordings at the correct pitch, respects mute, and cleans up", async () => {
  const voices = [];
  let resumes = 0;
  let status = "";
  const state = { masterVolume: 0.5 };
  const context = {
    currentTime: 3, state: "suspended", destination: {},
    resume() { resumes += 1; this.state = "running"; return Promise.resolve(); },
    createMediaElementSource(audio) {
      const source = { connect() {}, disconnect() { this.disconnected = true; } };
      audio.sourceNode = source; return source;
    },
    createGain() {
      const gain = { gain: { setValueAtTime(value) { gain.peak = value; }, linearRampToValueAtTime(value) { gain.peak = value; }, exponentialRampToValueAtTime() {} },
        connect() {}, disconnect() { this.disconnected = true; } };
      voices.at(-1).gainNode = gain; return gain;
    }
  };
  const m = loadScript("src/renderer/metronome.js", ["playPianoNote"], {
    state, window: { AudioContext: function () { return context; } },
    Audio: function (src) {
      this.src = src; this.play = () => state.failPlay ? Promise.reject(new Error("sample unavailable")) : Promise.resolve(); this.pause = () => { this.paused = true; };
      voices.push(this);
    }, setTimeout: () => 1, clearTimeout() {}, setStatus(message) { status = message; }
  });
  await m.playPianoNote(69); await m.playPianoNote(60); await m.playPianoNote(61);
  assert.equal(resumes, 1);
  assert.equal(voices[0].src, "./piano-samples/A4.mp3");
  assert.equal(voices[1].src, "./piano-samples/C4.mp3");
  assert.equal(voices[2].src, "./piano-samples/C4.mp3");
  assert.equal(voices[0].playbackRate, 1);
  assert.ok(Math.abs(voices[2].playbackRate - 2 ** (1 / 12)) < 1e-8);
  assert.ok(voices.every((voice) => voice.preservesPitch === false));
  voices[0].onended();
  assert.equal(voices[0].sourceNode.disconnected, true); assert.equal(voices[0].gainNode.disconnected, true);
  await m.playPianoNote(33);
  assert.equal(voices[3].src, "./piano-samples/A1.mp3");
  assert.ok(voices[3].gainNode.peak > voices[0].gainNode.peak, "low notes receive bounded volume compensation");
  assert.ok(voices[3].gainNode.peak <= 1);
  for (let midi = 21; midi <= 108; midi += 1) {
    await m.playPianoNote(midi);
    const voice = voices.at(-1);
    assert.ok(fs.existsSync(path.join(__dirname, '../../src/renderer', voice.src)), voice.src);
    const [, note, octave] = voice.src.match(/(A|C|Ds|Fs)(\d)\.mp3$/);
    const recordedMidi = (Number(octave) + 1) * 12 + { A: 9, C: 0, Ds: 3, Fs: 6 }[note];
    assert.ok(Math.abs(recordedMidi + 12 * Math.log2(voice.playbackRate) - midi) < 1e-8);
    assert.ok(Math.abs(recordedMidi - midi) <= 1);
  }
  state.failPlay = true;
  await m.playPianoNote(60);
  assert.match(status, /sample unavailable/);
  assert.equal(voices.at(-1).paused, true);
  assert.equal(voices.at(-1).sourceNode.disconnected, true);
  const voiceCount = voices.length;
  state.masterVolume = 0;
  m.playPianoNote(60); m.playPianoNote(20); m.playPianoNote(109); m.playPianoNote(NaN);
  assert.equal(voices.length, voiceCount);
});
