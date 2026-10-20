const test = require('node:test');
const assert = require('node:assert/strict');
const {loadScript, plain} = require('./helpers/load-script');
const BassTuning=require('../../src/renderer/bass-tuning.js');

function bass() {
  const {measuredBassMidi} = loadScript('src/renderer/bars.js',['measuredBassMidi'],{
    pitchIndex:note=>['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'].indexOf(note)
  });
  return loadScript('src/renderer/bass-view.js',['bassPositions','bassBarNotes','bassChartNotes','activeBassNote'],{measuredBassMidi,BassTuning});
}
const cell=(start,end,midi)=>({start,end,bass_reference:{pitch_class:midi%12,detected_pitches:[{midi,strength:1}]}});

test('bass chart groups consecutive identical display labels without changing chord data or selection indices',()=>{
  const {displayChordSymbol}=loadScript('src/renderer/bars.js',['displayChordSymbol'],{elements:{simplifyChordsInput:{checked:true}},state:{}});
  const {bassChartChordLabels}=loadScript('src/renderer/bass-view.js',['bassChartChordLabels'],{displayChordSymbol});
  assert.equal(typeof bassChartChordLabels,'function');
  const chords=[['Fmaj7',0,.5],['Fmaj9',.5,1],['Fmaj7/C',1,1.5],['Fmaj13/C',1.5,2],
    ['Dm9',2,2.5],['Fmaj7/C',2.5,3],['Fmaj7/C',3.2,3.5]].map(([chord,start,end])=>({chord,start,end}));
  const before=JSON.stringify(chords);
  const labels=bassChartChordLabels(chords);
  assert.deepEqual(plain(labels).map(item=>[item.eventIndex,item.label,item.event.start,item.event.end]),
    [[0,'Fmaj7',0,1],[2,'Fmaj7/C',1,2],[4,'Dm7',2,2.5],[5,'Fmaj7/C',2.5,3],[6,'Fmaj7/C',3.2,3.5]]);
  assert.equal(JSON.stringify(chords),before);
});

test('measured reattacks stay separate while clipped pieces of one attack stay tied',()=>{
  const {bassChartNotes}=bass();
  const chart={duration:2,bars:[
    {start:0,bass_events:[{start:0,end:.6,midi:37,attack_start:0},{start:.6,end:1,midi:37,attack_start:.6}]},
    {start:1,bass_events:[{start:1,end:1.4,midi:37,attack_start:.6},{start:1.4,end:2,midi:37,attack_start:1.4}]}]};
  const snapshot=JSON.stringify(chart);
  const notes=bassChartNotes(chart,4);
  assert.deepEqual(plain(notes[0]).map(n=>[n.start,n.end]),[[0,.6],[.6,1]]);
  assert.deepEqual(plain(notes[1]).map(n=>[n.start,n.end]),[[1,1.4],[1.4,2]]);
  assert.equal(notes[0][0].continuesToNext,false);
  assert.equal(notes[0][1].continuesToNext,true);
  assert.equal(notes[1][0].continuesFromPrevious,true);
  assert.equal(notes[1][1].continuesFromPrevious,false);
  assert.equal(JSON.stringify(chart),snapshot);
});

test('bass chart keeps measured notes, cross-bar fingering and ties when transposed',()=>{
  const {bassChartNotes}=bass();
  const chart={duration:6,key_offset:2,bars:[
    {start:0,bass_events:[{start:0,end:1.5,midi:28},{start:1.5,end:2.5,midi:33}]},
    {start:2,bass_events:[]},{start:4,bass_events:[]}
  ]};
  const saved=JSON.stringify(chart);
  const notes=bassChartNotes(chart,4);
  assert.deepEqual(plain(notes[0]).map(n=>[n.start,n.end,n.midi]),[[0,1.5,30],[1.5,2,35]]);
  assert.deepEqual(plain(notes[1]).map(n=>[n.start,n.end,n.midi]),[[2,2.5,35]]);
  assert.equal(notes[0][1].continuesToNext,true);
  assert.equal(notes[1][0].continuesFromPrevious,true);
  assert.deepEqual(plain(notes[0][1].position),plain(notes[1][0].position));
  assert.deepEqual(plain(notes[2]),[]);
  assert.equal(JSON.stringify(chart),saved);
});

test('bass chart respects tuning and never invents a bass note from a chord root',()=>{
  const {bassChartNotes}=bass();
  const chart={duration:4,key_offset:-5,bars:[{start:0,bass_events:[{start:0,end:2,midi:28}]},
    {start:2,chord:'C',bass_reference:{note:'C',pitch_class:0}}]};
  assert.equal(bassChartNotes(chart,4)[0][0].position,null);
  assert.deepEqual(plain(bassChartNotes(chart,5)[0][0].position),{string:5,fret:0});
  assert.deepEqual(plain(bassChartNotes(chart,5)[1]),[]);
});

test('bass chart preserves ties for notes that extend beyond the displayed chart',()=>{
  const {bassChartNotes}=bass();
  const notes=bassChartNotes({duration:2,bars:[{start:0,bass_events:[{start:-.25,end:2.25,midi:31}]}]},4)[0];
  assert.equal(notes[0].start,0);
  assert.equal(notes[0].end,2);
  assert.equal(notes[0].continuesFromPrevious,true);
  assert.equal(notes[0].continuesToNext,true);
});

test('bass preview uses independent fundamentals and timings ahead of chord-cell peaks',()=>{
  const {bassBarNotes,activeBassNote}=bass();
  const bar={start:1,bass_events:[{start:.9,end:1.4,midi:31,confidence:.95},
    {start:1.42,end:1.55,midi:38,confidence:.91},{start:1.6,end:2.1,midi:43,confidence:.97}],
    chord_events:[{start:1,end:2,...cell(1,2,50)}]};
  const notes=bassBarNotes(bar,2,4);
  assert.deepEqual(plain(notes).map(n=>[n.start,n.end,n.midi]),[[1,1.4,31],[1.42,1.55,38],[1.6,2,43]]);
  assert.equal(activeBassNote(notes,1.5).midi,38);
  assert.deepEqual(plain(bassBarNotes({...bar,bass_events:[]},2,4)),[]);
});

test('verified periodic fundamental supplies its measured octave even if overtone peaks are louder',()=>{
  const {measuredBassMidi}=loadScript('src/renderer/bars.js',['measuredBassMidi'],{});
  assert.equal(measuredBassMidi({method:'periodicity',pitch_class:7,midi:31},[{midi:43,strength:1}]),31);
});

test('independent bass timings survive edited bar starts by reading the complete saved track',()=>{
  const {bassBarNotes}=bass();
  const track=[{start:0,end:1,midi:31},{start:1,end:2,midi:36}];
  const bar={start:0,bass_events:[track[0]]};
  assert.deepEqual(plain(bassBarNotes(bar,1.2,4,track)).map(n=>[n.start,n.end,n.midi]),[[0,1,31],[1,1.2,36]]);
});

test('bass positions use sounding octaves, standard 4/5/6-string tuning and 24 frets',()=>{
  const {bassPositions}=bass();
  assert.deepEqual(plain(bassPositions(28,4)),[{string:4,fret:0}]);
  assert.deepEqual(plain(bassPositions(23,4)),[]);
  assert.deepEqual(plain(bassPositions(23,5)),[{string:5,fret:0}]);
  assert.deepEqual(plain(bassPositions(24,5)),[{string:5,fret:1}]);
  assert.deepEqual(plain(bassPositions(23,6)),[{string:6,fret:0}]);
  assert.deepEqual(plain(bassPositions(48,6)[0]),{string:1,fret:0});
  assert.deepEqual(plain(bassPositions(72,6)),[{string:1,fret:24}]);
  assert.equal(bassPositions(44,4)[0].fret,1);
  assert.deepEqual(plain(bassPositions(68,5)),[]);
});

test('bass fingering follows a nearby fretted hand position through octave phrases',()=>{
  const {bassBarNotes}=bass();
  for(const strings of [4,5]) {
    const bass_events=[31,38,43,31,36,31,33,36].map((midi,i)=>({start:i*.2,end:(i+1)*.2,midi}));
    const notes=bassBarNotes({start:0,bass_events},1.6,strings);
    assert.deepEqual(plain(notes).map(n=>n.position),[
      {string:4,fret:3},{string:3,fret:5},{string:2,fret:5},{string:4,fret:3},
      {string:3,fret:3},{string:4,fret:3},{string:4,fret:5},{string:3,fret:3}
    ]);
  }
});

test('a tied bass note keeps its string and fret across independently displayed bars',()=>{
  const {bassBarNotes}=bass();
  const track=[{start:0,end:1.5,midi:28},{start:1.5,end:2,midi:33},
    {start:2,end:2.5,midi:33},{start:2.5,end:4,midi:30}];
  const first=bassBarNotes({start:0,bass_events:track.slice(0,2)},2,4,track);
  const second=bassBarNotes({start:2,bass_events:track.slice(2)},4,4,track);
  assert.deepEqual(plain(first.at(-1).position),plain(second[0].position));
  assert.equal(first.at(-1).continuesToNext,true);
  assert.equal(second[0].continuesFromPrevious,true);
});

test('bass bar preview preserves cell timing, merges repeated notes and switches at exact boundaries',()=>{
  const {bassBarNotes,activeBassNote}=bass();
  const bar={start:0,chord_events:[{start:0,end:2,debug:{cells:[cell(-.2,.5,28),cell(.5,1,28),cell(1,1.5,33),cell(1.5,2.5,35)]}}]};
  const saved=JSON.stringify(bar);
  const notes=bassBarNotes(bar,2,4);
  assert.deepEqual(plain(notes).map(({start,end,midi,position})=>({start,end,midi,position})),[
    {start:0,end:1,midi:28,position:{string:4,fret:0}},
    {start:1,end:1.5,midi:33,position:{string:3,fret:0}},
    {start:1.5,end:2,midi:35,position:{string:3,fret:2}}
  ]);
  assert.equal(activeBassNote(notes,.99).midi,28);
  assert.equal(activeBassNote(notes,1).midi,33);
  assert.equal(activeBassNote(notes,2),null);
  assert.equal(JSON.stringify(bar),saved);
});

test('bass preview keeps gaps and out-of-range pitches without guessing legacy octaves or chord roots',()=>{
  const {bassBarNotes,activeBassNote}=bass();
  assert.deepEqual(plain(bassBarNotes({start:0,end:2,chord:'C',bass_reference:{note:'C',pitch_class:0}},2,4)),[]);
  const bar={start:0,end:2,debug:{cells:[cell(0,.5,24),{start:.5,end:1},cell(1,2,24)]}};
  const notes=bassBarNotes(bar,2,4);
  assert.equal(notes.length,2);
  assert.equal(notes[0].position,null);
  assert.equal(activeBassNote(notes,.75),null);
  assert.equal(bassBarNotes(bar,2,5)[0].position.fret,1);
});

test('bass timing remains independent of chord boundary moves, splits and merges',()=>{
  const {bassBarNotes}=bass();
  const edits=loadScript('src/renderer/chord-events.js',['moveChordBoundary','splitChordEvent','mergeChordEvents']);
  const events=[{start:0,end:1,chord:'E',debug:{cells:[cell(0,1,28)]}},
    {start:1,end:2,chord:'A',debug:{cells:[cell(1,2,33)]}}];
  const expected=[[0,1,28],[1,2,33]];
  const notes=chord_events=>plain(bassBarNotes({start:0,chord_events},2,4)).map(n=>[n.start,n.end,n.midi]);
  assert.deepEqual(notes(edits.moveChordBoundary(events,0,1.5)),expected);
  assert.deepEqual(notes(edits.splitChordEvent(events,0,.5)),expected);
  assert.deepEqual(notes(edits.mergeChordEvents(events,0)),expected);
});

test('playback refreshes bass independently when an edited chord hides a source-cell boundary',()=>{
  const {bassBarNotes,activeBassNote}=bass();
  const helpers=loadScript('src/renderer/chord-events.js',['barChordEvents','activeChordEvent']);
  const bar={start:0,chord:'E',chord_events:[
    {start:0,end:1.5,chord:'E',debug:{cells:[cell(0,1.25,28)]}},
    {start:1.5,end:2,chord:'A',debug:{cells:[cell(1.25,2,33)]}}
  ]};
  const state={chart:{duration:2,beat_times:[0,.5,1,1.5],bars:[bar]},selectedIndex:0,selectedChordEventIndex:0,
    activeIndex:0,activeChordEventIndex:0,activeBeatNumber:3,activeDetailSpectrumStart:0};
  const audioPlayer={currentTime:1.3};
  let midi=null;
  const {updateActiveBarFromPlayback}=loadScript('src/renderer/bars.js',['updateActiveBarFromPlayback'],{
    ...helpers,state,elements:{audioPlayer},hasChart:()=>true,
    renderDetailBass:(bar,end,time)=>{midi=activeBassNote(bassBarNotes(bar,end,4),time)?.midi;},
    updateRowState:()=>assert.fail('Should reuse the existing detail pane')
  });
  updateActiveBarFromPlayback();
  assert.equal(midi,33);
});
