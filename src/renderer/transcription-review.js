// Reviews belong to a particular recording, bar and set of predictions. Model
// outputs stay available when a performer corrects an interpretation.
function transcriptionRawEvents(chart,bar,end,kind) {
  if(kind==='melody')return (chart.melody?.events||[]).filter(note=>note.end>bar.start&&note.start<end).map(note=>({...note,
    source_start:note.start,source_end:note.end,attack_start:note.start,start:Math.max(bar.start,note.start),end:Math.min(end,note.end),
    continuesFromPrevious:note.start<bar.start,continuesToNext:note.end>end}));
  if(kind==='drums') return (chart.drums?.events || []).filter(hit=>hit.time>=bar.start && hit.time<end);
  if(kind==='bass') return bar.bass_events || [];
  return bar.chord_events?.length ? bar.chord_events : [{start:bar.start,end,chord:bar.chord || 'N.C.',confidence:bar.confidence}];
}

function transcriptionBasis(chart,bar,end,kind) {
  const fields=kind==='melody'?['start','end','midi','pitch_midi','source_start','source_end']:kind==='drums' ? ['time','instrument','score'] : kind==='bass'
    ? ['start','end','midi','confidence','frequency_hz','attack_start'] : ['start','end','chord','confidence','evidence_stale'];
  return JSON.stringify([chart.source_path,bar.start,end,(chart.beat_times || []).filter(t=>t>=bar.start && t<=end),
    ['drums','melody'].includes(kind) ? [chart[kind]?.model,chart[kind]?.fingerprint] : chart.analysis_engine?.options,
    transcriptionRawEvents(chart,bar,end,kind).map(event=>fields.map(field=>event[field]))]);
}

function effectiveTranscriptionEvents(chart,bar,end,kind) {
  const entry=bar.transcription_review?.[kind];
  const source=kind!=='chords' && entry?.events && entry.basis===transcriptionBasis(chart,bar,end,kind)
    ? entry.events : transcriptionRawEvents(chart,bar,end,kind);
  return JSON.parse(JSON.stringify(source));
}

function captureDetectedChords(bar,end,offset=0) {
  const review=bar.transcription_review ||= {};
  const entry=review.chords ||= {};
  if(!entry.detected) {
    entry.detected=JSON.parse(JSON.stringify(transcriptionRawEvents({},bar,end,'chords')));
    entry.capture_offset=offset;
    entry.capture_bounds=[bar.start,end];
  }
}

function setTranscriptionCorrection(chart,bar,end,kind,events) {
  const clean=events.map(event=>kind==='drums' ? {time:Number(event.time),instrument:event.instrument,manual:true}
    : ['bass','melody'].includes(kind) ? {start:Number(event.start),end:Number(event.end),midi:Number(event.midi),attack_start:Number(event.start),manual:true}
      : {start:Number(event.start),end:Number(event.end),chord:String(event.chord || '').trim(),manual:true,evidence_stale:true});
  clean.sort((a,b)=>(a.time ?? a.start)-(b.time ?? b.start));
  if(['bass','melody'].includes(kind))clean.forEach(note=>{
    const source=effectiveTranscriptionEvents(chart,bar,end,kind).find(item=>item.start===note.start && (kind==='melody'||item.midi===note.midi));
    if(source && Number.isFinite(source.attack_start))note.attack_start=source.attack_start;
    else if(source)delete note.attack_start;
    if(kind==='melody'&&source){note.continuesFromPrevious=Boolean(source.continuesFromPrevious);
      note.continuesToNext=Boolean(source.continuesToNext&&source.end===note.end);}
  });
  let previous=bar.start;
  clean.forEach(event=>{
    const start=event.time ?? event.start;
    if(!Number.isFinite(start) || start<bar.start || start>=end) throw new Error('Onsets must be inside this bar.');
    if(kind==='drums') {
      if(!['kick','snare','tom','hihat','cymbal'].includes(event.instrument)) throw new Error('Choose a supported drum class.');
    } else {
      if(!Number.isFinite(event.end) || event.end<=start || event.end>end || start<previous-1e-6) throw new Error('Use positive, non-overlapping durations inside this bar.');
      if(kind==='bass' && (!Number.isInteger(event.midi) || event.midi<21 || event.midi>67)) throw new Error('Bass pitches must be MIDI 21–67.');
      if(kind==='melody' && (!Number.isInteger(event.midi)||event.midi<0||event.midi>127))throw Error('Vocal pitches must be MIDI 0–127.');
      if(kind==='chords' && (!event.chord || Math.abs(start-previous)>1e-6)) throw new Error('Chords must cover the bar without gaps.');
      previous=event.end;
    }
  });
  if(kind==='chords') {
    if(!clean.length || Math.abs(previous-end)>1e-6) throw new Error('Chords must cover the complete bar.');
    captureDetectedChords(bar,end,Number(chart.key_offset) || 0);
    const old=transcriptionRawEvents(chart,bar,end,kind);
    bar.chord_events=clean.map(event=>{
      const source=old.find(item=>item.start===event.start && item.end===event.end) || {};
      // Keep acoustic evidence for inspection; never reuse its confidence as a
      // confidence in the manually supplied chord.
      const result={...source,...event};
      delete result.confidence;delete result.chord_confidence;
      return result;
    });
    bar.chord=clean.reduce((a,b)=>b.end-b.start>a.end-a.start?b:a).chord;
    delete bar.confidence;delete bar.chord_confidence;
  }
  const entry=(bar.transcription_review ||= {})[kind] ||= {};
  entry.basis=transcriptionBasis(chart,bar,end,kind);
  if(kind!=='chords') entry.events=clean;
  entry.verified=null;
}

function resetTranscriptionCorrection(chart,bar,end,kind) {
  const entry=bar.transcription_review?.[kind];
  if(kind==='chords' && entry?.detected) {
    const bounds=entry.capture_bounds || [entry.detected[0]?.start,entry.detected.at(-1)?.end];
    if(bounds[0]!==bar.start || bounds[1]!==end)throw new Error('Bar timing changed. Edit events to the current bar instead of restoring old bounds.');
    const copy={chord_events:JSON.parse(JSON.stringify(entry.detected))};
    const semitones=(Number(chart.key_offset) || 0)-(entry.capture_offset || 0);
    if(semitones)transposeBarChordFields(copy,semitones);
    bar.chord_events=copy.chord_events;
    const dominant=bar.chord_events.reduce((a,b)=>b.end-b.start>a.end-a.start?b:a);
    bar.chord=dominant.chord;
    for(const field of ['confidence','chord_confidence','evidence_stale','manual']) {
      if(dominant[field]===undefined)delete bar[field];else bar[field]=dominant[field];
    }
  }
  if(bar.transcription_review)delete bar.transcription_review[kind];
}

function transcriptionReviewStatus(chart,bar,end,kind) {
  const entry=bar.transcription_review?.[kind];
  if(['drums','melody'].includes(kind) && chart[kind]?.stale) return 'Needs review';
  if(entry?.basis && entry.basis!==transcriptionBasis(chart,bar,end,kind)) return 'Needs review';
  if(!entry?.verified)return 'Unverified';
  const current=transcriptionVerificationEvents(chart,bar,end,kind);
  if(entry?.verified && entry.verified.events!==current)return 'Needs review';
  return entry?.verified?.events===current && entry.basis===transcriptionBasis(chart,bar,end,kind) ? 'Verified' : 'Unverified';
}

function verifyTranscription(chart,bar,end,kind,verified) {
  if(verified && ((['drums','melody'].includes(kind) && (!chart[kind]?.ok || chart[kind].stale)) || (kind==='bass' && !hasReviewedBassEvents(chart,bar,end)))) return false;
  const entry=(bar.transcription_review ||= {})[kind] ||= {};
  // A stale correction must be reset or edited before accepting new evidence.
  if(verified && entry.events && entry.basis!==transcriptionBasis(chart,bar,end,kind)) return false;
  entry.basis=transcriptionBasis(chart,bar,end,kind);
  entry.verified=verified ? {at:new Date().toISOString(),events:transcriptionVerificationEvents(chart,bar,end,kind)} : null;
  return true;
}

function hasReviewedBassEvents(chart,bar,end) {
  const entry=bar?.transcription_review?.bass;
  return Array.isArray(bar?.bass_events) || (Array.isArray(entry?.events) && entry.basis===transcriptionBasis(chart,bar,end,'bass'));
}

function reviewedBassTrack(chart) {
  return chart.bars.flatMap((bar,i)=>effectiveTranscriptionEvents(chart,bar,chart.bars[i+1]?.start ?? chart.duration,'bass'));
}

function reviewedDrumTrack(chart,start=-Infinity,end=Infinity) {
  const inside=hit=>hit.time>=start && hit.time<end;
  let events=(chart.drums?.events || []).filter(inside);
  // Only inspect edited owners intersecting the requested interval. Rebuilding
  // the complete effective track for every measure makes long sheets quadratic.
  chart.bars.forEach((bar,i)=>{
    const stop=chart.bars[i+1]?.start ?? chart.duration,entry=bar.transcription_review?.drums;
    if(stop<=start || bar.start>=end || !entry?.events || entry.basis!==transcriptionBasis(chart,bar,stop,'drums'))return;
    events=events.filter(hit=>hit.time<bar.start || hit.time>=stop);
    events.push(...entry.events.filter(inside));
  });
  return events.sort((a,b)=>a.time-b.time);
}

function transcriptionVerificationEvents(chart,bar,end,kind) {
  if(kind==='melody'){
    const index=chart.bars?.indexOf(bar) ?? -1;
    // Precision changes written durations, but must not invalidate source edits.
    const resolution=Number(typeof state==='undefined'?16:state.melodyNotation?.resolution)===32?32:16;
    const evidence=index>=0?[index-1,index,index+1].filter(i=>i>=0&&i<chart.bars.length).map(i=>{
      const owner=chart.bars[i],stop=chart.bars[i+1]?.start ?? chart.duration;
      // Neighbouring attacks establish cross-bar tuplets as well as sustain
      // ties, so verification must include the complete adjacent evidence.
      return effectiveTranscriptionEvents(chart,owner,stop,kind);
    }):[effectiveTranscriptionEvents(chart,bar,end,kind)];
    return JSON.stringify({resolution,evidence});
  }
  // A near-barline hit may be engraved on the next downbeat. Include adjacent
  // original-time hits so editing their owning bar also invalidates this review.
  return JSON.stringify(kind==='drums' ? reviewedDrumTrack(chart,bar.start-.035,end+.035)
    : effectiveTranscriptionEvents(chart,bar,end,kind));
}

function chartDisplayTitle(chart,audio={}) {
  const clean=value=>String(value || '').replace(/\s*\[[\w-]{11}\]\s*$/,'').trim();
  const title=clean(chart?.title) || clean(audio.title) || 'Untitled';
  return audio.artist && title===clean(audio.title) ? `${title} — ${audio.artist}` : title;
}

function parseReviewPitch(value) {
  if(/^\d+$/.test(String(value).trim()))return Number(value);
  const match=/^([A-Ga-g])([#b♯♭]?)(-?\d)$/.exec(String(value).trim());
  if(!match)return NaN;
  return (Number(match[3])+1)*12+{C:0,D:2,E:4,F:5,G:7,A:9,B:11}[match[1].toUpperCase()]
    +(['#','♯'].includes(match[2])?1:['b','♭'].includes(match[2])?-1:0);
}

function transcriptionSheetStatus(chart,kind) {
  const verified=chart.bars.filter((bar,i)=>transcriptionReviewStatus(chart,bar,chart.bars[i+1]?.start ?? chart.duration,kind)==='Verified').length;
  return verified===chart.bars.length ? 'Manually verified' : `Unverified estimate · ${verified}/${chart.bars.length} bars reviewed`;
}

let reviewPlayer=null;
function stopTranscriptionListen() {
  if(reviewPlayer) {
    if(reviewPlayer.reviewFrame!==undefined)cancelAnimationFrame(reviewPlayer.reviewFrame);
    reviewPlayer.pause();reviewPlayer.src='';reviewPlayer=null;
  }
}

async function listenTranscriptionBar(chart,bar,end,source='full_mix') {
  stopTranscriptionListen();
  const url=source==='full_mix' ? state.audio?.url : chart.stems?.stems?.find(stem=>stem.name===source)?.url;
  if(!url) {setStatus('This audio source is unavailable.');return;}
  elements.audioPlayer.pause();pauseStems();stopStudyPlayback();
  const player=new Audio(url);reviewPlayer=player;
  player.volume=state.masterVolume;player.playbackRate=state.playbackRate;
  const seek=()=>{if(reviewPlayer===player) player.currentTime=bar.start;};
  player.addEventListener('loadedmetadata',seek,{once:true});seek();
  player.addEventListener('timeupdate',()=>{if(player.currentTime>=end && reviewPlayer===player)stopTranscriptionListen();});
  player.addEventListener('ended',()=>{if(reviewPlayer===player)stopTranscriptionListen();});
  player.addEventListener('error',()=>{if(reviewPlayer===player){stopTranscriptionListen();setStatus('Review audio could not be played.');}});
  try {
    await player.play();
    if(reviewPlayer!==player){player.pause();return;}
    const tick=()=>{
      if(reviewPlayer!==player)return;
      if(player.currentTime>=end){stopTranscriptionListen();return;}
      player.reviewFrame=requestAnimationFrame(tick);
    };
    tick();
  }
  catch(error){if(reviewPlayer===player){stopTranscriptionListen();setStatus(error.message);}}
}

function renderTranscriptionReview() {
  const panel=document.getElementById('transcriptionReview');
  if(!panel) return;
  const chart=state.chart,bar=chart?.bars[state.selectedIndex];
  panel.hidden=!bar;if(!bar)return;
  const kind=state.reviewKind || (state.chartRenderer==='numbered'?'melody':['bass','drums','melody'].includes(state.chartRenderer)?state.chartRenderer:'chords');
  const end=barEndTime(state.selectedIndex),entry=bar.transcription_review?.[kind];
  const signature=JSON.stringify([state.selectedIndex,kind,transcriptionBasis(chart,bar,end,kind),entry,chart.drums?.stale,chart.melody?.stale,
    kind==='melody'?transcriptionVerificationEvents(chart,bar,end,kind):null]);
  if(panel._signature===signature && panel._chart===chart && panel._bar===bar)return;
  panel._signature=signature;panel._chart=chart;panel._bar=bar;
  const text=(tag,value,className='')=>{const n=document.createElement(tag);n.textContent=value;n.className=className;return n;};
  const summary=panel.querySelector('summary'),body=panel.querySelector('.transcription-review-body');
  const status=transcriptionReviewStatus(chart,bar,end,kind);
  summary.textContent=`Review transcription · Bar ${bar.number || state.selectedIndex+1} · ${status}`;
  body.replaceChildren();
  const controls=text('div','','transcription-review-controls'),select=document.createElement('select');
  select.setAttribute('aria-label','Review instrument');
  for(const [value,label] of [['chords','Chords'],['bass','Bass notes'],['drums','Drum hits'],['melody','Vocal melody']]) {
    const option=text('option',label);option.value=value;select.append(option);
  }
  select.value=kind;select.onchange=()=>{state.reviewKind=select.value;renderTranscriptionReview();};controls.append(select);
  const button=(label,run)=>{const n=text('button',label);n.type='button';n.onclick=run;return n;};
  controls.append(button('Listen to bar',()=>listenTranscriptionBar(chart,bar,end)));
  if(kind!=='chords') controls.append(button('Listen to stem',()=>listenTranscriptionBar(chart,bar,end,kind==='melody'?'vocals':kind)));
  controls.append(button('Stop',stopTranscriptionListen));
  const verify=button(status==='Verified'?'Mark unverified':'Mark verified',()=>{
    if(!verifyTranscription(chart,bar,end,kind,status!=='Verified')) {setStatus('Reset stale edits or refresh analysis before verifying.');return;}
    renderChartPreview();renderTranscriptionReview();
  });
  verify.disabled=(['drums','melody'].includes(kind) && (!chart[kind]?.ok || chart[kind].stale)) || (kind==='bass' && !hasReviewedBassEvents(chart,bar,end));
  controls.append(verify);body.append(controls);
  body.append(text('p',kind==='melody'?'Review original vocal pitches against the vocals stem. The score follows display transposition. Check harmonies, octave errors, slides and repeated syllables.':kind==='drums' ? 'Kit classes are model guesses. Scores are model activations, not accuracy. Environmental percussion may not fit these classes.'
    : kind==='bass' ? 'Measured low-register pitches; instrument and fingering are interpretations. Periodicity is signal evidence, not transcription accuracy.'
      : 'Detected chords and manual reference candidates are separate. A reference note never changes the detector.','study-muted'));
  if(kind==='drums') {
    const boundary=drumBarEvents(chart,bar,end).filter(hit=>hit.time<bar.start || hit.time>=end);
    boundary.forEach(hit=>{
      const owner=chart.bars.findIndex((item,i)=>hit.time>=item.start && hit.time<(chart.bars[i+1]?.start ?? chart.duration));
      if(owner>=0)body.append(button(`Boundary hit ${hit.time.toFixed(3)}s — edit in Bar ${chart.bars[owner].number || owner+1}`,()=>selectBar(owner,true)));
    });
  }
  const raw=transcriptionRawEvents(chart,bar,end,kind),effective=effectiveTranscriptionEvents(chart,bar,end,kind);
  const detected=kind==='chords' ? entry?.detected || raw : raw;
  const evidence=document.createElement('details');evidence.append(text('summary','Original detection evidence'));
  const list=text('ul','','transcription-evidence');
  detected.forEach(event=>{
    const label=kind==='drums' ? `${event.time.toFixed(3)}s · ${DRUM_PARTS[event.instrument]?.name || event.instrument} · activation ${event.score?.toFixed(2) ?? 'unavailable'}`
      : kind==='melody'?`${event.source_start.toFixed(3)}–${event.source_end.toFixed(3)}s · MIDI ${event.midi} · estimated vocal pitch`
      : `${event.start.toFixed(3)}–${event.end.toFixed(3)}s · ${kind==='bass' ? `${bassPitchLabel(event.midi)} · periodicity ${event.confidence?.toFixed(2) ?? 'unavailable'}` : `${event.chord} · score ${event.confidence?.toFixed(2) ?? 'unavailable'}`}`;
    list.append(text('li',label));
  });
  if(!detected.length)list.append(text('li','No detected events.'));
  evidence.append(list);body.append(evidence);
  const ref=text('label','Reference candidate / review note (manual) '),input=document.createElement('input');
  input.type='text';input.value=entry?.reference || '';input.placeholder='Optional; not used by analysis';
  input.onchange=()=>{const item=(bar.transcription_review ||= {})[kind] ||= {};item.reference=input.value;};ref.append(input);body.append(ref);
  const editor=document.createElement('details');editor.append(text('summary','Edit events'));
  const form=document.createElement('form'),rows=text('div','','transcription-edit-rows'),error=text('p','','drum-error');
  const stale=kind!=='chords' && entry?.events && entry.basis!==transcriptionBasis(chart,bar,end,kind);
  if(stale)editor.append(text('p','Previous edits no longer match the current evidence. Review and apply them again, or reset to discard them.','drum-error'));
  const addRow=event=>{
    const row=text('div','','transcription-edit-row');
    const field=(name,value,type='number')=>{const label=text('label',name==='midi'?'Pitch (e.g. C2)':name),n=document.createElement('input');
      n.type=type;n.value=value ?? '';if(type==='number')n.step=name==='midi'?'1':'any';n.name=name;n.required=true;label.append(n);row.append(label);};
    field(kind==='drums'?'time':'start',event.time ?? event.start);
    if(kind!=='drums')field('end',event.end);
    if(kind==='drums') {
      const n=document.createElement('select');n.name='instrument';n.setAttribute('aria-label','Drum class');
      Object.entries(DRUM_PARTS).forEach(([value,part])=>{const o=text('option',part.name);o.value=value;n.append(o);});n.value=event.instrument || 'kick';row.append(n);
    } else field(['bass','melody'].includes(kind)?'midi':'chord',['bass','melody'].includes(kind)?bassPitchLabel(event.midi):event.chord,'text');
    row.append(button('Remove',()=>row.remove()));rows.append(row);
  };
  (stale?entry.events:effective).forEach(addRow);
  form.append(rows,button('Add event',()=>addRow({start:bar.start,end,time:bar.start,midi:36,chord:'N.C.'})),error);
  const save=text('button','Apply edits');save.type='submit';form.append(save);
  form.onsubmit=event=>{
    event.preventDefault();
    if(state.chart!==chart || chart.bars[state.selectedIndex]!==bar){error.textContent='Select this bar again before editing.';return;}
    const events=[...rows.children].map(row=>Object.fromEntries([...row.querySelectorAll('input,select')].map(n=>[n.name,n.name==='midi'?parseReviewPitch(n.value):n.type==='number'?Number(n.value):n.value])));
    try {setTranscriptionCorrection(chart,bar,end,kind,events);renderBars();renderTimeline();updateRowState();}
    catch(failure){error.textContent=failure.message;}
  };
  form.append(button('Reset edits',()=>{
    try {resetTranscriptionCorrection(chart,bar,end,kind);renderBars();renderTimeline();updateRowState();}
    catch(failure){error.textContent=failure.message;}
  }));
  editor.append(form);body.append(editor);
}
