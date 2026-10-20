const DRUM_PARTS = {
  kick:{name:'Kick',short:'K',key:'f/4'},
  snare:{name:'Snare',short:'S',key:'c/5'},
  tom:{name:'Toms',short:'T',key:'d/5'},
  hihat:{name:'Hi-hat',short:'H',key:'g/5/x2'},
  cymbal:{name:'Cymbals / ride',short:'C',key:'a/5/x2'}
};

function drumDisplayTime(time, anchors) {
  // Only notation moves: keep the measured hit time for playback and evidence.
  let nearest=time, distance=Infinity;
  anchors.forEach((anchor,index)=>{
    const spans=[anchor-anchors[index-1],anchors[index+1]-anchor].filter(value=>value>0);
    const tolerance=Math.min(.035,...spans.map(value=>value*.06));
    const delta=Math.abs(time-anchor);
    if(delta<=tolerance && delta<distance) {nearest=anchor;distance=delta;}
  });
  return nearest;
}

function drumBarEvents(chart, bar, end) {
  if (!chart?.drums?.ok || !bar || !(end > bar.start)) return [];
  const anchors=[...new Set([...(chart.beat_times || []),...(chart.bars || []).map(item=>item.start),bar.start,end].filter(Number.isFinite))].sort((a,b)=>a-b);
  const lastBar=chart.bars?.at(-1)===bar || end===chart.duration;
  return (typeof reviewedDrumTrack==='function' ? reviewedDrumTrack(chart,bar.start-.035,end+.035) : chart.drums.events || []).flatMap(hit => {
    if(!Number.isFinite(hit?.time) || !Object.hasOwn(DRUM_PARTS,hit.instrument) || hit.time<bar.start-.035 || hit.time>=end+.035) return [];
    const time=drumDisplayTime(hit.time,anchors);
    // Carry the same display position into engraving, including partial bars.
    return time>=bar.start && (time<end || (lastBar && hit.time<end && time===end)) ? [{...hit,notation_time:time}] : [];
  })
    .sort((a,b)=>a.time-b.time);
}

function drumSummary(chart, bar, end) {
  if (!chart?.drums?.ok) return 'Not analysed';
  const hits = drumBarEvents(chart,bar,end);
  const counts = Object.keys(DRUM_PARTS).map(key => [key,hits.filter(hit=>hit.instrument===key).length]).filter(([,n])=>n);
  return (chart.drums.stale ? 'Stale · ' : '') + (counts.length ? counts.map(([key,n])=>`${DRUM_PARTS[key].short} ${n}`).join(' · ') : 'No detected hits');
}

function drumRhythm(hits,bar,barEnd,chart={}) {
  const meter = bassRhythm([],bar,barEnd,{...chart,time_signature:bar.time_signature || chart.time_signature});
  if (!meter) return null;
  const {anchors,beats,beatValue} = meter, events=[];
  const positions=hits.map(hit=>({hit,time:Math.min(barEnd-1e-9,hit.notation_time ?? drumDisplayTime(hit.time,anchors))}));
  let collisions=0;
  for(let beat=0;beat<beats;beat++) {
    const start=anchors[beat],end=anchors[beat+1];
    const notes=positions.filter(item=>item.time>=start && item.time<end).map(({hit,time})=>({...hit,fraction:(time-start)/(end-start)}));
    const error=grid=>notes.reduce((sum,hit)=>sum+Math.abs(hit.fraction-Math.min(grid-1,Math.round(hit.fraction*grid))/grid),0)/Math.max(1,notes.length);
    let grid=Math.max(1,16/beatValue),triplet=false;
    const distinctAttacks=new Set(notes.map(hit=>Math.round(hit.fraction*24))).size;
    if(distinctAttacks>1 && error(3)+.035<error(grid) && error(3)<.07) {grid=3;triplet=true;}
    else if(notes.length && error(grid*2)+.025<error(grid)) grid*=2;
    const groups=new Map();
    notes.forEach(hit=>{
      const offset=Math.min(grid-1,Math.max(0,Math.round(hit.fraction*grid)));
      if(!groups.has(offset)) groups.set(offset,[]);
      if(groups.get(offset).some(other=>other.instrument===hit.instrument)) collisions++;
      groups.get(offset).push(hit);
    });
    const offsets=triplet ? [0,1,2] : [...new Set([0,...groups.keys()])].sort((a,b)=>a-b);
    offsets.forEach((offset,i)=>{
      let remaining=(offsets[i+1] ?? grid)-offset,cursor=offset;
      while(remaining>0) {
        const units=triplet ? 1 : [8,6,4,3,2,1].find(value=>value<=remaining && (cursor===offset || !groups.has(cursor)));
        const dots=!triplet && [3,6].includes(units) ? 1 : 0;
        const duration=String(triplet ? beatValue*2 : beatValue*grid/(dots ? units/1.5 : units));
        const source=cursor===offset ? groups.get(offset) || [] : [];
        events.push({beat,offset:beat+cursor/grid,beats:units/grid,duration,dots,triplet,
          instruments:[...new Set(source.map(hit=>hit.instrument))],hits:source});
        cursor+=units;remaining-=units;
      }
    });
  }
  const grouped=[];
  for(let i=0;i<events.length;) {
    const first=events[i];
    if(first.instruments.length || first.triplet || first.offset%1) {grouped.push(first);i++;continue;}
    let stop=i+1,total=first.beats;
    while(stop<events.length && !events[stop].instruments.length && !events[stop].triplet) {total+=events[stop].beats;stop++;}
    if(total%1) {grouped.push(first);i++;continue;}
    let offset=first.offset,remaining=total;
    while(remaining>0) {
      const count=[8,6,4,3,2,1].find(value=>value<=remaining && beatValue/value>=1);
      const dots=[3,6].includes(count)?1:0;
      grouped.push({...first,beat:Math.floor(offset),offset,beats:count,duration:String(beatValue*(dots?1.5:1)/count),dots});
      remaining-=count;offset+=count;
    }
    i=stop;
  }
  return {beats,beatValue,anchors,events:grouped,collisions};
}

function layoutDrumSystem(sources,chart={},minimumWidth=640) {
  const {Stave,StaveNote,Voice,Formatter,Dot,Tuplet,Beam,Fraction,Barline}=Vex.Flow;
  let x=0;
  const measures=sources.map((source,index)=>{
    const model=drumRhythm(source.events,source.bar,source.barEnd,chart);
    const stave=new Stave(x,30,Math.max(160,model.events.length*14+60));
    const previous=sources[index-1]?.bar.time_signature || chart.time_signature;
    if(!index) stave.addClef('percussion');
    if(!index || previous!==(source.bar.time_signature || chart.time_signature)) stave.addTimeSignature(source.bar.time_signature || chart.time_signature || '4/4');
    if(source.bar.repeat_start) stave.setBegBarType(Barline.type.REPEAT_BEGIN);
    if(source.bar.repeat_end) stave.setEndBarType(Barline.type.REPEAT_END);
    const notes=model.events.map(item=>{
      const keys=item.instruments.length ? item.instruments.map(key=>DRUM_PARTS[key].key) : ['b/4'];
      const note=new StaveNote({keys,duration:item.duration+(item.instruments.length?'':'r'),dots:item.dots,stem_direction:1});
      if(item.dots) Dot.buildAndAttach([note],{all:true});
      note.setCenterAlignment(false);
      if(note.hasStem()) note.setStemLength(Math.max(32,note.getStemMinimumLength()));
      return note;
    });
    const tuplets=[];
    for(let beat=0;beat<model.beats;beat++) {
      const group=notes.filter((_,i)=>model.events[i].beat===beat && model.events[i].triplet);
      if(group.length) tuplets.push(new Tuplet(group,{num_notes:3,notes_occupied:2,ratioed:false,bracketed:true}));
    }
    const voice=new Voice({num_beats:model.beats,beat_value:model.beatValue}).addTickables(notes);
    notes.forEach(note=>note.setStave(stave));
    const beams=Beam.generateBeams(notes,{groups:[new Fraction(model.beatValue===8 && model.beats%3===0 ? 3 : 1,model.beatValue)],stem_direction:1,maintain_stem_directions:true});
    beams.forEach(beam=>{beam.render_options.min_slope=-.08;beam.render_options.max_slope=.08;});
    new Formatter().joinVoices([voice]).formatToStave([voice],stave);
    const metrics=notes.map(note=>note.getTickContext().getMetrics());
    const left=metrics.map((metric,i)=>metric.totalLeftPx+notes[i].getGlyphWidth()/2);
    const right=metrics.map((metric,i)=>metric.notePx+metric.totalRightPx-notes[i].getGlyphWidth()/2);
    const startX=stave.getNoteStartX()+left[0]+10;
    const spacing=notationSpacing(model.events.map(e=>e.offset),model.beats,left,right,startX,stave.getNoteEndX()-25);
    const endX=spacing.endX;
    const beatWidth=(endX-startX)/model.beats;
    stave.setWidth(endX+25-x);
    notes.forEach((note,i)=>{const tick=note.getTickContext();tick.setX(tick.getX()+spacing.positions[i]-note.getCenterGlyphX());});
    x+=stave.getWidth();
    return {...source,model,stave,notes,voice,tuplets,beams,startX,endX,beatWidth,left,right,spacing};
  });
  measures.forEach(measure=>measure.minimumWidth=measure.stave.getWidth());
  return fitDrumSystem({measures,width:x,height:132},minimumWidth);
}

function fitDrumSystem(system,targetWidth) {
  const widths=notationMeasureWidths(system.measures.map(measure=>measure.minimumWidth),targetWidth);
  let x=0;
  system.measures.forEach((measure,index)=>{
    const {stave,model,notes}=measure;
    const inset=measure.startX-stave.getX();
    const barWidth=widths[index];
    stave.setX(x).setWidth(barWidth);
    measure.startX=stave.getX()+inset;
    measure.beatWidth=(barWidth-inset-25)/model.beats;
    measure.endX=measure.startX+model.beats*measure.beatWidth;
    measure.spacing=notationSpacing(model.events.map(e=>e.offset),model.beats,measure.left,measure.right,measure.startX,measure.endX);
    notes.forEach((note,i)=>{
      note.setStave(stave);
      const tick=note.getTickContext();
      tick.setX(tick.getX()+measure.spacing.positions[i]-note.getCenterGlyphX());
    });
    x+=barWidth;
  });
  system.width=x;
  return system;
}

function drumText(tag,text,className='') {
  const node=document.createElement(tag);node.textContent=text;node.className=className;return node;
}

function drumControls(container) {
  const ready=hasDrumStem(),busy=state.drumBusy || state.isAnalyzing || state.study?.busy;
  const controls=drumText('div','','drum-controls');
  const button=drumText('button',state.drumBusy ? 'Working…' : ready ? 'Analyse Drums' : 'Prepare Stems');
  button.type='button';button.disabled=Boolean(busy || !state.audio?.path || !hasChart());
  button.addEventListener('click',()=>ready ? analyzeDrums() : prepareDrumStems());controls.append(button);
  if(ready && state.chart?.drums?.ok) {
    const refresh=drumText('button','Reanalyse');refresh.type='button';refresh.disabled=Boolean(busy);
    refresh.title='Run drum transcription again instead of using cached results';
    refresh.addEventListener('click',()=>analyzeDrums(true));controls.append(refresh);
  }
  container.append(controls);
  if(!ready) container.append(drumText('p','Prepare the drum stem to analyse its hits.','study-muted'));
  if(state.drumError?.chart===state.chart) container.append(drumText('p',state.drumError.message,'drum-error'));
}

function renderDrumScore(container,sources,chart) {
  const system=layoutDrumSystem(sources,chart,380);
  const {Renderer}=Vex.Flow;
  const renderer=new Renderer(container,Renderer.Backends.SVG);renderer.resize(system.width,system.height);
  const context=renderer.getContext();context.setFillStyle('#e4e7ed');context.setStrokeStyle('#e4e7ed');
  system.measures.forEach(measure=>{
    const {model,stave,notes,tuplets,beams}=measure;
    const group=context.openGroup('drum-measure');group.classList.add('drum-measure');group.dataset.index=String(measure.index ?? 0);
    stave.setContext(context).draw();
    notes.forEach((note,i)=>{
      const item=model.events[i],hitGroup=context.openGroup('drum-hit');hitGroup.classList.add('drum-hit');
      if(item.hits.length) {
        hitGroup.dataset.times=JSON.stringify(item.hits.map(hit=>hit.time));
        const title=document.createElementNS('http://www.w3.org/2000/svg','title');
        title.textContent=item.hits.map(hit=>`${DRUM_PARTS[hit.instrument].name} · ${hit.time.toFixed(3)}s${Number.isFinite(hit.score)?` · model score ${hit.score.toFixed(2)}`:''}`).join('\n');
        hitGroup.append(title);
      }
      note.setStave(stave).setContext(context).draw();context.closeGroup();
    });
    beams.forEach(beam=>beam.setContext(context).draw());tuplets.forEach(tuplet=>tuplet.setContext(context).draw());
    context.closeGroup();
  });
  const svg=container.querySelector('svg');svg.setAttribute('viewBox',`0 0 ${system.width} ${system.height}`);
  svg.style.width=`${system.width*.65}px`;svg.style.height='auto';svg.setAttribute('role','img');svg.setAttribute('aria-label','Estimated drum score');
  return system;
}

function highlightDrumHits(container,time) {
  container.querySelectorAll('.drum-current').forEach(group=>group.classList.remove('drum-current'));
  container.querySelectorAll('.drum-hit[data-times]').forEach(group=>{
    group.classList.toggle('drum-current',JSON.parse(group.dataset.times).some(onset=>time>=onset && time<onset+.12));
  });
}

function renderDetailDrums(bar,end,time) {
  const container=elements.detailDrums;if(!container) return;
  const chart=state.chart,hits=drumBarEvents(chart,bar,end);
  const signature=JSON.stringify([bar?.start,end,bar?.time_signature,chart?.time_signature,chart?.beat_times,hits,chart?.drums?.ok,chart?.drums?.stale,
    hasDrumStem(),state.drumBusy,state.isAnalyzing,state.study?.busy,state.drumError?.chart===chart ? state.drumError.message : '']);
  if(container._drumSignature!==signature) {
    container._drumSignature=signature;container.replaceChildren();
    drumControls(container);
    if(!bar) container.append(drumText('p','Select a bar to see its drum sheet.','study-muted'));
    else if(!chart.drums?.ok) container.append(drumText('p','Optional drum transcription has not been run for this song.','study-muted'));
    else {
      container.append(drumText('p',drumSummary(chart,bar,end),'drum-summary'));
      const score=drumText('div','','drum-score');container.append(score);
      try {renderDrumScore(score,[{bar,barEnd:end,events:hits,index:state.selectedIndex}],chart);}
      catch(error) {score.textContent='Drum notation could not be drawn.';console.warn(error);}
      container.append(drumText('p','Unverified kit classes · K kick · S snare · T toms · H hi-hat · C cymbals/ride. Model scores are activations, not accuracy.','study-muted'));
      if(chart.drums.stale) container.append(drumText('p','Stems changed. Analyse Drums to refresh this score.','drum-error'));
    }
  }
  highlightDrumHits(container,time);
}
