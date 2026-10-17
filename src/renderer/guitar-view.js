function guitarPositions(midi) {
  if (!Number.isInteger(midi)) return [];
  return [64,59,55,50,45,40].map((open,index) => ({string:index+1,fret:midi-open}))
    .filter(position => position.fret>=0 && position.fret<=24)
    .sort((a,b) => a.fret-b.fret || a.string-b.string);
}

function guitarNotePositions(midis) {
  const notes=[...new Set(midis.filter(midi => Number.isInteger(midi) && midi>=21 && midi<=108))]
    .sort((a,b)=>a-b).map(midi=>({midi,position:guitarPositions(midi)[0] || null}));
  const playable=notes.filter(note=>note.position).map(note=>({...note,positions:guitarPositions(note.midi)}))
    .sort((a,b)=>a.positions.length-b.positions.length || a.midi-b.midi);
  if (playable.length>6) return notes;
  const cost=shape=>{
    const frets=shape.map(note=>note.position.fret).filter(fret=>fret>0);
    const highest=Math.max(0,...frets),lowest=frets.length ? Math.min(...frets) : 0;
    return (highest-lowest)**2*4+highest*.4+frets.reduce((sum,fret)=>sum+fret,0)*.02;
  };
  let best=null,bestCost=Infinity;
  const search=(index,used,shape)=>{
    const score=cost(shape);
    if(score>=bestCost) return;
    if(index===playable.length) {best=shape;bestCost=score;return;}
    const note=playable[index];
    for(const position of note.positions) {
      const bit=1<<position.string;
      if(!(used&bit)) search(index+1,used|bit,[...shape,{midi:note.midi,position}]);
    }
  };
  search(0,0,[]);
  return notes.map(note=>best?.find(candidate=>candidate.midi===note.midi) || note);
}

function guitarBarFrames(bar, barEnd) {
  if(!bar || !Number.isFinite(bar.start) || !(barEnd>bar.start)) return [];
  const frames=[];
  const events=Array.isArray(bar.chord_events) && bar.chord_events.length ? bar.chord_events : [bar];
  for(const event of events) {
    const snapshots=event.evidence?.voicing_frames;
    const sources=Array.isArray(snapshots) && snapshots.length ? [event]
      : Array.isArray(event.debug?.cells) && event.debug.cells.length ? event.debug.cells : [event];
    for(const source of sources) {
      const observed=source.evidence?.voicing_frames;
      if(Array.isArray(observed) && observed.length) {
        for(const snapshot of observed) {
          if(!Number.isFinite(snapshot?.start) || !Number.isFinite(snapshot?.end) || !Array.isArray(snapshot.midis)) continue;
          const start=Math.max(bar.start,snapshot.start),end=Math.min(barEnd,snapshot.end);
          if(end>start) frames.push({start,end,midis:[...new Set(snapshot.midis.filter(midi=>Number.isInteger(midi) && midi>=21 && midi<=108))].sort((a,b)=>a-b)});
        }
      } else if(Array.isArray(source.evidence?.detected_pitches)) {
        const pitches=source.evidence.detected_pitches.filter(pitch=>Number.isInteger(pitch?.midi)
          && pitch.midi>=21 && pitch.midi<=108 && Number.isFinite(pitch.strength) && pitch.strength>0);
        const maximum=Math.max(0,...pitches.map(pitch=>pitch.strength));
        const midis=[...new Set(pitches.filter(pitch=>pitch.strength>=maximum*.06)
          .sort((a,b)=>b.strength-a.strength).slice(0,6).map(pitch=>pitch.midi))].sort((a,b)=>a-b);
        const start=Math.max(bar.start,source.start ?? event.start ?? bar.start);
        const end=Math.min(barEnd,source.end ?? event.end ?? barEnd);
        if(end>start) frames.push({start,end,midis});
      }
    }
  }
  return [...new Map(frames.map(frame=>[JSON.stringify(frame),frame])).values()].sort((a,b)=>a.start-b.start);
}

function activeGuitarFrame(frames, time) {
  return frames.filter(frame=>time>=frame.start && time<frame.end)
    .sort((a,b)=>Math.abs((a.start+a.end)/2-time)-Math.abs((b.start+b.end)/2-time) || b.start-a.start)[0] || null;
}

function renderDetailGuitar(bar, barEnd, time) {
  const container=elements.detailGuitar;
  if(!container) return;
  const frames=guitarBarFrames(bar,barEnd);
  const signature=JSON.stringify([bar?.number,bar?.start,barEnd,frames]);
  if(container._guitarSignature!==signature) {
    container._guitarSignature=signature;
    const scroll=container.querySelector('.bass-fretboard-scroll')?.scrollLeft || 0;
    container.replaceChildren();
    container._guitarFrames=frames.map(frame=>({...frame,notes:guitarNotePositions(frame.midis)}));
    const notes=container._guitarFrames.flatMap(frame=>frame.notes);
    const text=(tag,content,className='')=>{
      const node=document.createElement(tag);node.textContent=content;node.className=className;return node;
    };
    const heading=text('div','','bass-view-heading');
    heading.append(text('h3','Guitar Notes'));
    container.append(heading,text('div','','bass-view-current'));
    const fretboard=text('div','','bass-fretboard-scroll');
    fretboard.append(createStringFretboard(notes,['E','B','G','D','A','E'],'guitar'));
    container.append(fretboard);
    fretboard.scrollLeft=scroll;
    container.append(text('p','E–A–D–G–B–E · amber: this bar · teal: current. Scroll for higher frets.','study-muted'));
    container.append(text('p','Detected accompaniment pitches · suggested guitar locations, not confirmed fingering.','study-muted'));
    const outside=[...new Set(notes.filter(note=>!note.position).map(note=>bassPitchLabel(note.midi)))];
    if(outside.length) container.append(text('p',`${outside.join(', ')} outside standard guitar tuning / 24 frets.`,'bass-range-warning'));
    if(!frames.length) container.append(text('p',bar ? 'No measured pitches saved. Reanalyse Chords to refresh guitar notes.'
      : 'Select a bar to see its guitar notes.','study-muted'));
    container._guitarActiveKey=null;
  }
  const current=activeGuitarFrame(container._guitarFrames,time);
  const notes=current?.notes || [];
  container.querySelector('.bass-view-current').textContent=bar
    ? `Bar ${bar.number || state.selectedIndex+1} · ${notes.length ? notes.map(note=>bassPitchLabel(note.midi)).join(' · ') : 'No measured notes at cursor'}`
    : 'No bar selected';
  container.querySelectorAll('[data-fretboard-midi]').forEach(marker=>marker.classList.toggle('bass-current',notes.some(note=>
    note.midi===Number(marker.getAttribute('data-fretboard-midi')) && note.position?.string===Number(marker.getAttribute('data-fretboard-string'))
      && note.position?.fret===Number(marker.getAttribute('data-fretboard-fret')))));
  const key=JSON.stringify([notes,container.clientWidth]);
  if(container._guitarActiveKey!==key) {
    container._guitarActiveKey=key;
    const viewport=container.querySelector('.bass-fretboard-scroll'),marker=container.querySelector('.bass-note-marker.bass-current');
    if(viewport && marker) {
      const area=viewport.getBoundingClientRect(),position=marker.getBoundingClientRect();
      if(position.left<area.left || position.right>area.right) viewport.scrollLeft+=(position.left+position.right-area.left-area.right)/2;
    }
  }
}
