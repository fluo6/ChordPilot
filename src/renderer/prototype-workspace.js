// Layout from the supplied seven-view prototype. Original controls keep their listeners.
const prototypeWorkspace = {ready:false, logFilter:'all', logQuery:'', selectedJob:0, running:false, logStatus:'all', logFollow:true};
const prototypeElement = (tag, className='', text='') => {
  const element=document.createElement(tag);element.className=className;element.textContent=text;return element;
};
// Lucide SVG subset pinned at 20aef31db93fe4d9f398dbb15b120d99c48eef95; see vendor/lucide/LICENSE.txt.
// App-specific chart, flask, cog and bass symbols share the same 24px grid.
// Song retains the existing Feather music note; the Log tile keeps the reference's solid bars.
const prototypeIconArtwork = {
  "bass": "<g transform=\"rotate(18 12 12)\"><path d=\"M10 22v-7c-.3-.6-1.3-1.1-1.3-2.2V3.2C8.7 1.8 10.3 1 12 1c2.4 0 4.9 1 5.3 2.9.4 1.7-1.1 3.1-2.9 4.1-1.3.8-.6 2.3-.9 3.6L13 15v7Z\" fill=\"currentColor\" stroke=\"none\"/><path d=\"M6 3.75h3M6 7.25h3M6 10.75h3M6 14.25h3.5\" stroke-width=\"1.1\"/><g fill=\"currentColor\" stroke=\"none\"><rect x=\"3.1\" y=\"2.5\" width=\"3.2\" height=\"2.5\" rx=\"1.2\"/><rect x=\"3.1\" y=\"6\" width=\"3.2\" height=\"2.5\" rx=\"1.2\"/><rect x=\"3.1\" y=\"9.5\" width=\"3.2\" height=\"2.5\" rx=\"1.2\"/><rect x=\"3.1\" y=\"13\" width=\"3.2\" height=\"2.5\" rx=\"1.2\"/></g><g fill=\"var(--ui-bg,#090f16)\" stroke=\"none\"><circle cx=\"10.3\" cy=\"3.75\" r=\".7\"/><circle cx=\"10.3\" cy=\"7.25\" r=\".7\"/><circle cx=\"10.3\" cy=\"10.75\" r=\".7\"/><circle cx=\"10.3\" cy=\"14.25\" r=\".7\"/></g><path d=\"M10.4 22v-7l-.1-11.25M11.05 22v-7l-.75-7.75M11.7 22v-7l-1.4-4.25M12.35 22v-7l-2.05-.75M10 15h3\" stroke=\"var(--ui-bg,#090f16)\" stroke-width=\".45\"/></g>",
  "info": '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  "home": "<path d=\"M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8\" />\n  <path d=\"M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z\" />\n",
  "song": "<path d=\"M9 18V5l10-2v13\"/><circle cx=\"6\" cy=\"18\" r=\"3\"/><circle cx=\"16\" cy=\"16\" r=\"3\"/>",
  "analysis": "<path d=\"M10 8h4\" />\n  <path d=\"M12 21v-9\" />\n  <path d=\"M12 8V3\" />\n  <path d=\"M17 16h4\" />\n  <path d=\"M19 12V3\" />\n  <path d=\"M19 21v-5\" />\n  <path d=\"M3 14h4\" />\n  <path d=\"M5 10V3\" />\n  <path d=\"M5 21v-7\" />\n",
  "chart": "<rect x=\"3\" y=\"2\" width=\"18\" height=\"20\" rx=\"2\"/><path d=\"M7 8h10M7 16h10M10 6v4m4 4v4\"/>",
  "study": "<path d=\"M9 3h6M10 3v6l-6 10a1.3 1.3 0 0 0 1.1 2h13.8a1.3 1.3 0 0 0 1.1-2L14 9V3M8 14h8\"/>",
  "log": "<circle cx=\"12\" cy=\"12\" r=\"10\" />\n  <path d=\"M12 6v6h4\" />\n",
  "wave": "<path d=\"M2 10v3\" />\n  <path d=\"M6 6v11\" />\n  <path d=\"M10 3v18\" />\n  <path d=\"M14 8v7\" />\n  <path d=\"M18 5v13\" />\n  <path d=\"M22 10v3\" />\n",
  "folder": "<path d=\"m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2\" />\n",
  "save": "<path d=\"M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z\" />\n  <path d=\"M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7\" />\n  <path d=\"M7 3v4a1 1 0 0 0 1 1h7\" />\n",
  "download": "<path d=\"M12 15V3\" />\n  <path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\" />\n  <path d=\"m7 10 5 5 5-5\" />\n",
  "mixer": "<path d=\"M10 5H3\" />\n  <path d=\"M12 19H3\" />\n  <path d=\"M14 3v4\" />\n  <path d=\"M16 17v4\" />\n  <path d=\"M21 12h-9\" />\n  <path d=\"M21 19h-5\" />\n  <path d=\"M21 5h-7\" />\n  <path d=\"M8 10v4\" />\n  <path d=\"M8 12H3\" />\n",
  "pause": "<rect x=\"14\" y=\"3\" width=\"5\" height=\"18\" rx=\"1\" />\n  <rect x=\"5\" y=\"3\" width=\"5\" height=\"18\" rx=\"1\" />\n",
  "play": "<path d=\"M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z\" />\n",
  "book": "<path d=\"M12 5v16\" />\n  <path d=\"M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z\" />\n",
  "keyboard": "<path d=\"M10 8h.01\" />\n  <path d=\"M12 12h.01\" />\n  <path d=\"M14 8h.01\" />\n  <path d=\"M16 12h.01\" />\n  <path d=\"M18 8h.01\" />\n  <path d=\"M6 8h.01\" />\n  <path d=\"M7 16h10\" />\n  <path d=\"M8 12h.01\" />\n  <rect width=\"20\" height=\"16\" x=\"2\" y=\"4\" rx=\"2\" />\n",
  "bulb": "<path d=\"M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5\" />\n  <path d=\"M9 18h6\" />\n  <path d=\"M10 22h4\" />\n",
  "mic": "<path d=\"M12 19v3\" />\n  <path d=\"M19 10v2a7 7 0 0 1-14 0v-2\" />\n  <rect x=\"9\" y=\"2\" width=\"6\" height=\"13\" rx=\"3\" />\n",
  "drum": "<path d=\"m2 2 8 8\" />\n  <path d=\"m22 2-8 8\" />\n  <ellipse cx=\"12\" cy=\"9\" rx=\"10\" ry=\"5\" />\n  <path d=\"M7 13.4v7.9\" />\n  <path d=\"M12 14v8\" />\n  <path d=\"M17 13.4v7.9\" />\n  <path d=\"M2 9v8a10 5 0 0 0 20 0V9\" />\n",
  "keys": "<rect width=\"20\" height=\"16\" x=\"2\" y=\"4\" rx=\"2\" />\n  <path d=\"M6 8h4\" />\n  <path d=\"M14 8h.01\" />\n  <path d=\"M18 8h.01\" />\n  <path d=\"M2 12h20\" />\n  <path d=\"M6 12v4\" />\n  <path d=\"M10 12v4\" />\n  <path d=\"M14 12v4\" />\n  <path d=\"M18 12v4\" />\n",
  "guitar": "<path d=\"m11.9 12.1 4.514-4.514\" />\n  <path d=\"M20.1 2.3a1 1 0 0 0-1.4 0l-1.114 1.114A2 2 0 0 0 17 4.828v1.344a2 2 0 0 1-.586 1.414A2 2 0 0 1 17.828 7h1.344a2 2 0 0 0 1.414-.586L21.7 5.3a1 1 0 0 0 0-1.4z\" />\n  <path d=\"m6 16 2 2\" />\n  <path d=\"M8.23 9.85A3 3 0 0 1 11 8a5 5 0 0 1 5 5 3 3 0 0 1-1.85 2.77l-.92.38A2 2 0 0 0 12 18a4 4 0 0 1-4 4 6 6 0 0 1-6-6 4 4 0 0 1 4-4 2 2 0 0 0 1.85-1.23z\" />\n",
  "bars": "<rect x=\"4\" y=\"13\" width=\"4\" height=\"8\" rx=\"1\" fill=\"currentColor\" stroke=\"none\"/><rect x=\"10\" y=\"4\" width=\"4\" height=\"17\" rx=\"1\" fill=\"currentColor\" stroke=\"none\"/><rect x=\"16\" y=\"9\" width=\"4\" height=\"12\" rx=\"1\" fill=\"currentColor\" stroke=\"none\"/>",
  "star": "<path d=\"M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z\" />\n",
  "chevron": "<path d=\"m9 18 6-6-6-6\" />\n",
  "chevronLeft": "<path d=\"m15 18-6-6 6-6\" />\n",
  "chevronDown": "<path d=\"m6 9 6 6 6-6\" />\n",
  "grip": "<circle cx=\"9\" cy=\"12\" r=\"1\" />\n  <circle cx=\"9\" cy=\"5\" r=\"1\" />\n  <circle cx=\"9\" cy=\"19\" r=\"1\" />\n  <circle cx=\"15\" cy=\"12\" r=\"1\" />\n  <circle cx=\"15\" cy=\"5\" r=\"1\" />\n  <circle cx=\"15\" cy=\"19\" r=\"1\" />\n",
  "more": "<circle cx=\"12\" cy=\"12\" r=\"1\" />\n  <circle cx=\"19\" cy=\"12\" r=\"1\" />\n  <circle cx=\"5\" cy=\"12\" r=\"1\" />\n",
  "moreVertical": "<circle cx=\"12\" cy=\"12\" r=\"1\" />\n  <circle cx=\"12\" cy=\"5\" r=\"1\" />\n  <circle cx=\"12\" cy=\"19\" r=\"1\" />\n",
  "close": "<path d=\"M18 6 6 18\" />\n  <path d=\"m6 6 12 12\" />\n",
  "search": "<path d=\"m21 21-4.34-4.34\" />\n  <circle cx=\"11\" cy=\"11\" r=\"8\" />\n",
  "settings": "<path d=\"m9.5 3-.6 2.1-2 .9-2-.6L3 9l1.6 1.5v3L3 15l1.9 3.6 2-.6 2 .9.6 2.1h5l.6-2.1 2-.9 2 .6L21 15l-1.6-1.5v-3L21 9l-1.9-3.6-2 .6-2-.9-.6-2.1Z\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/>",
  "pencil": "<path d=\"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z\" />\n  <path d=\"m15 5 4 4\" />\n",
  "loop": "<path d=\"m2 9 3-3 3 3\" />\n  <path d=\"M13 18H7a2 2 0 0 1-2-2V6\" />\n  <path d=\"m22 15-3 3-3-3\" />\n  <path d=\"M11 6h6a2 2 0 0 1 2 2v10\" />\n",
  "review": "<path d=\"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z\" />\n  <path d=\"M14 2v5a1 1 0 0 0 1 1h5\" />\n  <path d=\"m9 15 2 2 4-4\" />\n",
  "list": "<path d=\"M13 5h8\" />\n  <path d=\"M13 12h8\" />\n  <path d=\"M13 19h8\" />\n  <path d=\"m3 17 2 2 4-4\" />\n  <path d=\"m3 7 2 2 4-4\" />\n",
  "stop": "<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" />\n",
  "trash": "<path d=\"M10 11v6\" />\n  <path d=\"M14 11v6\" />\n  <path d=\"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6\" />\n  <path d=\"M3 6h18\" />\n  <path d=\"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2\" />\n",
  "plus": "<path d=\"M5 12h14\" />\n  <path d=\"M12 5v14\" />\n",
  "minus": "<path d=\"M5 12h14\" />\n",
  "help": "<circle cx=\"12\" cy=\"12\" r=\"10\" />\n  <path d=\"M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3\" />\n  <path d=\"M12 17h.01\" />\n"
};
function prototypeIcon(name) {
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('width','16');svg.setAttribute('height','16');svg.setAttribute('class','prototype-icon');svg.dataset.icon=name;svg.setAttribute('stroke-width','2');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');
  svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
  svg.innerHTML=prototypeIconArtwork[name]||'';return svg;
}
function decoratePrototypeTrack(lane) {
  const label=lane.querySelector('.lane-label');
  if(!label||label.querySelector('.prototype-track-icon'))return;
  const name=String(lane.dataset.trackName||'').toLowerCase();
  const icon=prototypeIcon({'full mix':'analysis',vocals:'mic',drums:'drum',bass:'bass',other:'song'}[name]||'song');
  icon.classList.add('prototype-track-icon');label.prepend(icon);
}
function prependPrototypeIcon(element,name) {
  if(element&&!element.querySelector('.prototype-icon')){const simple=element.childElementCount===0;element.prepend(prototypeIcon(name));if(simple&&element.matches('button'))element.classList.add('prototype-labeled-action');}
}
function setPrototypeControlIcon(element,name) {
  if(!element)return;
  if(element.children.length!==1||element.firstElementChild?.dataset.icon!==name)element.replaceChildren(prototypeIcon(name));
  element.classList.add('prototype-icon-button');
}
function refreshPrototypeControlIcons() {
  if(!prototypeWorkspace.ready)return;
  for(const [selector,icon] of [['#chooseBtn','folder'],['#openSessionBtn','folder'],['#analyzeBtn','wave'],['#saveSessionBtn','save'],['#saveSessionAsBtn','save'],['.chord-display-control > summary','song'],['#analysisSettingsToggle','settings'],['#analysisOpenSetupBtn','wave'],['#detailInspectorToggle','list']])prependPrototypeIcon(document.querySelector(selector),icon);
  setPrototypeControlIcon(elements.leftPaneToggle,elements.leftPane.classList.contains('collapsed-rail')?'chevron':'chevronLeft');
  for(const button of document.querySelectorAll('.collapse-toggle'))setPrototypeControlIcon(button,button.getAttribute('aria-expanded')==='false'?'chevron':'chevronDown');
  for(const button of document.querySelectorAll('.detail-drag-handle'))setPrototypeControlIcon(button,'grip');
  for(const button of document.querySelectorAll('.prototype-mobile-close'))setPrototypeControlIcon(button,'close');
  for(const button of document.querySelectorAll('.study-delete'))setPrototypeControlIcon(button,'trash');
  for(const [id,name] of [['analysisPreviousBar','chevronLeft'],['analysisNextBar','chevron'],['zoomOutBtn','minus'],['zoomInBtn','plus'],['detailChordEditBtn','pencil']])setPrototypeControlIcon(document.getElementById(id),name);
  for(const summary of document.querySelectorAll('.prototype-transport-menu > summary'))setPrototypeControlIcon(summary,'moreVertical');
  for(const details of document.querySelectorAll('.prototype-shell details:not(.chord-display-control):not(.prototype-transport-menu)')){
    const summary=details.querySelector(':scope > summary');if(!summary||summary.closest('#chartPreview')||summary.classList.contains('prototype-summary'))continue;
    const icon=prototypeIcon('chevron');icon.classList.add('prototype-disclosure-icon');summary.prepend(icon);summary.classList.add('prototype-summary');
  }
}
function prototypeSearchField(input) {
  const field=prototypeElement('div','prototype-search');field.append(prototypeIcon('search'),input);return field;
}
function prototypeButton(text, action, className='') {
  const button=prototypeElement('button',className,text);button.type='button';button.addEventListener('click',action);return button;
}
function prototypePanel(title, className='') {
  const panel=prototypeElement('section',`prototype-panel ${className}`);
  panel.append(prototypeElement('div','prototype-panel-head',title),prototypeElement('div','prototype-panel-body'));return panel;
}
function prototypeRows(container, rows) {
  container.replaceChildren();
  for(const [name,value] of rows){const row=prototypeElement('div','prototype-property');row.append(prototypeElement('span','prototype-muted',name),prototypeElement('span','',String(value??'—')));container.append(row);}
}
function prototypeSections() {
  const sections=[];
  for(const [index,bar] of (state.chart?.bars||[]).entries()) {
    const name=String(bar.section||'').trim()||'Song';const previous=sections.at(-1);
    if(previous?.name===name)previous.end=index+1;else sections.push({name,index,end:index+1});
  }
  return sections;
}
function syncPrototypeResponsiveButtons() {
  if(!prototypeWorkspace.ready)return;
  for(const [button,attribute,panel] of [['detailInspectorToggle','mobileDetail','barDetailInspector'],['chartInspectorToggle','mobileChart','chartInspector']]){
    const target=document.getElementById(panel),toggle=document.getElementById(button);
    if(innerWidth>860){
      target.removeAttribute('aria-hidden');
      toggle.setAttribute('aria-expanded',String(getComputedStyle(target).display!=='none'));
    }else{
      const open=elements.editorView.dataset[attribute]==='true';
      toggle.setAttribute('aria-expanded',String(open));target.setAttribute('aria-hidden',String(!open));
    }
  }
  if(typeof syncSongDetailsVisibility==='function')syncSongDetailsVisibility();
  refreshPrototypeControlIcons();
}

function prototypePinnedPaths() {
  try{return JSON.parse(localStorage.getItem('chordpilot.prototypePins')||'[]').filter(path=>typeof path==='string');}catch{return [];}
}
function togglePrototypePin(path) {
  if(!path)return;
  const paths=prototypePinnedPaths();
  try{localStorage.setItem('chordpilot.prototypePins',JSON.stringify(paths.includes(path)?paths.filter(item=>item!==path):[...paths,path]));}catch{return;}
  renderPrototypePins();
}
function renderPrototypePins() {
  const container=document.getElementById('prototypePinnedSongs');if(!container)return;
  const paths=prototypePinnedPaths();container.replaceChildren();
  const pin=document.getElementById('prototypePinCurrent');pin.disabled=!state.sessionPath;
  pin.setAttribute('aria-pressed',String(paths.includes(state.sessionPath)));
  pin.title=state.sessionPath?'Pin or unpin this saved session':'Save the session before pinning it';
  for(const path of paths){
    const recent=state.recentSessions.find(item=>item.path===path);
    const current=path===state.sessionPath;
    const card=prototypeElement('div','prototype-pinned-card');
    const open=prototypeButton('',()=>openSessionPath(path));
    const words=prototypeElement('span');words.append(prototypeElement('strong','',recent?.title||(current?state.chart?.title:null)||path.split(/[\\/]/).at(-1)),prototypeElement('small','prototype-muted',[recent?.key,recent?.tempo?`${recent.tempo} BPM`:''].filter(Boolean).join(' · ')));
    open.append(createCoverTile('recent-cover',recent?.coverUrl||(current?state.audio?.coverUrl:'')||''),words);
    const remove=prototypeButton('',()=>togglePrototypePin(path));remove.append(prototypeIcon('star'));remove.setAttribute('aria-label',`Unpin ${recent?.title||'session'}`);card.append(open,remove);container.append(card);
  }
  if(!paths.length)container.append(prototypeElement('p','prototype-muted','Pin a saved session to keep it within reach.'));
}
function syncPrototypeResumePlayback() {
  const player=elements.audioPlayer,button=document.getElementById('prototypeResumePlay');if(!button)return;
  button.replaceChildren(prototypeIcon(player.paused?'play':'pause'));button.disabled=!state.audio;
  button.setAttribute('aria-label',player.paused?'Play current song':'Pause current song');
  const duration=player.duration||getChartDuration()||0,time=player.currentTime||0;
  document.getElementById('prototypeResumeTime').textContent=`${formatTimelineTransportTime(time).split('.')[0]} / ${formatTimelineTransportTime(duration).split('.')[0]}`;
  const progress=document.getElementById('prototypeResumeProgress');progress.max=duration||1;progress.value=time;
}
function syncPrototypeWorkspace() {
  if(!prototypeWorkspace.ready)return;
  const chart=state.chart;
  if(typeof syncSongDetails==='function')syncSongDetails();
  const wave=document.getElementById('prototypeResumeWave');drawWaveform(wave,chart?.waveform||[],'waveform');
  const example=document.getElementById('prototypeNotationExample');example.replaceChildren();example.dataset.section=chart?.bars?.[0]?.section||'Section';
  const symbols=chart?.bars?.slice(0,4).map(bar=>bar.chord)||['Cmaj7','Am7','Dm7','G7'];
  for(const canvas of document.querySelectorAll('[data-prototype-workflow-wave]'))drawWaveform(canvas,chart?.waveform||[],'waveform');
  symbols.forEach((symbol,index)=>{const cell=prototypeElement('div');cell.append(prototypeElement('small','',String(index+1)),prototypeElement('strong','',displayChordSymbol(symbol,false)));example.append(cell);});
  const chartContext=document.getElementById('prototypeChartMeta');if(chartContext)chartContext.textContent=`Key: ${chart?chartKeyText(chart):'—'}   ·   Tempo: ${chart?.tempo||'—'} BPM   ·   ${chart?.time_signature||'—'}`;
  const run=document.getElementById('prototypeRunTargets');
  const selected=[...document.querySelectorAll('[data-prototype-target]:checked')].map(input=>input.value);
  const busy=prototypeWorkspace.running||state.isAnalyzing||state.drumBusy||state.melodyBusy||state.study?.busy;
  const sourceReady=Boolean(state.audio?.path)&&state.audio.exists!==false;
  let hint=hasChart()?'Reanalyse selected results; unselected analyses are kept.':'Run Chords first to create the timeline. Lyrics and other targets can run with it.';
  if(!sourceReady)hint='Choose or relink the source audio before running analysis.';
  else if(!selected.length)hint='Select at least one analysis target.';
  else if(busy)hint='Analysis is running. Progress is available in Log.';
  run.disabled=busy||!sourceReady||!selected.length||(!hasChart()&&!selected.includes('chords'));
  run.textContent=prototypeWorkspace.running?'Running Selected…':`Run Selected (${selected.length})`;
  document.getElementById('analysisSetupRunHint').textContent=hint;
  syncAnalysisWorkspace();
  document.querySelector('.prototype-shell').dataset.screen=state.currentView==='song'?state.editorPanel:state.currentView;

  renderPrototypeJobs();renderPrototypePins();syncPrototypeResumePlayback();
  syncPrototypeResponsiveButtons();
}
function renderPrototypeTimeline() {
  const host=document.getElementById('prototypeTimelineHeaders');if(!host)return;
  host.replaceChildren();if(!hasChart())return;
  const row=prototypeElement('div','timeline-lane prototype-ruler'),label=prototypeElement('div','lane-label','Bars'),body=prototypeElement('div','lane-body');
  const minSpacing=42;let previous=-Infinity;
  for(const [index,bar] of state.chart.bars.entries()){
    const left=percentAt(bar.start);if(left/100*timelineBodyWidth()-previous<minSpacing)continue;
    const tick=prototypeButton(String(bar.number||index+1),()=>selectBar(index,true));tick.style.left=`${left}%`;tick.title=`Bar ${bar.number||index+1}`;body.append(tick);previous=left/100*timelineBodyWidth();
  }
  row.append(label,body);host.append(row);
  const sectionRow=prototypeElement('div','timeline-lane prototype-section-lane'),sectionBody=prototypeElement('div','lane-body');sectionRow.append(prototypeElement('div','lane-label'),sectionBody);
  prototypeSections().forEach((section,index)=>{
    const start=state.chart.bars[section.index].start,end=barEndTime(section.end-1);
    const band=prototypeButton(section.name,()=>selectBar(section.index,true));band.style.left=`${percentAt(start)}%`;band.style.width=`${Math.max(.1,percentAt(end)-percentAt(start))}%`;band.dataset.colour=String(index%4);sectionBody.append(band);
  });host.append(sectionRow);
}
function preparePrototypeStudyResult() {
  document.getElementById('prototypeStudyCandidates')?.replaceChildren(prototypeElement('p','prototype-muted','Analyze a selection to compare measured candidates.'));
  // Clear result cards only: the playback controls and their listeners are persistent.
  document.querySelector('#prototypeStudyEvidence > .prototype-study-spectrum')?.remove();
  document.querySelector('#prototypeStudyTools > .prototype-study-chord')?.remove();
}
function arrangePrototypeStudyResult() {
  const root=document.getElementById('studyResult'),evidence=document.getElementById('prototypeStudyEvidence'),tools=document.getElementById('prototypeStudyTools');if(!evidence||!tools)return;
  const candidates=root.querySelector('.study-candidates');
  if(candidates){
    const target=document.getElementById('prototypeStudyCandidates');target.replaceChildren(candidates);
    [...candidates.children].forEach((button,index)=>{const item=studyCurrentRun()?.alternatives?.[index];if(!item)return;button.replaceChildren(prototypeElement('span','prototype-candidate-rank',String(index+1)),prototypeElement('strong','',displayChordSymbol(item.chord,false,studyCurrentRun()?.key_context?.key||studyCurrentRun()?.settings?.known_key||studyCurrentRun()?.settings?.song_key)));const meter=document.createElement('progress');meter.max=1;meter.value=item.score;meter.setAttribute('aria-label',`${item.chord} confidence`);button.append(meter,prototypeElement('span','',formatConfidence(item.score)));button.title=`Use ${item.chord} as the study correction`;});
  }
  const spectrum=root.querySelector('.study-spectrum'),piano=root.querySelector('.piano-evidence');
  if(spectrum){const panel=prototypePanel('Spectrum · selection','prototype-study-spectrum');panel.lastChild.append(spectrum);evidence.prepend(panel);}
  if(piano){
    const panel=prototypePanel('Chord View','prototype-study-chord');panel.lastChild.append(piano);tools.prepend(panel);
    const name=root.querySelector('.study-chord')?.cloneNode(true);if(name)panel.firstChild.append(name);
    requestAnimationFrame(()=>{
      if(!piano.isConnected)return;const viewport=piano.querySelector('.piano-viewport');
      const positions=(studyCurrentRun()?.evidence?.detected_pitches||[]).map(note=>piano.querySelector(`[data-midi="${note.midi}"]`)?.offsetLeft).filter(Number.isFinite);
      if(viewport&&positions.length)viewport.scrollLeft=Math.max(0,(Math.min(...positions)+Math.max(...positions))/2-viewport.clientWidth/2);
    });
  }
}
function prototypeStudyBarAt(time) {
  return (state.chart?.bars||[]).findIndex((bar,index)=>time>=bar.start&&time<barEndTime(index));
}
function decoratePrototypeRecentSessions() {
  [...elements.recentSessionsList.children].forEach((button,index)=>{const current=Boolean(state.sessionPath)&&state.recentSessions[index]?.path===state.sessionPath;button.classList.toggle('is-current',current);if(current)button.setAttribute('aria-current','true');else button.removeAttribute('aria-current');});
}
function syncPrototypeStudy() {
  if(!prototypeWorkspace.ready)return;
  const draft=state.study.draft,run=studyCurrentRun();
  prototypeRows(document.getElementById('prototypeStudyOverview'),[
    ['Time range',Number.isFinite(draft.start)&&Number.isFinite(draft.end)?`${draft.start.toFixed(3)}–${draft.end.toFixed(3)} s`:'Select a passage'],
    ['Bars',Number.isFinite(draft.start)&&Number.isFinite(draft.end)?`${prototypeStudyBarAt(draft.start)+1}–${prototypeStudyBarAt(Math.max(draft.start,draft.end-.001))+1}`:'—'],['Sources',draft.sources.join(' + ')||'None'],['Key',run?.key_context?.key||state.chart?.key],['Tempo',state.chart?.tempo?`${state.chart.tempo} BPM`:'—']
  ]);
  renderPrototypeStudyTimeline();
  const list=document.getElementById('studyList'),items=[...list.querySelectorAll('.study-list-row')];
  if(items.length){
    const table=prototypeElement('table','prototype-study-list-table');table.innerHTML='<thead><tr><th>#</th><th>Name</th><th>Bars</th><th>Time</th><th>Chord</th><th>Notes</th><th></th></tr></thead>';
    const tbody=document.createElement('tbody');
    items.forEach((item,index)=>{
      const saved=state.studies[index],row=document.createElement('tr'),open=item.querySelector('.study-list-item');open.textContent=saved.name;
      const latest=saved.runs?.at(-1);
      for(const value of [String(index+1),open,`${prototypeStudyBarAt(saved.start)+1}–${prototypeStudyBarAt(Math.max(saved.start,saved.end-.001))+1}`,`${formatSeconds(saved.start)}–${formatSeconds(saved.end)} s`,latest?.chord||saved.corrected_chord||'—',saved.notes||'—',item.querySelector('.study-delete')]){
        const cell=document.createElement('td');if(value instanceof Node)cell.append(value);else cell.textContent=value;row.append(cell);
      }tbody.append(row);
    });table.append(tbody);list.replaceChildren(table);
  }
  document.querySelector('.study-library h2').textContent=`Study Loop List (${state.studies.length})`;refreshPrototypeControlIcons();
}
function renderPrototypeStudyTimeline() {
  const strip=document.getElementById('prototypeStudyChords');if(!strip)return;
  strip.replaceChildren();const duration=studyDuration();if(!hasChart()||!duration)return;
  const width=document.getElementById('studyWaveBody').offsetWidth;strip.style.width=`${width}px`;
  const ruler=prototypeElement('div','prototype-study-ruler'),sections=prototypeElement('div','prototype-study-sections'),chords=prototypeElement('div','prototype-study-chord-blocks'),beats=prototypeElement('div','prototype-study-beats');
  const position=(element,start,end)=>{element.style.left=`${start/duration*100}%`;if(Number.isFinite(end))element.style.width=`${Math.max(0,end-start)/duration*100}%`;};
  let previous=-100;
  state.chart.bars.forEach((bar,index)=>{
    if(bar.start/duration*width-previous>=36){const tick=prototypeElement('span','',String(bar.number||index+1));position(tick,bar.start);ruler.append(tick);previous=bar.start/duration*width;}
    const events=barChordEvents(bar,barEndTime(index));
    events.forEach((event,eventIndex)=>{const button=prototypeButton(displayChordSymbol(event.chord,false),()=>openChordEventStudy(index,eventIndex));position(button,event.start??bar.start,event.end??barEndTime(index));button.classList.toggle('active-control',(event.start??bar.start)<=state.study.draft.start&&(event.end??barEndTime(index))>state.study.draft.start);button.title=`Bar ${bar.number||index+1}: ${event.chord}`;chords.append(button);});
  });
  prototypeSections().forEach((section,index)=>{const label=prototypeElement('span','',section.name);position(label,state.chart.bars[section.index].start,barEndTime(section.end-1));label.dataset.colour=String(index%4);sections.append(label);});
  for(const time of state.chart.beat_times||[]){const tick=prototypeElement('span');position(tick,time);tick.classList.toggle('downbeat',state.chart.bars.some(bar=>Math.abs(bar.start-time)<.02));beats.append(tick);}
  strip.append(ruler,sections,chords,beats);syncPrototypeStudyTimelineScroll();syncPrototypeStudyCursor(elements.audioPlayer.currentTime*(Number(state.audioPreview?.tempoRate)||1));
}
function syncPrototypeStudyTimelineScroll() {
  const strip=document.getElementById('prototypeStudyChords');if(strip)strip.style.transform=`translateX(${-document.getElementById('studyWaveViewport').scrollLeft}px)`;
}
function syncPrototypeStudyCursor(time) {
  const cursor=document.getElementById('prototypeStudyCursor');if(cursor&&studyDuration())cursor.style.left=`${Math.min(studyDuration(),Math.max(0,Number(time)||0))/studyDuration()*100}%`;

}
function decoratePrototypeChartInspector() {
  const host=elements.chartReasonPane;if(!host||host.querySelector('.prototype-key-context'))return;
  const alternatives=host.querySelector('.chart-reason-options');
  if(alternatives){const details=prototypeElement('details','prototype-chart-detail');details.open=true;details.append(prototypeElement('summary','','Alternatives'));alternatives.replaceWith(details);details.append(alternatives);}
  const context=prototypeElement('details','prototype-chart-detail prototype-key-context');context.open=true;context.append(prototypeElement('summary','','Key / scale context'));
  const values=prototypeElement('div');prototypeRows(values,[['Displayed key',chartKeyText(state.chart)],['Detected key',state.chart.detected_key||state.chart.native_key||'Not available'],['Transpose',`${state.chart.key_offset||0} semitones`]]);context.append(values);host.append(context);refreshPrototypeControlIcons();
}
function syncPrototypeActiveJob() {
  const active=document.getElementById('prototypeActiveJob');if(!active)return;
  active.replaceChildren(prototypeIcon('wave'),prototypeElement('strong','',state.isAnalyzing?(elements.logActiveText?.textContent||'Analysis is running'):'No active analysis tasks.'));
  active.classList.toggle('processing',state.isAnalyzing);
  if(state.isAnalyzing){const meter=document.createElement('progress');meter.setAttribute('aria-label','Analysis is running; percentage unavailable');active.append(meter);}
}
function syncPrototypeConsole() {
  syncPrototypeActiveJob();
  if(prototypeWorkspace.logFollow)elements.analysisLog.scrollTop=elements.analysisLog.scrollHeight;
}
function exportPrototypeLog() {
  const blob=new Blob([[...elements.analysisLog.children].map(line=>line.textContent).join('\n')],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='ChordPilot-log.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function renderPrototypeJobs() {
  if(!prototypeWorkspace.ready)return;
  const rows=document.getElementById('prototypeLogRows'),recent=document.getElementById('prototypeHomeJobs');rows.replaceChildren();recent.replaceChildren();
  const selected=state.jobs[prototypeWorkspace.selectedJob];
  state.jobs.forEach((job,index)=>{
    const text=String(job.message||''),kind=/stem/i.test(text)?'Stems':/lyric|melod|drum|transcri/i.test(text)?'Transcription':/export|sav/i.test(text)?'Export':'Analysis';
    if((prototypeWorkspace.logFilter==='all'||prototypeWorkspace.logFilter===kind)&&text.toLowerCase().includes(prototypeWorkspace.logQuery)&&(prototypeWorkspace.logStatus==='all'||job.status===prototypeWorkspace.logStatus)){
      const row=document.createElement('tr');row.classList.toggle('selected',index===prototypeWorkspace.selectedJob);
      const inspect=prototypeButton(text,()=>{prototypeWorkspace.selectedJob=index;renderPrototypeJobs();});
      const badge=prototypeElement('span',`prototype-job-state ${job.status}`,{done:'Completed',error:'Failed',running:'Processing'}[job.status]||job.status||'—');
      const progress=document.createElement('progress');progress.max=1;if(job.status==='done')progress.value=1;else if(job.status==='error'){progress.value=0;progress.title='Failed; final percentage was not reported';}else progress.title='Progress percentage not reported';progress.setAttribute('aria-label',`${text} progress`);
      for(const value of [String(index+1).padStart(2,'0'),kind,inspect,badge,progress,job.time||'—']){const cell=document.createElement('td');if(value instanceof Node)cell.append(value);else cell.textContent=value;row.append(cell);}rows.append(row);
    }
    const item=prototypeElement('div','prototype-job');item.append(prototypeElement('strong','',text),prototypeElement('span',`prototype-job-state ${job.status}`,job.status||'—'),prototypeElement('small','prototype-muted',job.time||''));recent.append(item);
  });
  if(!state.jobs.length){recent.append(prototypeElement('p','prototype-muted','No analysis jobs yet.'));const row=document.createElement('tr'),cell=document.createElement('td');cell.colSpan=6;cell.textContent='No analysis jobs yet.';row.append(cell);rows.append(row);}
  syncPrototypeActiveJob();
  prototypeRows(document.getElementById('prototypeJobDetail'),[['Job',selected?.message||'Select a job'],['Status',({done:'Completed',error:'Failed',running:'Processing'}[selected?.status])||selected?.status||'Idle'],['Recorded',selected?.time],['Input',selected?.input||'Not recorded'],['Duration',selected?.duration||'Not reported']]);
  document.querySelectorAll('[data-prototype-log-filter]').forEach(button=>button.classList.toggle('active-control',button.dataset.prototypeLogFilter===prototypeWorkspace.logFilter));
}
async function runPrototypeTargets() {
  const selected=new Set([...document.querySelectorAll('[data-prototype-target]:checked')].map(input=>input.value));
  const firstAnalysis=!hasChart();
  if(prototypeWorkspace.running||state.isAnalyzing||state.drumBusy||state.melodyBusy||state.study?.busy||!state.audio?.path||state.audio.exists===false||!selected.size||(firstAnalysis&&!selected.has('chords')))return;
  prototypeWorkspace.running=true;
  setAnalysisSetupOpen(false, false);syncPrototypeWorkspace();
  openEditorPanel('log');const audio=state.audio;
  try{
    const tasks=[];
    if(selected.has('chords'))tasks.push(()=>firstAnalysis
      ?analyzeAudio({requireStems:selected.has('stems')||selected.has('drums')||selected.has('melody')})
      :reanalyzeSection('chords'));
    // Initial analysis already includes the selected Lyrics control.
    if(selected.has('lyrics')&&!firstAnalysis)tasks.push(()=>reanalyzeSection('lyrics'));
    tasks.push(async()=>{
      if((selected.has('stems')&&!firstAnalysis)||(selected.has('drums')&&!hasDrumStem())||(selected.has('melody')&&!hasVocalStem()))await prepareDrumStems();
    });
    if(selected.has('drums'))tasks.push(()=>analyzeDrums());
    if(selected.has('melody'))tasks.push(()=>analyzeMelody());
    for(const task of tasks){
      if(state.audio!==audio)break;const previousJob=state.jobs[0];await task();
      if(state.jobs[0]!==previousJob&&state.jobs[0]?.status==='error')break;
    }
  }catch(error){showErrorDialog('Analysis targets',error.message);}
  finally{prototypeWorkspace.running=false;syncPrototypeWorkspace();}
}
function arrangePrototypeSource() {
  if(!prototypeWorkspace.ready)return;
  const card=elements.sourceInfoPanel.querySelector('.source-file-details');
  if(!card||card.parentElement.classList.contains('prototype-source-details'))return;
  const disclosure=prototypeElement('details','prototype-source-details');disclosure.append(prototypeElement('summary','','File details'));
  card.replaceWith(disclosure);disclosure.append(card);
  const info=elements.sourceInfoPanel,summary=prototypeElement('div','prototype-source-summary');
  const words=prototypeElement('div');words.append(prototypeElement('strong','',state.audio?.exists===false?'Source file unavailable':'Audio imported'),prototypeElement('small','prototype-muted',state.audio?.exists===false?'Choose Audio to reconnect the recording.':'Ready for analysis and playback.'));
  const replace=prototypeButton('Replace Audio…',()=>elements.chooseBtn.click());replace.prepend(prototypeIcon('folder'));
  summary.append(prototypeIcon('wave'),words,replace);info.append(summary);refreshPrototypeControlIcons();
}
(function initializePrototypeWorkspace(){
  const byId=id=>document.getElementById(id),body=panel=>panel.lastElementChild;
  const shell=prototypeElement('div','prototype-shell'),content=prototypeElement('div','prototype-content');
  shell.id='prototypeShell';
  shell.addEventListener('keydown',event=>{if((event.code==='Space'||event.key==='Enter')&&event.target.closest('button,summary'))event.stopPropagation();});
  const frame=document.querySelector('.app-frame');frame.append(shell);
  shell.append(document.querySelector('.topbar'),document.querySelector('.transport'),content,byId('appFooter'));
  content.append(elements.homeView,elements.helpView,elements.editorView);
  const transport=document.querySelector('.transport'),transportTitle=transport.querySelector('.section-title');
  const transportMenu=prototypeElement('details','prototype-transport-menu'),summary=prototypeElement('summary','','⋯');summary.setAttribute('aria-label','Source playback actions');transportMenu.append(summary,transportTitle);transport.append(transportMenu);
  const follow=byId('chartAutoFollowInput').closest('label');document.querySelector('.transport-content').insertBefore(follow,document.querySelector('.transport-info'));
  const brand=document.querySelector('.nav-brand');brand.replaceChildren(prototypeIcon('wave'),prototypeElement('strong','','ChordPilot'));
  const nav=document.querySelector('.nav-list');
  for(const [key,icon] of [['home','home'],['analysis','analysis'],['table','chart'],['study','study'],['log','log'],['help','help']]){
    const button=[...elements.navItems].find(item=>(item.dataset.editorView||item.dataset.view)===key);
    button.querySelector('.nav-icon').replaceChildren(prototypeIcon(icon));
  }

  for(const key of ['home','analysis','table','study','log','help'])nav.append([...elements.navItems].find(item=>(item.dataset.editorView||item.dataset.view)===key));

  const home=elements.homeView,hero=home.querySelector('.home-head');hero.querySelector('h1').textContent='Welcome to ChordPilot';hero.querySelector('p').textContent='Turn any song into chords, charts and practice tools.';
  const homeActions=hero.querySelector('.home-actions'),shortcuts=prototypeElement('div','prototype-shortcuts');
  for(const [title,description,key] of [['Analyze Audio','Detect chords and structure','analysis'],['View Charts','Edit and export charts','table'],['Study a Song','Practice with interactive tools','study'],['Open Log','View analysis history','log']]){
    const button=prototypeButton('',event=>hasProject()?(key==='analysis'?openAnalysisSetup(event):openEditorPanel(key)):elements.chooseBtn.click());
    if(key==='analysis')button.dataset.analysisSetup='';
    const icon=document.querySelector(`[data-editor-view="${key}"] .nav-icon`).cloneNode(true),words=prototypeElement('span');icon.replaceChildren(prototypeIcon({analysis:'wave',table:'chart',study:'study',log:'bars'}[key]));words.append(prototypeElement('strong','',title),prototypeElement('small','',description));button.append(icon,words,prototypeIcon('chevron'));shortcuts.append(button);
  }hero.append(shortcuts);
  const homeGrid=home.querySelector('.home-grid'),panels=[...homeGrid.children],left=prototypeElement('div','prototype-stack'),right=prototypeElement('div','prototype-stack');
  panels[0].querySelector('strong').textContent='Resume Session';panels[2].querySelector('strong').textContent='Recent Projects';panels[3].querySelector('strong').textContent='Recent Analysis Jobs';
  const quick=prototypePanel('Quick Actions'),quickButtons=prototypeElement('div','prototype-action-grid');
  quickButtons.append(prototypeButton('Open Audio File',()=>elements.chooseBtn.click()),...homeActions.children,prototypeButton('View / Export Charts',()=>openEditorPanel('table')));body(quick).append(quickButtons);
  const youtube=prototypeElement('details','prototype-youtube');youtube.append(prototypeElement('summary','','Start from a YouTube link'),panels[1]);body(quick).append(youtube);
  const resumeWave=document.createElement('canvas');resumeWave.id='prototypeResumeWave';resumeWave.width=900;resumeWave.height=34;panels[0].append(resumeWave);
  const resumeFooter=prototypeElement('div','prototype-resume-footer');const resumePlay=prototypeButton('',()=>togglePlayback(),'prototype-resume-play');resumePlay.id='prototypeResumePlay';
  const resumeMedia=prototypeElement('div','prototype-resume-media'),resumeInfo=prototypeElement('div','prototype-resume-info'),resumeTime=prototypeElement('span');resumeTime.id='prototypeResumeTime';const resumeProgress=document.createElement('progress');resumeProgress.id='prototypeResumeProgress';resumeProgress.setAttribute('aria-label','Song playback position');resumeInfo.append(resumeTime,resumeProgress);resumeMedia.append(resumeWave,resumeInfo);resumeFooter.append(resumePlay,resumeMedia,elements.homeGoSongBtn);
  for(const event of ['timeupdate','loadedmetadata','play','pause','emptied'])elements.audioPlayer.addEventListener(event,syncPrototypeResumePlayback);elements.homeGoSongBtn.textContent='Continue →';panels[0].append(resumeFooter);
  const jobsPreview=prototypeElement('div');jobsPreview.id='prototypeHomeJobs';panels[3].append(jobsPreview);
  const projectNotes=prototypePanel('Pinned Songs');body(projectNotes).id='prototypePinnedSongs';const pin=prototypeButton('Pin current session',()=>togglePrototypePin(state.sessionPath));pin.id='prototypePinCurrent';pin.prepend(prototypeIcon('star'));projectNotes.firstChild.append(pin);
  left.append(panels[0],panels[2]);right.append(quick,panels[3],projectNotes);homeGrid.replaceChildren(left,right);

  const setup=byId('analysisSettingsDock'),setupGrid=setup.querySelector('.options-grid');
  const intro=prototypeElement('p','analysis-setup-intro','Choose targets, review the preset, then run. Advanced settings are optional.');
  const targets=prototypeElement('fieldset','prototype-targets');targets.append(prototypeElement('legend','','Analysis targets'));
  const choices=prototypeElement('div','prototype-target-options');
  for(const [value,name] of [['chords','Chords'],['lyrics','Lyrics'],['drums','Drums'],['melody','Melody'],['stems','Stems']]){
    // Reuse the saved Lyrics setting rather than introduce a second, conflicting checkbox.
    const input=value==='lyrics'?elements.lyricsEnabledInput:document.createElement('input');
    const label=value==='lyrics'?input.closest('label'):document.createElement('label');
    input.type='checkbox';input.value=value;input.dataset.prototypeTarget='';
    if(value!=='lyrics')input.checked=value==='chords';
    if(value==='lyrics')label.replaceChildren(input,document.createTextNode(name));
    else label.append(input,document.createTextNode(name));
    input.addEventListener('change',syncPrototypeWorkspace);choices.append(label);
  }
  targets.append(choices);setupGrid.prepend(intro,targets);
  const advancedLabel=prototypeElement('p','analysis-setup-advanced-label','Advanced settings');
  setupGrid.querySelector('.analysis-settings-group').before(advancedLabel);
  const footer=prototypeElement('div','analysis-setup-footer');
  const hint=prototypeElement('p','prototype-muted');hint.id='analysisSetupRunHint';hint.setAttribute('role','status');
  const run=prototypeButton('Run Selected',runPrototypeTargets,'primary');run.id='prototypeRunTargets';run.dataset.prototypeBackendAction='';run.setAttribute('aria-describedby',hint.id);
  footer.append(hint,run);setup.append(footer);
  // Keep original action nodes/listeners for existing state updates, with a single visible run workflow.
  const legacy=setup.querySelector('.reanalysis-actions');legacy.hidden=true;legacy.setAttribute('aria-hidden','true');
  prependPrototypeIcon(byId('analysisSetupHide'),'chevronLeft');
  const keyControl=document.querySelector('.detail-key-signature-control'),chordSummary=document.querySelector('.detail-section[data-section="chord"] > summary');chordSummary.insertBefore(keyControl,chordSummary.lastElementChild);
  keyControl.addEventListener('click',event=>event.stopPropagation());
  const headers=prototypeElement('div');headers.id='prototypeTimelineHeaders';elements.timelineViewport.prepend(headers);
  elements.editorView.dataset.chartMixer='false';byId('chartMixerToggle').setAttribute('aria-expanded','false');
  const chartTitle=document.querySelector('.table-title'),chartSections=byId('chartSectionNav'),chartContext=prototypeElement('div','prototype-chart-context'),chartMeta=prototypeButton('',event=>openSongDetailsField('keyInput',event.currentTarget));chartMeta.id='prototypeChartMeta';chartMeta.title='Edit song key, tempo and time signature';
  chartSections.replaceWith(chartContext);chartContext.append(chartSections,chartMeta,byId('barsPerLineInput').closest('label'),chartTitle.querySelector('[data-export="pdf"]'));
  const chartOptions=prototypeElement('details','prototype-chart-options'),optionsSummary=prototypeElement('summary','','Display options');chartOptions.append(optionsSummary,byId('chartDetailInput').closest('label'),byId('chartZoomInput').closest('label'),byId('chartZoomReset'));chartTitle.append(chartOptions);
  const chartHeading=prototypeElement('strong','prototype-chart-heading','Charts');chartHeading.prepend(prototypeIcon('chart'));chartTitle.prepend(chartHeading);
  for(const [format,icon] of [['ireal','loop'],['bass','bass'],['drums','drum'],['melody','mic']])prependPrototypeIcon(document.querySelector(`[data-chart-format="${format}"]`),icon);
  for(const [mode,icon] of [['read','play'],['review','review'],['edit','pencil']])prependPrototypeIcon(document.querySelector(`[data-chart-mode="${mode}"]`),icon);
  const lyrics=document.querySelector('.chart-lyrics-disclosure');lyrics.hidden=true;
  const lyricsToggle=prototypeButton('Lyrics',()=>{lyrics.hidden=!lyrics.hidden;lyrics.open=!lyrics.hidden;lyricsToggle.setAttribute('aria-expanded',String(!lyrics.hidden));});lyricsToggle.setAttribute('aria-expanded','false');document.querySelector('.chart-format-toolbar').append(lyricsToggle);

  const study=elements.studyPanel,studyMain=study.querySelector('.study-workspace'),library=study.querySelector('.study-library');
  const side=prototypeElement('aside','prototype-study-sidebar prototype-stack prototype-scroll'),loop=prototypePanel('Loop Details'),candidates=prototypePanel('Chord Candidates'),notes=prototypePanel('Study Notes');
  body(loop).id='prototypeStudyOverview';body(candidates).id='prototypeStudyCandidates';body(notes).append(study.querySelector('.study-save-fields'));side.append(loop,candidates,notes);
  const timelineHead=prototypeElement('div','prototype-study-timeline'),strip=prototypeElement('div','prototype-study-chords');strip.id='prototypeStudyChords';timelineHead.append(strip);studyMain.querySelector('.study-toolbar').after(timelineHead);
  byId('studyWaveViewport').addEventListener('scroll',syncPrototypeStudyTimelineScroll,{passive:true});
  const studySizeObserver=new ResizeObserver(()=>{if(state.currentView==='song'&&state.editorPanel==='study')renderStudyWaveform();});studySizeObserver.observe(byId('studyWaveViewport'));
  const cursor=prototypeElement('div','prototype-study-cursor');cursor.id='prototypeStudyCursor';byId('studyWaveBody').append(cursor);
  elements.audioPlayer.addEventListener('timeupdate',()=>syncPrototypeStudyCursor(elements.audioPlayer.currentTime*(Number(state.audioPreview?.tempoRate)||1)));
  const subtitle=prototypeElement('span','prototype-muted','Loop, slow down and analyse a passage. Compare chord ideas and take notes.');studyMain.querySelector('.study-heading h2').after(subtitle);
  const focus=prototypeButton('Focus selection',()=>{const draft=state.study.draft;if(Number.isFinite(draft.start)&&Number.isFinite(draft.end))zoomStudyWaveform(Math.max(1,Math.min(16,studyDuration()/Math.max(8,(draft.end-draft.start)*4))));});focus.title='Zoom to the selected passage with surrounding context';studyMain.querySelector('.study-toolbar').append(focus);
  const evidence=prototypeElement('div','prototype-study-evidence');evidence.id='prototypeStudyEvidence';byId('studyWaveViewport').after(evidence);
  const listening=prototypeElement('details','prototype-listening'),sources=studyMain.querySelector('.study-source-fieldset');listening.append(prototypeElement('summary','','Listening sources & detection settings'),sources,studyMain.querySelector('.study-settings'));
  const sourceHint=[...studyMain.querySelectorAll('p')].find(element=>element.textContent.startsWith('With Bass + Other'));if(sourceHint)listening.append(sourceHint);
  listening.append(byId('studyWaveHint'));const playback=prototypePanel('Playback & Study Tools');playback.classList.add('prototype-study-playback');body(playback).append(byId('studyPlayBtn').closest('.study-toolbar'),byId('studyStatus'));const studyTools=prototypeElement('div','prototype-study-tools');studyTools.id='prototypeStudyTools';studyTools.append(playback);evidence.append(studyTools);evidence.after(listening);
  const history=prototypeElement('details','prototype-listening');history.append(prototypeElement('summary','','Analysis result & history'),studyMain.querySelector('.study-result-toolbar'),byId('studyResult'));studyMain.append(history,library);study.append(side);
  body(notes).append(byId('studyDirtyText'));

  const log=document.querySelector('.log-panel'),logWorkspace=prototypeElement('div','prototype-log-workspace'),logMain=prototypeElement('div','prototype-stack prototype-log-main'),jobPanel=prototypePanel('Analysis Log'),jobSide=prototypePanel('Job Detail');body(jobSide).id='prototypeJobDetail';
  const logTools=prototypeElement('div','prototype-log-tools');
  for(const name of ['all','Analysis','Transcription','Stems','Export']){const button=prototypeButton(name==='all'?'All':name,()=>{prototypeWorkspace.logFilter=name;renderPrototypeJobs();});button.dataset.prototypeLogFilter=name;logTools.append(button);}
  const search=document.createElement('input');search.type='search';search.placeholder='Filter jobs…';search.setAttribute('aria-label','Filter jobs');search.addEventListener('input',()=>{prototypeWorkspace.logQuery=search.value.toLowerCase();renderPrototypeJobs();});logTools.append(prototypeSearchField(search));
  const status=document.createElement('select');status.setAttribute('aria-label','Filter job status');for(const [value,label] of [['all','All statuses'],['done','Completed'],['error','Failed'],['running','Processing']]){const option=prototypeElement('option','',label);option.value=value;status.append(option);}status.addEventListener('change',()=>{prototypeWorkspace.logStatus=status.value;renderPrototypeJobs();});logTools.append(status);
  const active=prototypeElement('p','prototype-active-job');active.id='prototypeActiveJob';const table=document.createElement('table');table.className='prototype-jobs-table';table.innerHTML='<thead><tr><th>#</th><th>Type</th><th>Name</th><th>Status</th><th>Progress</th><th>Recorded</th></tr></thead><tbody id="prototypeLogRows"></tbody>';
  body(jobPanel).append(logTools,prototypeElement('h3','','Active tasks'),active,prototypeElement('h3','','Recent jobs'),table);
  log.querySelector('.log-header strong').textContent='Log Console';logMain.append(jobPanel);logWorkspace.append(logMain,jobSide,log);
  const consoleTools=prototypeElement('div','prototype-console-tools'),followLabel=prototypeElement('label'),followInput=document.createElement('input');followInput.type='checkbox';followInput.checked=true;followInput.addEventListener('change',()=>{prototypeWorkspace.logFollow=followInput.checked;syncPrototypeConsole();});followLabel.append(followInput,document.createTextNode('Auto-scroll'));
  const exportLog=prototypeButton('Export log…',exportPrototypeLog);exportLog.prepend(prototypeIcon('download'));consoleTools.append(followLabel,exportLog);log.querySelector('.log-header').append(consoleTools);logWorkspace.classList.add('editor-section','log-section');elements.editorView.append(logWorkspace);

  const help=elements.helpView,paper=help.querySelector('.help-paper'),helpGrid=help.querySelector('.help-grid'),articles=[...helpGrid.children];
  const basic=articles.find(article=>article.querySelector('h2')?.textContent==='Basic Usage'),shortcutsCard=articles.find(article=>article.querySelector('h2')?.textContent==='Hotkeys');
  basic.querySelector('h2').textContent='Get Started';shortcutsCard.querySelector('h2').textContent='Keyboard Shortcuts';
  const guide=basic.querySelector('ol');guide.replaceChildren();
  for(const [title,text] of [['Import Audio','Choose Audio to open a recording or resume a saved session.'],['Review & Refine','Check chords, sections and timing while listening.'],['Explore Views','Use Charts for notation and Passage Lab for a closer look.'],['Save & Export','Save the session, then export a chart or musical data.']]){const item=document.createElement('li');item.append(prototypeElement('strong','',title),prototypeElement('p','',text));guide.append(item);}
  basic.append(prototypeButton('Choose Audio to get started',()=>elements.chooseBtn.click(),'prototype-start-guide'));
  const keys=shortcutsCard.querySelector('dl');keys.replaceChildren();
  for(const [key,description] of [['Space','Play / pause (selection in Study)'],['← / →','Seek backward / forward 5 seconds'],['Shift + ← / →','Select previous / next bar'],[', / .','Select previous / next bar'],['+ / −','Transpose; zoom if no chart'],['0','Reset timeline zoom'],['N','Restore the detected key'],['A','Add a bar'],['D','Duplicate selected bar'],['S','Split selected bar'],['Delete','Delete selected bar'],['Esc','Dismiss / cancel selection']]){const term=document.createElement('dt'),kbd=document.createElement('kbd');kbd.textContent=key;term.append(kbd);keys.append(term,prototypeElement('dd','',description));}
  shortcutsCard.append(prototypeElement('p','prototype-muted','Tempo Setup uses its own tap and range shortcuts; see the technical reference below.'));
  prependPrototypeIcon(basic.querySelector('h2'),'book');prependPrototypeIcon(shortcutsCard.querySelector('h2'),'keyboard');
  const tips=prototypePanel('Notation Tips'),example=prototypeElement('div','prototype-notation-example');example.id='prototypeNotationExample';const callouts=prototypeElement('div','prototype-notation-callouts');for(const label of ['Section label ↙','Bar numbers ↓','Chord symbol ↓'])callouts.append(prototypeElement('span','',label));body(tips).append(callouts,example);
  const tipsList=document.createElement('ul');for(const text of ['Review uncertain chords while listening to the source.','Use section labels to organize the song.','Choose letter or number roots from Notation.','Adjust bars per line before exporting PDF.','Bass, drum and melody transcriptions remain estimates until reviewed.'])tipsList.append(prototypeElement('li','',text));body(tips).append(tipsList);prependPrototypeIcon(tips.firstChild,'bulb');
  const advanced=prototypeElement('details','prototype-panel prototype-advanced-help');advanced.id='help-analysis';advanced.append(prototypeElement('summary','','Analysis workflow & technical reference'));
  for(const article of articles)if(article!==basic&&article!==shortcutsCard)advanced.append(article);
  helpGrid.replaceChildren(basic,shortcutsCard,tips);paper.append(advanced);help.querySelector('h1').textContent='Help & Documentation';help.querySelector('.help-head p').textContent='Learn how to get the most out of ChordPilot. Guides, shortcuts and reference.';help.querySelector('.help-head').prepend(prototypeIcon('help'));
  const helpSearch=document.createElement('input');helpSearch.type='search';helpSearch.placeholder='Search help…';helpSearch.setAttribute('aria-label','Search help');help.querySelector('.help-head').append(prototypeSearchField(helpSearch));
  helpSearch.addEventListener('input',()=>{const query=helpSearch.value.toLowerCase();for(const article of [...helpGrid.children,...helpBottom.children,...advanced.querySelectorAll('.help-section')])article.classList.toggle('hidden',Boolean(query)&&!article.textContent.toLowerCase().includes(query));if(query)advanced.open=true;});
  const helpBottom=prototypeElement('div','prototype-help-bottom'),workflow=prototypePanel('Analysis Workflow'),troubleshooting=prototypePanel('Troubleshooting');
  body(workflow).classList.add('prototype-workflow');
  for(const [name,description,action] of [['1. Load Audio','Choose WAV / MP3',()=>elements.chooseBtn.click()],['2. Analyse','Chords, beats, stems',()=>openEditorPanel('analysis')],['3. Review & Edit','Correct results',()=>openEditorPanel('table')],['4. Export','PDF, session files',()=>openEditorPanel('table')]]){const button=prototypeButton('',action);const step=prototypeElement('span','prototype-workflow-number',name[0]);button.append(step,prototypeElement('strong','',name.slice(3)));
    if(name.startsWith('1')||name.startsWith('2')){const canvas=document.createElement('canvas');canvas.width=230;canvas.height=60;canvas.dataset.prototypeWorkflowWave='';button.append(canvas);}
    else if(name.startsWith('3')){const sample=prototypeElement('div','prototype-workflow-chords');for(const symbol of ['Cmaj7','Am7'])sample.append(prototypeElement('span','',displayChordSymbol(symbol,false)));button.append(sample);}
    else{const formats=prototypeElement('div','prototype-workflow-exports');for(const label of ['PDF charts','MusicXML','Session JSON'])formats.append(prototypeElement('span','',label));button.append(formats);}
    button.append(prototypeElement('small','prototype-muted',description));body(workflow).append(button);}
  const legend=prototypeElement('div','prototype-legend');for(const [name,colour] of [['Detected','2'],['Selected','1'],['Edited','3']]){const badge=prototypeElement('span','',name);badge.dataset.colour=colour;legend.append(badge);}body(troubleshooting).append(legend);
  for(const [title,text] of [['Analysis seems inaccurate','Check the tempo grid, key and selected audio source. Compare alternative chords while listening to the original audio.'],['Audio will not play','Check that the source file is available, then check master volume and stem mute / solo controls.'],['PDF export looks different','Screen zoom is excluded from PDF export. Check bars per line and the selected chart format before exporting.']]){const details=document.createElement('details');details.append(prototypeElement('summary','',title),prototypeElement('p','prototype-muted',text));body(troubleshooting).append(details);}
  const legendPanel=prototypePanel('Chart Legend');body(legendPanel).append(legend);
  for(const [label,type] of [['Detected chord','detected'],['Selected chord','selected'],['Edited by you','edited'],['No chord','nc'],['Bar boundary','bar'],['Playback position','cursor'],['Audio waveform','wave'],['Section label','section']]){const row=prototypeElement('div','prototype-legend-row'),symbol=prototypeElement('span',`prototype-legend-symbol ${type}`,{detected:'Em7',selected:'E−7',edited:'Am7',nc:'N.C.',bar:'|',cursor:'┃',section:'Verse'}[type]||'');if(type==='wave')symbol.append(prototypeIcon('wave'));row.append(symbol,prototypeElement('small','prototype-muted',label));body(legendPanel).append(row);}
  const documentation=prototypeButton('Open full documentation',()=>{advanced.open=true;advanced.scrollIntoView({block:'start'});});documentation.prepend(prototypeIcon('book'));body(troubleshooting).append(documentation);
  helpBottom.append(workflow,legendPanel,troubleshooting);advanced.before(helpBottom);
  for(const [buttonId,attribute,panelId] of [['detailInspectorToggle','mobileDetail','barDetailInspector'],['chartInspectorToggle','mobileChart','chartInspector']]){
    const toggle=byId(buttonId);
    toggle.addEventListener('click',event=>{
      if(panelId==='barDetailInspector'&&typeof showBarDetailFromSong==='function'&&showBarDetailFromSong()){event.preventDefault();event.stopImmediatePropagation();return;}
      if(innerWidth>860)return;event.preventDefault();event.stopImmediatePropagation();elements.editorView.dataset[attribute]=String(elements.editorView.dataset[attribute]!=='true');syncPrototypeResponsiveButtons();
    },true);
    const panel=byId(panelId),header=panel.querySelector('.detail-title,.chart-reason-title');
    const close=prototypeButton('×',()=>{elements.editorView.dataset[attribute]='false';syncPrototypeResponsiveButtons();toggle.focus();},'prototype-mobile-close');close.setAttribute('aria-label',`Close ${panelId==='barDetailInspector'?'Bar Detail':'chart inspector'}`);header.append(close);
  }
  window.addEventListener('resize',syncPrototypeResponsiveButtons);
  window.addEventListener('keydown',event=>{if(innerWidth>860||event.key!=='Escape'||isTypingTarget(event.target))return;for(const key of ['mobileDetail','mobileChart'])elements.editorView.dataset[key]='false';syncPrototypeResponsiveButtons();});

  // Add reference icons to existing actions without replacing their labels or listeners.
  for(const [id,icon] of [['chartMixerToggle','mixer']])prependPrototypeIcon(byId(id),icon);
  const actionIcons={'Open Audio File':'song','New Project':'folder','Open Session':'folder','View / Export Charts':'download','Play Song':'play','Analyze Audio':'analysis','Prepare Stems':'mixer','View Charts':'chart','Save Session':'save','Export':'download'};
  for(const button of document.querySelectorAll('.prototype-action-grid button')){
    const icon=actionIcons[button.textContent.trim()];if(icon)prependPrototypeIcon(button,icon);
  }
  for(const [index,icon] of ['wave','analysis','chart','download'].entries())prependPrototypeIcon(body(workflow).children[index],icon);
  const headingIcons={'Resume Session':'folder','Recent Projects':'folder','Quick Actions':'wave','Recent Analysis Jobs':'list','Song Information':'song','Source & Audio':'wave','Project / Session':'folder','Arrangement Summary':'chart','Analysis Log':'log'};
  for(const heading of document.querySelectorAll('.prototype-panel-head,.home-panel-head')){
    const title=heading.querySelector('strong')||heading;const icon=headingIcons[title.textContent.trim()];if(icon)prependPrototypeIcon(title,icon);
  }

  if(compactWorkspace.chartWidth===288)compactWorkspace.chartWidth=325;
  if(state.detailPaneWidth===320)state.detailPaneWidth=325;
  prototypeWorkspace.ready=true;document.querySelectorAll('.waveform-lane').forEach(decoratePrototypeTrack);refreshPrototypeControlIcons();syncPrototypeWorkspace();syncPrototypeStudy();renderPrototypeTimeline();arrangePrototypeSource();
})();
