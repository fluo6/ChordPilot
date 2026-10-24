const test=require('node:test');
const assert=require('node:assert/strict');
const {loadScript,plain}=require('./helpers/load-script');
const {createScore}=require('../../src/renderer/alphatab-score.js');
const alpha=require('../../src/renderer/vendor/alphatab/alphaTab.min.js');

function melody(){return loadScript('src/renderer/melody-view.js',['melodyBarNotes','melodyRhythm']);}

test('alphaTab preserves a short pickup voice inside the full written meter',()=>{
  const {melodyRhythm}=melody(),bar={start:0,pickup_beats:2,time_signature:'4/4'},notes=[{start:0,end:1,midi:60}];
  const model=melodyRhythm(notes,bar,1,{time_signature:'4/4'});
  const {score}=createScore(alpha,{kind:'melody',measures:[{bar,notes,model,start:0,end:1,chords:[]}]});
  assert.equal(score.masterBars[0].timeSignatureNumerator,4);
  assert.equal(score.masterBars[0].isAnacrusis,true);
  assert.equal(score.masterBars[0].calculateDuration(),1920);
});
const chart={time_signature:'4/4',beat_times:[0,.5,1,1.5,2,2.5,3,3.5,4],melody:{ok:true,events:[
  {start:0,end:1,midi:72},{start:1,end:1.5,midi:72},{start:1.5,end:2.5,midi:60}]}};

test('melody clips cross-bar notes but preserves attacks and source data',()=>{
  const {melodyBarNotes}=melody(),saved=JSON.stringify(chart);
  const first=melodyBarNotes(chart,{start:0},2),second=melodyBarNotes(chart,{start:2},4);
  assert.equal(first.length,3);assert.equal(first[2].continuesToNext,true);
  assert.equal(second[0].continuesFromPrevious,true);assert.equal(second[0].attack_start,1.5);
  assert.equal(JSON.stringify(chart),saved);
});

test('melody rhythm accounts for repeated notes, rests and exact measure duration',()=>{
  const {melodyBarNotes,melodyRhythm}=melody();
  const notes=melodyBarNotes(chart,{start:0},2),model=melodyRhythm(notes,{start:0},2,chart);
  assert.deepEqual([...new Set(model.events.filter(e=>e.sourceIndex!==null).map(e=>e.sourceIndex))],[0,1,2]);
  assert.equal(model.events.reduce((sum,e)=>sum+e.units,0),model.totalUnits);
  const rest=melodyRhythm([],{start:0},2,chart);
  assert.ok(rest.events.every(e=>e.sourceIndex===null));
});

test('alphaTab melody uses treble concert pitch, no TAB, and cross-bar ties',()=>{
  const {melodyBarNotes,melodyRhythm}=melody();
  const measures=[0,2].map(start=>{const bar={start},notes=melodyBarNotes(chart,bar,start+2);
    return {bar,start,end:start+2,notes,model:melodyRhythm(notes,bar,start+2,chart),chords:[]};});
  const converted=createScore(alpha,{kind:'melody',mode:'notation',key:'C',measures},{barsPerLine:2});
  const staff=converted.score.tracks[0].staves[0];
  assert.equal(staff.showTablature,false);assert.equal(staff.bars[0].clef,alpha.model.Clef.G2);
  const pitched=converted.audit.filter(e=>e.source.sourceIndex!==null);
  assert.ok(pitched.length>=4);
  for(const entry of pitched){assert.equal(entry.beat.notes[0].realValue,entry.source.midi);assert.equal(entry.beat.notes[0].displayValue,entry.source.midi);}
  assert.ok(pitched.some(e=>e.beat.notes[0].isTieDestination));
});

test('triplet melody durations survive alphaTab normalization',()=>{
  const {melodyRhythm}=melody();
  const notes=[0,1,2].map(i=>({start:i/6,end:(i+1)/6,midi:67}));
  const model=melodyRhythm(notes,{start:0},2,{time_signature:'4/4'});
  assert.ok(model.events.filter(e=>e.sourceIndex!==null).every(e=>e.triplet));
  assert.doesNotThrow(()=>createScore(alpha,{kind:'melody',mode:'notation',key:'C',measures:[{start:0,end:2,notes,model,chords:[]}]}));
});

test('a syncopated quarter stays one note instead of two tied eighths',()=>{
  const {melodyRhythm}=melody(),notes=[{start:.25,end:.75,midi:61}];
  const saved=JSON.stringify(notes),model=melodyRhythm(notes,{start:0},2,{time_signature:'4/4'});
  const pitched=model.events.filter(event=>event.sourceIndex!==null);
  assert.equal(pitched.length,1);assert.equal(pitched[0].duration,'4');
  assert.equal(pitched[0].tieToNext,false);assert.equal(JSON.stringify(notes),saved);
});

test('one release near a third of a beat does not invent triplet notes and rests',()=>{
  const {melodyRhythm}=melody();
  const model=melodyRhythm([{start:0,end:1/3,midi:61},{start:.5,end:1,midi:64}],{start:0},2,{time_signature:'4/4'});
  assert.ok(model.events.every(event=>!event.triplet));
  assert.equal(model.events.reduce((sum,event)=>sum+event.units,0),model.totalUnits);
});

test('vocal timing drift uses a consistent sixteenth grid and retains repeated attacks',()=>{
  const {melodyRhythm}=melody(),notes=[{start:0,end:.27,midi:61},{start:.27,end:.51,midi:61},{start:.51,end:.99,midi:64}];
  const model=melodyRhythm(notes,{start:0},2,{time_signature:'4/4'});
  assert.deepEqual([...new Set(model.events.filter(event=>event.sourceIndex!==null).map(event=>event.sourceIndex))],[0,1,2]);
  assert.ok(model.events.every(event=>!event.triplet&&Number(event.duration)<=16));
  assert.equal(model.events.filter(event=>event.sourceIndex!==null).length,3);
});

test('quarter-note triplets remain coherent and substantial vocal rests remain rests',()=>{
  const {melodyRhythm}=melody();
  const notes=[0,1,2].map(i=>({start:i/3,end:(i+1)/3,midi:60+i}));
  const model=melodyRhythm(notes,{start:0},2,{time_signature:'4/4'});
  const pitched=model.events.filter(event=>event.sourceIndex!==null);
  assert.equal(pitched.length,3);assert.ok(pitched.every(event=>event.triplet&&event.duration==='4'));
  assert.equal(model.events.filter(event=>event.sourceIndex===null).reduce((sum,event)=>sum+event.units,0),48);
});

test('a coherent triplet crossing a barline retains its rhythm and tied continuation',()=>{
  const {melodyBarNotes,melodyRhythm}=melody();
  const c={time_signature:'3/4',duration:3,beat_times:[0,.5,1,1.5,2,2.5,3],bars:[{start:0},{start:1.5}],
    melody:{ok:true,events:[{start:1,end:4/3,midi:60},{start:4/3,end:5/3,midi:62},{start:5/3,end:2,midi:64}]}};
  const measures=c.bars.map((bar,i)=>{const end=c.bars[i+1]?.start??c.duration,notes=melodyBarNotes(c,bar,end);
    return {bar,start:bar.start,end,notes,model:melodyRhythm(notes,bar,end,c),chords:[]};});
  for(const measure of measures)assert.ok(measure.model.events.filter(event=>event.sourceIndex!==null).every(event=>event.triplet));
  const converted=createScore(alpha,{kind:'melody',mode:'notation',key:'C',measures});
  assert.ok(converted.audit.some(entry=>entry.beat.notes[0]?.isTieDestination));
});

test('sub-grid notes are diagnosed instead of silently disappearing',()=>{
  const {melodyRhythm}=melody();
  const notes=Array.from({length:4},(_,i)=>({start:i*.001,end:(i+1)*.001,midi:60+i}));
  const model=melodyRhythm(notes,{start:0},2,{time_signature:'4/4'});
  const represented=new Set(model.events.filter(e=>e.sourceIndex!==null).map(e=>e.sourceIndex));
  for(let i=0;i<notes.length;i++)assert.ok(represented.has(i)||model.diagnostics.some(d=>d.sourceIndex===i));
});

test('display transposition follows chords while original vocal pitches stay unchanged',()=>{
  const {melodyBarNotes}=melody(),transposed={...chart,key_offset:2};
  const notes=melodyBarNotes(transposed,{start:0},2);
  assert.equal(notes[0].midi,74);assert.equal(chart.melody.events[0].midi,72);
});
test('invalid loaded melody timing cannot disappear during measure filtering',()=>{
  const {melodyBarNotes}=melody();
  const broken={melody:{events:[{start:NaN,end:1,midi:60}]}};
  assert.throws(()=>melodyBarNotes(broken,{start:0},2),/Invalid vocal note/);
  for(const events of [[{start:0,end:2,midi:60},{start:1,end:3,midi:62}],[{start:0,end:5,midi:60}]]){
    assert.throws(()=>melodyBarNotes({melody:{duration:4,events}},{start:0},2),/Invalid vocal note/);
  }
});

test('vocal events beyond chart measures have explicit coverage diagnostics',()=>{
  const {melodyCoverageDiagnostics}=loadScript('src/renderer/melody-view.js',['melodyCoverageDiagnostics']);
  const events=[{start:0,end:1,midi:60},{start:2,end:3,midi:62},{start:3,end:5,midi:64},{start:6,end:7,midi:65}];
  const issues=melodyCoverageDiagnostics({melody:{events}},.5,4);
  assert.equal(issues.length,3);
  for(const midi of [60,64,65])assert.ok(issues.some(issue=>issue.includes(`MIDI ${midi}`)));
});

test('lead-sheet notation defaults are clean and finer rhythm is optional',()=>{
  const {melodyNotationSettings}=loadScript('src/renderer/melody-view.js',['melodyNotationSettings']);
  assert.deepEqual(plain(melodyNotationSettings()),{resolution:16,cleanChords:true});
  assert.deepEqual(plain(melodyNotationSettings({resolution:32,cleanChords:false})),{resolution:32,cleanChords:false});
});

test('fine rhythm retains close attacks without changing raw events',()=>{
  const {melodyRhythm}=melody(),notes=[{start:0,end:.0625,midi:60},{start:.0625,end:.125,midi:62}];
  const saved=JSON.stringify(notes),model=melodyRhythm(notes,{start:0},2,{}, {resolution:32});
  assert.deepEqual([...new Set(model.events.filter(event=>event.sourceIndex!==null).map(event=>event.sourceIndex))],[0,1]);
  assert.equal(model.events.reduce((sum,event)=>sum+event.units,0),model.totalUnits);
  assert.equal(JSON.stringify(notes),saved);
});

test('clean lead-sheet chords consolidate equivalent labels and preserve real bass notes and alterations',()=>{
  const display=loadScript('src/renderer/bars.js',['displayChordSymbol'],{elements:{},state:{chart:{}}});
  const {melodyChordEvents}=loadScript('src/renderer/melody-view.js',['melodyChordEvents'],display);
  const events=[{start:0,end:.5,chord:'Cmaj9/C'},{start:.5,end:1,chord:'Cmaj13'},{start:1,end:1.5,chord:'Dm6/9/A'},{start:1.5,end:2,chord:'E7#9'}];
  const saved=JSON.stringify(events),clean=melodyChordEvents(events,true);
  assert.equal(clean.length,3);assert.equal(clean[0].label,'Cmaj7');assert.equal(clean[0].end,1);
  assert.equal(clean[1].label,'Dm6/A');assert.equal(clean[2].label,'E7#9');
  assert.deepEqual([...clean[0].originalChords],['Cmaj9/C','Cmaj13']);
  assert.equal(melodyChordEvents(events,false).length,4);assert.equal(JSON.stringify(events),saved);
});

test('notation quality checks request review without changing suspicious rhythms',()=>{
  const {melodyQualityDiagnostics}=loadScript('src/renderer/melody-view.js',['melodyQualityDiagnostics']);
  const model={beats:4,events:Array.from({length:5},(_,i)=>({sourceIndex:0,duration:'32',triplet:false,tieToNext:i<4}))};
  const saved=JSON.stringify(model),issues=melodyQualityDiagnostics(model,[{start:0,end:1,midi:60}]);
  assert.ok(issues.some(issue=>issue.includes('tie')));assert.ok(issues.some(issue=>issue.includes('short')));
  assert.equal(JSON.stringify(model),saved);
});

test('instrumental classifier evidence flags review without discarding quiet notes',()=>{
  const {melodyQualityDiagnostics}=loadScript('src/renderer/melody-view.js',['melodyQualityDiagnostics']);
  const notes=[{start:1,end:2,midi:60}],model={beats:4,events:[{sourceIndex:0,duration:'4'}]};
  const review={intervals:[{start:0,end:3,singing:.02,instruments:.4}]};
  assert.ok(melodyQualityDiagnostics(model,notes,review).some(issue=>issue.includes('accompaniment')));
  assert.equal(notes.length,1);assert.equal(notes[0].midi,60);
  assert.deepEqual(plain(melodyQualityDiagnostics(model,notes,{intervals:[{start:0,end:3,singing:.2,instruments:.4}]})),[]);
});
