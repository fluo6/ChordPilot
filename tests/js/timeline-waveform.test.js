const test = require('node:test');
const assert = require('node:assert/strict');
const { loadScript, plain } = require('./helpers/load-script');

test('waveform columns retain narrow transients when zoomed out and silence when zoomed in', () => {
  const { waveformColumns } = loadScript('src/renderer/waveform.js', ['waveformColumns']);
  assert.deepEqual(plain(waveformColumns([0, 1, 0, .4, 0, 0], 3)), [1, .4, 0]);
  assert.deepEqual(plain(waveformColumns([0, .5], 4)), [0, 0, .5, .5]);
  assert.deepEqual(plain(waveformColumns([NaN, -1, 2], 3)), [0, 0, 1]);
});

test('waveform display gain enlarges quiet peaks, clips at lane bounds and leaves audio evidence unchanged',()=>{
  const {drawWaveform}=loadScript('src/renderer/waveform.js',['drawWaveform']);
  const peaks=[.1,.8];
  const render=gain=>{
    const fills=[];
    const context={clearRect(){},fillRect(...rect){fills.push({color:this.fillStyle,rect});},beginPath(){},moveTo(){},lineTo(){},stroke(){}};
    drawWaveform({width:2,height:64,getContext:()=>context},peaks,'waveform',gain);
    return fills.filter(item=>item.color==='#269b8a').map(item=>item.rect);
  };
  assert.equal(render(2)[0][3],render(1)[0][3]*2);
  assert.equal(render(8)[1][3],58);
  assert.deepEqual(render(undefined),render(1));
  assert.deepEqual(peaks,[.1,.8]);
});
