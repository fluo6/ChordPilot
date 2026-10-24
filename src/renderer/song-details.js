// One inspector, using the original bound Song controls and existing session data.
const songDetailsWorkspace = {ready:false, open:false, returnFocus:null};

function syncSongDetailsVisibility() {
  if (!songDetailsWorkspace.ready) return;
  const editor=elements.editorView, panel=document.getElementById('songDetailsInspector');
  if (state.currentView!=='song') songDetailsWorkspace.open=false;
  const open=songDetailsWorkspace.open, timeline=state.editorPanel==='analysis';
  const parent=timeline?document.querySelector('.workspace'):editor;
  if(panel.parentElement!==parent) parent.append(panel);
  editor.dataset.songDetails=String(open);
  panel.hidden=!open;panel.inert=!open;panel.setAttribute('aria-hidden',String(!open));
  const toggle=document.getElementById('songDetailsToggle');
  toggle.disabled=!hasProject();toggle.setAttribute('aria-expanded',String(open));
  toggle.classList.toggle('active-control',open);
  document.getElementById('songDetailsBarSwitch').hidden=!timeline;
  // Keep the user's Bar Detail preference and mobile state while temporarily replacing it.
  const bar=document.getElementById('barDetailInspector');
  const barVisible=timeline&&!open&&(innerWidth>860?compactWorkspace.detailInspector:editor.dataset.mobileDetail==='true');
  bar.inert=!barVisible;bar.setAttribute('aria-hidden',String(!barVisible));
  if(timeline)document.getElementById('detailInspectorToggle').setAttribute('aria-expanded',String(barVisible));
}

function setSongDetailsOpen(open, focus=true, trigger=null) {
  if(!songDetailsWorkspace.ready) return;
  if(open&&!hasProject()) return;
  if(open&&state.currentView!=='song')openEditorPanel('analysis');
  const wasOpen=songDetailsWorkspace.open;
  if(open&&!wasOpen)songDetailsWorkspace.returnFocus=trigger||document.activeElement;
  if(open)setAnalysisSetupOpen(false,false);
  songDetailsWorkspace.open=Boolean(open);
  syncSongDetails();
  if(open&&focus)document.getElementById('songDetailsClose').focus({preventScroll:true});
  else if(wasOpen&&focus){
    const target=songDetailsWorkspace.returnFocus;
    (target?.isConnected&&target.getClientRects().length?target:document.getElementById('songDetailsToggle')).focus({preventScroll:true});
  }
  if(wasOpen!==songDetailsWorkspace.open)resizeCompactWorkspace();
}

function openSongDetailsField(id,trigger=null) {
  setSongDetailsOpen(true,false,trigger);
  const input=document.getElementById(id);
  if(input&&!input.disabled){input.scrollIntoView({block:'nearest'});input.focus({preventScroll:true});}
  else document.getElementById('songDetailsClose').focus({preventScroll:true});
}

function showBarDetailFromSong() {
  if(!songDetailsWorkspace.ready||!songDetailsWorkspace.open||state.editorPanel!=='analysis')return false;
  setSongDetailsOpen(false,false);
  compactWorkspace.detailInspector=true;
  if(innerWidth<=860)elements.editorView.dataset.mobileDetail='true';
  syncCompactWorkspace();saveCompactWorkspace();resizeCompactWorkspace();
  document.getElementById('detailInspectorToggle').focus({preventScroll:true});
  return true;
}

function handleSongDetailsKeydown(event) {
  // An OS/web file dialog owns Escape while it is above this nonmodal inspector.
  if(event.key==='Escape'&&document.querySelector('dialog[open],[aria-modal="true"]:not([hidden]):not(.hidden)'))return;
  if(event.key==='Escape'&&!event.defaultPrevented){
    event.preventDefault();event.stopPropagation();setSongDetailsOpen(false);
  }else if((event.code==='Space'||event.key==='Enter')&&event.target.closest('input,select,textarea,button,summary')){
    event.stopPropagation();
  }
}

function updateSongDetailsNotes(value) {
  if(state.audio)state.audio.comment=String(value);
}

function syncSongDetails() {
  if(!songDetailsWorkspace.ready)return;
  const byId=id=>document.getElementById(id),audio=state.audio,chart=state.chart;
  elements.topbarTitle.textContent=chart?.title||audio?.title||audio?.name||'ChordPilot';
  for(const [id,text] of [['songHeaderKey',chart?`Key: ${chartKeyText(chart)}`:'Key: —'],['songHeaderTempo',chart?.tempo?`${chart.tempo} BPM`:'Tempo: —'],['songHeaderTime',chart?.time_signature||'Time: —']]){
    byId(id).textContent=text;byId(id).disabled=!chart;
  }
  for(const input of [elements.titleInput,elements.tempoInput,elements.timeInput])input.readOnly=!chart;
  if(!chart)elements.titleInput.value=audio?.title||audio?.name||'';
  for(const name of ['Artist','Album','Genre'])byId(`songDetails${name}`).value=audio?.[name.toLowerCase()]||'';
  const art=byId('songDetailsArt'),cover=audio?.coverUrl||'';
  if(art.dataset.cover!==cover){art.replaceChildren(createProjectCover('prototype-cover'));art.dataset.cover=cover;}
  byId('songDetailsSessionPath').textContent=state.sessionPath||'Not saved yet. Use Save Session in the toolbar.';
  const notes=byId('songDetailsNotes');notes.disabled=!audio;
  if(notes._audio!==audio||document.activeElement!==notes)notes.value=audio?.comment??audio?.description??'';
  notes._audio=audio;
  byId('songDetailsNotesHint').textContent=audio?'Notes are saved with the session.':'Open source audio to add session notes.';
  syncSongDetailsVisibility();
}

(function initializeSongDetails(){
  const byId=id=>document.getElementById(id);
  const identity=document.querySelector('.topbar-identity');
  const row=prototypeElement('div','song-title-row');elements.topbarTitle.before(row);row.append(elements.topbarTitle);
  const toggle=prototypeButton('',event=>setSongDetailsOpen(!songDetailsWorkspace.open,true,event.currentTarget),'song-details-toggle');
  toggle.id='songDetailsToggle';toggle.title='Song Details';toggle.setAttribute('aria-label','Song Details');
  toggle.setAttribute('aria-controls','songDetailsInspector');toggle.setAttribute('aria-expanded','false');toggle.append(prototypeIcon('info'));row.append(toggle);
  const facts=prototypeElement('div','song-header-facts');
  for(const [id,field,label] of [['songHeaderKey','keyInput','Edit song key'],['songHeaderTempo','tempoInput','Edit song tempo'],['songHeaderTime','timeInput','Edit time signature']]){
    const button=prototypeButton('',event=>openSongDetailsField(field,event.currentTarget));button.id=id;button.title=label;facts.append(button);
  }
  row.append(facts);identity.classList.add('song-header-identity');

  const panel=prototypeElement('aside','song-details-inspector');panel.id='songDetailsInspector';panel.hidden=true;panel.inert=true;
  panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','false');panel.setAttribute('aria-labelledby','songDetailsHeading');
  const head=prototypeElement('div','song-details-head'),heading=prototypeElement('strong','','Song Details');heading.id='songDetailsHeading';
  const barSwitch=prototypeButton('Bar Detail',showBarDetailFromSong);barSwitch.id='songDetailsBarSwitch';barSwitch.title='Return to Bar / Beat Detail';
  const close=prototypeButton('',()=>setSongDetailsOpen(false));close.id='songDetailsClose';close.title='Close Song Details';close.setAttribute('aria-label','Close Song Details');close.append(prototypeIcon('close'));
  head.append(prototypeIcon('info'),heading,barSwitch,close);
  const body=prototypeElement('div','song-details-body');panel.append(head,body);

  const meta=document.querySelector('.chart-meta'),grid=meta.querySelector('.meta-grid');
  const title=elements.titleInput.closest('label'),key=elements.keyInput.closest('label'),tempo=elements.tempoInput.closest('label'),time=elements.timeInput.closest('label');
  const settings=prototypeElement('div','prototype-song-settings');settings.append(...[...grid.children].filter(node=>![title,key,tempo,time].includes(node)));
  meta.querySelector('.collapse-toggle').remove();meta.querySelector('strong').textContent='Song Information';
  const art=prototypeElement('div','song-details-art');art.id='songDetailsArt';grid.replaceChildren(art,title);
  for(const name of ['Artist','Album','Genre']){
    const label=prototypeElement('label','',name),input=prototypeElement('input');input.id=`songDetails${name}`;
    input.readOnly=true;input.placeholder='Not provided';label.append(input);grid.append(label);
  }
  const music=prototypePanel('Musical Settings');music.lastElementChild.classList.add('song-details-music');music.lastElementChild.append(key,tempo,time);
  const source=document.querySelector('.source-panel');source.querySelector('.collapse-toggle').remove();source.querySelector('strong').textContent='Source & Audio';
  const session=prototypePanel('Session');const sessionPath=prototypeElement('p','prototype-muted');sessionPath.id='songDetailsSessionPath';session.lastElementChild.append(sessionPath);
  const notesLabel=prototypeElement('label','','Notes'),notes=prototypeElement('textarea');notes.id='songDetailsNotes';notes.rows=3;
  notes.addEventListener('input',()=>updateSongDetailsNotes(notes.value));
  const noteHint=prototypeElement('small','prototype-muted');noteHint.id='songDetailsNotesHint';notes.setAttribute('aria-describedby',noteHint.id);notesLabel.append(notes);session.lastElementChild.append(notesLabel,noteHint);
  const advanced=prototypeElement('details','prototype-panel song-details-advanced');advanced.append(prototypeElement('summary','','Advanced song controls'),settings);
  const tools=document.querySelector('.editor-toolbar');tools.querySelector('.collapse-toggle').remove();tools.querySelector('strong').textContent='Bar editing & exports';advanced.append(tools);
  body.append(meta,music,source,session,advanced);elements.editorView.append(panel);
  panel.addEventListener('keydown',handleSongDetailsKeydown);
  // Escape also works while focus is in the timeline; form controls keep native key behavior.
  window.addEventListener('keydown',event=>{
    if(songDetailsWorkspace.open&&event.key==='Escape')handleSongDetailsKeydown(event);
  },true);
  for(const input of [elements.titleInput,elements.tempoInput,elements.timeInput])input.addEventListener('input',syncSongDetails);
  elements.keyInput.addEventListener('change',syncSongDetails);
  window.addEventListener('resize',syncSongDetailsVisibility);
  songDetailsWorkspace.ready=true;refreshPrototypeControlIcons();syncSongDetails();
})();
