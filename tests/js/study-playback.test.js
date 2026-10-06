const test = require("node:test");
const assert = require("node:assert/strict");
const { loadScript, plain } = require("./helpers/load-script");

function setup({ deferred = false } = {}) {
  const players = []; const messages = []; let frame; let finish;
  class FakeAudio {
    constructor(url) { this.src = url; this.paused = true; this.currentTime = 0; this.duration = 10; this.events = {}; players.push(this); }
    addEventListener(name, callback) { this.events[name] = callback; }
    play() { this.paused = false; return deferred ? new Promise((resolve) => { finish = () => { this.paused = false; resolve(); }; }) : Promise.resolve(); }
    pause() { this.paused = true; }
  }
  const state = { study: { draft: { start: 2.25, end: 3, sources: ["other"] } }, masterVolume: .4, playbackRate: .75, soloStem: "vocals", stemPlayers: [{ muted: true, volume: .9 }], audioPreview: { url: "transposed" } };
  const before = plain({ solo: state.soloStem, stems: state.stemPlayers });
  const loaded = loadScript("src/renderer/study-playback.js", ["playStudySelection", "stopStudyPlayback", "applyStudyPlaybackSettings", "isStudyPlaying"], {
    state, Audio: FakeAudio, elements: { audioPlayer: { pause() {} } },
    studyOriginalSources: () => ({ other: { url: "original-other" }, full_mix: { url: "original-mix" } }),
    studyDuration: () => 10, studyRangeError: () => "", pauseStems() {}, stopMetronome() {},
    setStatus() {}, setStudyMessage(message) { messages.push(message); }, requestAnimationFrame(callback) { frame = callback; return 1; }, cancelAnimationFrame() {}
  });
  return { ...loaded, players, messages, state, before, tick: () => frame(), finish: () => finish() };
}

test("study playback uses original selected audio and stops precisely at end without mixer changes", async () => {
  const env = setup(); assert.equal(await env.playStudySelection(), true);
  assert.equal(env.players[0].src, "original-other"); assert.equal(env.players[0].currentTime, 2.25);
  assert.equal(env.players[0].volume, .4); assert.equal(env.players[0].playbackRate, .75);
  env.players[0].currentTime = 3; env.tick();
  assert.equal(env.players[0].paused, true); assert.equal(env.isStudyPlaying(), false);
  assert.deepEqual(plain({ solo: env.state.soloStem, stems: env.state.stemPlayers }), env.before);
});

test("loop seeks back to selection start and settings update during playback", async () => {
  const env = setup(); await env.playStudySelection({ loop: true });
  env.players[0].currentTime = 3; env.tick(); assert.equal(env.players[0].currentTime, 2.25);
  env.state.masterVolume = .2; env.applyStudyPlaybackSettings(); assert.equal(env.players[0].volume, .2);
  env.stopStudyPlayback(); assert.equal(env.players[0].paused, true);
});

test("late play promise cannot restart players after navigation stops a study", async () => {
  const env = setup({ deferred: true });
  const pending = env.playStudySelection(); env.stopStudyPlayback(); env.finish();
  assert.equal(await pending, false); assert.equal(env.players[0].paused, true);
});

test("playback feedback and source failures appear in the Local Study panel", async () => {
  const env = setup(); await env.playStudySelection({ loop: true });
  assert.match(env.messages.at(-1), /Looping/);
  env.players[0].events.error();
  assert.match(env.messages.at(-1), /Unable to play source other/);
  assert.equal(env.isStudyPlaying(), false);
});

test("media events enforce boundaries when animation frames are suspended", async () => {
  const env = setup(); await env.playStudySelection();
  env.players[0].currentTime = 3;
  env.players[0].events.timeupdate?.();
  assert.equal(env.players[0].paused, true);
  assert.equal(env.isStudyPlaying(), false);
  await env.playStudySelection({ loop: true });
  env.players[1].currentTime = 3;
  env.players[1].events.timeupdate?.();
  assert.equal(env.players[1].currentTime, 2.25);
  env.players[1].currentTime = 10;
  env.players[1].events.ended?.();
  assert.equal(env.players[1].currentTime, 2.25);
  env.stopStudyPlayback();
});
