const test=require('node:test');
const assert=require('node:assert/strict');
const {loadScript,plain}=require('./helpers/load-script');
const Vex=require('../../src/renderer/vendor/vexflow-bravura-4.2.5.js');
const BassTuning=require('../../src/renderer/bass-tuning.js');
const bass=loadScript('src/renderer/bass-view.js',['bassRhythm','notationSpacing','notationMeasureWidths'],{BassTuning});
function functions(){return loadScript('src/renderer/drum-view.js',['drumRhythm','drumBarEvents','layoutDrumSystem'],{Vex,...bass});}

test('shared spacing preserves subdivision clearance and balanced sparse-bar widths',()=>{
  const spacing=bass.notationSpacing([0,.25,.5,.75],1,[5,5,5,5],[5,5,5,5],0,40);
  assert.ok(spacing.positions[1]-spacing.positions[0]>=24);
  const widths=bass.notationMeasureWidths([160,160,160,400],1600);
  assert.ok(Math.abs(widths.reduce((a,b)=>a+b,0)-1600)<.001);
  assert.ok(Math.min(...widths)>=1600/4*.7);
  assert.ok(widths[3]>widths[0]);
  assert.ok(widths[3]/widths[0]<1.6);
});

test('simultaneous drums share one onset and bar boundaries use original time',()=>{
  const {drumBarEvents,drumRhythm}=functions();
  const chart={time_signature:'4/4',drums:{ok:true,events:[{time:0,instrument:'kick'},{time:0,instrument:'hihat'},{time:2,instrument:'snare'}]}};
  const hits=drumBarEvents(chart,{start:0},2);
  assert.equal(hits.length,2);
  const rhythm=drumRhythm(hits,{start:0},2,chart);
  assert.deepEqual(plain(rhythm.events[0].instruments),['kick','hihat']);
  assert.equal(rhythm.events.filter(e=>e.instruments.length).length,1);
  assert.equal(chart.drums.events[2].time,2);
});

test('triplet attacks remain triplets and complete the bar',()=>{
  const {drumRhythm}=functions();
  const hits=[0,1/6,1/3].map(time=>({time,instrument:'snare'}));
  const rhythm=drumRhythm(hits,{start:0},2,{time_signature:'4/4'});
  assert.equal(rhythm.events.filter(e=>e.triplet).length,3);
  assert.equal(rhythm.events.filter(e=>e.instruments.length).length,3);
  assert.ok(Math.abs(rhythm.events.reduce((n,e)=>n+e.beats,0)-4)<1e-6);
});

test('hits just before and after beat one share the downbeat without duplication or changing raw times',()=>{
  const {drumBarEvents,drumRhythm}=functions();
  const chart={time_signature:'4/4',beat_times:[0,.5,1,1.5,2,2.5,3,3.5],bars:[{start:0},{start:2}],
    drums:{ok:true,events:[{time:1.98,instrument:'kick'},{time:2,instrument:'snare'},{time:2.02,instrument:'hihat'}]}};
  const original=JSON.stringify(chart.drums.events);
  assert.equal(drumBarEvents(chart,chart.bars[0],2).length,0);
  const hits=drumBarEvents(chart,chart.bars[1],4);
  assert.equal(hits.length,3);
  const rhythm=drumRhythm(hits,chart.bars[1],4,chart);
  assert.equal(rhythm.events[0].offset,0);
  assert.deepEqual(plain(rhythm.events[0].instruments),['kick','snare','hihat']);
  assert.equal(JSON.stringify(chart.drums.events),original);
});

test('near-beat rounding works inside the bar and preserves a genuine thirty-second pickup',()=>{
  const {drumRhythm,drumBarEvents}=functions();
  const chart={time_signature:'4/4',beat_times:[0,.5,1,1.5,2],bars:[{start:0},{start:2}],drums:{ok:true,events:[
    {time:.48,instrument:'kick'},{time:.52,instrument:'hihat'},{time:1.9375,instrument:'snare'}]}};
  const rhythm=drumRhythm(drumBarEvents(chart,chart.bars[0],2),chart.bars[0],2,chart);
  const beatTwo=rhythm.events.find(e=>e.offset===1);
  assert.deepEqual(plain(beatTwo?.instruments),['kick','hihat']);
  const pickup=rhythm.events.find(e=>e.instruments.includes('snare'));
  assert.equal(pickup.offset,3.875);
  assert.equal(drumBarEvents(chart,chart.bars[1],4).length,0);
});

test('continuous percussion systems join barlines and support silent 6/8',()=>{
  const {layoutDrumSystem}=functions();
  const system=layoutDrumSystem([{bar:{start:0},barEnd:2,events:[]},{bar:{start:2},barEnd:4,events:[]}],{time_signature:'6/8'});
  const [a,b]=system.measures;
  assert.equal(a.stave.getX()+a.stave.getWidth(),b.stave.getX());
  assert.equal(a.stave.getYForLine(0),b.stave.getYForLine(0));
  assert.equal(a.voice.isComplete(),true);
  assert.equal(b.voice.isComplete(),true);
  for(const measure of system.measures) {
    measure.notes.forEach(note=>{
      note.setStave(measure.stave);
      assert.ok(note.getCenterGlyphX()>measure.stave.getX());
      assert.ok(note.getCenterGlyphX()<measure.stave.getX()+measure.stave.getWidth());
    });
  }
});

test('complex drum bars receive more space while keeping a consistent notation scale',()=>{
  const {layoutDrumSystem}=functions();
  const system=layoutDrumSystem([
    {bar:{start:0},barEnd:2,events:[{time:0,instrument:'kick'}]},
    {bar:{start:2},barEnd:4,events:Array.from({length:32},(_,i)=>({time:2+i/16,instrument:'hihat'}))}
  ],{time_signature:'4/4'});
  const [a,b]=system.measures;
  assert.ok(b.stave.getWidth()>a.stave.getWidth());
  assert.equal(b.stave.getX(),a.stave.getWidth());
  assert.equal(a.notes[0].getGlyphWidth(),b.notes[0].getGlyphWidth());
  for(const measure of system.measures) {
    for(const note of measure.notes) {
      assert.ok(note.getCenterGlyphX()>measure.stave.getX());
      assert.ok(note.getCenterGlyphX()<measure.stave.getX()+measure.stave.getWidth());
    }
  }
});

test('silent drum bars use one whole-measure rest without losing beats',()=>{
  const {drumRhythm}=functions();
  const model=drumRhythm([],{start:0},2,{time_signature:'4/4'});
  assert.equal(model.events.length,1);
  assert.equal(model.events[0].beats,4);
  assert.equal(model.events[0].duration,'1');
});

test('one short drum subdivision does not stretch the entire system',()=>{
  const {layoutDrumSystem}=functions();
  const sources=Array.from({length:4},(_,i)=>({bar:{start:i*2},barEnd:i*2+2,
    events:[0,.0625,.5,1,1.5].map(t=>({time:i*2+t,instrument:'snare'}))}));
  const system=layoutDrumSystem(sources,{time_signature:'4/4'},1000);
  assert.ok(system.width<=1100,`Unexpected system width ${system.width}`);
});

test('justified mixed systems fill the requested width without crowding simple neighbours',()=>{
  const {layoutDrumSystem}=functions();
  const sources=Array.from({length:4},(_,i)=>({bar:{start:i*2},barEnd:i*2+2,
    events:Array.from({length:i===3?16:4},(_,j)=>({time:i*2+j*(i===3?.125:.5),instrument:'snare'}))}));
  const original=JSON.stringify(sources);
  for(const count of [2,4]) {
    const system=layoutDrumSystem(sources.slice(4-count),{time_signature:'4/4'},1600);
    assert.ok(Math.abs(system.width-1600)<.01);
    const widths=system.measures.map(m=>m.stave.getWidth());
    assert.ok(widths.at(-1)>=widths[0]-.001);
    assert.ok(Math.min(...widths)>=1600/count*.65);
    for(const measure of system.measures) {
      for(let i=1;i<measure.notes.length;i++) {
        assert.ok(measure.notes[i].getCenterGlyphX()-measure.notes[i-1].getCenterGlyphX()>=24);
      }
    }
  }
  assert.equal(JSON.stringify(sources),original);
});

test('a hit assigned to a partial final bar survives notation with its original timestamp',()=>{
  const {drumBarEvents,drumRhythm}=functions();
  const chart={duration:5.1,time_signature:'4/4',beat_times:Array.from({length:11},(_,i)=>i*.5),
    bars:[{start:0},{start:2},{start:4}],drums:{ok:true,events:[{time:3.975,instrument:'snare'}]}};
  assert.equal(drumBarEvents(chart,chart.bars[1],4).length,0);
  const hits=drumBarEvents(chart,chart.bars[2],5.1);
  const rhythm=drumRhythm(hits,chart.bars[2],5.1,chart);
  assert.equal(rhythm.events[0].hits[0]?.time,3.975);
  assert.equal(rhythm.events[0].offset,0);
});

test('pickup beats remain in a short measure before the first full bar',()=>{
  const {drumBarEvents,layoutDrumSystem}=functions();
  const chart={time_signature:'4/4',beat_times:[.25,.75,1.25,1.75,2.25,2.75,3.25],
    bars:[{start:.25,pickup_beats:2},{start:1.25}],drums:{ok:true,events:[{time:.25,instrument:'snare'},{time:.75,instrument:'kick'}]}};
  const system=layoutDrumSystem(chart.bars.map((bar,i)=>({bar,barEnd:i?3.25:1.25,events:drumBarEvents(chart,bar,i?3.25:1.25)})),chart);
  assert.equal(system.measures[0].model.beats,2);
  assert.equal(system.measures[0].model.events.filter(e=>e.hits.length).length,2);
  assert.equal(system.measures[0].voice.isComplete(),true);
  assert.equal(system.measures[1].model.beats,4);
});
