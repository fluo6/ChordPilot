const test=require('node:test');
const assert=require('node:assert/strict');
const {loadScript,plain}=require('./helpers/load-script');
const api=()=>loadScript('src/renderer/guitar-view.js',['guitarPositions','guitarNotePositions','guitarBarFrames','activeGuitarFrame']);

test('guitar positions preserve sounding octaves in standard six-string tuning',()=>{
  const {guitarPositions}=api();
  assert.deepEqual(plain(guitarPositions(40)),[{string:6,fret:0}]);
  assert.deepEqual(plain(guitarPositions(64))[0],{string:1,fret:0});
  assert.deepEqual(plain(guitarPositions(88)),[{string:1,fret:24}]);
  assert.deepEqual(plain(guitarPositions(39)),[]);
  assert.deepEqual(plain(guitarPositions(89)),[]);
  assert.deepEqual(plain(guitarPositions(null)),[]);
});

test('suggested guitar locations use separate strings for measured open chord shapes',()=>{
  const {guitarNotePositions}=api();
  const notes=guitarNotePositions([48,52,55,60,64]);
  assert.deepEqual(plain(notes).map(note=>note.position),[
    {string:5,fret:3},{string:4,fret:2},{string:3,fret:0},{string:2,fret:1},{string:1,fret:0}
  ]);
  assert.equal(new Set(notes.map(note=>note.position.string)).size,notes.length);
  assert.equal(guitarNotePositions([36])[0].position,null);
});

test('guitar follows simultaneous snapshots and clears during gaps and silent snapshots',()=>{
  const {guitarBarFrames,activeGuitarFrame}=api();
  const bar={start:0,chord:'C',evidence:{voicing_frames:[
    {start:0,end:.5,midis:[48,52,55,60,64]},
    {start:.5,end:1,midis:[]},
    {start:1.5,end:2,midis:[43,50,55]}
  ]}};
  const saved=JSON.stringify(bar);
  const frames=guitarBarFrames(bar,2);
  assert.deepEqual(plain(activeGuitarFrame(frames,.25).midis),[48,52,55,60,64]);
  assert.deepEqual(plain(activeGuitarFrame(frames,.75).midis),[]);
  assert.equal(activeGuitarFrame(frames,1.25),null);
  assert.deepEqual(plain(activeGuitarFrame(frames,1.75).midis),[43,50,55]);
  assert.equal(JSON.stringify(bar),saved);
});

test('guitar source-cell timing survives edited chord bounds without inventing octaves',()=>{
  const {guitarBarFrames,activeGuitarFrame}=api();
  const bar={start:0,chord_events:[{start:0,end:1.5,debug:{cells:[
    {start:0,end:1,evidence:{detected_pitches:[{midi:52,strength:1},{midi:64,strength:.001}]}}
  ]}},{start:1.5,end:2,debug:{cells:[
    {start:1,end:2,evidence:{detected_pitches:[{midi:55,strength:1}]}}
  ]}}]};
  assert.deepEqual(plain(activeGuitarFrame(guitarBarFrames(bar,2),1.25).midis),[55]);
  assert.deepEqual(plain(activeGuitarFrame(guitarBarFrames(bar,2),.5).midis),[52]);
  assert.deepEqual(plain(guitarBarFrames({start:0,chord:'C',evidence:{detected_notes:[{note:'C',strength:1}]}},2)),[]);
  assert.deepEqual(plain(guitarBarFrames(null,0)),[]);
});

test('playback refreshes guitar snapshots within an unchanged beat and chord cell',()=>{
  const state={chart:{duration:2,bars:[{start:0,chord:'C'}]},selectedIndex:0,selectedChordEventIndex:0,
    activeIndex:0,activeChordEventIndex:0,activeBeatNumber:1,activeDetailSpectrumStart:null};
  let cursor=null;
  const {updateActiveBarFromPlayback}=loadScript('src/renderer/bars.js',['updateActiveBarFromPlayback'],{
    state,elements:{audioPlayer:{currentTime:.2}},hasChart:()=>true,
    barChordEvents:()=>[{start:0,end:2,chord:'C'}],activeChordEvent:()=>0,
    renderDetailGuitar:(_bar,_end,time)=>{cursor=time;},
    updateRowState:()=>assert.fail('Should reuse the current detail view')
  });
  updateActiveBarFromPlayback();
  assert.equal(cursor,.2);
});
