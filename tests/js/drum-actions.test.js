const test=require('node:test');
const assert=require('node:assert/strict');
const {loadScript}=require('./helpers/load-script');

function setup(analyzeDrums){
  const state={audio:{path:'song'},chart:{bars:[{chord:'C/E',lyrics:'edited'}],stems:{ok:true,stems:[{name:'drums',path:'stem'}]},drums:{ok:true,events:[]}}};
  const noop=()=>{};
  const ctx={state,elements:{},window:{chordPilot:{analyzeDrums}},hasChart:()=>true,setStatus:noop,appendLog:noop,addJob:noop,
    setAnalysisActive:active=>{state.isAnalyzing=active;},updateButtons:noop,renderBars:noop,renderStems:noop,renderHome:noop,showErrorDialog:noop};
  return {state,...loadScript('src/renderer/drum-actions.js',['analyzeDrums'],ctx)};
}
test('drum result preserves edited chart and failed rerun preserves previous hits',async()=>{
  const result={ok:true,events:[{time:.1,instrument:'kick'}]};
  const app=setup(async()=>result); const chart=app.state.chart;
  await app.analyzeDrums();
  assert.equal(app.state.chart,chart);assert.equal(chart.bars[0].chord,'C/E');assert.equal(chart.bars[0].lyrics,'edited');
  assert.equal(chart.drums,result);
  const failed=setup(async()=>{throw Error('model failed');});const old=failed.state.chart.drums;
  await failed.analyzeDrums();assert.equal(failed.state.chart.drums,old);assert.equal(failed.state.drumBusy,false);
});
test('late drum result cannot apply to a different session and duplicate job is blocked',async()=>{
  let finish,calls=0;const app=setup(()=>{calls++;return new Promise(resolve=>{finish=resolve;});});
  const job=app.analyzeDrums();await app.analyzeDrums();assert.equal(calls,1);
  app.state.chart={bars:[{chord:'Dm'}]};finish({ok:true,events:[{time:0,instrument:'snare'}]});await job;
  assert.equal(app.state.chart.drums,undefined);
});
