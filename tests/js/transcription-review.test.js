const test=require('node:test');
const assert=require('node:assert/strict');
const {loadScript,plain}=require('./helpers/load-script');
const BassTuning=require('../../src/renderer/bass-tuning.js');
const names=['transcriptionBasis','transcriptionReviewStatus','setTranscriptionCorrection','effectiveTranscriptionEvents','verifyTranscription','captureDetectedChords','chartDisplayTitle','hasReviewedBassEvents','reviewedBassTrack','parseReviewPitch','resetTranscriptionCorrection'];
const transpose=loadScript('src/renderer/transpose.js',['transposeBarChordFields'],{PITCH_NAMES:['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'],ENHARMONIC_TO_PITCH:{}});
const api=()=>loadScript('src/renderer/transcription-review.js',names,transpose);
function fixture(){return {source_path:'song.wav',beat_times:[0,.5,1,1.5,2],analysis_engine:{options:{}},
  drums:{ok:true,fingerprint:'model-a',events:[{time:.25,instrument:'kick',score:.8}]},
  duration:2,bars:[{start:0,chord:'C',chord_events:[{start:0,end:2,chord:'C',confidence:.7}],bass_events:[{start:.1,end:1.8,midi:36,confidence:.98,attack_start:.1}]}]};}

test('corrections preserve original predictions and require explicit verification',()=>{
  const a=api(),chart=fixture(),bar=chart.bars[0],original=JSON.stringify(bar.bass_events);
  const edited=[{start:.2,end:1.7,midi:38}];
  a.setTranscriptionCorrection(chart,bar,2,'bass',edited);
  assert.equal(a.transcriptionReviewStatus(chart,bar,2,'bass'),'Unverified');
  assert.equal(JSON.stringify(bar.bass_events),original);
  const effective=a.effectiveTranscriptionEvents(chart,bar,2,'bass');
  assert.equal(effective[0].midi,38);assert.equal(effective[0].confidence,undefined);
  assert.equal(a.verifyTranscription(chart,bar,2,'bass',true),true);
  assert.equal(a.transcriptionReviewStatus(chart,bar,2,'bass'),'Verified');
  effective[0].midi=12;assert.equal(a.effectiveTranscriptionEvents(chart,bar,2,'bass')[0].midi,38);
  const restored=JSON.parse(JSON.stringify(chart));
  assert.equal(a.transcriptionReviewStatus(restored,restored.bars[0],2,'bass'),'Verified');
});

test('changed evidence, bar bounds or corrections invalidate verification',()=>{
  const a=api(),chart=fixture(),bar=chart.bars[0];
  a.setTranscriptionCorrection(chart,bar,2,'bass',[{start:.2,end:1.7,midi:38}]);
  a.verifyTranscription(chart,bar,2,'bass',true);
  bar.bass_events[0].midi=37;
  assert.equal(a.transcriptionReviewStatus(chart,bar,2,'bass'),'Needs review');
  assert.equal(a.effectiveTranscriptionEvents(chart,bar,2,'bass')[0].midi,37);
  assert.equal(a.transcriptionReviewStatus(chart,bar,2.1,'bass'),'Needs review');
  a.setTranscriptionCorrection(chart,bar,2,'bass',[{start:.2,end:1.7,midi:39}]);
  assert.equal(a.transcriptionReviewStatus(chart,bar,2,'bass'),'Unverified');
});

test('drum class scores are preserved only on raw events and stale stems cannot be verified',()=>{
  const a=api(),chart=fixture(),bar=chart.bars[0];
  a.setTranscriptionCorrection(chart,bar,2,'drums',[{time:.3,instrument:'snare'}]);
  assert.equal(a.effectiveTranscriptionEvents(chart,bar,2,'drums')[0].score,undefined);
  a.verifyTranscription(chart,bar,2,'drums',true);chart.drums.fingerprint='model-b';
  assert.equal(a.transcriptionReviewStatus(chart,bar,2,'drums'),'Needs review');
  chart.drums.stale=true;assert.equal(a.verifyTranscription(chart,bar,2,'drums',true),false);
  assert.deepEqual(plain(chart.drums.events),[{time:.25,instrument:'kick',score:.8}]);
});

test('edits reject invalid ranges, unknown classes, overlapping bass and chord gaps',()=>{
  const a=api(),chart=fixture(),bar=chart.bars[0];
  for(const [kind,events] of [['bass',[{start:0,end:3,midi:36}]],['bass',[{start:0,end:1,midi:36},{start:.5,end:2,midi:38}]],
    ['drums',[{time:1,instrument:'water'}]],['chords',[{start:.1,end:2,chord:'C'}]]]) {
    assert.throws(()=>a.setTranscriptionCorrection(chart,bar,2,kind,events));
  }
  a.setTranscriptionCorrection(chart,bar,2,'bass',[]);
  assert.deepEqual(plain(a.effectiveTranscriptionEvents(chart,bar,2,'bass')),[]);
});

test('original chord snapshots and reference candidates never replace detected labels',()=>{
  const a=api(),chart=fixture(),bar=chart.bars[0];
  a.captureDetectedChords(bar,2);bar.chord_events[0].chord='Cm';a.captureDetectedChords(bar,2);
  assert.equal(bar.transcription_review.chords.detected[0].chord,'C');
  bar.transcription_review.chords.reference='F7';
  assert.equal(a.effectiveTranscriptionEvents(chart,bar,2,'chords')[0].chord,'Cm');
});

test('chart headings use compact song metadata while preserving custom titles',()=>{
  const {chartDisplayTitle}=api();
  assert.equal(chartDisplayTitle({title:'Overjoyed [678STgx-Esw]'}, {title:'Overjoyed',artist:'Stevie Wonder'}),'Overjoyed — Stevie Wonder');
  assert.equal(chartDisplayTitle({title:'My arrangement'}, {title:'Overjoyed',artist:'Stevie Wonder'}),'My arrangement');
  assert.equal(chartDisplayTitle({title:'Song [abcdefghijk]'}),'Song');
});

test('short manual notes and notes entered on legacy bars remain visible without fake confidence',()=>{
  const a=api(),chart=fixture(),bar=chart.bars[0];delete bar.bass_events;
  a.setTranscriptionCorrection(chart,bar,2,'bass',[{start:.2,end:.24,midi:38}]);
  const view=loadScript('src/renderer/bass-view.js',['bassChartNotes','bassRhythm'],{...a,PITCH_NAMES:[],BassTuning});
  const notes=view.bassChartNotes(chart,4)[0],model=view.bassRhythm(notes,bar,2,chart);
  assert.equal(notes[0].midi,38);assert.ok(model.events.some(e=>e.midi===38));
  assert.equal(notes[0].confidence,undefined);assert.equal(a.verifyTranscription(chart,bar,2,'bass',true),true);
});

test('editing an unchanged clipped sustain preserves attack identity and cross-bar ties',()=>{
  const a=api(),chart=fixture();chart.bars=[{start:0,bass_events:[{start:0,end:1,midi:36,attack_start:0}]},
    {start:1,bass_events:[{start:1,end:2,midi:36,attack_start:0}]}];
  a.setTranscriptionCorrection(chart,chart.bars[1],2,'bass',[{start:1,end:2,midi:36}]);
  const view=loadScript('src/renderer/bass-view.js',['bassChartNotes'],{...a,BassTuning});
  const notes=view.bassChartNotes(chart,4);
  assert.equal(notes[0][0].continuesToNext,true);assert.equal(notes[1][0].continuesFromPrevious,true);
});

test('manual provenance survives merging a tiny continuation with an earlier raw sustain',()=>{
  const a=api(),chart=fixture();chart.bars=[{start:0,bass_events:[{start:0,end:1,midi:36,confidence:.99,attack_start:0}]},
    {start:1,bass_events:[{start:1,end:1.02,midi:36,confidence:.99,attack_start:0}]}];
  a.setTranscriptionCorrection(chart,chart.bars[1],2,'bass',[{start:1,end:1.02,midi:36}]);
  const view=loadScript('src/renderer/bass-view.js',['bassChartNotes','bassRhythm'],{...a,BassTuning});
  const notes=view.bassChartNotes(chart,4)[1];
  assert.equal(notes[0].manual,true);assert.ok(view.bassRhythm(notes,chart.bars[1],2,chart).events.some(e=>e.midi===36));
  delete chart.bars[0].bass_events[0].attack_start;delete chart.bars[1].bass_events[0].attack_start;
  a.resetTranscriptionCorrection(chart,chart.bars[1],2,'bass');
  a.setTranscriptionCorrection(chart,chart.bars[1],2,'bass',[{start:1,end:1.02,midi:36}]);
  const legacy=view.bassChartNotes(chart,4);
  assert.equal(legacy[0][0].continuesToNext,true);assert.equal(legacy[1][0].continuesFromPrevious,true);
});

test('review pitch input accepts octave names, accidentals and MIDI numbers',()=>{
  const {parseReviewPitch}=api();
  for(const [name,midi]of [['C2',36],['Db2',37],['C♯2',37],['Bb1',34],['38',38]])assert.equal(parseReviewPitch(name),midi);
  assert.ok(Number.isNaN(parseReviewPitch('cat')));
});

test('editing a neighbouring hit invalidates verification of a snapped downbeat',()=>{
  const a=api(),chart=fixture();chart.duration=4;chart.bars.push({start:2});
  chart.drums.events=[{time:1.99,instrument:'snare',score:.9}];
  a.verifyTranscription(chart,chart.bars[1],4,'drums',true);
  assert.equal(a.transcriptionReviewStatus(chart,chart.bars[1],4,'drums'),'Verified');
  a.setTranscriptionCorrection(chart,chart.bars[0],2,'drums',[{time:1.99,instrument:'kick'}]);
  assert.equal(a.transcriptionReviewStatus(chart,chart.bars[1],4,'drums'),'Needs review');
});

test('reset restores captured chords at the current transposition and refuses obsolete bar bounds',()=>{
  const a=api(),chart=fixture(),bar=chart.bars[0];
  a.setTranscriptionCorrection(chart,bar,2,'chords',[{start:0,end:2,chord:'F'}]);
  chart.key_offset=2;transpose.transposeBarChordFields(bar,2);
  a.resetTranscriptionCorrection(chart,bar,2,'chords');
  assert.equal(bar.chord_events[0].chord,'D');assert.equal(bar.chord,'D');
  a.setTranscriptionCorrection(chart,bar,2,'chords',[{start:0,end:2,chord:'G'}]);
  bar.start=.1;assert.throws(()=>a.resetTranscriptionCorrection(chart,bar,2,'chords'),/timing changed/);
  assert.equal(bar.chord_events[0].chord,'G');
});
