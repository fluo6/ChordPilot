const test = require('node:test');
const assert = require('node:assert/strict');
const {loadScript, plain} = require('./helpers/load-script');
const BassTuning=require('../../src/renderer/bass-tuning.js');

function rhythm() {
  const Vex = require('../../src/renderer/vendor/vexflow-bravura-4.2.5.js');
  const {spellNotationPitch} = loadScript('src/renderer/chord-notation.js', ['spellNotationPitch']);
  return {...loadScript('src/renderer/bass-view.js', ['bassRhythm', 'bassNotationVoices', 'layoutBassNotation', 'layoutBassSystem', 'notationMeasureWidths'], {Vex, spellNotationPitch,BassTuning}), Vex};
}
const note = (start, end, midi = 31) => ({start, end, midi, position:{string:4,fret:midi-28}});

test('small beat-tracking offsets do not engrave a held note as a chain of ties',()=>{
  const {bassRhythm}=rhythm();
  const notes=[{...note(.07,1.75),confidence:.99}];
  const saved=JSON.stringify(notes);
  const model=bassRhythm(notes,{start:0},2,{time_signature:'4/4'});
  const pitched=model.events.filter(event=>event.sourceIndex!==null);
  assert.equal(pitched[0].offset,0);
  assert.ok(pitched.length<=2);
  assert.equal(model.events.reduce((sum,event)=>sum+event.units,0),model.totalUnits);
  assert.equal(JSON.stringify(notes),saved);
});

test('tiny articulation gaps do not create micro-rests while fast measured attacks remain distinct',()=>{
  const {bassRhythm}=rhythm();
  const notes=[note(0,.843),note(.883,1.5,33),note(1.77,1.81,38)].map(n=>({...n,confidence:.99}));
  const model=bassRhythm(notes,{start:0},2,{time_signature:'4/4'});
  const first=model.events.filter(event=>event.sourceIndex===0).at(-1);
  const next=model.events.find(event=>event.sourceIndex===1);
  assert.equal(first.offset+first.units,next.offset);
  assert.ok(model.events.some(event=>event.sourceIndex===2));
  assert.ok(model.events.some(event=>event.sourceIndex===null && event.offset>next.offset));
});

test('later bass systems repeat the clef and key but omit an unchanged time signature',()=>{
  const {layoutBassSystem,Vex}=rhythm();
  const source={bar:{start:2},index:1,barEnd:4,notes:[note(2,4)]};
  const result=layoutBassSystem([source],4,{time_signature:'4/4'},'Bb',500);
  for(const stave of [result.measures[0].stave,result.measures[0].tab]) {
    assert.equal(stave.getModifiers().filter(m=>m.getCategory()===Vex.Flow.TimeSignature.CATEGORY).length,0);
  }
  assert.ok(result.measures[0].stave.getModifiers().some(m=>m.getCategory()===Vex.Flow.Clef.CATEGORY));
});

test('a pickup has a short voice but keeps the full meter on score and TAB',()=>{
  const {layoutBassSystem,Vex}=rhythm();
  const result=layoutBassSystem([
    {bar:{start:0,pickup_beats:2},barEnd:1,notes:[note(0,1)]},
    {bar:{start:1},barEnd:3,notes:[note(1,3)]}
  ],4,{time_signature:'4/4',beat_times:[0,.5,1,1.5,2,2.5]},'C',800);
  assert.equal(result.measures[0].model.beats,2);
  assert.equal(result.measures[1].model.beats,4);
  for(const stave of [result.measures[0].stave,result.measures[0].tab]) {
    assert.equal(stave.getModifiers().find(m=>m.getCategory()===Vex.Flow.TimeSignature.CATEGORY).getTimeSpec(),'4/4');
  }
});

test('continuous bass systems join barlines with shared staff and TAB baselines',()=>{
  const {layoutBassSystem,Vex}=rhythm();
  for(const strings of [4,5]) {
    const result=layoutBassSystem([
      {bar:{start:0},barEnd:2,notes:[note(0,1,28),note(1,2,31)]},
      {bar:{start:2},barEnd:4,notes:[note(2,2.5,43),note(2.5,4,38)]}
    ],strings,{time_signature:'4/4'},'C',800);
    const [first,second]=result.measures;
    assert.equal(first.stave.getX()+first.stave.getWidth(),second.stave.getX());
    assert.equal(first.tab.getX()+first.tab.getWidth(),second.tab.getX());
    assert.equal(first.stave.getYForLine(4),second.stave.getYForLine(4));
    assert.equal(first.tab.getYForLine(0),second.tab.getYForLine(0));
    for(const Category of [Vex.Flow.Clef,Vex.Flow.TimeSignature]) {
      assert.equal(first.stave.getModifiers().filter(m=>m.getCategory()===Category.CATEGORY).length,1);
      assert.equal(second.stave.getModifiers().filter(m=>m.getCategory()===Category.CATEGORY).length,0);
    }
    for(const measure of result.measures) measure.voices.scoreNotes.forEach((score,i)=>{
      assert.ok(Math.abs(score.getCenterGlyphX()-measure.voices.tabNotes[i].getCenterGlyphX())<1e-6);
      assert.ok(score.getCenterGlyphX()>measure.stave.getX());
      assert.ok(score.getCenterGlyphX()<measure.stave.getX()+measure.stave.getWidth());
    });
  }
});

test('continuous bass systems draw a single tie across a shared barline',()=>{
  const {layoutBassSystem}=rhythm();
  const result=layoutBassSystem([
    {bar:{start:0},barEnd:2,notes:[{...note(0,2),continuesToNext:true}]},
    {bar:{start:2},barEnd:4,notes:[{...note(2,4),continuesFromPrevious:true,continuesToNext:true}]}
  ],4,{time_signature:'4/4'},'C',800);
  assert.deepEqual(plain(result.ties).map(tie=>[tie.first,tie.last]),[
    [[0,0],[1,0]],[[1,0],null]
  ]);
});

test('bass score and TAB stay compact with clearance for stems and legible string spacing',()=>{
  const {layoutBassSystem}=rhythm();
  const source={bar:{start:0},barEnd:2,notes:[note(0,.5),note(.5,1),note(1,1.5),note(1.5,2)]};
  const system=layoutBassSystem([source],4,{time_signature:'4/4'},'C',700);
  const {stave,tab}=system.measures[0];
  const gap=tab.getYForLine(0)-system.scoreBottom;
  assert.ok(gap>=50 && gap<=65,`Stem clearance should determine the staff-to-TAB gap: ${gap}`);
  assert.equal(tab.getSpacingBetweenLines(),14);
  for(const n of system.measures[0].voices.tabNotes.filter(n=>n.hasStem()))assert.ok(n.getStem().getHeight()>=35);
});

test('TAB rhythm uses a clear upper lane for rests, flags and grouped stems',()=>{
  const {layoutBassSystem}=rhythm();
  for(const strings of [4,5]) {
    const system=layoutBassSystem([{bar:{start:0},barEnd:2,notes:[note(0,.125),note(.125,.25),note(.5,.75),note(1,1.5)]}],strings,{time_signature:'4/4'},'C',1000);
    const m=system.measures[0],top=m.tab.getYForLine(0);
    m.voices.tabNotes.forEach((n,i)=>{
      if(m.model.events[i].sourceIndex===null)assert.ok(n.getYs()[0]<top-20,'Rests belong above the fret numbers');
      else if(n.hasStem()) {
        assert.ok(n.getStem().getHeight()>=35);
        assert.ok(n.getStemExtents().topY>system.scoreBottom+8,'TAB flags and beams must clear the score');
      }
    });
    assert.ok(m.tabBeams.every(beam=>beam.render_options.flat_beams));
  }
});

test('larger TAB digits reserve their real font width, including two-digit frets',()=>{
  const {bassRhythm,bassNotationVoices}=rhythm();
  const model=bassRhythm([{...note(0,1),position:{string:4,fret:3}},
    {...note(1,2),position:{string:4,fret:12}}],{start:0},2,{time_signature:'4/4'});
  const {tabNotes}=bassNotationVoices(model,'C',4);
  assert.ok(tabNotes[0].getGlyphWidth()>11 && tabNotes[0].getGlyphWidth()<11.3);
  assert.ok(tabNotes[1].getGlyphWidth()>22 && tabNotes[1].getGlyphWidth()<22.6);
});

test('balanced measure allocation honours dense minimums without starving sparse neighbours',()=>{
  const {notationMeasureWidths}=rhythm();
  assert.deepEqual(plain(notationMeasureWidths([150,250,300,200],1600)),[400,400,400,400]);
  const widths=notationMeasureWidths([150,250,500,200],1600);
  assert.ok(Math.abs(widths[2]-500)<.001);
  assert.ok(Math.abs(widths[0]-1100/3)<.001);
  assert.ok(Math.abs(widths.reduce((a,b)=>a+b,0)-1600)<.001);
});

test('bass score spells chromatic notes against the accompanying chord',()=>{
  const {bassRhythm,bassNotationVoices}=rhythm();
  const model=bassRhythm([note(0,2,42)],{start:0},2,{time_signature:'4/4'});
  assert.equal(bassNotationVoices(model,'C',4,['D7']).scoreNotes[0].getKeys()[0],'f#/3');
  assert.equal(bassNotationVoices(model,'C',4,['Gbmaj7']).scoreNotes[0].getKeys()[0],'gb/3');
});

test('rhythmic bass notation uses dotted values and rests that fill the bar', () => {
  const {bassRhythm} = rhythm();
  assert.equal(typeof bassRhythm, 'function');
  const notes = [note(.01, .75), note(1, 2, 33)];
  const before = JSON.stringify(notes);
  const model = bassRhythm(notes, {start:0}, 2, {time_signature:'4/4'});
  assert.deepEqual(plain(model.events).map(e=>[e.duration,e.dots,e.sourceIndex,e.units]),
    [['4',1,0,6],['8',0,null,2],['2',0,1,8]]);
  assert.equal(model.totalUnits,16);
  assert.equal(JSON.stringify(notes),before);
});

test('offbeat holds split at beat boundaries and tie without changing source-note identity', () => {
  const {bassRhythm} = rhythm();
  assert.equal(typeof bassRhythm, 'function');
  const model = bassRhythm([note(.125,.75)],{start:0},2,{time_signature:'4/4'});
  const pitched = model.events.filter(e=>e.sourceIndex !== null);
  assert.deepEqual(plain(pitched).map(e=>[e.duration,e.units,e.tieToNext]),[['16',1,true],['8',2,true],['8',2,false]]);
  assert.equal(model.events.reduce((sum,e)=>sum+e.units,0),16);
});

test('6/8 uses dotted quarter pulses and the measured beat map', () => {
  const {bassRhythm} = rhythm();
  assert.equal(typeof bassRhythm, 'function');
  const model = bassRhythm([note(0,1.5),note(1.5,3,36)],{start:0},3,{time_signature:'6/8'});
  assert.deepEqual(plain(model.events).map(e=>[e.duration,e.dots]),[['4',1],['4',1]]);
  const uneven = bassRhythm([note(.3,.9)],{start:0},2,{time_signature:'4/4',beat_times:[0,.3,.9,1.4]});
  const pitched = uneven.events.filter(e=>e.sourceIndex !== null);
  assert.deepEqual(plain(pitched).map(e=>[e.offset,e.units]),[[4,4]]);
});

test('empty bars, clipped notes and sub-grid detections never create zero-duration notation', () => {
  const {bassRhythm} = rhythm();
  assert.equal(typeof bassRhythm, 'function');
  for (const notes of [[],[note(-.1,.04),note(1.9,2.2)]]) {
    const model = bassRhythm(notes,{start:0},2,{time_signature:'4/4'});
    assert.equal(model.events.reduce((sum,e)=>sum+e.units,0),16);
    assert.ok(model.events.every(e=>e.units>0));
  }
  assert.equal(bassRhythm([],{start:2},2,{}),null);
});

test('confirmed short passing notes remain in the score on a finer grid without promoting clipped slivers',()=>{
  const {bassRhythm,bassNotationVoices,Vex}=rhythm();
  const notes=[{...note(0,.8),confidence:.99},{...note(.92,.96,38),confidence:.85},
    {...note(1,1.5,43),confidence:.99},{...note(1.7,1.74,38),confidence:.84},
    {...note(1.85,1.91,37),confidence:.93},{...note(1.999,2.4,36),confidence:.99}];
  const model=bassRhythm(notes,{start:0},2,{time_signature:'6/8'});
  const shown=new Set(model.events.map(e=>e.sourceIndex));
  for(const index of [0,1,2,3,4]) assert.ok(shown.has(index),`missing source note ${index}`);
  assert.equal(shown.has(5),false);
  assert.equal(model.unitDenominator,32);
  const voices=bassNotationVoices(model,'C',4);
  assert.equal(voices.scoreVoice.getTicksUsed().value(),Vex.Flow.RESOLUTION*6/8);
  assert.equal(voices.tabVoice.getTicksUsed().value(),Vex.Flow.RESOLUTION*6/8);
});

test('a quick confirmed fill at the bar end reserves room for every note',()=>{
  const {bassRhythm}=rhythm();
  const notes=[[0,1.8,31],[1.8,1.86,38],[1.86,1.92,40],[1.92,1.98,43]]
    .map(([start,end,midi])=>({...note(start,end,midi),confidence:.99}));
  const model=bassRhythm(notes,{start:0},2,{time_signature:'6/8'});
  assert.deepEqual([...new Set(model.events.filter(e=>e.sourceIndex!==null).map(e=>e.sourceIndex))],[0,1,2,3]);
  assert.equal(model.events.reduce((sum,e)=>sum+e.units,0),model.totalUnits);
});

test('dense confirmed notes increase grid capacity instead of replacing the opening',()=>{
  const {bassRhythm,bassNotationVoices,Vex}=rhythm();
  const notes=Array.from({length:25},(_,i)=>({...note(i*.08,(i+1)*.08,31+i%5),confidence:.99}));
  const model=bassRhythm(notes,{start:0},2,{time_signature:'6/8'});
  assert.deepEqual([...new Set(model.events.filter(e=>e.sourceIndex!==null).map(e=>e.sourceIndex))],Array.from({length:25},(_,i)=>i));
  const voices=bassNotationVoices(model,'C',4);
  assert.equal(voices.scoreVoice.getTicksUsed().value(),Vex.Flow.RESOLUTION*6/8);
});

test('cross-bar sustains keep incoming and outgoing ties after clipping the saved track',()=>{
  const {bassBarNotes,bassRhythm}=loadScript('src/renderer/bass-view.js',['bassBarNotes','bassRhythm'],{BassTuning});
  const track=[note(1.5,2),note(2,2.5)];
  const first=bassBarNotes({start:0,bass_events:[track[0]]},2,4,track);
  const second=bassBarNotes({start:2,bass_events:[track[1]]},4,4,track);
  assert.equal(first[0].continuesToNext,true);
  assert.equal(second[0].continuesFromPrevious,true);
  assert.equal(bassRhythm(first,{start:0},2,{}).events.at(-1).tieToFollowingBar,true);
  assert.equal(bassRhythm(second,{start:2},4,{}).events[0].tieFromPrevious,true);
});

test('native score and TAB voices share durations, meter, aligned ticks, and bass transposition', () => {
  const {bassRhythm,bassNotationVoices,Vex} = rhythm();
  assert.equal(typeof bassRhythm, 'function');
  assert.equal(typeof bassNotationVoices, 'function');
  for (const strings of [4,5]) for(const key of ['','Ab','C#']) {
    const model = bassRhythm([note(0,.75),note(1,2,33)],{start:0},2,{time_signature:'4/4'});
    const result = bassNotationVoices(model,key,strings);
    assert.equal(result.scoreVoice.getTicksUsed().value(),Vex.Flow.RESOLUTION);
    assert.equal(result.tabVoice.getTicksUsed().value(),Vex.Flow.RESOLUTION);
    assert.equal(result.scoreNotes[0].getKeys()[0],'g/2');
    const stave=new Vex.Flow.Stave(8,10,450).addClef('bass');
    if(key) stave.addKeySignature(key);
    const tab=new Vex.Flow.TabStave(8,120,450,{num_lines:strings}).addTabGlyph();
    const left=Math.max(stave.getNoteStartX(),tab.getNoteStartX());
    stave.setNoteStartX(left); tab.setNoteStartX(left);
    result.scoreNotes.forEach(n=>n.setStave(stave)); result.tabNotes.forEach(n=>n.setStave(tab));
    new Vex.Flow.Formatter().joinVoices([result.scoreVoice]).joinVoices([result.tabVoice])
      .formatToStave([result.scoreVoice,result.tabVoice],stave);
    result.scoreNotes.forEach((n,i)=>assert.equal(n.getAbsoluteX(),result.tabNotes[i].getAbsoluteX()));
    assert.equal(result.scoreNotes[1].isRest(),true);
    assert.equal(result.tabNotes[1].isRest(),true);
  }
});

test('a whole-bar whole note has no TAB stem',()=>{
  const {bassRhythm,bassNotationVoices}=rhythm();
  const voices=bassNotationVoices(bassRhythm([note(0,2)],{start:0},2,{time_signature:'4/4'}),'C',4);
  assert.equal(voices.tabNotes[0].hasStem(),false);
});

test('engraving aligns visible score and TAB centres on evenly spaced beat columns',()=>{
  const {bassRhythm,bassNotationVoices,layoutBassNotation,Vex}=rhythm();
  assert.equal(typeof layoutBassNotation,'function');
  const model=bassRhythm([note(0,.375),note(.375,.5,33),note(.625,1.25,35),note(1.5,2,40)],{start:0},2,{time_signature:'4/4'});
  for(const strings of [4,5]) for(const key of ['Ab','C#']) {
    const voices=bassNotationVoices(model,key,strings);
    const stave=new Vex.Flow.Stave(16,12,500).addClef('bass').addKeySignature(key).addTimeSignature('4/4');
    const tab=new Vex.Flow.TabStave(16,126,500,{num_lines:strings}).addTabGlyph().addTimeSignature('4/4');
    const start=Math.max(stave.getNoteStartX(),tab.getNoteStartX()); stave.setNoteStartX(start);tab.setNoteStartX(start);
    voices.scoreNotes.forEach(n=>n.setStave(stave));voices.tabNotes.forEach(n=>n.setStave(tab));
    const layout=layoutBassNotation(model,voices,stave,tab);
    voices.scoreNotes.forEach((n,i)=>{
      assert.ok(Math.abs(n.getCenterGlyphX()-voices.tabNotes[i].getCenterGlyphX())<1e-6);
      assert.ok(Math.abs(n.getCenterGlyphX()-(layout.startX+model.events[i].offset*layout.unitWidth))<1e-6);
    });
    assert.equal(layout.beats.length,4);
    layout.beats.slice(1).forEach((beat,i)=>assert.ok(Math.abs(beat.x-layout.beats[i].x-layout.unitWidth*4)<1e-6));
    assert.ok(layout.endX-voices.scoreNotes.at(-1).getCenterGlyphX()>=layout.unitWidth*4-1e-6);
    assert.ok(stave.getNoteEndX()>voices.scoreNotes.at(-1).getCenterGlyphX());
  }
});

test('compound meter lays out two dotted-quarter beat columns in 6/8',()=>{
  const {bassRhythm,bassNotationVoices,layoutBassNotation,Vex}=rhythm();
  assert.equal(typeof layoutBassNotation,'function');
  const model=bassRhythm([note(0,1.5),note(1.5,3,36)],{start:0},3,{time_signature:'6/8'});
  const voices=bassNotationVoices(model,'C',4);
  const stave=new Vex.Flow.Stave(16,12,500).addClef('bass');
  const tab=new Vex.Flow.TabStave(16,126,500,{num_lines:4}).addTabGlyph();
  const start=Math.max(stave.getNoteStartX(),tab.getNoteStartX());stave.setNoteStartX(start);tab.setNoteStartX(start);
  voices.scoreNotes.forEach(n=>n.setStave(stave));voices.tabNotes.forEach(n=>n.setStave(tab));
  const layout=layoutBassNotation(model,voices,stave,tab);
  assert.equal(layout.beats.length,2);
  assert.ok(Math.abs(layout.beats[1].x-layout.beats[0].x-layout.unitWidth*6)<1e-6);
});
