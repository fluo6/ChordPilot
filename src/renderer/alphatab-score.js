// Convert ChordPilot's existing bass/drum engraving models to alphaTab's
// public score model. This module never reads audio or changes chart data.
(function(root){
  const bassTuning=typeof module!=='undefined'?require('./bass-tuning.js'):root.BassTuning;
  const drumMap={kick:36,snare:38,hihat:42,tom:47,cymbal:49};
  function createScore(alpha,fixture,{barsPerLine=4}={}){
    const m=alpha.model,score=new m.Score(),track=new m.Track(),staff=new m.Staff();
    const unsupported=fixture.kind==='bass'?fixture.measures.flatMap((measure,bar)=>measure.model.events
      .filter(event=>event.sourceIndex!==null&&!event.position)
      .map(event=>({bar,source:event,transcription:measure.notes?.[event.sourceIndex]}))):[];
    // alphaTab's combined notation+TAB renderer requires every note to have a
    // valid string/fret. Keep the exact pitch in the score, but use its stable
    // notation-only layout for the whole passage when any note is out of range.
    // This avoids a worker-side engraving exception without changing source
    // pitches, durations, ties, or the existing ChordPilot renderer's TAB view.
    const effectiveMode=fixture.kind==='bass'&&fixture.mode!=='notation'&&unsupported.length?'notation':fixture.mode;
    const pitched=fixture.kind!=='drums';
    score.title='';track.name=fixture.kind==='bass'?'Bass':fixture.kind==='melody'?'Lead vocal':'Drums';track.shortName='';
    score.addTrack(track);track.addStaff(staff);
    track.playbackInfo.program=fixture.kind==='bass'?33:0;
    track.defaultSystemsLayout=barsPerLine;score.defaultSystemsLayout=barsPerLine;
    staff.isPercussion=fixture.kind==='drums';
    staff.showTablature=fixture.kind==='bass'&&effectiveMode!=='notation';
    staff.showStandardNotation=staff.isPercussion||effectiveMode!=='tab';
    if(fixture.kind==='bass'){
      staff.stringTuning=new m.Tuning('Bass',bassTuning.configFor(fixture.strings).midi,false);
      staff.displayTranspositionPitch=-12;
    }
    const audit=[],annotations=[],diagnostics=[];
    let previousSection='',previousEvent=null,previousNote=null;
    const keyFifths={C:0,G:1,D:2,A:3,E:4,B:5,'F#':6,'C#':7,F:-1,Bb:-2,Eb:-3,Ab:-4,Db:-5,Gb:-6,Cb:-7,
      Am:0,Em:1,Bm:2,'F#m':3,'C#m':4,'G#m':5,'D#m':6,'A#m':7,Dm:-1,Gm:-2,Cm:-3,Fm:-4,Bbm:-5,Ebm:-6,Abm:-7};
    fixture.measures.forEach((source,index)=>{
      const master=new m.MasterBar(),bar=new m.Bar(),voice=new m.Voice();
      const model=source.model;
      master.timeSignatureNumerator=model.beats;master.timeSignatureDenominator=model.beatValue;
      if(source.bar?.pickup_beats){
        const signature=/^(\d+)\/(2|4|8|16)$/.exec(source.bar.time_signature||fixture.chart?.time_signature||'4/4');
        if(signature&&model.beats<Number(signature[1])){
          master.timeSignatureNumerator=Number(signature[1]);master.timeSignatureDenominator=Number(signature[2]);master.isAnacrusis=true;
        }
      }
      master.isRepeatStart=Boolean(source.bar?.repeat_start);
      master.repeatCount=Math.max(0,Number(source.bar?.repeat_end)||0);
      const sectionKey=source.sectionId || source.bar?.section_id || source.section;
      if(source.section && sectionKey!==previousSection){
        // Section names are drawn in ChordPilot's overlay above each system so
        // alphaTab does not place marker text inside the music staff.
        if(index)track.addLineBreaks(index);previousSection=sectionKey;
      }
      score.addMasterBar(master);staff.addBar(bar);bar.addVoice(voice);
      bar.clef=staff.isPercussion?m.Clef.Neutral:fixture.kind==='melody'?m.Clef.G2:m.Clef.F4;
      bar.keySignature=staff.isPercussion?0:keyFifths[fixture.key] ?? 0;
      model.events.forEach((event,eventIndex)=>{
        const beat=new m.Beat();voice.addBeat(beat);beat.duration=Number(event.duration);beat.dots=event.dots;
        if(event.triplet){beat.tupletNumerator=3;beat.tupletDenominator=2;}
        const next=model.events[eventIndex+1];
        const pulse=pitched?model.unitDenominator/model.beatValue:1;
        const silent=e=>pitched?e.sourceIndex===null:!e.instruments.length;
        if(!next || silent(event) || silent(next) || Math.floor(event.offset/pulse)!==Math.floor(next.offset/pulse))beat.beamingMode=m.BeatBeamingMode.ForceSplitToNext;
        if(pitched && event.sourceIndex!==null){
          const note=new m.Note();
          if(event.position){note.string=fixture.strings+1-event.position.string;note.fret=event.position.fret;}
          else{
            // Keep the exact MIDI pitch in standard notation. alphaTab's public
            // pitch-only Note fields let the rest of the score keep its TAB.
            note.string=-1;note.fret=-1;note.tone=((event.midi%12)+12)%12;note.octave=Math.floor(event.midi/12);
            const transcription=fixture.measures[index].notes?.[event.sourceIndex];
            if(fixture.kind==='bass')
            diagnostics.push({kind:'unplayable-tab-note',bar:source.number||index+1,midi:event.midi,
              pitch:bassTuning.pitchName(event.midi),sourceIndex:event.sourceIndex,
              start:transcription?.start,end:transcription?.end,frequencyHz:transcription?.frequency_hz,
              attackStart:transcription?.attack_start,confidence:transcription?.confidence,
              strings:fixture.strings,tuning:bassTuning.configFor(fixture.strings).label,
              reason:bassTuning.unavailableReason(event.midi,fixture.strings)});
          }
          beat.addNote(note);
          const connect=previousNote && previousEvent?.midi===event.midi &&
            (previousEvent.tieToNext || previousEvent.tieToFollowingBar && event.tieFromPrevious);
          if(connect){note.isTieDestination=true;note.tieOrigin=previousNote;previousNote.tieDestination=note;}
          previousNote=note;previousEvent=event;
        } else if(fixture.kind==='drums'){
          for(const instrument of event.instruments){
            const articulation=drumMap[instrument];
            if(!articulation)throw Error(`Unsupported drum class: ${instrument}`);
            const note=new m.Note();note.percussionArticulation=articulation;beat.addNote(note);
          }
        } else {previousNote=null;previousEvent=null;}
        const quarters=pitched?event.units*4/model.unitDenominator:
          event.beats*4/model.beatValue;
        audit.push({bar:index,event:eventIndex,beat,source:event,quarters});
      });
      annotations.push(...source.chords.map(chord=>({bar:index,...chord})));
    });
    score.finish(new alpha.Settings());
    // Fail visibly if the engraving library normalizes a musical value.
    for(const entry of audit){
      const {beat,source:event,quarters}=entry;
      if(Math.abs(beat.playbackDuration/960-quarters)>1e-8)throw Error(`Duration changed in bar ${entry.bar+1}: ${beat.playbackDuration/960} != ${quarters}`);
      if(pitched && event.sourceIndex!==null){
        const note=beat.notes[0];
        if(note.realValue!==event.midi || note.displayValue!==event.midi+(fixture.kind==='bass'?12:0))throw Error(`Pitch/octave changed in bar ${entry.bar+1}`);
        if(event.position){
          if(note.string!==fixture.strings+1-event.position.string || note.fret!==event.position.fret)throw Error('Bass fingering changed');
        }else if(!note.isPiano||note.string!==-1||note.fret!==-1)throw Error('Pitch-only note was not retained in standard notation');
      }
      if(fixture.kind==='drums' && beat.notes.map(note=>note.percussionArticulation).join(',')!==event.instruments.map(key=>drumMap[key]).join(','))
        throw Error(`Drum articulation changed in bar ${entry.bar+1}`);
    }
    return {score,audit,annotations,diagnostics,effectiveMode};
  }
  function buildFixture(kind){
    const chart=state.chart,bars=chart?.bars || [];
    if(!bars.length)throw Error('Analyze a song before rendering notation.');
    const ends=bars.map((_,index)=>barEndTime(index));
    const bassChart=kind==='bass'?{...chart,duration:ends.at(-1)}:null;
    const detectedNotesByBar=kind==='bass'?bassChartNotes(bassChart,4):null;
    const strings=kind==='bass'?bassTuning.recommendedStringCount(detectedNotesByBar.flat()):bassTuning.normalizeStringCount(state.bassStrings);
    if(kind==='bass')state.bassStrings=strings;
    const bass=kind==='bass'?(strings===4?detectedNotesByBar:bassChartNotes(bassChart,strings)):null;
    const melodySettings=kind==='melody'?melodyNotationSettings(state.melodyNotation):null;
    const voiceReview=chart.melody?.voice_review?.melody_fingerprint===chart.melody?.fingerprint?chart.melody?.voice_review:null;
    const measures=bars.map((bar,index)=>{
      const end=ends[index];
      const notes=kind==='melody'?melodyBarNotes(chart,bar,end):kind==='bass'?bass[index]:undefined;
      const model=kind==='melody'?melodyRhythm(notes,bar,end,chart,melodySettings):kind==='bass'?bassRhythm(notes,bar,end,chart):drumRhythm(drumBarEvents(chart,bar,end),bar,end,chart);
      if(!model)throw Error(`Could not prepare bar ${bar.number || index+1} for notation.`);
      return {number:bar.number || index+1,start:Number(bar.start),end,section:String(bar.section || '').trim(),sectionId:bar.section_id || bar.section,bar,
        notes,model,reviewIssues:kind==='melody'?melodyQualityDiagnostics(model,notes,voiceReview):[],
        chords:kind==='melody'?melodyChordEvents(chordEventsForBar(index),melodySettings.cleanChords):chordEventsForBar(index).map(event=>({chord:event.chord,start:event.start,end:event.end}))};
    });
    const key=typeof notationKeySignature==='function'?notationKeySignature(chart,state.notationUseKeySignature!==false):'';
    return {kind,strings,key,keyLabel:chartKeyText(chart)||chart.key||chart.detected_key||'C',
      mode:kind==='melody'?'notation':state.bassNotationMode||'both',melodySettings,tempo:chart.tempo||0,title:chart.title||'',chart,measures};
  }
  function timeToTick(fixture,time){
    let ticks=0;
    for(const source of fixture.measures){
      const {model}=source,total=model.beats*4/model.beatValue*960;
      if(time>=source.end){ticks+=total;continue;}
      if(time<=source.start)return ticks;
      const anchors=model.anchors,index=anchors.findIndex((end,i)=>i>0&&time<end)-1;
      return ticks+(index+(time-anchors[index])/(anchors[index+1]-anchors[index]))*4/model.beatValue*960;
    }
    return ticks;
  }
  function tickToTime(fixture,tick){
    let offset=0;
    for(const source of fixture.measures){
      const {model}=source,total=model.beats*4/model.beatValue*960;
      if(tick>=offset+total){offset+=total;continue;}
      const position=Math.max(0,tick-offset)/(4/model.beatValue*960),index=Math.min(model.beats-1,Math.floor(position));
      return model.anchors[index]+(position-index)*(model.anchors[index+1]-model.anchors[index]);
    }
    return fixture.measures.at(-1)?.end || 0;
  }
  const api={createScore,buildFixture,timeToTick,tickToTime,drumMap};
  if(typeof module!=='undefined')module.exports=api;else root.AlphaTabScore=api;
})(globalThis);
