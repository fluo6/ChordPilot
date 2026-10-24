const test=require('node:test'),assert=require('node:assert/strict');
const {loadScript}=require('./helpers/load-script');
function setup(analyzeMelody){
  const state={chart:{melody:{ok:true,events:[{midi:60}]}},audio:{path:'song'}};
  const nop=()=>{};
  const api=loadScript('src/renderer/melody-actions.js',['analyzeMelody','prepareMelodyStems','preserveMelodyAnalysis'],{
    state,window:{chordPilot:{analyzeMelody}},hasChart:()=>true,setAnalysisActive:nop,updateButtons:nop,renderBars:nop,addJob:nop,
    appendLog:nop,setStatus:nop,showErrorDialog:nop,renderHome:nop,renderStems:nop});
  return {state,...api};
}
test('failed melody jobs retain the previous score and expose useful diagnostics',async()=>{
  const api=setup(async()=>{throw Error('Model missing');}),previous=api.state.chart.melody;
  await api.analyzeMelody();assert.equal(api.state.chart.melody,previous);assert.match(api.state.melodyError.message,/Model missing/);assert.equal(api.state.melodyBusy,false);
});
test('a melody completion cannot overwrite another session',async()=>{
  let finish;const api=setup(()=>new Promise(resolve=>finish=resolve)),original=api.state.chart;
  const job=api.analyzeMelody();api.state.chart={};finish({ok:true,events:[{midi:72}]});await job;
  assert.equal(api.state.chart.melody,undefined);assert.equal(original.melody.events[0].midi,60);
});

test('voice identity review survives an identical cached result and is dropped for changed notes',async()=>{
  for(const [midi,kept] of [[60,true],[61,false]]){
    const api=setup(async()=>({ok:true,fingerprint:'a',events:[{midi}]}));
    api.state.chart.melody.fingerprint='a';api.state.chart.melody.voice_review={melody_fingerprint:'a',intervals:[]};
    await api.analyzeMelody();assert.equal(Boolean(api.state.chart.melody.voice_review),kept);
  }
});
test('reanalysis preserves melody but marks a changed source stale',()=>{
  const {preserveMelodyAnalysis}=setup(()=>{}),previous={melody:{ok:true,events:[]},stems:{stems:[{name:'vocals',path:'a'}]}};
  const next={stems:{stems:[{name:'vocals',path:'b'}]}};preserveMelodyAnalysis(next,previous);assert.equal(next.melody.stale,true);
});
test('chord reanalysis retains matching melody reviews and archives changed bar intervals',()=>{
  const {preserveMelodyAnalysis}=setup(()=>{}),entry={events:[{start:0,end:1,midi:72}],basis:'original'};
  const previous={duration:4,melody:{ok:true,events:[]},stems:{stems:[{name:'vocals',path:'a'}]},bars:[{start:0,transcription_review:{melody:entry}},{start:2}]};
  const same={duration:4,stems:previous.stems,bars:[{start:0},{start:2}]};preserveMelodyAnalysis(same,previous);
  assert.deepEqual(JSON.parse(JSON.stringify(same.bars[0].transcription_review.melody)),entry);
  const changed={duration:4,stems:previous.stems,bars:[{start:.1},{start:2}]};preserveMelodyAnalysis(changed,previous);
  assert.equal(changed.melody.previous_reviews.length,1);assert.equal(changed.melody.previous_reviews[0].start,0);
  assert.equal(changed.bars[0].transcription_review,undefined);
});
