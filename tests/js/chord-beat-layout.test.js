const test = require('node:test');
const assert = require('node:assert/strict');
const {loadScript, plain} = require('./helpers/load-script');

function layout() {
  return loadScript('src/renderer/chart-layout.js', ['chordBeatLayout', 'chartBeatAtTime']);
}

test('chord onsets and durations use measured beats, including offbeats and tempo changes', () => {
  const {chordBeatLayout, chartBeatAtTime} = layout();
  const chart = {time_signature:'4/4', beat_times:[10,10.4,11,11.5,12.2]};
  const bar = {start:10};
  const events = [{start:10,end:10.7,chord:'E'}, {start:10.7,end:11.5,chord:'D/F#'}, {start:11.5,end:12.2,chord:'Amaj9'}];
  const snapshot = JSON.stringify({chart,bar,events});
  const model = chordBeatLayout(bar,12.2,chart,events);
  assert.deepEqual(plain(model.anchors),[10,10.4,11,11.5,12.2]);
  assert.deepEqual(plain(model.events).map(e=>[e.offset,e.duration]),[[0,1.5],[1.5,1.5],[3,1]]);
  assert.equal(chartBeatAtTime(10.7,model),1.5);
  assert.equal(chartBeatAtTime(50,model),4);
  assert.equal(JSON.stringify({chart,bar,events}),snapshot);
});

test('legacy bars, pickup measures and incomplete beat maps retain their actual lengths', () => {
  const {chordBeatLayout} = layout();
  const model = chordBeatLayout({start:0,pickup_beats:2},1,{time_signature:'4/4',beat_times:[0,.5,1]},[{start:0,end:1,chord:'C'}]);
  assert.equal(model.beats,2);
  assert.deepEqual(plain(model.labels),[3,4]);
  assert.equal(model.events[0].duration,2);
  const fallback = chordBeatLayout({start:2},5,{time_signature:'3/4',beat_times:[]},[{start:2,end:5,chord:'F'}]);
  assert.deepEqual(plain(fallback.anchors),[2,3,4,5]);
  assert.deepEqual(plain(fallback.labels),[1,2,3]);
});

test('events are clipped to the measure without filling rests or changing the saved event', () => {
  const {chordBeatLayout} = layout();
  const model = chordBeatLayout({start:0},2,{time_signature:'4/4'},[{start:-1,end:.5,chord:'C'},{start:1,end:3,chord:'G'}]);
  assert.deepEqual(plain(model.events).map(e=>[e.offset,e.duration,e.eventIndex]),[[0,1,0],[2,2,1]]);
});
