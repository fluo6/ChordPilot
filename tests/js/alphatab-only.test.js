const test=require('node:test');
const assert=require('node:assert/strict');
const {loadScript}=require('./helpers/load-script');

for(const kind of ['bass','drums','melody'])test(`${kind} charts always use alphaTab, including stale renderer preferences`,()=>{
  const calls=[],node={classList:{toggle(){}},innerHTML:''};
  const {renderChartPreview}=loadScript('src/renderer/bars.js',['renderChartPreview'],{
    state:{chartRenderer:kind,notationRenderer:'current'},
    elements:{chartPreview:node,barsTable:node},hasChart:()=>true,
    renderLyricsReferencePanel(){},renderAlphaTabChartPreview:()=>calls.push('alphaTab'),
    renderBassChartPreview:()=>calls.push('legacy bass'),renderDrumChartPreview:()=>calls.push('legacy drums'),
    finishChartLayout(){}
  });
  renderChartPreview();
  assert.deepEqual(calls,['alphaTab']);
});
