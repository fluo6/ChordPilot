const test=require('node:test');
const assert=require('node:assert/strict');
const {loadScript,plain}=require('./helpers/load-script');

test('one density setting groups measures consistently without changing chart data',()=>{
  const state={barsPerLine:2,chart:{bars:Array.from({length:11},(_,i)=>({number:i+1,start:i*2,section:i<5?'Intro':'Verse',chord:'C'}))}};
  const original=JSON.stringify(state.chart);
  const layout=loadScript('src/renderer/chart-layout.js',['chartBarsPerLine'],{state});
  const {chartRows}=loadScript('src/renderer/bars.js',['chartRows'],{state,hasChart:()=>true,...layout});
  assert.deepEqual(plain(chartRows()).map(row=>row.length),[2,2,1,2,2,2]);
  state.barsPerLine=4;
  assert.deepEqual(plain(chartRows()).map(row=>row.length),[4,1,4,2]);
  state.barsPerLine=3;
  assert.equal(layout.chartBarsPerLine(),4);
  assert.equal(JSON.stringify(state.chart),original);
});

function node(index,top=0){
  const classes=new Set();
  const system={getBoundingClientRect:()=>({top,bottom:top+120}),scrollIntoView(options){this.scrolled=options;}};
  return {dataset:{index:String(index)},style:{setProperty(){}},classList:{toggle(name,value){value?classes.add(name):classes.delete(name)}},
    setAttribute(name,value){this[name]=value},removeAttribute(name){delete this[name]},closest:()=>system,classes,system};
}

test('playback highlights and follows systems only when needed, respecting manual suspension',()=>{
  let now=1000;
  const nodes=[node(0,40),node(1,500),node(2,500)];
  const state={chartAutoFollow:true,selectedIndex:0,chart:{bars:[{start:0},{start:2},{start:4}],duration:6}};
  const preview={querySelectorAll:()=>nodes,getBoundingClientRect:()=>({top:0,bottom:300}),addEventListener(){}};
  const controls={chartPreview:preview,audioPlayer:{paused:false},chartResumeFollowBtn:{hidden:true},chartAutoFollowInput:{checked:true}};
  const helpers=loadScript('src/renderer/chart-layout.js',['registerChartPlayback','updateChartPlayback','suspendChartFollow','resumeChartFollow'],
    {state,elements:controls,performance:{now:()=>now},window:{innerHeight:800},document:{activeElement:null}});
  helpers.registerChartPlayback();
  helpers.updateChartPlayback(0,0);
  assert.equal(nodes[0].classes.has('active'),true);
  assert.equal(nodes[0].classes.has('selected'),true);
  assert.equal(nodes[0].system.scrolled,undefined);
  helpers.suspendChartFollow();
  state.selectedIndex=1;
  helpers.updateChartPlayback(2,1);
  assert.equal(nodes[0].classes.has('active'),false);
  assert.equal(nodes[1].classes.has('active'),true);
  assert.equal(nodes[0].classes.has('selected'),false);
  assert.equal(nodes[1].classes.has('selected'),true);
  assert.equal(nodes[1].system.scrolled,undefined);
  assert.equal(controls.chartResumeFollowBtn.hidden,false);
  helpers.resumeChartFollow();
  assert.ok(nodes[1].system.scrolled);
  delete nodes[1].system.scrolled;
  helpers.suspendChartFollow();now+=9000;
  helpers.updateChartPlayback(2.2,1);
  assert.ok(nodes[1].system.scrolled,'follow resumes after timeout even within the same system');
  state.chartAutoFollow=false;
  helpers.updateChartPlayback(4,2);
  assert.equal(nodes[2].classes.has('active'),true);
  assert.equal(nodes[2].system.scrolled,undefined);
  controls.audioPlayer.paused=true;
  state.chartAutoFollow=true;now+=9000;
  helpers.updateChartPlayback(0,0);
  assert.equal(nodes[0].classes.has('active'),true);
  assert.equal(nodes[0].system.scrolled,undefined);
});
