// Optional alphaTab renderer for the existing estimated bass/drum score views.
// ChordPilot remains responsible for analysis, timing, transport and selection.
(function(){
  let runtime=null;
  const fontDirectory=new URL('./vendor/alphatab/font/',document.baseURI).href;
  const css=document.createElement('style');
  css.textContent=`
    .alpha-chart { box-sizing:border-box; min-width:0; width:100%; background:#fff; color:#171717; color-scheme:light; padding:18px 22px; }
    .alpha-chart-header { display:flex; flex-wrap:wrap; align-items:start; justify-content:space-between; gap:12px; margin-bottom:12px; }
    .alpha-chart-heading { display:grid; gap:5px; }
    .alpha-chart-heading strong { font:26px 'MuseJazz Text','Segoe UI',sans-serif; }
    .alpha-chart-heading span,.alpha-chart-footer { color:#666; font-size:11px; line-height:1.5; }
    .alpha-chart-heading .transcription-sheet-status { color:#72623b; }
    .alpha-chart-screen { position:relative; min-width:0; width:100%; overflow:hidden; }
    .alpha-chart-engine { min-width:0; width:100%; }
    .alpha-chart-overlay { position:absolute; inset:0; pointer-events:none; }
    .alpha-chart-system { position:absolute; pointer-events:none; }
    .alpha-chart-measure { appearance:none; position:absolute; z-index:1; margin:0; min-height:0; border:0; border-radius:0; padding:0; outline:0; background:transparent!important; box-shadow:none; pointer-events:auto; }
    .alpha-chart-measure::after { content:''; position:absolute; inset:26px 2px 8px; border:1px solid transparent; border-radius:2px; background:transparent; pointer-events:none; }
    .alpha-chart-overlay-drums .alpha-chart-measure::after { inset:56px 2px 8px; }
    .alpha-chart-measure.active::after { background:rgb(76 142 137 / 5%); border-color:rgb(76 142 137 / 45%); }
    .alpha-chart-measure.selected:not(.active)::after { background:rgb(76 142 137 / 3%); border-color:rgb(76 142 137 / 30%); }
    .alpha-chart .alpha-chart-measure:hover:not(:disabled) { border:0; background:transparent!important; box-shadow:none; }
    .alpha-chart-number { position:absolute; left:2px; top:2px; color:#526268; font:11px 'Segoe UI',sans-serif; white-space:nowrap; }
    .alpha-chart-note-hit { position:absolute; z-index:2; border:0; border-radius:4px; padding:0; background:transparent; pointer-events:auto; }
    .alpha-chart-note-hit.playing { background:rgb(23 182 162 / 28%); box-shadow:0 0 0 2px #189585; }
    .alpha-chart-cursor { position:absolute; z-index:3; width:2px; background:#189585; pointer-events:none; }
    .alpha-chart .alpha-chart-chord { appearance:none; -webkit-appearance:none; position:absolute; z-index:4; box-sizing:content-box; min-height:0; margin:0; border:0!important; border-radius:0; padding:0!important; background:transparent!important; box-shadow:none!important; color:#171717!important; font:20px 'MuseJazz Text','Segoe UI',sans-serif; line-height:1.15; text-align:left; text-shadow:none; white-space:nowrap; cursor:pointer; pointer-events:auto; }
    .alpha-chart .alpha-chart-chord:hover:not(:disabled) { border:0!important; background:transparent!important; color:#171717!important; filter:none; }
    .alpha-chart-chord sup { font-size:.58em; }
    .alpha-chart-section-label { position:absolute; z-index:5; box-sizing:border-box; padding:2px 7px; border-left:2px solid #6d9e97; background:#fff; color:#365458; font:600 13px/1.3 'Segoe UI',sans-serif; pointer-events:none; }
    .alpha-chart-diagnostic { margin:0 0 12px; padding:8px 10px; border-left:3px solid #ad8642; background:#fff8e9; color:#594624; font-size:12px; line-height:1.45; }
    .alpha-chart-diagnostic ul { margin:5px 0 0; padding-left:18px; }
    .alpha-chart-error { margin:8px 0; padding:10px; border-left:3px solid #b45a42; background:#fff6f3; color:#71321f; font-size:12px; }
    .alpha-chart-error-details { margin-top:6px; color:#71321f; }
    .alpha-chart-error-details summary { cursor:pointer; }
    .alpha-chart-error-details pre { max-height:180px; overflow:auto; white-space:pre-wrap; font:11px/1.4 Consolas,monospace; }
    .alpha-chart-fallback { min-width:0; }
    .alpha-chart-fallback > .alpha-chart-error { margin-bottom:8px; }
    .alpha-chart-print { display:none; }
    .alpha-chart-print-part { position:relative; break-inside:avoid; page-break-inside:avoid; }
    .alpha-chart-print-part > svg { display:block; }
    .alpha-chart-print-number { position:absolute; z-index:5; color:#526268; font:10px 'Segoe UI',sans-serif; white-space:nowrap; }
    @media print {
      .alpha-chart { padding:0; }
      .alpha-chart-screen { display:none !important; }
      .alpha-chart-header label { display:none !important; }
      .alpha-chart-print { display:block; }
      .alpha-chart-print .alpha-chart-chord { color:#171717!important;background:transparent!important;border:0!important;border-radius:0!important;padding:0!important;pointer-events:none; }
      .alpha-chart-print .alpha-chart-section-label { color:#365458!important;background:transparent!important; }
    }
  `;
  document.head.append(css);

  const place=(node,bounds)=>Object.assign(node.style,{left:`${bounds.x}px`,top:`${bounds.y}px`,width:`${bounds.w}px`,height:`${bounds.h}px`});
  function nativeSettings(barsPerLine){
    const a=alphaTab,s=new a.Settings();
    s.core.useWorkers=true;s.core.scriptFile=new URL('./vendor/alphatab/alphaTab.min.js',document.baseURI).href;
    s.core.engine='svg';s.core.enableLazyLoading=false;s.core.includeNoteBounds=true;s.core.fontDirectory=fontDirectory;
    s.display.scale=.65;s.display.barsPerRow=barsPerLine;s.display.padding=[8,0,0,0];
    s.display.layoutMode=a.LayoutMode.Parchment;s.display.barCountPerPartial=barsPerLine;
    // Keep ChordPilot's chord symbols in their own timed overlay above notation.
    s.display.firstNotationStaffPaddingTop=112;
    s.display.resources.engravingSettings.tabLineSpacing=14;
    s.display.resources.tablatureFont=new a.model.Font('Arial',18);
    s.display.notationStaffPaddingTop=12;s.display.notationStaffPaddingBottom=12;
    s.display.systemPaddingTop=42;s.display.systemPaddingBottom=16;
    s.player.enablePlayer=false;s.notation.rhythmMode=a.TabRhythmMode.ShowWithBars;s.notation.rhythmHeight=42;
    for(const key of ['ScoreTitle','ScoreSubTitle','ScoreArtist','ScoreAlbum','ScoreWords','ScoreMusic','GuitarTuning','TrackNames','ChordDiagrams','EffectDynamics','EffectTempo','BarNumber'])
      s.notation.elements.set(a.NotationElement[key],false);
    return s;
  }
  function buildSheet(container,fixture){
    const text=(tag,content,className='')=>{const node=document.createElement(tag);node.textContent=content;node.className=className;return node;};
    const sheet=text('section','','alpha-chart');
    const header=text('div','','alpha-chart-header'),heading=text('div','','alpha-chart-heading');
    heading.append(text('strong',typeof chartDisplayTitle==='function'?chartDisplayTitle(fixture.chart,state.audio||{}):fixture.title||'Untitled'),
      text('span',`${fixture.keyLabel||fixture.key||'?'} · ${fixture.tempo||'?'} BPM · alphaTab 1.8.4`),
      text('span',typeof transcriptionSheetStatus==='function'?transcriptionSheetStatus(fixture.chart,fixture.kind):'Unverified estimate','transcription-sheet-status'));
    header.append(heading);
    if(fixture.kind==='drums')drumControls(header);
    if(fixture.kind==='bass'){
      const label=text('label','Bass strings (auto) '),select=document.createElement('select');
      select.setAttribute('aria-label','Automatically detected bass chart strings');
      select.title='Automatically selected from the lowest transcribed bass note';
      [4,5].forEach(count=>{const option=text('option',`${count} strings`);option.value=String(count);select.append(option);});
      select.value=String(fixture.strings);select.disabled=true;
      label.append(select);header.append(label);
      const modeLabel=text('label','Display '),mode=document.createElement('select');mode.setAttribute('aria-label','Bass notation display');
      [['both','Notation + TAB'],['tab','TAB only'],['notation','Notation only']].forEach(([value,title])=>{const option=text('option',title);option.value=value;mode.append(option);});
      mode.value=fixture.mode;mode.addEventListener('change',()=>{state.bassNotationMode=mode.value;renderChartPreview();});
      modeLabel.append(mode);header.append(modeLabel);
    }
    sheet.append(header);
    if(fixture.kind==='drums' && !fixture.chart.drums?.ok){
      sheet.append(text('p','Select Analyse Drums to create the drum sheet.','bass-chart-empty'));
      container.replaceChildren(sheet);return {sheet,engine:null,overlay:null};
    }
    const screen=text('div','','alpha-chart-screen'),engine=text('div','','alpha-chart-engine'),overlay=text('div','','alpha-chart-overlay');
    if(fixture.kind==='drums')overlay.classList.add('alpha-chart-overlay-drums');
    screen.append(engine,overlay);sheet.append(screen);
    const footer=fixture.kind==='bass'
      ? `${BassTuning.configFor(fixture.strings).label} tuning · Bass sounds one octave below written notation. Rhythm and fingering are estimated.`
      : 'ADTOF audio estimate · kit classes require review. Rhythm is quantized for display; model activations are not accuracy scores.';
    sheet.append(text('p',footer,'alpha-chart-footer'));
    container.replaceChildren(sheet);return {sheet,screen,engine,overlay};
  }
  function showTabDiagnostics(sheet,fixture,converted){
    if(!converted.diagnostics.length&&converted.effectiveMode===fixture.mode)return;
    if(fixture.kind==='bass'&&fixture.mode==='notation')return;
    const panel=document.createElement('div');panel.className='alpha-chart-diagnostic';panel.setAttribute('role','status');
    const tuning=BassTuning.configFor(fixture.strings);
    const lead=document.createElement('div');
    lead.textContent=converted.effectiveMode!==fixture.mode
      ? `${fixture.mode==='tab'?'TAB-only':'Combined notation + TAB'} cannot represent every pitch on the selected ${fixture.strings}-string bass (${tuning.label}, ${BassTuning.rangeLabel(fixture.strings)}, 24 frets). AlphaTab is showing the complete standard notation; no pitches or rhythms were changed. Select the Current renderer to keep the existing TAB view.`
      : `${converted.diagnostics.length} note${converted.diagnostics.length===1?'':'s'} have no playable fingering on the selected ${fixture.strings}-string bass (${tuning.label}, ${BassTuning.rangeLabel(fixture.strings)}, 24 frets). The original pitch and rhythm remain in standard notation; affected TAB positions are left blank.`;
    panel.append(lead);
    if(converted.diagnostics.length){
      const list=document.createElement('ul');
      converted.diagnostics.forEach(item=>{
        const detail=[`Bar ${item.bar}`,`${item.pitch} (MIDI ${item.midi})`,`source note ${item.sourceIndex+1}`];
        if(Number.isFinite(item.start))detail.push(`${item.start.toFixed(3)}s${Number.isFinite(item.end)?`–${item.end.toFixed(3)}s`:''}`);
        if(Number.isFinite(item.frequencyHz))detail.push(`${item.frequencyHz.toFixed(2)}Hz`);
        if(Number.isFinite(item.confidence))detail.push(`${(item.confidence*100).toFixed(1)}% confidence`);
        const line=document.createElement('li');line.textContent=`${detail.join(' · ')} — ${item.reason}`;list.append(line);
      });
      panel.append(list);
    }
    const heading=sheet.querySelector('.alpha-chart-header');heading?.after(panel);
  }
  function drawOverlay(){
    if(!runtime?.api.boundsLookup)return;
    const {api,fixture,overlay,converted}=runtime;
    overlay.replaceChildren();runtime.measureNodes=[];runtime.noteNodes=[];runtime.chordNodes=[];runtime.sectionNodes=[];
    const nodes=document.createDocumentFragment(),entriesByBar=new Map(),masterBars=new Map(),pendingChords=[];
    for(const entry of converted.audit){
      const entries=entriesByBar.get(entry.bar)||[];entries.push(entry);entriesByBar.set(entry.bar,entries);
    }
    api.boundsLookup.staffSystems.forEach((systemBounds,systemIndex)=>{
      const system=document.createElement('div');system.className='alpha-chart-system';system.dataset.systemIndex=String(systemIndex);system.style.position='absolute';system.style.pointerEvents='none';
      place(system,systemBounds.realBounds);nodes.append(system);
      const firstIndex=systemBounds.bars[0]?.index,section=fixture.measures[firstIndex]?.section||'';
      const previousSection=firstIndex>0?fixture.measures[firstIndex-1]?.section||'':'';
      if(section&&section!==previousSection){
        const label=document.createElement('div');label.className='alpha-chart-section-label';label.textContent=section;
        place(label,{x:systemBounds.realBounds.x,y:Math.max(0,systemBounds.realBounds.y-24),w:Math.min(220,systemBounds.realBounds.w),h:20});
        nodes.append(label);runtime.sectionNodes.push({node:label,index:firstIndex});
      }
      for(const bounds of systemBounds.bars){
        const index=bounds.index,source=fixture.measures[index];if(!source)continue;
        const hit=document.createElement('button');hit.type='button';hit.className='alpha-chart-measure';hit.dataset.index=String(index);hit.dataset.systemIndex=String(systemIndex);
        place(hit,bounds.realBounds);hit.setAttribute('aria-label',`Select bar ${source.number}`);hit.onclick=()=>selectBar(index,true);
        const number=document.createElement('span');number.className='alpha-chart-number';number.textContent=`Bar ${source.number}`;hit.append(number);hit._alphaSystem=system;nodes.append(hit);
        runtime.measureNodes.push({node:hit,index,system});
      }
    });
    for(const entries of entriesByBar.values()){
      for(const entry of entries){
      if(fixture.kind==='bass' && entry.source.sourceIndex===null)continue;
      if(fixture.kind==='drums' && !entry.source.instruments.length)continue;
      for(const bounds of api.boundsLookup.findBeats(entry.beat)||[]){
        for(const noteBounds of bounds.notes||[]){
          const hit=document.createElement('button');hit.type='button';hit.className='alpha-chart-note-hit';
          const source=fixture.measures[entry.bar],event=entry.source;
          hit.title=fixture.kind==='bass'?(event.position?`MIDI ${event.midi} · string ${event.position.string}, fret ${event.position.fret}`:`MIDI ${event.midi} · no playable TAB position; retained in standard notation`):
            `${event.instruments.join(' + ')} · original hit times retained`;
          hit.setAttribute('aria-label',hit.title);place(hit,noteBounds.noteHeadBounds);nodes.append(hit);
          const seek=fixture.kind==='bass'?source.notes[event.sourceIndex]?.start:event.hits?.[0]?.time;
          hit.addEventListener('click',()=>{selectBar(entry.bar,false);if(Number.isFinite(seek))elements.audioPlayer.currentTime=seek/(Number(state.audioPreview?.tempoRate)||1);});
          runtime.noteNodes.push({node:hit,entry});
        }
      }
      }
    }
    const lanes=new Map();
    for(const chord of converted.annotations){
      let barBounds=masterBars.get(chord.bar);
      if(!barBounds){barBounds=api.boundsLookup.findMasterBarByIndex(chord.bar);masterBars.set(chord.bar,barBounds);}
      if(!barBounds)continue;
      const entries=entriesByBar.get(chord.bar)||[],tick=AlphaTabScore.timeToTick(fixture,chord.start);
      let low=0,high=entries.length;
      while(low<high){const middle=(low+high)>>1;if(entries[middle].beat.absolutePlaybackStart<=tick)low=middle+1;else high=middle;}
      const before=entries[Math.max(0,low-1)]||entries[0];
      if(!before)continue;
      const after=entries[low];
      const a=api.boundsLookup.findBeat(before.beat),b=after?api.boundsLookup.findBeat(after.beat):null;
      const start=a?.onNotesX??barBounds.realBounds.x,end=b?.onNotesX??barBounds.realBounds.x+barBounds.realBounds.w;
      const finish=after?.beat.absolutePlaybackStart??before.beat.absolutePlaybackStart+before.beat.playbackDuration;
      const x=start+Math.max(0,Math.min(1,(tick-before.beat.absolutePlaybackStart)/Math.max(1,finish-before.beat.absolutePlaybackStart)))*(end-start);
      const label=document.createElement('button');label.type='button';label.className='alpha-chart-chord';
      appendIrealChord(label,displayChordSymbol(chord.chord));label.title=`${chord.chord} · ${chord.start.toFixed(3)}s`;nodes.append(label);
      pendingChords.push({label,chord,barBounds,x});
      label.addEventListener('click',()=>{selectBar(chord.bar,false);elements.audioPlayer.currentTime=chord.start/(Number(state.audioPreview?.tempoRate)||1);});
      runtime.chordNodes.push({node:label,index:chord.bar});
    }
    const cursor=document.createElement('div');cursor.className='alpha-chart-cursor';nodes.append(cursor);runtime.cursor=cursor;
    overlay.append(nodes);
    // Measure chord text without touching layout, then write all positions. Reading
    // DOM bounds forced synchronous style and layout work across the full score.
    const measureContext=document.createElement('canvas').getContext('2d');
    for(const item of pendingChords){
      let width=0;
      for(const part of item.label.children){
        const size=part.tagName==='SUP'?11.6:part.classList.contains('ireal-bass')?14.4:20;
        if(measureContext){measureContext.font=`${size}px "MuseJazz Text", "Segoe UI", sans-serif`;width+=measureContext.measureText(part.textContent).width;}
        else width+=part.textContent.length*size*.6;
        if(part.classList.contains('ireal-quality')||part.classList.contains('ireal-bass'))width+=1;
      }
      item.width=Math.ceil(width+1);
    }
    for(const {label,width,barBounds,x} of pendingChords){
      const left=Math.max(barBounds.realBounds.x,Math.min(x,barBounds.realBounds.x+barBounds.realBounds.w-width-3));
      const laneKey=Math.round(barBounds.realBounds.y),rows=lanes.get(laneKey)||[];let lane=rows.findIndex(right=>right+6<=left);
      if(lane<0)lane=rows.length;rows[lane]=left+width;lanes.set(laneKey,rows);
      label.style.left=`${left}px`;label.style.top=`${barBounds.realBounds.y+21+lane*22}px`;
    }
    updateHighlights();
  }
  function updateHighlights(time=chartPlaybackTime,index=chartPlaybackIndex){
    if(!runtime?.ready)return;
    const {fixture,measureNodes,noteNodes,cursor,api,converted}=runtime;
    measureNodes.forEach(item=>{
      item.node.classList.toggle('active',item.index===index);item.node.classList.toggle('selected',item.index===state.selectedIndex);
    });
    noteNodes.forEach(({node,entry})=>{
      const source=fixture.measures[entry.bar],event=entry.source;
      const playing=fixture.kind==='bass'
        ? (()=>{const note=source.notes[event.sourceIndex];return Boolean(note&&time>=note.start&&time<note.end);})()
        : (event.hits||[]).some(hit=>time>=hit.time-.025&&time<hit.time+.15);
      node.classList.toggle('playing',playing);
    });
    const measure=measureNodes.find(item=>item.index===index);
    if(measure&&cursor){
      const bounds=api.boundsLookup.findMasterBarByIndex(index)?.realBounds;
      const tick=AlphaTabScore.timeToTick(fixture,time);
      const active=converted.audit.find(entry=>tick>=entry.beat.absolutePlaybackStart&&tick<entry.beat.absolutePlaybackStart+entry.beat.playbackDuration);
      const beat=active?api.boundsLookup.findBeat(active.beat):null;
      if(bounds)Object.assign(cursor.style,{left:`${beat?.onNotesX??bounds.x}px`,top:`${bounds.y}px`,height:`${bounds.h}px`});
      if(state.chartAutoFollow&&!elements.audioPlayer.paused&&performance.now()>=chartFollowSuspendedUntil){
        const target=measure.system.getBoundingClientRect(),host=elements.chartPreview.closest('.bars-panel').getBoundingClientRect();
        if(target.top<host.top+24||target.bottom>host.bottom-30)measure.system.scrollIntoView({block:'nearest',behavior:'smooth'});
      }
    }
  }
  function printParts(){
    const r=runtime;if(!r?.ready)throw Error('alphaTab notation is still rendering. Try exporting again in a moment.');
    r.sheet.querySelector('.alpha-chart-print')?.remove();
    const print=document.createElement('div');print.className=`alpha-chart-print ${r.api.canvasElement.element.className}`;
    const parts=[...r.partials.values()].sort((a,b)=>a.y-b.y),font=r.api.settings.display.resources.smuflFontFamilyName;
    for(const partial of parts){
      const chunk=document.createElement('div');chunk.className='alpha-chart-print-part';chunk.style.fontFamily=font;
      chunk.style.width=`${partial.width}px`;chunk.style.height=`${partial.height}px`;chunk.innerHTML=partial.renderResult;
      chunk.querySelectorAll('g.at').forEach(group=>group.style.fontFamily=font);
      const overlay=document.createElement('div');overlay.className='alpha-chart-overlay';
      for(const node of r.overlay.children){
        if(!node.matches('.alpha-chart-measure,.alpha-chart-chord,.alpha-chart-section-label'))continue;
        const y=parseFloat(node.style.top);if(y<partial.y-.5||y>=partial.y+partial.height-.5)continue;
        let copy;
        if(node.matches('.alpha-chart-measure')){
          copy=document.createElement('span');copy.className='alpha-chart-print-number';
          copy.textContent=node.querySelector('.alpha-chart-number')?.textContent||'';
        }else if(node.matches('.alpha-chart-chord')){
          copy=document.createElement('span');copy.className='alpha-chart-chord';copy.innerHTML=node.innerHTML;
        }else{
          copy=document.createElement('span');copy.className='alpha-chart-section-label';copy.textContent=node.textContent;
        }
        copy.style.left=node.style.left;copy.style.top=`${y-partial.y}px`;copy.style.width=node.style.width;copy.style.height=node.style.height;overlay.append(copy);
      }
      chunk.append(overlay);print.append(chunk);
    }
    if(!parts.length)throw Error('alphaTab did not produce printable score pages.');
    r.sheet.append(print);return parts.reduce((width,part)=>Math.max(width,part.width),700);
  }
  function destroyAlphaTabChart(){
    if(!runtime)return;
    runtime.resizeObserver?.disconnect();runtime.api?.destroy();runtime.sheet?.querySelector('.alpha-chart-print')?.remove();runtime=null;
  }
  function showLegacyFallback(container,kind,error){
    destroyAlphaTabChart();
    const wrapper=document.createElement('section');wrapper.className='alpha-chart-fallback';
    const notice=document.createElement('div');notice.className='alpha-chart-error';notice.setAttribute('role','alert');
    const message=error?.message||String(error);
    notice.append(document.createTextNode(`alphaTab could not render this score (${message}). Showing the ChordPilot renderer so the score remains available.`));
    if(error?.stack){
      const details=document.createElement('details');details.className='alpha-chart-error-details';
      const summary=document.createElement('summary');summary.textContent='Technical details';
      const stack=document.createElement('pre');stack.textContent=error.stack;details.append(summary,stack);notice.append(details);
      console.error('alphaTab score render failed',error);
    }
    const body=document.createElement('div');body.className='alpha-chart-fallback-body';wrapper.append(notice,body);container.replaceChildren(wrapper);
    try{
      if(kind==='bass')renderBassChartPreview(body);else renderDrumChartPreview(body);
      finishChartLayout(body,false);registerChartPlayback();
    }catch(fallbackError){
      const detail=document.createElement('p');detail.className='alpha-chart-error';detail.textContent=`The fallback renderer also failed: ${fallbackError.message||fallbackError}`;wrapper.append(detail);
    }
    return false;
  }
  function normalizeAlphaTabError(error){
    if(error instanceof Error)return error;
    const detail=error&&typeof error==='object'?error:null;
    const failure=new Error(detail?.message||String(error));
    failure.name=detail?.name||'AlphaTabError';
    // Worker messages are often plain objects or strings. Do not present the
    // synthetic main-thread Error stack as if it identified the worker fault.
    failure.stack=typeof detail?.stack==='string'?detail.stack:'';
    return failure;
  }
  async function renderAlphaTabChartPreview(container=elements.chartPreview){
    const kind=state.chartRenderer;
    if(!container||!['bass','drums'].includes(kind))return;
    let fixture;
    try{fixture=AlphaTabScore.buildFixture(kind);}catch(error){return showLegacyFallback(container,kind,error);}
    const measures=fixture.measures.map(source=>[
      source.number,source.start,source.end,source.section,Boolean(source.bar?.repeat_start),source.bar?.repeat_end,
      source.model.beats,source.model.beatValue,source.model.unitDenominator,source.model.anchors,
      source.model.events.map(event=>[event.offset,event.units,event.beats,event.duration,event.dots,event.triplet,event.sourceIndex,event.midi,
        event.position?.string,event.position?.fret,event.tieToNext,event.tieToFollowingBar,event.tieFromPrevious,event.instruments,
        event.hits?.map(hit=>[hit.time,hit.instrument])]),
      source.notes?.map(note=>[note.start,note.end,note.midi,note.position?.string,note.position?.fret,note.confidence,note.frequency_hz,note.attack_start]),
      source.chords
    ]);
    const title=typeof chartDisplayTitle==='function'?chartDisplayTitle(fixture.chart,state.audio||{}):fixture.title||'Untitled';
    const status=typeof transcriptionSheetStatus==='function'?transcriptionSheetStatus(fixture.chart,fixture.kind):'Unverified estimate';
    const key=JSON.stringify([kind,title,fixture.keyLabel,fixture.key,fixture.tempo,fixture.strings,fixture.mode,fixture.chart.drums?.ok,status,
      state.chordDisplayPreferences,chartBarsPerLine(),Math.round(container.clientWidth),measures]);
    if(runtime?.key===key){
      if(runtime.ready){updateHighlights(chartPlaybackTime,chartPlaybackIndex);return true;}
      if(runtime.promise)return runtime.promise;
    }
    destroyAlphaTabChart();
    let view,converted;
    try{view=buildSheet(container,fixture);if(!view.engine)return;converted=AlphaTabScore.createScore(alphaTab,fixture,{barsPerLine:chartBarsPerLine()});showTabDiagnostics(view.sheet,fixture,converted);
      const display=view.sheet.querySelector('[aria-label="Bass notation display"]');if(display&&converted.effectiveMode!==fixture.mode)display.value=converted.effectiveMode;}
    catch(error){return showLegacyFallback(container,kind,error);}
    let api;
    try{api=new alphaTab.AlphaTabApi(view.engine,nativeSettings(chartBarsPerLine()));}
    catch(error){return showLegacyFallback(container,kind,error);}
    runtime={api,fixture,converted,...view,key,partials:new Map(),measureNodes:[],noteNodes:[],chordNodes:[],ready:false};
    const current=runtime;
    api.renderer.preRender.on(()=>{if(runtime===current)current.partials.clear();});
    api.renderer.partialRenderFinished.on(partial=>{if(runtime===current&&typeof partial.renderResult==='string')current.partials.set(partial.id,partial);});
    const ready=new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(Error('alphaTab render timed out.')),30000);
      api.error.on(error=>{
        clearTimeout(timeout);
        reject(normalizeAlphaTabError(error));
      });
      api.postRenderFinished.on(()=>{
        clearTimeout(timeout);
        if(runtime!==current)return;
        try{drawOverlay();}
        catch(error){
          console.error('alphaTab score rendered, but ChordPilot could not compose its overlays',error);
          current.overlay.replaceChildren();
          const warning=document.createElement('div');warning.className='alpha-chart-error';warning.setAttribute('role','status');
          warning.textContent=`The alphaTab score rendered, but its interactive overlays could not be drawn (${error.message||error}).`;
          current.sheet.querySelector('.alpha-chart-header')?.after(warning);
        }
        resolve();
      });
    });
    current.promise=(async()=>{
      try{await ready;}catch(error){
        if(runtime===current)showLegacyFallback(container,kind,error);
        return false;
      }
      if(runtime!==current)return false;
      current.ready=true;current.resizeObserver=new ResizeObserver(()=>{
        if(runtime!==current)return;const width=Math.round(api.container.width||0);
        if(width>0&&width!==current.width){current.width=width;api.render();}
      });current.resizeObserver.observe(container);current.width=Math.round(api.container.width||0);
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      if(runtime!==current)return false;
      updateHighlights(chartPlaybackTime,chartPlaybackIndex);finishChartLayout(container,state.notationRenderer!=='compare');
      registerChartPlayback();return true;
    })();
    try{api.renderScore(converted.score,[0]);}
    catch(error){return showLegacyFallback(container,kind,error);}
    return current.promise;
  }
  async function prepareAlphaTabPrint(){
    if(!['alphatab','compare'].includes(state.notationRenderer)||!['bass','drums'].includes(state.chartRenderer))return null;
    const container=state.notationRenderer==='compare'
      ? elements.chartPreview.querySelector('.renderer-compare-alpha-body')
      : elements.chartPreview;
    await renderAlphaTabChartPreview(container||elements.chartPreview);
    if(runtime?.ready)return printParts();
    return null;
  }
  window.renderAlphaTabChartPreview=renderAlphaTabChartPreview;
  window.destroyAlphaTabChart=destroyAlphaTabChart;
  window.prepareAlphaTabPrint=prepareAlphaTabPrint;
  window.updateAlphaTabChartPlayback=updateHighlights;
})();
