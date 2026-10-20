function bassPositions(midi, strings = 4) {
  return BassTuning.positions(midi,strings);
}

function bassFingerings(notes, strings) {
  // Plan the phrase together: favour fretted notes near a comfortable position,
  // small hand shifts and nearby strings. Open strings remain useful in low runs.
  const layers=[];
  notes.forEach((note,index)=>{
    const candidates=bassPositions(note.midi,strings);
    const previous=layers[index-1] || [];
    layers.push((candidates.length?candidates:[null]).map(position=>{
      const own=position ? position.fret*.03+(position.fret===0 ? 1.1 : Math.abs(position.fret-4)*.08) : 0;
      const choices=previous.map((entry,i)=>{
        const before=entry.position;
        const distance=position && before ? Math.abs(position.fret-before.fret) : 0;
        const move=position && before ? distance*.1+Math.max(0,distance-3)*1.5+Math.abs(position.string-before.string)*.35 : 0;
        return {cost:entry.cost+move,index:i};
      });
      const best=choices.reduce((a,b)=>b.cost<a.cost?b:a,{cost:previous.length?Infinity:0,index:-1});
      return {position,cost:own+best.cost,previous:best.index};
    }));
  });
  let selected=layers.at(-1)?.reduce((best,entry,i,entries)=>entry.cost<entries[best].cost?i:best,0);
  for(let i=notes.length-1;i>=0;i--) {
    const choice=layers[i][selected];
    notes[i].position=choice.position;
    selected=choice.previous;
  }
  return notes;
}

function bassBarNotes(bar, barEnd, strings = 4, bassEvents = bar?.bass_events) {
  if (!bar || !Number.isFinite(bar.start) || !(barEnd > bar.start)) return [];
  const notes = [];
  const merge=source=>source.sort((a,b)=>a.start-b.start).reduce((merged,note)=>{
    const previous=merged.at(-1);
    if(previous?.midi===note.midi && note.start<=previous.end+.005
      && (note.attack_start===undefined || note.attack_start===previous.attack_start)) {
      previous.end=Math.max(previous.end,note.end);
      if(note.manual || previous.manual) {previous.manual=true;delete previous.confidence;}
    }
    else merged.push({...note});
    return merged;
  },[]);
  if (Array.isArray(bassEvents)) {
    const phrase=merge(bassEvents.filter(note=>Number.isInteger(note.midi) && note.midi>=21 && note.midi<=67
      && Number.isFinite(note.start) && Number.isFinite(note.end) && note.end>note.start));
    bassFingerings(phrase,strings);
    notes.push(...phrase.filter(note=>note.end>bar.start && note.start<barEnd)
      .map(note => ({...note, start: Math.max(bar.start, note.start), end: Math.min(barEnd, note.end),
        position:note.position})).filter(note => note.end > note.start));
  } else {
    const events = Array.isArray(bar.chord_events) && bar.chord_events.length ? bar.chord_events : [bar];
    for (const event of events) {
      const cells = Array.isArray(event.debug?.cells) && event.debug.cells.length ? event.debug.cells : [event];
      for (const cell of cells) {
        // Saved cell times describe the audio, independently of edited chord bounds.
        const start = Math.max(bar.start, cell.start ?? bar.start);
        const end = Math.min(barEnd, cell.end ?? barEnd);
        const reference = cell.bass_reference;
        const pitches = Array.isArray(reference?.detected_pitches) ? reference.detected_pitches.filter(pitch => pitch) : [];
        const midi = measuredBassMidi(reference, pitches);
        if (!(end > start) || !Number.isInteger(midi)) continue;
        notes.push({start, end, midi, position: bassPositions(midi, strings)[0] || null});
      }
    }
  }
  const merged=merge(notes);
  if(Array.isArray(bassEvents)) for(const note of merged) {
    const sameAttack=other=>note.attack_start===undefined || note.attack_start===other.attack_start;
    if(note.start===bar.start && bassEvents.some(other=>sameAttack(other) && other.midi===note.midi && other.start<bar.start && other.end>=bar.start-.005)) note.continuesFromPrevious=true;
    if(note.end===barEnd && bassEvents.some(other=>sameAttack(other) && other.midi===note.midi && other.end>barEnd && other.start<=barEnd+.005)) note.continuesToNext=true;
  }
  return Array.isArray(bassEvents) ? merged : bassFingerings(merged,strings);
}

function activeBassNote(notes, time) {
  return notes.find(note => time >= note.start && time < note.end) || null;
}

function bassChartNotes(chart, strings = 4) {
  const bars = chart?.bars || [];
  if (!bars.length) return [];
  const end = index => Number(bars[index + 1]?.start ?? chart.duration);
  const semitones = Math.trunc(Number(chart?.key_offset) || 0);
  const transpose = notes => semitones ? bassFingerings(notes.map(note => ({...note, midi:note.midi + semitones})), strings) : notes;
  const track = typeof reviewedBassTrack==='function' ? reviewedBassTrack(chart) : bars.flatMap(bar => bar.bass_events || []);
  // Plan the complete phrase once so adjacent measures keep the same fingering.
  const measured = transpose(bassBarNotes({start:bars[0]?.start}, end(bars.length - 1), strings, track));
  return bars.map((bar, index) => (typeof hasReviewedBassEvents==='function' ? hasReviewedBassEvents(chart,bar,end(index)) : Array.isArray(bar.bass_events))
    ? measured.filter(note => note.end > bar.start && note.start < end(index)).map(note => ({...note,
      start:Math.max(bar.start, note.start), end:Math.min(end(index), note.end),
      continuesFromPrevious:Boolean(note.continuesFromPrevious || note.start < bar.start),
      continuesToNext:Boolean(note.continuesToNext || note.end > end(index))}))
    : transpose(bassBarNotes(bar, end(index), strings)));
}

function bassPitchLabel(midi) {
  return `${PITCH_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

function bassSvgNode(tag, attributes = {}, text = '') {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, String(value)));
  node.textContent = text;
  return node;
}

function createBassFretboard(notes, strings) {
  return createStringFretboard(notes,BassTuning.configFor(strings).strings,'bass');
}

function createStringFretboard(notes, names, instrument) {
  const strings=names.length,height=strings*24+42;
  const svg = bassSvgNode('svg', {viewBox: `0 0 600 ${height}`, role: 'img',
    'aria-label': `${strings}-string ${instrument} fretboard, suggested positions for measured notes`});
  const nut = 54, right = 584;
  const boundary = fret => nut + (1 - 2 ** (-fret / 12)) / .75 * (right - nut);
  const positionX = fret => fret === 0 ? 30 : (boundary(fret - 1) + boundary(fret)) / 2;
  const bottom = 38 + (strings - 1) * 24;
  svg.append(bassSvgNode('image', {href: './assets/bass-rosewood.png', x: nut, y: 24, width: right - nut,
    height: bottom - 10, preserveAspectRatio: 'none'}));
  svg.append(bassSvgNode('rect', {x: nut - 3, y: 24, width: 6, height: bottom - 10, class: 'bass-nut'}));
  for (let fret = 1; fret <= 24; fret++) {
    svg.append(bassSvgNode('line', {x1: boundary(fret), x2: boundary(fret), y1: 24, y2: bottom + 14, class: 'bass-fret'}),
      bassSvgNode('text', {x: positionX(fret), y: 15, 'text-anchor': 'middle', class: 'bass-fret-number'}, String(fret)));
  }
  for (const fret of [3, 5, 7, 9, 12, 15, 17, 19, 21, 24]) {
    const center = (38 + bottom) / 2;
    const ys = fret % 12 === 0 ? [center - 13, center + 13] : [center];
    ys.forEach(y => svg.append(bassSvgNode('circle', {cx: positionX(fret), cy: y, r: 4, class: 'bass-inlay'})));
  }
  names.forEach((name, index) => {
    const y = 38 + index * 24;
    svg.append(bassSvgNode('line', {x1: 16, x2: right, y1: y + 1.5, y2: y + 1.5, class: 'bass-string-shadow', 'stroke-width': 1.4 + index * .6}),
      bassSvgNode('line', {x1: 16, x2: right, y1: y, y2: y, class: 'bass-string', 'stroke-width': 1.2 + index * .5}),
      bassSvgNode('text', {x: 7, y: y + 4, 'text-anchor': 'middle', class: 'bass-string-name'}, name));
  });
  for (const note of [...new Map(notes.filter(note => note.position).map(note => [`${note.midi}:${note.position.string}:${note.position.fret}`, note])).values()]) {
    const x = positionX(note.position.fret), y = 38 + (note.position.string - 1) * 24;
    const marker = bassSvgNode('g', {'data-fretboard-midi': note.midi, 'data-fretboard-string':note.position.string,
      'data-fretboard-fret':note.position.fret, class: 'bass-note-marker'});
    marker.append(bassSvgNode('title', {}, `${bassPitchLabel(note.midi)} · string ${note.position.string} · fret ${note.position.fret}`),
      bassSvgNode('circle', {cx: x, cy: y, r: 9}),
      bassSvgNode('text', {x, y: y + 3.5, 'text-anchor': 'middle', class: 'bass-marker-fret'}, String(note.position.fret)),
      bassSvgNode('text', {x, y: y - 13, 'text-anchor': 'middle', class: 'bass-marker-name'}, bassPitchLabel(note.midi)));
    svg.append(marker);
  }
  return svg;
}

function bassRhythm(notes, bar, barEnd, chart = {}) {
  if (!bar || !Number.isFinite(bar.start) || !(barEnd > bar.start)) return null;
  const signature = /^(\d+)\/(2|4|8|16)$/.exec(chart.time_signature || '4/4');
  const fullBeats = signature && Number(signature[1]) >= 1 && Number(signature[1]) <= 32 ? Number(signature[1]) : 4;
  const beats = Number.isInteger(bar.pickup_beats) && bar.pickup_beats > 0 && bar.pickup_beats < fullBeats ? bar.pickup_beats : fullBeats;
  const beatValue = signature ? Number(signature[2]) : 4;
  let unitDenominator=16, pulse=16/beatValue, totalUnits=beats*pulse;
  const measured = [...new Set((chart.beat_times || []).filter(Number.isFinite))]
    .filter(time => time > bar.start + .04 && time < barEnd - .04).sort((a,b)=>a-b);
  const anchors = measured.length === beats - 1 ? [bar.start, ...measured, barEnd]
    : Array.from({length:beats+1},(_,i)=>bar.start+(barEnd-bar.start)*i/beats);
  const quantize = (time, settle = false) => {
    if (time <= bar.start) return 0;
    if (time >= barEnd) return totalUnits;
    const index = anchors.findIndex((end,i)=>i>0 && time<end)-1;
    const beat=index+(time-anchors[index])/(anchors[index+1]-anchors[index]);
    const eighth=Math.round(beat*2)/2;
    return Math.round((settle && Math.abs(beat-eighth)<=1/6 ? eighth : beat)*pulse);
  };
  const held=note=>Math.min(barEnd,note.end)-Math.max(bar.start,note.start)>=(barEnd-bar.start)/beats*.5;
  const confirmedShort=note=>note.manual===true || (note.confidence>=.8 && Math.min(barEnd,note.end)-Math.max(bar.start,note.start)>=.039);
  if(notes.some(note=>confirmedShort(note) && quantize(note.end)<=quantize(note.start))) {
    unitDenominator=32; pulse*=2; totalUnits*=2;
  }
  const confirmedCount=notes.filter(confirmedShort).length;
  while(unitDenominator<128 && confirmedCount>totalUnits) {
    unitDenominator*=2; pulse*=2; totalUnits*=2;
  }
  const compound = beatValue === 8 && beats >= 6 && beats % 3 === 0;
  const group = compound ? pulse*3 : pulse;
  const values = [[16,'1',0],[12,'2',1],[8,'2',0],[6,'4',1],[4,'4',0],[3,'8',1],[2,'8',0],[1,'16',0]]
    .map(([units,duration,dots])=>[units*unitDenominator/16,duration,dots]);
  for(let denominator=32;denominator<=unitDenominator;denominator*=2) values.push([unitDenominator/denominator,String(denominator),0]);
  const events = [];
  const append = (start,end,sourceIndex) => {
    const first = events.length;
    while(start<end) {
      const limit = start % group ? Math.min(end,Math.ceil(start/group)*group) : end;
      const [units,duration,dots] = values.find(([units,,dots])=>units<=limit-start &&
        (compound || start % (dots ? units/1.5 : units) === 0));
      events.push({offset:start,units,duration,dots,sourceIndex,tieToNext:false,
        ...(sourceIndex === null ? {} : {midi:notes[sourceIndex].midi,position:notes[sourceIndex].position})});
      start+=units;
    }
    if(sourceIndex !== null) for(let i=first;i<events.length-1;i++) events[i].tieToNext=true;
    if(sourceIndex !== null && notes[sourceIndex].continuesFromPrevious && events[first]?.offset===0) events[first].tieFromPrevious=true;
    if(sourceIndex !== null && notes[sourceIndex].continuesToNext && end===totalUnits) events.at(-1).tieToFollowingBar=true;
  };
  let cursor = 0;
  notes.forEach((note,index)=>{
    const remaining=unitDenominator>16 ? Math.min(notes.slice(index+1).filter(confirmedShort).length,Math.max(0,totalUnits-cursor-1)) : 0;
    const start=Math.max(cursor,Math.min(quantize(note.start,held(note)),totalUnits-remaining-(confirmedShort(note)?1:0)));
    let release=quantize(note.end,held(note));
    const next=notes[index+1],gap=next ? next.start-note.end : Infinity;
    // A detector-sized articulation gap inside a held phrase is not a written
    // rest. Short notes retain the finer grid and their separate source IDs.
    if(held(note) && gap>=0 && gap<=Math.min(.05,(barEnd-bar.start)/beats*.12)) {
      release=quantize(next.start,held(next));
    }
    const end=Math.max(0,Math.min(totalUnits-remaining,Math.max(release,confirmedShort(note)?start+1:0)));
    if(end<=start) return;
    if(start>cursor) append(cursor,start,null);
    append(start,end,index); cursor=end;
  });
  if(cursor<totalUnits) append(cursor,totalUnits,null);
  return {beats,beatValue,totalUnits,unitDenominator,events,anchors};
}

function notationSpacing(offsets,total,left,right,startX,endX) {
  const gaps=offsets.slice(1).map((_,i)=>Math.max(24,right[i]+left[i+1]+8));
  const tail=Math.max(24,right.at(-1)+10);
  const minimum=gaps.reduce((a,b)=>a+b,0)+tail;
  const width=Math.max(minimum,endX-startX);
  const weights=offsets.map((offset,i)=>Math.sqrt(Math.max(.001,(offsets[i+1] ?? total)-offset)));
  const weight=weights.reduce((a,b)=>a+b,0);
  const positions=[startX];
  gaps.forEach((gap,i)=>positions.push(positions.at(-1)+gap+(width-minimum)*weights[i]/weight));
  const end=startX+width;
  return {positions,endX:end,xAt(offset){
    if(offset<=offsets[0])return startX;
    if(offset>=total)return end;
    const index=offsets.findIndex((value,i)=>i>0 && value>offset);
    const rightIndex=index<0?offsets.length:index;
    const i=rightIndex-1;
    return positions[i]+(offset-offsets[i])/((offsets[rightIndex] ?? total)-offsets[i])*((positions[rightIndex] ?? end)-positions[i]);
  }};
}

function notationMeasureWidths(minimums,targetWidth) {
  if(!minimums.length) return [];
  const available=Math.max(targetWidth,minimums.reduce((a,b)=>a+b,0));
  // Equal bars whenever possible; only a real engraving minimum can make a
  // measure wider. Water-fill the others without compressing any glyphs.
  let low=0,high=available/minimums.length;
  for(let i=0;i<32;i++) {
    const middle=(low+high)/2;
    if(minimums.reduce((sum,width)=>sum+Math.max(width,middle),0)<=available)low=middle;
    else high=middle;
  }
  const floors=minimums.map(width=>Math.max(width,low));
  const extra=Math.max(0,available-floors.reduce((a,b)=>a+b,0))/minimums.length;
  return floors.map(width=>width+extra);
}

function bassNotationVoices(model, key, strings, chordSymbols = []) {
  const {StaveNote,TabNote,Voice,Dot,Accidental} = Vex.Flow;
  const tabFont=Vex.Flow.TextFormatter.create({family:'Arial',size:'15pt'});
  const names = Vex.Flow.keySignature(key || 'C')[0]?.type === '#'
    ? ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
    : ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
  const scoreNotes=[],tabNotes=[];
  model.events.forEach(item=>{
    const rest=item.sourceIndex === null;
    const duration=item.duration+(rest?'r':'');
    const pitch=rest ? 'd/3' : spellNotationPitch(item.midi+12,chordSymbols[item.sourceIndex] || names[item.midi%12]).key;
    const score=new StaveNote({clef:'bass',keys:[pitch],duration,dots:item.dots});
    const tab=rest ? new StaveNote({clef:'treble',keys:['d/6'],duration,dots:item.dots})
      : new TabNote({positions:[{str:item.position?.string || 1,fret:item.position?.fret ?? 'X'}],duration,dots:item.dots},item.duration!=='1');
    if(!rest) {
      tab.render_options.draw_stem_through_stave=false;
      tab.render_options.font='15pt Arial, sans-serif';
      tab.render_options.scale=1.15;
      tab.updateWidth();
      // TabNote's default numeric widths assume its smaller built-in font.
      // Use the same font metrics for spacing, centres, stems and printed digits.
      tab.glyphPropsArr.forEach(glyph=>{
        if(glyph.code)return;
        const width=tabFont.getWidthForTextInPx(String(glyph.text));
        glyph.getWidth=()=>width;
      });
      tab.width=Math.max(...tab.glyphPropsArr.map(glyph=>glyph.getWidth()));
    }
    if(item.dots) { Dot.buildAndAttach([score],{all:true}); Dot.buildAndAttach([tab],{all:true}); }
    scoreNotes.push(score); tabNotes.push(tab);
  });
  const time={num_beats:model.beats,beat_value:model.beatValue};
  const scoreVoice=new Voice(time).addTickables(scoreNotes),tabVoice=new Voice(time).addTickables(tabNotes);
  Accidental.applyAccidentals([scoreVoice],key || 'C');
  return {scoreNotes,tabNotes,scoreVoice,tabVoice};
}

function layoutBassNotation(model, voices, stave, tab) {
  const {scoreNotes,tabNotes,scoreVoice,tabVoice}=voices;
  [...scoreNotes,...tabNotes].forEach(note=>note.setCenterAlignment(false));
  new Vex.Flow.Formatter().joinVoices([scoreVoice]).joinVoices([tabVoice])
    .formatToStave([scoreVoice,tabVoice],stave);
  // Keep native accidental / flag clearance, then space onsets proportionally
  // to time so both parts communicate the same beat structure.
  const metrics=scoreNotes.map(note=>note.getTickContext().getMetrics());
  const left=metrics.map((metric,i)=>metric.totalLeftPx+scoreNotes[i].getGlyphWidth()/2);
  const right=metrics.map((metric,i)=>metric.notePx+metric.totalRightPx-scoreNotes[i].getGlyphWidth()/2);
  const denominator=model.unitDenominator || 16;
  let unitWidth=18*16/denominator;
  for(let i=1;i<model.events.length;i++) {
    unitWidth=Math.max(unitWidth,(right[i-1]+left[i]+6)/(model.events[i].offset-model.events[i-1].offset));
  }
  const startX=stave.getNoteStartX()+left[0]+14;
  unitWidth=Math.max(unitWidth,(stave.getNoteEndX()-startX-24)/model.totalUnits);
  const endX=startX+model.totalUnits*unitWidth;
  const width=endX+Math.max(24,right.at(-1)+10)-stave.getX();
  stave.setWidth(width); tab.setWidth(width);
  scoreNotes.forEach((note,i)=>{
    const tick=note.getTickContext();
    tick.setX(tick.getX()+(startX+model.events[i].offset*unitWidth)-note.getCenterGlyphX());
    // TAB glyphs are narrower than noteheads. Shift the absolute drawing origin
    // (also used by stems, dots and ties), rather than just the glyph's x_shift.
    const fret=tabNotes[i];
    fret.setCenterAlignment(true).setCenterXShift(0);
    fret.setCenterXShift(note.getCenterGlyphX()-fret.getCenterGlyphX());
  });
  const beatUnits=model.beatValue===8 && model.beats>=6 && model.beats%3===0 ? denominator*3/8 : denominator/model.beatValue;
  const beats=Array.from({length:model.totalUnits/beatUnits},(_,i)=>({number:i+1,x:startX+i*beatUnits*unitWidth}));
  return {startX,endX,unitWidth,beats,left,right};
}

function layoutBassSystem(sources, strings, chart, key, minimumWidth = 400) {
  const {Stave,TabStave,Clef,Beam,Fraction,Stem,Barline}=Vex.Flow;
  const measures=[];
  let scoreBottom=0,stemLength=35;
  sources.forEach(source=>{
    const {bar,barEnd,notes,chords}=source;
    const model=bassRhythm(notes,bar,barEnd,chart);
    if(!model) return;
    const first=measures.length===0;
    const width=Math.max(minimumWidth/sources.length,model.events.length*48+160);
    const stave=new Stave(8,12,width-16);
    const tab=new TabStave(8,0,width-16,{num_lines:strings,spacing_between_lines_px:14});
    if(first) {
      stave.addClef('bass');
      if(key) stave.addKeySignature(key);
      const signature=chart.time_signature || '4/4';
      const showTimeSignature=source.index===undefined || source.index===0;
      if(showTimeSignature) stave.addTimeSignature(signature);
      const clef=new Clef('tab');
      // VexFlow's TAB clef baseline assumes six strings; copy before adapting it.
      clef.clef={...clef.clef,line:(strings-1)/2};
      tab.addModifier(clef);
      if(showTimeSignature) tab.addTimeSignature(signature);
    } else {
      stave.setBegBarType(Barline.type.NONE);
      tab.setBegBarType(Barline.type.NONE);
    }
    if(bar.repeat_start) {stave.setBegBarType(Barline.type.REPEAT_BEGIN);tab.setBegBarType(Barline.type.REPEAT_BEGIN);}
    if(bar.repeat_end) {stave.setEndBarType(Barline.type.REPEAT_END);tab.setEndBarType(Barline.type.REPEAT_END);}
    const symbols=notes.map(note=>chords?.find(event=>note.start>=event.start && note.start<event.end)?.chord);
    const voices=bassNotationVoices(model,key,strings,symbols);
    const {scoreNotes,tabNotes}=voices;
    // Measure without a context so hidden views retain native TAB glyph widths.
    scoreNotes.forEach(note=>note.setStave(stave));
    tabNotes.forEach(note=>note.setStave(tab));
    scoreBottom=Math.max(scoreBottom,stave.getYForLine(4),...scoreNotes.flatMap(note=>note.getYs()));
    const groups=[new Fraction(model.beatValue===8 && model.beats%3===0?3:1,model.beatValue)];
    const scoreBeams=Beam.generateBeams(scoreNotes,{groups});
    scoreBottom=Math.max(scoreBottom,...scoreNotes.filter(note=>note.hasStem())
      .flatMap(note=>Object.values(note.getStemExtents())));
    const tabBeams=Beam.generateBeams(tabNotes,{groups,stem_direction:Stem.UP});
    tabBeams.forEach(beam=>{beam.render_options.flat_beams=true;});
    tabNotes.forEach(note=>{
      if(!note.hasStem()) return;
      const length=Math.max(35,note.getStemMinimumLength());
      note.setStemLength(length);note.getStem().setExtension(length-Stem.HEIGHT);
      stemLength=Math.max(stemLength,length);
    });
    measures.push({...source,model,voices,stave,tab,scoreBeams,tabBeams});
  });
  let x=8;
  measures.forEach(measure=>{
    const {stave,tab,voices,model}=measure;
    stave.setX(x);tab.setX(x);
    const tabTop=scoreBottom+16+stemLength+tab.getSpacingBetweenLines()/2;
    tab.setY(tab.getY()+tabTop-tab.getYForLine(0));
    const start=Math.max(stave.getNoteStartX(),tab.getNoteStartX());
    stave.setNoteStartX(start);tab.setNoteStartX(start);
    voices.scoreNotes.forEach(note=>note.setStave(stave));
    voices.tabNotes.forEach(note=>note.setStave(tab));
    measure.layout=layoutBassNotation(model,voices,stave,tab);
    x=stave.getX()+stave.getWidth();
  });
  const connects=(left,right)=>Boolean(left?.tieToFollowingBar && right?.tieFromPrevious && left.midi===right.midi);
  const ties=[];
  measures.forEach((measure,m)=>measure.model.events.forEach((item,index)=>{
    if(item.tieToNext) ties.push({first:[m,index],last:[m,index+1]});
    if(item.tieFromPrevious && !connects(measures[m-1]?.model.events.at(-1),item)) {
      ties.push({first:null,last:[m,index]});
    }
    if(item.tieToFollowingBar) ties.push({first:[m,index],
      last:connects(item,measures[m+1]?.model.events[0]) ? [m+1,0] : null});
  }));
  const top=Math.min(0,...measures.flatMap(measure=>measure.voices.scoreNotes.flatMap(note=>note.getYs().map(y=>y-38))));
  const height=measures[0]?.tab.getYForLine(strings-1)+22 || 0;
  const system={measures,ties,scoreBottom,width:x+8,height,top};
  return system;
}

function renderBassScore(container, notes, strings, bar, barEnd) {
  const {Renderer,StaveTie,TabTie,StaveConnector}=Vex.Flow;
  const key=notationKeySignature(state.chart,state.notationUseKeySignature !== false);
  const system=layoutBassSystem([{bar,barEnd,notes}],strings,state.chart,key,400);
  if(!system.measures.length) return;
  const {measures,ties,width,scoreBottom}=system;
  const {height,top}=system;
  const renderer=new Renderer(container,Renderer.Backends.SVG);
  renderer.resize(width,height-top);
  const context=renderer.getContext();
  context.setFillStyle('#d8e1ec');
  context.setStrokeStyle('#8d9caf');
  context.setBackgroundFillStyle('#10151c');
  measures.forEach((measure,m)=>{
    const {stave,tab,voices,model,layout,notes,scoreBeams,tabBeams}=measure;
    const className='bass-system-measure';
    const group=context.openGroup(className);group.classList.add(className);
    group.setAttribute('data-index',String(measure.index ?? m));
    stave.setContext(context).draw();
    tab.setContext(context).draw();
    if(m===0) new StaveConnector(stave,tab).setType(StaveConnector.type.SINGLE_LEFT).setContext(context).draw();
    new StaveConnector(stave,tab).setType(StaveConnector.type.SINGLE_RIGHT).setContext(context).draw();
    const beatY=scoreBottom+12;
    layout.beats.forEach(beat=>group.append(bassSvgNode('text',{x:beat.x,y:beatY,
      'text-anchor':'middle',class:'bass-beat-number'},String(beat.number))));
    const draw=(note,index,className)=>{
      const item=model.events[index],noteGroup=context.openGroup(className);noteGroup.classList.add(className);
      if(item.sourceIndex !== null) {
        noteGroup.dataset.bassStart=String(notes[item.sourceIndex].start);noteGroup.dataset.bassEnd=String(notes[item.sourceIndex].end);
        noteGroup.setAttribute('data-bass-segment',String(item.sourceIndex));
        noteGroup.append(bassSvgNode('title',{},`${bassPitchLabel(item.midi)} · ${notes[item.sourceIndex].start.toFixed(2)}–${notes[item.sourceIndex].end.toFixed(2)} s · estimated rhythm`));
      }
      note.setContext(context).draw();context.closeGroup();
    };
    voices.scoreNotes.forEach((note,index)=>draw(note,index,'bass-score-note'));
    voices.tabNotes.forEach((note,index)=>draw(note,index,'bass-tab-note'));
    [...scoreBeams,...tabBeams].forEach(beam=>{
      beam.render_options.min_slope=-.12;beam.render_options.max_slope=.12;
      beam.setContext(context).draw();
    });
    context.closeGroup();
  });
  ties.forEach(({first,last})=>{
    const origin=first || last;
    const group=context.openGroup('bass-rhythm-tie');
    group.setAttribute('data-bass-segment',String(measures[origin[0]].model.events[origin[1]].sourceIndex));
    for(const [Tie,part] of [[StaveTie,'scoreNotes'],[TabTie,'tabNotes']]) {
      new Tie({first_note:first ? measures[first[0]].voices[part][first[1]] : null,
        last_note:last ? measures[last[0]].voices[part][last[1]] : null,
        first_indices:[0],last_indices:[0]}).setContext(context).draw();
    }
    context.closeGroup();
  });
  const svg=container.querySelector('svg'),model=measures[0].model;
  svg.setAttribute('viewBox',`0 ${top} ${width} ${height-top}`);
  svg.style.width=`${width*.65}px`;svg.style.height='auto';
  svg.setAttribute('role','img');
  svg.setAttribute('aria-label',`Bass rhythmic score and ${strings}-string TAB in ${model.beats}/${model.beatValue}; ${measures.length} measures; estimated rhythm; score sounds one octave below written pitch`);
  return {...system,height,top,model,layout:measures[0].layout};
}

function renderDetailBass(bar, barEnd, time) {
  const container = elements.detailBass;
  if (!container) return;
  const strings = BassTuning.normalizeStringCount(state.bassStrings);
  // Reclip the complete saved track so editing bar starts cannot strand notes
  // in their original bar. Chord edits never alter the measured note times.
  const barHasBass=typeof hasReviewedBassEvents==='function' ? hasReviewedBassEvents(state.chart,bar,barEnd) : Array.isArray(bar?.bass_events);
  const bassEvents = barHasBass ? (typeof reviewedBassTrack==='function' ? reviewedBassTrack(state.chart) : state.chart.bars.flatMap(item => item.bass_events || [])) : undefined;
  const notes = bassBarNotes(bar, barEnd, strings, bassEvents);
  const current = activeBassNote(notes, time);
  const signature = JSON.stringify([bar?.number, bar?.start, bar?.chord, barEnd, notes, strings, state.chart?.time_signature,
    (state.chart?.beat_times || []).filter(time=>time>=bar?.start && time<=barEnd),
    notationKeySignature(state.chart, state.notationUseKeySignature !== false)]);
  if (container._bassSignature !== signature) {
    container._bassSignature = signature;
    container.replaceChildren();
    const text = (tag, content, className = '') => {
      const node = document.createElement(tag); node.textContent = content; node.className = className; return node;
    };
    const header = text('div', '', 'bass-view-heading');
    header.append(text('h3', 'Bass Notes'));
    const select = document.createElement('select');
    select.setAttribute('aria-label', 'Bass strings');
    [4, 5, 6].forEach(count => { const option = text('option', `${count} strings`); option.value = String(count); select.append(option); });
    select.value = String(strings);
    select.addEventListener('change', () => {
      state.bassStrings = BassTuning.normalizeStringCount(select.value);
      updateDetailPane();
      if (state.chartRenderer === 'bass') renderChartPreview();
    });
    header.append(select);
    const caption = text('div', '', 'bass-view-current');
    const fretboard = text('div', '', 'bass-fretboard-scroll');
    fretboard.append(createBassFretboard(notes, strings));
    container.append(header, caption, fretboard);
    if (notes.length || Array.isArray(bar?.bass_events)) {
      const score = text('div', '', 'bass-score-scroll');
      container.append(score);
      try { renderBassScore(score, notes, strings, bar, barEnd); }
      catch (error) { score.textContent = notes.map(note => bassPitchLabel(note.midi)).join(' · '); console.warn('Bass score unavailable:', error.message); }
      const outside = [...new Set(notes.filter(note => !note.position).map(note => bassPitchLabel(note.midi)))];
      container.append(text('p', `${BassTuning.configFor(strings).label} · phrase-based fingering · amber: this bar · teal: current. Scroll for higher frets.`, 'study-muted'));
      if (outside.length) container.append(text('p', `${outside.join(', ')} outside this tuning / 24 frets.`, 'bass-range-warning'));
      container.append(text('p', `Score sounds one octave below written pitch. ${Array.isArray(bar.bass_events) ? 'Fundamentals tracked independently of chord timing; uncertain attacks are left blank.' : 'Pitch preview from analysis cells.'} Estimated rhythm uses finer values for confirmed short notes; rests mark unvoiced gaps. Fingering is suggested.`, 'study-muted'));
    } else container.append(text('p', bar ? 'No confident bass fundamental for this bar. Reanalyse Chords with an existing bass stem to refresh.' : 'Select a bar to see its bass notes.', 'study-muted'));
  }
  container.querySelector('.bass-view-current').textContent = bar
    ? `Bar ${bar.number || state.selectedIndex + 1} · ${current ? bassPitchLabel(current.midi) : 'No bass note at cursor'}` : 'No bar selected';
  container.querySelectorAll('[data-fretboard-midi]').forEach(node => node.classList.toggle('bass-current',
    Number(node.getAttribute('data-fretboard-midi')) === current?.midi && Number(node.getAttribute('data-fretboard-string')) === current?.position?.string
      && Number(node.getAttribute('data-fretboard-fret')) === current?.position?.fret));
  const activeIndex = current ? notes.indexOf(current) : -1;
  container.querySelectorAll('[data-bass-segment]').forEach(node => node.classList.toggle('bass-current', Number(node.getAttribute('data-bass-segment')) === activeIndex));
  const activeKey = `${signature}:${activeIndex}:${container.clientWidth}`;
  if (container._bassActiveKey !== activeKey) {
    container._bassActiveKey = activeKey;
    // Follow each new note once; let users pan freely until the next note.
    for (const [viewportClass, markerClass] of [['.bass-fretboard-scroll', '.bass-note-marker.bass-current'],
      ['.bass-score-scroll', '.bass-tab-note.bass-current']]) {
      const viewport = container.querySelector(viewportClass), marker = container.querySelector(markerClass);
      if (!viewport || !marker) continue;
      const area = viewport.getBoundingClientRect(), note = marker.getBoundingClientRect();
      if (note.left < area.left || note.right > area.right) viewport.scrollLeft += (note.left + note.right - area.left - area.right) / 2;
    }
  }
}
