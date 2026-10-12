const test = require("node:test");
const assert = require("node:assert/strict");
const { loadScript, plain } = require("./helpers/load-script");
const helpers = loadScript("src/renderer/chord-events.js", ["barChordEvents", "summarizeChordEvents", "splitChordEvent", "mergeChordEvents", "splitEventsAtBoundary", "shiftChordEventTimes", "retimeChordEvents"]);

function environment(bars, selectedIndex = 0) {
  const state = { chart: { duration: 4, bars }, selectedIndex, activeIndex: selectedIndex, selectedChordEventIndex: 0 };
  const endTime = (index) => Number(state.chart.bars[index + 1]?.start ?? state.chart.duration);
  const env = loadScript("src/renderer/actions.js", ["splitSelectedChordEvent", "mergeSelectedChordEvents", "splitBar", "mergeBar", "addBar", "duplicateBar", "deleteBar"], {
    ...helpers, state, cloneBar: (bar) => JSON.parse(JSON.stringify(bar)), getSelectedBar: () => state.chart.bars[state.selectedIndex],
    hasChart: () => state.chart.bars.length > 0, secondsPerBar: () => 2,
    barEndTime: endTime,
    renumberBars() {}, renderBars() {}, syncMetaToState() {},
    syncBarChordSummary(bar) {
      const index = state.chart.bars.indexOf(bar); const event = helpers.summarizeChordEvents(helpers.barChordEvents(bar, endTime(index)));
      if (event) bar.chord = event.chord;
    }
  });
  return { ...env, state };
}

test("chord split and merge keep bar numbering, left correction, evidence history, and alternatives", () => {
  const env = environment([{ number: 1, start: 0, chord: "C", chord_events: [{ start: 0, end: 2, chord: "C", evidence: { id: 1 }, alternatives: [{ chord: "Am", score: .4 }] }] }]);
  env.state.chart.duration = 2;
  env.splitSelectedChordEvent();
  assert.deepEqual(plain(env.state.chart.bars[0].chord_events.map((event) => [event.start, event.end])), [[0, 1], [1, 2]]);
  env.state.chart.bars[0].chord_events[0].chord = "Dm";
  env.mergeSelectedChordEvents();
  const merged = env.state.chart.bars[0].chord_events[0];
  assert.deepEqual([merged.start, merged.end, merged.chord], [0, 2, "Dm"]);
  assert.equal(merged.evidence_stale, true);
  assert.equal(merged.evidence_history.length, 2);
  assert.equal(merged.alternatives[0].chord, "Am");
});

test("musical bar split clips crossing events and measure merge retains ordered events, lyrics, and repeats", () => {
  const env = environment([
    { number: 1, start: 0, chord: "C", lyrics: "first", repeat_start: true, chord_events: [{ start: 0, end: 2, chord: "C", evidence: { id: 1 } }] },
    { number: 2, start: 2, chord: "G", lyrics: "second", repeat_end: 2, chord_events: [{ start: 2, end: 4, chord: "G", evidence: { id: 2 } }] }
  ]);
  env.splitBar();
  assert.deepEqual(plain(env.state.chart.bars.slice(0, 2).map((bar) => [bar.start, bar.chord_events[0].start, bar.chord_events[0].end])), [[0, 0, 1], [1, 1, 2]]);
  env.state.selectedIndex = 1;
  env.mergeBar();
  const merged = env.state.chart.bars[1];
  assert.deepEqual(plain(merged.chord_events.map((event) => [event.start, event.end, event.chord])), [[1, 2, "C"], [2, 4, "G"]]);
  assert.equal(merged.lyrics, "second");
  assert.equal(merged.repeat_start, true);
  assert.equal(merged.repeat_end, 2);
});

test("duplicate splits an available interval without overlapping the following bar", () => {
  const env = environment([
    { number: 1, start: 0, chord: "C", chord_events: [
      { start: 0, end: .8, chord: "C", evidence: { pitches: ["C"] } },
      { start: .8, end: 2, chord: "G", evidence: { pitches: ["G"] } }
    ] },
    { number: 2, start: 2, chord: "Dm", chord_events: [{ start: 2, end: 4, chord: "Dm" }] },
    { number: 3, start: 4, chord: "F", chord_events: [{ start: 4, end: 6, chord: "F" }] }
  ]);
  env.duplicateBar();
  const duplicate = env.state.chart.bars[1];
  assert.deepEqual(plain(env.state.chart.bars.slice(0, 3).map((bar, index) => helpers.barChordEvents(bar, env.state.chart.bars[index + 1]?.start ?? 6).map((event) => [event.start, event.end, event.chord]))), [
    [[0, .8, "C"], [.8, 1, "G"]], [[1, 1.4, "C"], [1.4, 2, "G"]], [[2, 4, "Dm"]]
  ]);
  assert.equal(env.state.chart.bars[0].chord, "C");
  assert.equal(duplicate.chord, "G");
  assert.ok(duplicate.chord_events.every((event) => event.evidence_stale));
  duplicate.chord_events[0].chord = "Am";
  assert.equal(env.state.chart.bars[0].chord_events[0].chord, "C");
});

test("addBar shares the same non-overlapping midpoint split and summary update", () => {
  const env = environment([
    { number: 1, start: 0, chord: "G", chord_events: [
      { start: 0, end: .8, chord: "C" }, { start: .8, end: 2, chord: "G" }
    ] },
    { number: 2, start: 2, chord: "Dm", chord_events: [{ start: 2, end: 4, chord: "Dm" }] },
    { number: 3, start: 4, chord: "F", chord_events: [{ start: 4, end: 6, chord: "F" }] }
  ]);
  env.addBar();
  assert.deepEqual(plain(env.state.chart.bars.slice(0, 3).map((bar, index) => helpers.barChordEvents(bar, env.state.chart.bars[index + 1]?.start ?? 6).map((event) => [event.start, event.end, event.chord]))), [
    [[0, .8, "C"], [.8, 1, "G"]], [[1, 1.4, "C"], [1.4, 2, "G"]], [[2, 4, "Dm"]]
  ]);
  assert.equal(env.state.chart.bars[0].chord, "C");
});

test("deleting a middle bar extends the previous event to the next original boundary", () => {
  const env = environment([
    { number: 1, start: 0, chord: "C", chord_events: [
      { start: 0, end: .8, chord: "C", evidence: { pitches: ["C"] } },
      { start: .8, end: 2, chord: "G", evidence: { pitches: ["G"] } }
    ] },
    { number: 2, start: 2, chord: "Dm", chord_events: [{ start: 2, end: 4, chord: "Dm" }] },
    { number: 3, start: 4, chord: "F", chord_events: [{ start: 4, end: 6, chord: "F" }] }
  ]);
  env.state.selectedIndex = 1;
  env.deleteBar();
  assert.deepEqual(plain(env.state.chart.bars[0].chord_events.map((event) => [event.start, event.end, event.chord])), [[0, .8, "C"], [.8, 4, "G"]]);
  assert.equal(env.state.chart.bars[0].chord_events[0].evidence.pitches[0], "C");
  assert.equal(env.state.chart.bars[0].chord_events[1].evidence_stale, true);
  assert.equal(env.state.chart.bars[1].start, 4);
});

test("selected chord edits affect one stored event and leave analysis evidence intact", () => {
  const bar = { start: 0, chord: "G", notes: "bar note", chord_events: [
    { start: 0, end: .5, chord: "C", evidence: { detected_notes: [{ note: "C" }] }, alternatives: [{ chord: "Am" }] },
    { start: .5, end: 2, chord: "G", evidence: { detected_notes: [{ note: "G" }] }, alternatives: [{ chord: "D" }] }
  ] };
  const state = { chart: { duration: 2, bars: [bar] }, selectedIndex: 0, selectedChordEventIndex: 1 };
  const editor = loadScript("src/renderer/bars.js", ["applySelectedChordCorrection"], {
    ...helpers, state, hasChart: () => true, getSelectedBar: () => bar,
    barChordEvents: helpers.barChordEvents, activeChordEvent: helpers.activeChordEvent, summarizeChordEvents: helpers.summarizeChordEvents,
    barEndTime: () => 2
  });
  editor.applySelectedChordCorrection("chord", "Dm");
  editor.applySelectedChordCorrection("notes", "event note");
  assert.deepEqual(plain(bar.chord_events.map((event) => event.chord)), ["C", "Dm"]);
  assert.equal(bar.chord, "Dm");
  assert.equal(bar.chord_events[1].notes, "event note");
  assert.equal(bar.notes, "bar note");
  assert.deepEqual(plain(bar.chord_events[1].evidence), { detected_notes: [{ note: "G" }] });
});
