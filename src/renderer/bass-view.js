function bassPositions(midi, strings = 4) {
  const tuning = strings === 5 ? [43, 38, 33, 28, 23] : [43, 38, 33, 28];
  if (!Number.isInteger(midi)) return [];
  return tuning.map((open, index) => ({string: index + 1, fret: midi - open}))
    .filter(position => position.fret >= 0 && position.fret <= 24)
    .sort((a, b) => a.fret - b.fret || a.string - b.string);
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
    if(previous?.midi===note.midi && note.start<=previous.end+.005) previous.end=Math.max(previous.end,note.end);
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
    if(note.start===bar.start && bassEvents.some(other=>other.midi===note.midi && other.start<bar.start && other.end>=bar.start-.005)) note.continuesFromPrevious=true;
    if(note.end===barEnd && bassEvents.some(other=>other.midi===note.midi && other.end>barEnd && other.start<=barEnd+.005)) note.continuesToNext=true;
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
  const track = bars.flatMap(bar => bar.bass_events || []);
  // Plan the complete phrase once so adjacent measures keep the same fingering.
  const measured = transpose(bassBarNotes({start:bars[0]?.start}, end(bars.length - 1), strings, track));
  return bars.map((bar, index) => Array.isArray(bar.bass_events)
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
  return createStringFretboard(notes,strings===5 ? ['G','D','A','E','B'] : ['G','D','A','E'],'bass');
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
  const beats = signature && Number(signature[1]) >= 1 && Number(signature[1]) <= 32 ? Number(signature[1]) : 4;
  const beatValue = signature ? Number(signature[2]) : 4;
  let unitDenominator=16, pulse=16/beatValue, totalUnits=beats*pulse;
  const measured = [...new Set((chart.beat_times || []).filter(Number.isFinite))]
    .filter(time => time > bar.start + .04 && time < barEnd - .04).sort((a,b)=>a-b);
  const anchors = measured.length === beats - 1 ? [bar.start, ...measured, barEnd]
    : Array.from({length:beats+1},(_,i)=>bar.start+(barEnd-bar.start)*i/beats);
  const quantize = time => {
    if (time <= bar.start) return 0;
    if (time >= barEnd) return totalUnits;
    const index = anchors.findIndex((end,i)=>i>0 && time<end)-1;
    return Math.round((index+(time-anchors[index])/(anchors[index+1]-anchors[index]))*pulse);
  };
  const confirmedShort=note=>note.confidence>=.8 && Math.min(barEnd,note.end)-Math.max(bar.start,note.start)>=.039;
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
    const start=Math.max(cursor,Math.min(quantize(note.start),totalUnits-remaining-(confirmedShort(note)?1:0)));
    const end=Math.max(0,Math.min(totalUnits-remaining,Math.max(quantize(note.end),confirmedShort(note)?start+1:0)));
    if(end<=start) return;
    if(start>cursor) append(cursor,start,null);
    append(start,end,index); cursor=end;
  });
  if(cursor<totalUnits) append(cursor,totalUnits,null);
  return {beats,beatValue,totalUnits,unitDenominator,events,anchors};
}

function bassNotationTimeX(time, model, layout) {
  const {anchors} = model;
  if (!Number.isFinite(time) || time <= anchors[0]) return layout.startX;
  if (time >= anchors.at(-1)) return layout.endX;
  const beat = anchors.findIndex((end, index) => index > 0 && time < end) - 1;
  const fraction = (time - anchors[beat]) / (anchors[beat + 1] - anchors[beat]);
  return layout.startX + (beat + fraction) * model.totalUnits / model.beats * layout.unitWidth;
}

function bassNotationVoices(model, key, strings, chordSymbols = []) {
  const {StaveNote,TabNote,Voice,Dot,Accidental} = Vex.Flow;
  const names = Vex.Flow.keySignature(key || 'C')[0]?.type === '#'
    ? ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
    : ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
  const scoreNotes=[],tabNotes=[];
  model.events.forEach(item=>{
    const rest=item.sourceIndex === null;
    const duration=item.duration+(rest?'r':'');
    const pitch=rest ? 'd/3' : spellNotationPitch(item.midi+12,chordSymbols[item.sourceIndex] || names[item.midi%12]).key;
    const score=new StaveNote({clef:'bass',keys:[pitch],duration,dots:item.dots});
    const tab=rest ? new StaveNote({clef:'treble',keys:[strings===5?'b/4':'a/4'],duration,dots:item.dots})
      : new TabNote({positions:[{str:item.position?.string || 1,fret:item.position?.fret ?? 'X'}],duration,dots:item.dots},item.duration!=='1');
    if(!rest) {
      tab.render_options.draw_stem_through_stave=false;
      tab.render_options.font='11.5pt Arial, sans-serif';
      tab.render_options.scale=1.15;
      tab.updateWidth();
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
    tick.setX(tick.getX()+startX+model.events[i].offset*unitWidth-note.getCenterGlyphX());
    // TAB glyphs are narrower than noteheads. Shift the absolute drawing origin
    // (also used by stems, dots and ties), rather than just the glyph's x_shift.
    const fret=tabNotes[i];
    fret.setCenterAlignment(true).setCenterXShift(0);
    fret.setCenterXShift(note.getCenterGlyphX()-fret.getCenterGlyphX());
  });
  const beatUnits=model.beatValue===8 && model.beats>=6 && model.beats%3===0 ? denominator*3/8 : denominator/model.beatValue;
  const beats=Array.from({length:model.totalUnits/beatUnits},(_,i)=>({number:i+1,x:startX+i*beatUnits*unitWidth}));
  return {startX,endX,unitWidth,beats};
}

function layoutBassSystem(sources, strings, chart, key, minimumWidth = 400) {
  const {Stave,TabStave,Clef,Beam,Fraction,Stem,Barline}=Vex.Flow;
  const measures=[];
  let scoreBottom=0,stemLength=20;
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
      const signature=`${model.beats}/${model.beatValue}`;
      stave.addTimeSignature(signature);
      const clef=new Clef('tab');
      // VexFlow's TAB clef baseline assumes six strings; copy before adapting it.
      clef.clef={...clef.clef,line:(strings-1)/2};
      tab.addModifier(clef).addTimeSignature(signature);
    } else {
      stave.setBegBarType(Barline.type.NONE);
      tab.setBegBarType(Barline.type.NONE);
    }
    const symbols=notes.map(note=>chords?.find(event=>note.start>=event.start && note.start<event.end)?.chord);
    const voices=bassNotationVoices(model,key,strings,symbols);
    const {scoreNotes,tabNotes}=voices;
    // Measure without a context so hidden views retain native TAB glyph widths.
    scoreNotes.forEach(note=>note.setStave(stave));
    tabNotes.forEach(note=>note.setStave(tab));
    scoreBottom=Math.max(scoreBottom,stave.getYForLine(4),...scoreNotes.flatMap(note=>note.getYs()));
    const groups=[new Fraction(model.beatValue===8 && model.beats%3===0?3:1,model.beatValue)];
    const scoreBeams=Beam.generateBeams(scoreNotes,{groups});
    const tabBeams=Beam.generateBeams(tabNotes,{groups,stem_direction:Stem.UP});
    tabNotes.forEach(note=>{
      if(!note.hasStem()) return;
      const length=Math.max(20,note.getStemMinimumLength());
      note.setStemLength(length);note.getStem().setExtension(length-Stem.HEIGHT);
      stemLength=Math.max(stemLength,length);
    });
    measures.push({...source,model,voices,stave,tab,scoreBeams,tabBeams});
  });
  let x=8;
  measures.forEach(measure=>{
    const {stave,tab,voices,model}=measure;
    stave.setX(x);tab.setX(x);
    const tabTop=scoreBottom+28+stemLength+tab.getSpacingBetweenLines()/2;
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
  return {measures,ties,scoreBottom,width:x+8,height,top};
}

function renderBassScore(container, notes, strings, bar, barEnd, options = {}) {
  const {Renderer,StaveTie,TabTie,StaveConnector}=Vex.Flow;
  const key=options.keySignature ?? notationKeySignature(state.chart,state.notationUseKeySignature !== false);
  const system=layoutBassSystem(options.measures || [{bar,barEnd,notes,chords:options.chords}],
    strings,state.chart,key,options.measures ? 800 : 400);
  if(!system.measures.length) return;
  const {measures,ties,width,height,top,scoreBottom}=system;
  const renderer=new Renderer(container,Renderer.Backends.SVG);
  renderer.resize(width,height-top);
  const context=renderer.getContext();
  context.setFillStyle(options.paper ? '#171717' : '#d8e1ec');
  context.setStrokeStyle(options.paper ? '#333' : '#8d9caf');
  context.setBackgroundFillStyle(options.paper ? '#fff' : '#10151c');
  measures.forEach((measure,m)=>{
    const {stave,tab,voices,model,layout,notes,scoreBeams,tabBeams}=measure;
    const className=options.measures ? 'bass-chart-measure' : 'bass-system-measure';
    const group=context.openGroup(className);group.classList.add(className);
    group.setAttribute('data-index',String(measure.index ?? m));
    if(options.measures) group.append(bassSvgNode('rect',{x:stave.getX(),y:top,
      width:stave.getWidth(),height:height-top,class:'bass-chart-measure-highlight'}));
    stave.setContext(context).draw();tab.setContext(context).draw();
    if(m===0) new StaveConnector(stave,tab).setType(StaveConnector.type.SINGLE_LEFT).setContext(context).draw();
    new StaveConnector(stave,tab).setType(StaveConnector.type.SINGLE_RIGHT).setContext(context).draw();
    layout.beats.forEach(beat=>group.append(bassSvgNode('text',{x:beat.x,y:scoreBottom+17,
      'text-anchor':'middle',class:'bass-beat-number'},String(beat.number))));
    const draw=(note,index,className)=>{
      const item=model.events[index],noteGroup=context.openGroup(className);noteGroup.classList.add(className);
      if(item.sourceIndex !== null) {
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
  return {...system,model,layout:measures[0].layout};
}

function renderBassChartPreview(container) {
  const chart = state.chart;
  const strings = state.bassStrings === 5 ? 5 : 4;
  const key = notationKeySignature({key:chart.key || chart.detected_key || chart.native_key}, state.notationUseKeySignature !== false);
  const ends = chart.bars.map((_, index) => barEndTime(index));
  const signature = JSON.stringify([chart.title, chartKeyText(chart), chart.tempo, chart.time_signature,
    chart.beat_times, chart.key_offset, key, strings, state.chordDisplayPreferences,
    elements.simplifyChordsInput?.checked ?? chart.analysis_engine?.options?.simplify_chords,
    chart.bars.map((bar, index) => [bar.number, bar.section, bar.start, ends[index], bar.chord,
      (bar.chord_events || []).map(event => [event.start, event.end, event.chord]), bar.bass_events,
      Array.isArray(bar.bass_events) ? null : bassBarNotes(bar, ends[index], strings)])]);
  let sheet = container.querySelector('.bass-chart');
  if (!sheet || sheet._bassChartSignature !== signature) {
    const text = (tag, content, className) => {
      const node = document.createElement(tag); node.textContent = content; node.className = className || ''; return node;
    };
    sheet = text('section', '', 'bass-chart');
    sheet._bassChartSignature = signature;
    const header = text('div', '', 'bass-chart-header');
    const heading = text('div', '', 'bass-chart-heading');
    heading.append(text('strong', chart.title || 'Untitled'),
      text('span', `${chartKeyText(chart) || '?'} · ${chart.tempo || '?'} BPM · ${chart.time_signature || '4/4'}`));
    const tuning = text('label', 'Bass strings ');
    const select = document.createElement('select');
    select.setAttribute('aria-label', 'Bass chart strings');
    [4, 5].forEach(count => { const option = text('option', `${count} strings`); option.value = String(count); select.append(option); });
    select.value = String(strings);
    select.addEventListener('change', () => {
      state.bassStrings = Number(select.value) === 5 ? 5 : 4;
      renderChartPreview(); updateDetailPane();
    });
    tuning.append(select); header.append(heading, tuning);
    const systems = text('div', '', 'bass-chart-systems');
    sheet.append(header, systems);
    container.replaceChildren(sheet);
    const notesByBar = bassChartNotes({...chart, duration:ends.at(-1)}, strings);
    let lastSection = '';
    chartRows(2).forEach(row => {
      const section = String(row[0]?.section || '').trim();
      if (section && section !== lastSection) {
        systems.append(text('h3', section, 'bass-chart-section'));
        lastSection = section;
      }
      const system = text('div', '', 'bass-chart-system');
      const flow = text('div', '', 'bass-chart-flow');
      const buttons = text('div', '', 'bass-chart-bars');
      const symbols = text('div', '', 'bass-chart-chords');
      const score = text('div', '', 'bass-chart-staff');
      flow.append(buttons, symbols, score);system.append(flow);systems.append(system);
      try {
        const sources = row.map(({bar,index}) => ({bar,index,barEnd:ends[index],notes:notesByBar[index],chords:chordEventsForBar(index)}));
        const engraving = renderBassScore(score, [], strings, null, null, {paper:true,keySignature:key,measures:sources});
        if (!engraving) return;
        flow.style.minWidth = `${Math.ceil(engraving.width * .8)}px`;
        engraving.measures.forEach(({bar,index,chords,stave,model,layout}) => {
          const button = text('button', `Bar ${bar.number || index + 1}`, 'bass-chart-bar-select');
          button.type = 'button';button.dataset.index = String(index);
          button.setAttribute('aria-label', `Select bar ${bar.number || index + 1}: ${chords.map(event => displayChordSymbol(event.chord)).join(', ')}`);
          button.style.left = `${100 * stave.getX() / engraving.width}%`;
          button.style.width = `${100 * stave.getWidth() / engraving.width}%`;
          button.addEventListener('click', () => selectBar(index, true));buttons.append(button);
          chords.forEach((event, eventIndex) => {
            if (eventIndex && event.chord === chords[eventIndex - 1].chord) return;
            const symbol = text('span', '', 'bass-chart-chord');
            appendIrealChord(symbol, displayChordSymbol(event.chord));
            symbol.title = `${event.chord} · ${formatSeconds(event.start)}s`;
            symbol.style.left = `${100 * bassNotationTimeX(event.start, model, layout) / engraving.width}%`;
            symbol.addEventListener('click', () => selectBar(index, true, eventIndex));symbols.append(symbol);
          });
        });
        score.querySelectorAll('.bass-chart-measure').forEach(measure => {
          measure.addEventListener('click', () => selectBar(Number(measure.dataset.index), true));
        });
      } catch (error) {
        score.replaceChildren(text('p', 'Bass notation unavailable for this row.', 'bass-chart-empty'));
        console.warn('Bass chart unavailable:', error.message);
      }
    });
    if (!notesByBar.some(notes => notes.length)) {
      sheet.insertBefore(text('p', 'No measured bass notes are available. Reanalyse Chords with an existing bass stem to populate the score.', 'bass-chart-empty'), systems);
    }
    const outside = notesByBar.some(notes => notes.some(note => !note.position));
    sheet.append(text('p', `${strings === 5 ? 'B–E–A–D–G' : 'E–A–D–G'} tuning · Bass sounds one octave below written notation. Rhythm and fingering are estimated.${outside ? ' X marks notes outside this tuning.' : ''}`, 'bass-chart-footer'));
  }
  sheet.querySelectorAll('.bass-chart-measure').forEach(measure => {
    const index = Number(measure.dataset.index);
    measure.classList.toggle('selected', index === state.selectedIndex);
    measure.classList.toggle('active', index === state.activeIndex);
  });
  sheet.querySelectorAll('.bass-chart-bar-select').forEach(button => {
    button.setAttribute('aria-pressed', String(Number(button.dataset.index) === state.selectedIndex));
  });
}

function renderDetailBass(bar, barEnd, time) {
  const container = elements.detailBass;
  if (!container) return;
  const strings = state.bassStrings === 5 ? 5 : 4;
  // Reclip the complete saved track so editing bar starts cannot strand notes
  // in their original bar. Chord edits never alter the measured note times.
  const bassEvents = Array.isArray(bar?.bass_events) ? state.chart.bars.flatMap(item => item.bass_events || []) : undefined;
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
    [4, 5].forEach(count => { const option = text('option', `${count} strings`); option.value = String(count); select.append(option); });
    select.value = String(strings);
    select.addEventListener('change', () => {
      state.bassStrings = Number(select.value) === 5 ? 5 : 4;
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
      container.append(text('p', `${strings === 5 ? 'B–E–A–D–G' : 'E–A–D–G'} · phrase-based fingering · amber: this bar · teal: current. Scroll for higher frets.`, 'study-muted'));
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
