const test=require('node:test');
const assert=require('node:assert/strict');
const {loadScript,plain}=require('./helpers/load-script');
const api=()=>loadScript('src/renderer/arrangement-waveforms.js',['normalizeWaveformView','waveformTrackHeight','setWaveformTrackHeight']);

test('waveform view defaults and restored settings are bounded independently from playback',()=>{
  const {normalizeWaveformView:normalize,waveformTrackHeight:height}=api();
  assert.deepEqual(plain(normalize()),{gain:1,heightZoom:1,trackHeights:{}});
  const view=normalize({gain:4,heightZoom:2,trackHeights:{Bass:120,Other:'bad'}});
  assert.equal(height(view,'Bass'),240);
  assert.equal(height(view,'Full Mix'),112);
  assert.equal(height(normalize({heightZoom:4,trackHeights:{Bass:9000}}),'Bass'),720);
  assert.equal(normalize({gain:Infinity,heightZoom:-4}).gain,1);
  assert.deepEqual(plain(normalize(null)),{gain:1,heightZoom:1,trackHeights:{}});
});

test('individual resize follows actual pixels under global height zoom without altering other tracks or audio',()=>{
  const state={waveformView:{gain:2,heightZoom:2,trackHeights:{}},masterVolume:.55,chart:{waveform:[.1,.4]}};
  const canvas={height:0,width:2,_waveformPeaks:[]};
  const lane={dataset:{trackName:'Bass'},style:{setProperty(){}},querySelector:selector=>selector==='canvas'?canvas:null};
  let redrawn=null;
  // The public setter redraws only its supplied lane and stores the unzoomed height.
  const {context}=loadScript('src/renderer/arrangement-waveforms.js',[],{state,drawWaveform:()=>{redrawn=lane;}});
  context.setWaveformTrackHeight(lane,200);
  assert.equal(state.waveformView.trackHeights.Bass,100);
  assert.equal(state.waveformView.trackHeights.Other,undefined);
  assert.equal(state.waveformView.gain,2);
  assert.equal(state.masterVolume,.55);
  assert.deepEqual(state.chart.waveform,[.1,.4]);
  assert.equal(redrawn,lane);
});
