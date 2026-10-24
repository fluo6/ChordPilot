// Source timing stays separate from the quantized treble score.
function melodyNotationSettings(value={}) {
  return {resolution:Number(value?.resolution)===32?32:16,cleanChords:value?.cleanChords!==false};
}

function melodyChordEvents(events,clean=true) {
  const result=[];
  for(const event of events){
    let symbol=String(event.chord||'N.C.');
    if(clean){
      symbol=symbol.replace(/^([A-G][#b]?)(m?)6\/9(?=\/|$)/,(_,root,minor)=>`${root}${minor}6`);
      const parts=/^([A-G][#b]?)(.*?)\/([A-G][#b]?)$/.exec(symbol);
      if(parts&&parts[1]===parts[3])symbol=parts[1]+parts[2];
    }
    const label=displayChordSymbol(symbol,clean),previous=result.at(-1);
    if(clean&&previous?.label===label&&Math.abs(previous.end-event.start)<.001){
      previous.end=event.end;previous.originalChords.push(event.chord);
    }else result.push({...event,label,displaySymbol:symbol,originalChords:[event.chord]});
  }
  return result;
}

function melodyQualityDiagnostics(model,notes,voiceReview) {
  const issues=[],pitched=model.events.filter(event=>event.sourceIndex!==null),counts=new Map();
  pitched.forEach(event=>counts.set(event.sourceIndex,(counts.get(event.sourceIndex)||0)+1));
  if([...counts.values()].some(count=>count>=4))issues.push('A long tie chain remains. Check whether this is one sustain or genuine repeated attacks.');
  if(pitched.filter(event=>Number(event.duration)>=32).length>=4||pitched.some(event=>Number(event.duration)>=64))
    issues.push('Several very short note values remain. Review the original vocal timing before accepting this rhythm.');
  if(notes.length>Math.max(12,model.beats*4))issues.push('Unusually high note density. Check for pitch-tracking fragments or accompaniment leakage.');
  if(pitched.filter(event=>event.triplet).length>=9)issues.push('Dense tuplets remain. Listen to confirm that these subdivisions are genuine.');
  const suspect=Array.isArray(voiceReview?.intervals)&&voiceReview.intervals.find(interval=>
    Number.isFinite(interval.start)&&Number.isFinite(interval.end)&&interval.end>interval.start&&
    Number.isFinite(interval.singing)&&interval.singing>=0&&interval.singing<.05&&
    Number.isFinite(interval.instruments)&&interval.instruments>=.1&&interval.instruments<=1&&
    notes.some(note=>Math.max(0,Math.min(note.end,interval.end)-Math.max(note.start,interval.start))>=(note.end-note.start)*.8));
  if(suspect)issues.push(`Possible accompaniment leakage: audio classification at ${suspect.start.toFixed(1)}–${suspect.end.toFixed(1)}s favours instrument sounds. Listen to the vocal stem and full mix before verifying these notes.`);
  return issues;
}

function melodyBarNotes(chart,bar,end) {
  let previousEnd=0;
  for(const note of chart.melody?.events||[]){
    if(!note||!Number.isInteger(note.midi)||note.midi<0||note.midi>127||!Number.isFinite(note.start)||note.start<0||!Number.isFinite(note.end)||note.end<=note.start||
      note.start<previousEnd-1e-6||(Number.isFinite(chart.melody.duration)&&note.end>chart.melody.duration+1e-6))
      throw Error(`Invalid vocal note at ${note?.start}s (MIDI ${note?.midi}). Review the melody evidence.`);
    previousEnd=note.end;
  }
  const raw=typeof effectiveTranscriptionEvents==='function'
    ? effectiveTranscriptionEvents(chart,bar,end,'melody') : chart.melody?.events || [];
  return raw.filter(note=>note.end>bar.start && note.start<end).map(note=>{
    if(!Number.isInteger(note.midi)||note.midi<0||note.midi>127||!Number.isFinite(note.start)||!Number.isFinite(note.end)||note.end<=note.start)
      throw Error(`Invalid vocal note at ${note.start}s (MIDI ${note.midi}). Review the melody evidence.`);
    const midi=note.midi+(Number(chart.key_offset)||0);
    if(!Number.isInteger(midi)||midi<0||midi>127)throw Error(`Transposed vocal MIDI ${midi} is outside the notation range; the original pitch is preserved.`);
    return {...note,midi,attack_start:note.attack_start ?? note.start,
      start:Math.max(bar.start,note.start),end:Math.min(end,note.end),
      continuesFromPrevious:note.continuesFromPrevious ?? note.start<bar.start,
      continuesToNext:note.continuesToNext ?? note.end>end};
  }).sort((a,b)=>a.start-b.start);
}

function melodyCoverageDiagnostics(chart,start,end) {
  return (chart.melody?.events||[]).filter(note=>note.start<start||note.end>end).map(note=>
    `Vocal MIDI ${note.midi} at ${note.start.toFixed(3)}–${note.end.toFixed(3)}s extends outside the chart's measure coverage (${start.toFixed(3)}–${end.toFixed(3)}s). Its original pitch and timing are retained in the evidence.`);
}

function melodyRhythm(notes,bar,end,chart={},options={}) {
  const signature=/^(\d+)\/(2|4|8|16)$/.exec(bar.time_signature || chart.time_signature || '4/4');
  const full=signature ? Number(signature[1]) : 4,beatValue=signature ? Number(signature[2]) : 4;
  const beats=bar.pickup_beats>0 && bar.pickup_beats<full ? bar.pickup_beats : full;
  if(!(end>bar.start)||beats<1||beats>32)throw Error('Invalid melody measure timing.');
  const measured=[...new Set((chart.beat_times || []).filter(t=>Number.isFinite(t)&&t>bar.start+.001&&t<end-.001))].sort((a,b)=>a-b);
  const anchors=measured.length===beats-1 ? [bar.start,...measured,end]
    : Array.from({length:beats+1},(_,i)=>bar.start+(end-bar.start)*i/beats);
  const unitDenominator=96,pulse=unitDenominator/beatValue,totalUnits=beats*pulse,events=[],diagnostics=[];
  const grid=unitDenominator/melodyNotationSettings(options).resolution;
  const before=[...new Set((chart.beat_times||[]).filter(t=>Number.isFinite(t)&&t<bar.start-.001))].sort((a,b)=>a-b).slice(-8);
  const after=[...new Set((chart.beat_times||[]).filter(t=>Number.isFinite(t)&&t>end+.001))].sort((a,b)=>a-b).slice(0,8);
  const extended=[...before,...anchors,...after];
  const quarterAt=time=>{
    if(time<extended[0])return ((time-extended[0])/(extended[1]-extended[0])-before.length)*4/beatValue;
    let i=extended.findIndex((t,index)=>index>0&&time<t)-1;
    if(i<0)i=extended.length-2;
    return (i-before.length+(time-extended[i])/(extended[i+1]-extended[i]))*4/beatValue;
  };
  // A single late attack/release is not evidence of a tuplet. Require three
  // consecutive attacks supporting the same subdivision of a binary beat span.
  let neighbours=chart.melody?.events||[];
  const barIndex=chart.bars?.findIndex(owner=>owner.start===bar.start) ?? -1;
  if(barIndex>=0&&typeof effectiveTranscriptionEvents==='function')
    neighbours=[barIndex-1,barIndex+1].filter(i=>i>=0&&i<chart.bars.length).flatMap(i=>
      effectiveTranscriptionEvents(chart,chart.bars[i],chart.bars[i+1]?.start??chart.duration,'melody'));
  const context=neighbours.filter(note=>!note.continuesFromPrevious&&(note.start<bar.start||note.start>=end)&&note.start>=bar.start-(end-bar.start)&&note.start<end+(end-bar.start));
  const attacks=[...new Set([...context,...notes.filter(note=>!note.continuesFromPrevious)].map(note=>quarterAt(note.start)))].sort((a,b)=>a-b),tuplets=[];
  for(let i=0;i+2<attacks.length;i++){
    const start=Math.round(attacks[i]*2)/2;
    if(Math.abs(attacks[i]-start)>.06)continue;
    const width=[2,1,.5].find(size=>Math.abs(attacks[i+1]-start-size/3)<.06&&Math.abs(attacks[i+2]-start-2*size/3)<.06);
    if(width&&start*24<totalUnits&&(start+width)*24>0&&(!tuplets.length||start*24>=tuplets.at(-1).end))
      tuplets.push({start:start*24,end:(start+width)*24,step:width*8});
  }
  const quantize=time=>{
    if(time<=bar.start)return 0;if(time>=end)return totalUnits;
    const units=quarterAt(time)*24,group=tuplets.find(item=>units>=item.start-1.44&&units<=item.end+1.44);
    return group ? Math.max(group.start,Math.min(group.end,group.start+Math.round((units-group.start)/group.step)*group.step))
      : Math.round(units/grid)*grid;
  };
  const values=[];
  for(const duration of [1,2,4,8,16,32,64])for(const triplet of [false,true])for(const dots of [0,1]) {
    if(triplet&&dots)continue;
    const units=unitDenominator/duration*(triplet?2/3:dots?1.5:1);
    if(Number.isInteger(units)&&units>=1)values.push({units,duration:String(duration),dots,triplet});
  }
  values.sort((a,b)=>b.units-a.units || Number(a.triplet)-Number(b.triplet));
  function append(start,stop,sourceIndex) {
    const first=events.length;
    while(start<stop) {
      const group=tuplets.find(item=>start>=item.start&&start<item.end);
      const boundary=Math.min(stop,group?.end ?? tuplets.find(item=>item.start>start)?.start ?? stop);
      const available=values.filter(value=>!value.triplet||group),best=new Map([[boundary,{cost:0,values:[]}]]);
      // Minimise tied fragments first. A syncopated quarter can be written as
      // one quarter; splitting every beat and greedily choosing dots caused
      // chains of tied 32nds and spurious tuplets in otherwise simple vocals.
      for(let offset=boundary-1;offset>=start;offset--){
        let choice;
        for(const value of available){
          const next=offset+value.units,tail=best.get(next);if(!tail)continue;
          const cost=1+tail.cost+(next<boundary&&next%pulse!==0?.01:0);
          if(!choice||cost<choice.cost)choice={cost,values:[value,...tail.values]};
        }
        if(choice)best.set(offset,choice);
      }
      const spelling=best.get(start);if(!spelling)throw Error('Could not spell the quantized vocal rhythm. Original timing is preserved.');
      for(const value of spelling.values){
        events.push({...value,offset:start,sourceIndex,tieToNext:false,
          ...(sourceIndex===null?{}:{midi:notes[sourceIndex].midi})});start+=value.units;
      }
    }
    if(sourceIndex!==null) {
      for(let i=first;i<events.length-1;i++)events[i].tieToNext=true;
      if(notes[sourceIndex].continuesFromPrevious&&events[first]?.offset===0)events[first].tieFromPrevious=true;
      if(notes[sourceIndex].continuesToNext&&stop===totalUnits)events.at(-1).tieToFollowingBar=true;
    }
  }
  let cursor=0;
  notes.forEach((note,sourceIndex)=>{
    const start=Math.max(cursor,quantize(note.start)),stop=Math.min(totalUnits,quantize(note.end));
    if(stop<=start){diagnostics.push({sourceIndex,start:note.start,end:note.end,midi:note.midi,
      reason:'This note is shorter than the display grid or overlaps a quantized note. Original evidence is retained.'});return;}
    if(start>cursor)append(cursor,start,null);append(start,stop,sourceIndex);cursor=stop;
  });
  if(cursor<totalUnits)append(cursor,totalUnits,null);
  return {beats,beatValue,unitDenominator,totalUnits,events,anchors,diagnostics,tuplets};
}

function melodyControls(container) {
  const controls=document.createElement('div');controls.className='alpha-chart-controls';container.append(controls);
  const ready=hasVocalStem(),button=document.createElement('button');button.type='button';
  button.textContent=state.melodyBusy?'Analysing Melody…':ready?'Analyse Melody':'Prepare Vocal Stem';
  button.disabled=Boolean(state.melodyBusy||state.drumBusy||state.isAnalyzing||state.study?.busy);
  button.onclick=()=>ready?analyzeMelody():prepareMelodyStems();controls.append(button);
  if(ready&&state.chart?.melody?.ok){const refresh=document.createElement('button');refresh.type='button';refresh.textContent='Reanalyse Melody';
    refresh.disabled=button.disabled;refresh.onclick=()=>analyzeMelody(true);controls.append(refresh);}
  const settings=melodyNotationSettings(state.melodyNotation),rhythm=document.createElement('label'),select=document.createElement('select');
  rhythm.append(document.createTextNode('Rhythm '));select.setAttribute('aria-label','Lead sheet rhythm grid');
  [16,32].forEach(value=>{const option=document.createElement('option');option.value=String(value);option.textContent=`1/${value} notes`;select.append(option);});
  select.value=String(settings.resolution);select.disabled=button.disabled;
  select.onchange=()=>{state.melodyNotation={...settings,resolution:Number(select.value)};renderChartPreview();renderTranscriptionReview();};rhythm.append(select);controls.append(rhythm);
  const clean=document.createElement('label'),checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=settings.cleanChords;checkbox.disabled=button.disabled;
  checkbox.onchange=()=>{state.melodyNotation={...settings,cleanChords:checkbox.checked};renderChartPreview();};
  clean.append(checkbox,document.createTextNode(' Clean chords'));controls.append(clean);
  if(state.melodyError?.chart===state.chart){const error=document.createElement('p');error.className='alpha-chart-diagnostic';error.textContent=state.melodyError.message;container.append(error);}
}
