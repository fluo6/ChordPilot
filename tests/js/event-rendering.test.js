const test = require("node:test");
const assert = require("node:assert/strict");
const { loadScript, plain } = require("./helpers/load-script");
const eventHelpers = loadScript("src/renderer/chord-events.js", ["barChordEvents", "activeChordEvent", "summarizeChordEvents", "moveChordBoundary"]);

test("timeline event regions align labels and widths to timed changes inside one bar", () => {
  const state = { chart: { duration: 2, bars: [{ start: 0, chord: "C", chord_events: [{ start: 0, end: 1, chord: "C" }, { start: 1, end: 2, chord: "G" }] }] } };
  const timeline = loadScript("src/renderer/timeline.js", ["chordEventRegionLayout"], {
    state, ...eventHelpers, chordEventsForBar: (index) => eventHelpers.barChordEvents(state.chart.bars[index], 2),
    percentAt: (time) => time / state.chart.duration * 100
  });
  assert.deepEqual(plain(timeline.chordEventRegionLayout(0).map(({ left, width, chordEvent }) => [left, width, chordEvent.chord])), [[0, 50, "C"], [50, 50, "G"]]);
});

function dragEnvironment() {
  const state = { chart: { duration: 4, bars: [
    { start: 0, chord: "C", chord_events: [{ start: 0, end: 1, chord: "C" }, { start: 1, end: 2, chord: "G" }] },
    { start: 2, chord: "Dm", chord_events: [{ start: 2, end: 3, chord: "Dm" }, { start: 3, end: 4, chord: "F" }] }
  ] }, audio: { path: "song.wav" }, currentView: "song", editorPanel: "arrange" };
  const regions = state.chart.bars.flatMap((bar, index) => bar.chord_events.map((_, eventIndex) => ({
    dataset: { index: String(index), eventIndex: String(eventIndex) }, style: {}
  })));
  const body = { getBoundingClientRect: () => ({ left: 0, width: 100 }), setPointerCapture() {}, querySelectorAll: () => regions };
  let rendered = 0;
  let focused = 0;
  let currentSlider = { focus() { focused += 1; } };
  const timeline = loadScript("src/renderer/timeline.js", ["startChordBoundaryDrag", "updateChordBoundaryDrag", "finishChordBoundaryDrag", "cancelChordBoundaryDrag", "handleChordBoundaryKeydown"], {
    state, moveChordBoundary: eventHelpers.moveChordBoundary,
    getChartDuration: () => state.chart.duration, percentAt: (time) => time / state.chart.duration * 100,
    chordEventsForBar: (index) => state.chart.bars[index].chord_events,
    syncBarChordSummary() {}, renderBars() { rendered += 1; currentSlider = { focus() { focused += 1; } }; },
    document: { querySelector: () => currentSlider }
  });
  return { state, regions, body, timeline, rendered: () => rendered, focused: () => focused };
}

function pointerEvent(pointerId, clientX, target = null) { return { pointerId, clientX, target, currentTarget: target, preventDefault() {}, stopPropagation() {} }; }

test("boundary drag updates only its bar regions and aborts on chart replacement", () => {
  const env = dragEnvironment();
  const beforeOtherBar = plain(env.regions.slice(2).map((region) => region.style));
  env.timeline.startChordBoundaryDrag(pointerEvent(1, 25), 0, 0, env.body);
  env.timeline.updateChordBoundaryDrag(pointerEvent(1, 31.25), env.body);
  assert.deepEqual(plain(env.state.chart.bars[0].chord_events.map((event) => [event.start, event.end])), [[0, 1.25], [1.25, 2]]);
  assert.deepEqual(plain(env.regions.slice(2).map((region) => region.style)), beforeOtherBar);

  const replacement = { duration: 4, bars: [{ start: 0, chord: "Am", chord_events: [{ start: 0, end: 1, chord: "Am" }, { start: 1, end: 4, chord: "G" }] }] };
  env.state.chart = replacement;
  env.timeline.updateChordBoundaryDrag(pointerEvent(1, 32), env.body);
  assert.equal(env.state.chordBoundaryDrag, null);
  assert.deepEqual(plain(replacement.bars[0].chord_events.map((event) => [event.start, event.end])), [[0, 1], [1, 4]]);
  assert.equal(env.rendered(), 0);
});

test("boundary drag cancels when leaving its view and on lost pointer capture", () => {
  const env = dragEnvironment();
  env.timeline.startChordBoundaryDrag(pointerEvent(2, 25), 0, 0, env.body);
  env.state.currentView = "home";
  env.timeline.finishChordBoundaryDrag(pointerEvent(2, 25), env.body);
  assert.equal(env.state.chordBoundaryDrag, null);
  assert.equal(env.rendered(), 0);
  env.state.currentView = "song";
  env.timeline.startChordBoundaryDrag(pointerEvent(3, 25), 0, 0, env.body);
  env.timeline.cancelChordBoundaryDrag(pointerEvent(3, 25), env.body);
  assert.equal(env.state.chordBoundaryDrag, null);
});

test("pointer boundary interaction moves focus to the keyboard-adjustable slider", () => {
  const env = dragEnvironment();
  let focused = 0;
  env.timeline.startChordBoundaryDrag(pointerEvent(4, 25, { focus() { focused += 1; } }), 0, 0, env.body);
  assert.equal(focused, 1);
  env.timeline.cancelChordBoundaryDrag(pointerEvent(4, 25), env.body);
});

test("pointerup and repeated arrow edits restore boundary focus without seeking audio", () => {
  const env = dragEnvironment();
  env.timeline.startChordBoundaryDrag(pointerEvent(5, 25), 0, 0, env.body);
  env.timeline.finishChordBoundaryDrag(pointerEvent(5, 25), env.body);
  assert.equal(env.focused(), 1);

  const audio = { currentTime: 14 };
  for (let count = 0; count < 2; count += 1) {
    let stopped = false;
    env.timeline.handleChordBoundaryKeydown({ key: "ArrowRight", preventDefault() {}, stopPropagation() { stopped = true; } }, 0, 0);
    if (!stopped) audio.currentTime += 5; // model the document-level seek shortcut
    assert.equal(stopped, true);
    assert.equal(env.focused(), count + 2);
  }
  assert.equal(audio.currentTime, 14);
  assert.equal(env.state.chart.bars[0].chord_events[0].end, 1.1);
});
