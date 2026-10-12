const test = require("node:test");
const assert = require("node:assert/strict");
const { loadScript, plain } = require("./helpers/load-script");

const events = loadScript("src/renderer/chord-events.js", ["barChordEvents", "activeChordEvent", "summarizeChordEvents", "splitChordEvent", "mergeChordEvents", "moveChordBoundary", "splitEventsAtBoundary", "shiftChordEventTimes"]);

test("legacy bars produce a non-mutating one-event view", () => {
  const bar = { start: 0, chord: "C", confidence: 0.7 };
  assert.deepEqual(plain(events.barChordEvents(bar, 2)), [{ start: 0, end: 2, chord: "C", confidence: 0.7 }]);
  assert.equal(Object.hasOwn(bar, "chord_events"), false);
});

test("event selection includes a boundary in the event starting there", () => {
  const items = [{ start: 0, end: 1, chord: "C" }, { start: 1, end: 2, chord: "G" }];
  assert.equal(events.activeChordEvent(items, 1), 1);
  assert.equal(events.activeChordEvent(items, 2), -1);
});

test("summary picks the longest event and keeps the earliest on ties", () => {
  assert.equal(events.summarizeChordEvents([{ start: 0, end: 1, chord: "C" }, { start: 1, end: 2, chord: "G" }]).chord, "C");
  assert.equal(events.summarizeChordEvents([{ start: 0, end: 0.5, chord: "C" }, { start: 0.5, end: 2, chord: "G" }]).chord, "G");
});

test("malformed and overlapping events fall back without mutating source", () => {
  const source = [{ start: 0, end: 1, chord: "C", alternatives: [] }, { start: 0.5, end: 2, chord: "G" }];
  const bar = { start: 0, chord: "Am", chord_events: source };
  assert.deepEqual(plain(events.barChordEvents(bar, 2)), [{ start: 0, end: 2, chord: "Am" }]);
  assert.equal(source[0].end, 1);
  const gap = [{ start: 0, end: .5, chord: "C" }, { start: .6, end: 2, chord: "G" }];
  assert.deepEqual(plain(events.barChordEvents({ start: 0, chord: "Am", chord_events: gap }, 2)), [{ start: 0, end: 2, chord: "Am" }]);
  assert.equal(events.activeChordEvent([{ start: 0, end: 2, chord: "" }], 1), -1);
});

test("event copies retain evidence and alternatives", () => {
  const input = [{ start: 0, end: 1, chord: "C", alternatives: [{ chord: "Am", score: 0.2 }], evidence: { pitches: ["C"] } }];
  const copied = events.barChordEvents({ start: 0, chord: "C", chord_events: input }, 1);
  assert.deepEqual(plain(copied[0].evidence), { pitches: ["C"] });
  assert.notEqual(copied[0], input[0]);
});

test("event splits, boundary moves, and merges preserve intervals and stale evidence", () => {
  const source = [{ start: 0, end: 2, chord: "C", evidence: { pitches: ["C"] }, alternatives: [{ chord: "Am", score: .4 }] }];
  const split = events.splitChordEvent(source, 0, 1);
  assert.deepEqual(plain(split.map(({ start, end }) => [start, end])), [[0, 1], [1, 2]]);
  assert.equal(split[0].evidence_stale, true);
  assert.deepEqual(plain(source.map(({ start, end }) => [start, end])), [[0, 2]]);
  const moved = events.moveChordBoundary(split, 0, 1.25);
  assert.deepEqual(plain(moved.map(({ start, end }) => [start, end])), [[0, 1.25], [1.25, 2]]);
  const merged = events.mergeChordEvents(moved, 0);
  assert.deepEqual(plain(merged.map(({ start, end, chord }) => [start, end, chord])), [[0, 2, "C"]]);
  assert.equal(merged[0].evidence_stale, true);
  assert.equal(merged[0].alternatives[0].chord, "Am");
  const short = events.moveChordBoundary([{ start: 0, end: .04, chord: "C" }, { start: .04, end: .08, chord: "G" }], 0, .06);
  assert.equal(short[0].end, .04);
  assert.equal(events.mergeChordEvents([{ start: 0, end: .04, chord: "C" }, { start: .04, end: .08, chord: "G" }], 0).length, 1);
});

test("splitting a musical bar repartitions crossing events and deep copies evidence", () => {
  const source = [{ start: 0, end: 2, chord: "C", evidence: { source: "analysis" }, alternatives: [{ chord: "Am" }] }];
  const [left, right] = events.splitEventsAtBoundary(source, 1);
  assert.deepEqual(plain(left.map(({ start, end }) => [start, end])), [[0, 1]]);
  assert.deepEqual(plain(right.map(({ start, end }) => [start, end])), [[1, 2]]);
  assert.notEqual(left[0], right[0]);
  right[0].alternatives[0].chord = "G";
  assert.equal(left[0].alternatives[0].chord, "Am");
});

test("selected event follows the active playback event without changing selected bar", () => {
  const state = { chart: { duration: 2, bars: [{ start: 0, chord: "C", chord_events: [{ start: 0, end: 1, chord: "C" }, { start: 1, end: 2, chord: "G", alternatives: [{ chord: "D", score: .3 }] }] }] }, selectedIndex: 0, activeIndex: -1, selectedChordEventIndex: 0, audioPreview: { tempoRate: 2 } };
  let updated = 0;
  const bars = loadScript("src/renderer/bars.js", ["getSelectedChordEvent", "selectedChordTarget", "syncBarChordSummary", "selectBar", "updateActiveBarFromPlayback"], {
    state, barChordEvents: events.barChordEvents, activeChordEvent: events.activeChordEvent, summarizeChordEvents: events.summarizeChordEvents,
    hasChart: () => true, elements: { audioPlayer: { currentTime: .5, duration: 2 } }, syncStemTimes() {}, updateRowState() { updated += 1; }
  });
  bars.updateActiveBarFromPlayback();
  assert.equal(state.activeIndex, 0);
  assert.equal(state.activeChordEventIndex, 1);
  assert.equal(state.selectedIndex, 0);
  state.selectedChordEventIndex = 1;
  const selected = bars.getSelectedChordEvent();
  assert.equal(selected.chord, "G");
  selected.chord = "D";
  assert.equal(state.chart.bars[0].chord_events[1].chord, "D");
  bars.syncBarChordSummary(state.chart.bars[0]);
  assert.equal(state.chart.bars[0].chord, "C");
  assert.equal(state.chart.bars[0].chord_events[1].start, 1);
  bars.selectBar(0, true, 1);
  assert.equal(state.selectedChordEventIndex, 1);
  assert.equal(bars.context.elements.audioPlayer.currentTime, .5);
  assert.equal(updated, 2);
});

test("malformed stored events fall back to an editable legacy summary", () => {
  const bar = { start: 0, chord: "Am", chord_events: [{ start: 0, end: .5, chord: "C" }, { start: .25, end: 2, chord: "G" }] };
  const state = { chart: { duration: 2, bars: [bar] }, selectedIndex: 0 };
  const bars = loadScript("src/renderer/bars.js", ["selectedChordTarget"], {
    state, barChordEvents: events.barChordEvents, activeChordEvent: events.activeChordEvent, summarizeChordEvents: events.summarizeChordEvents,
    hasChart: () => true
  });
  const target = bars.selectedChordTarget();
  target.chord = "D";
  assert.equal(bar.chord, "D");
  assert.equal(bar.chord_events[0].chord, "C");
});

test("playback stays on the containing event just before a bar boundary", () => {
  const state = { chart: { duration: 4, bars: [
    { start: 0, chord: "C", chord_events: [{ start: 0, end: 2, chord: "C" }] },
    { start: 2, chord: "G", chord_events: [{ start: 2, end: 4, chord: "G" }] }
  ] }, selectedIndex: 0, activeIndex: 0, activeChordEventIndex: -1, audioPreview: { tempoRate: 1 } };
  const bars = loadScript("src/renderer/bars.js", ["updateActiveBarFromPlayback", "findActiveBarIndex"], {
    state, barChordEvents: events.barChordEvents, activeChordEvent: events.activeChordEvent,
    chordEventsForBar: (index) => events.barChordEvents(state.chart.bars[index], state.chart.bars[index + 1]?.start ?? state.chart.duration),
    hasChart: () => true, elements: { audioPlayer: { currentTime: 1.99, duration: 4 } },
    updateRowState() {}, syncStemTimes() {}
  });
  assert.equal(bars.findActiveBarIndex(1.99), 1); // Keep the existing anticipation helper stable.
  bars.updateActiveBarFromPlayback();
  assert.equal(state.activeIndex, 0);
  assert.equal(state.activeChordEventIndex, 0);
  bars.context.elements.audioPlayer.currentTime = 2;
  bars.updateActiveBarFromPlayback();
  assert.equal(state.activeIndex, 1);
  assert.equal(state.activeChordEventIndex, 0);
});
