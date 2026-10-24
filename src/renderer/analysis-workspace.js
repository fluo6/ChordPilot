// Analysis layout reuses the existing settings, stem lanes and inspector nodes.
function setAnalysisSetupOpen(open, focus = true, trigger = null) {
  const panel = document.getElementById('analysisSettingsDock');
  if (!panel) return;
  if(open&&typeof setSongDetailsOpen==='function')setSongDetailsOpen(false,false);
  const wasOpen = !panel.hidden;
  if (open && !wasOpen) panel._returnFocus = trigger || document.activeElement;
  panel.hidden = !open;
  panel.classList.toggle('collapsed', !open);
  panel.setAttribute('aria-hidden', String(!open));
  syncAnalysisWorkspace();
  if (open && focus) document.getElementById('analysisSetupHide').focus({preventScroll:true});
  else if (wasOpen && focus) {
    const target = panel._returnFocus;
    (target?.isConnected && target.getClientRects().length ? target : document.getElementById('analysisSettingsToggle')).focus({preventScroll:true});
  }
}

function openAnalysisSetup(event) {
  if (!hasProject()) { setStatus('Choose audio or open a session before analysis.'); return; }
  openEditorPanel('analysis');
  setAnalysisSetupOpen(true, true, event?.currentTarget);
}

function handleAnalysisSetupKeydown(event) {
  if(event.key==='Escape'&&!event.defaultPrevented){
    event.preventDefault();event.stopPropagation();setAnalysisSetupOpen(false);
  } else if((event.code==='Space'||event.key==='Enter')&&event.target.closest('input,select,textarea,button,summary')) {
    // Keep native form activation; the global Space shortcut controls playback.
    event.stopPropagation();
  }
}

function syncAnalysisWorkspace() {
  const panel=document.getElementById('analysisSettingsDock');
  if(!panel)return;
  const open=!panel.hidden;
  for (const id of ['analysisSettingsToggle','analysisOpenSetupBtn','analyzeBtn']) {
    document.getElementById(id)?.setAttribute('aria-expanded',String(open));
  }
  document.getElementById('analysisDockModeInput').value=elements.analysisModeInput.value;
  document.getElementById('analysisPreviousBar').disabled=!hasChart()||state.selectedIndex<=0;
  document.getElementById('analysisNextBar').disabled=!hasChart()||state.selectedIndex>=state.chart.bars.length-1;
  const busy=state.isAnalyzing||state.drumBusy||state.melodyBusy||state.study?.busy;
  document.getElementById('analysisOpenSetupBtn').disabled=!hasProject()||busy;
  if (typeof syncPrototypeResponsiveButtons === 'function') syncPrototypeResponsiveButtons();
}

function analysisDefaultTrackHeight() {
  if(state.editorPanel!=='analysis'||!state.chart)return 56;
  const viewport=elements.timelineViewport;
  const fixed=[elements.chordLane,elements.lyricLane,elements.beatLane].reduce((total,lane)=>
    total+(lane.hidden?0:lane.offsetHeight+4),0);
  const count=1+(state.chart.stems?.ok?state.chart.stems.stems?.length||0:0);
  return Math.max(56,Math.min(112,Math.floor((viewport.clientHeight-fixed-(document.getElementById('prototypeTimelineHeaders')?.offsetHeight||0)-16-4*(count-1))/count)));
}

(function initializeAnalysisWorkspace(){
  const byId=id=>document.getElementById(id);
  const node=(tag,className='')=>{const element=document.createElement(tag);element.className=className;return element;};
  const panel=document.querySelector('.analysis-options'),workspace=document.querySelector('.workspace');
  panel.id='analysisSettingsDock';panel.hidden=true;panel.classList.add('collapsed');workspace.prepend(panel);
  panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','false');panel.setAttribute('aria-labelledby','analysisSetupTitle');
  const heading=panel.querySelector('.section-title strong');heading.id='analysisSetupTitle';heading.textContent='Analysis Setup';
  panel.querySelector('.collapse-toggle').remove();
  const hide=node('button');hide.id='analysisSetupHide';hide.type='button';hide.textContent='Hide';
  hide.title='Hide Analysis Setup; reopen it from Settings or Analyze';hide.addEventListener('click',()=>setAnalysisSetupOpen(false));
  panel.querySelector('.section-title').append(hide);
  panel.addEventListener('keydown',handleAnalysisSetupKeydown);
  panel.querySelector('[data-study-current]')?.remove(); // The shared transport keeps the same action.
  const grid=panel.querySelector('.options-grid');
  const preset=panel.querySelector('.analysis-preset-row');
  const hint=byId('analysisPresetHint');
  const help=node('details','analysis-preset-help');
  const helpTitle=node('summary');helpTitle.textContent='About this preset';help.append(helpTitle,hint);preset.append(help);
  const modeLabel=node('label');modeLabel.textContent='Separation mode';
  const mode=node('select');mode.id='analysisDockModeInput';mode.setAttribute('aria-label','Analysis separation mode');
  for(const option of elements.analysisModeInput.options)mode.append(option.cloneNode(true));
  modeLabel.append(mode);
  mode.addEventListener('change',()=>{
    elements.analysisModeInput.value=mode.value;
    elements.analysisModeInput.dispatchEvent(new Event('change'));
  });
  elements.analysisModeInput.addEventListener('change',()=>{mode.value=elements.analysisModeInput.value;});
  const groups=[
    ['Sources & stems',[modeLabel,'chordSourceInput','demucsModelInput','useCacheInput'],false],
    ['Timing & key',['rhythmEngineInput','analysisKeyInput','minBpmInput','maxBpmInput','beatOffsetInput','barPhaseInput','onsetFrameInput','onsetHopInput'],false],
    ['Chords & filtering',['chordTimingInput','chordGridInput','chordStabilityInput','alternativesInput','chromaLowInput','chromaHighInput','tailReductionInput','tailHalfLifeInput','overtoneWeightingInput','simplifyChordsInput'],false],
    ['Lyrics',['lyricsEnabledInput','lyricsSourceInput','lyricsModelInput','lyricsLanguageInput'],false]
  ];
  const sections=[];
  for(const [title,controls,open] of groups){
    const section=node('details','analysis-settings-group');section.open=open;
    const summary=node('summary');summary.textContent=title;
    const fields=node('fieldset','option-group');fields.setAttribute('aria-label',title);
    const content=node('div','option-group-grid');
    for(const control of controls){
      const label=typeof control==='string'?byId(control).closest('label'):control;
      content.append(label);
    }
    fields.append(content);section.append(summary,fields);sections.push(section);
  }
  grid.replaceChildren(preset,...sections);
  const actions=panel.querySelector('.reanalysis-actions');
  actions.setAttribute('aria-label','Run or refresh analysis');

  const head=document.querySelector('.timeline-head');
  const title=node('div','analysis-lane-title'),tools=node('div','analysis-lane-tools');
  head.querySelector('strong').textContent='Timeline';
  const analyze=node('button');analyze.id='analysisOpenSetupBtn';analyze.type='button';analyze.textContent='Analyze';
  analyze.dataset.analysisSetup='';
  analyze.title='Choose analysis targets and review settings before running';analyze.setAttribute('aria-controls',panel.id);analyze.setAttribute('aria-expanded','false');
  analyze.addEventListener('click',openAnalysisSetup);
  title.append(head.querySelector('.collapse-toggle'),head.querySelector('strong'),byId('timelineSummary'),byId('analysisSettingsToggle'),analyze,byId('detailInspectorToggle'));
  const playback=head.querySelector('.arrangement-playback-controls');
  const click=playback.querySelector('.arrangement-metronome-toggle');
  tools.append(head.querySelector('.timeline-follow'),click,head.querySelector('.timeline-zoom'),head.querySelector('.waveform-view-controls'));
  const playbackMenu=node('details','analysis-playback-menu');
  const playbackTitle=node('summary');playbackTitle.textContent='Playback options';
  playbackMenu.append(playbackTitle,playback);tools.append(playbackMenu);head.replaceChildren(title,tools);

  const navigation=node('div','analysis-inspector-navigation');
  const previous=node('button');previous.id='analysisPreviousBar';previous.type='button';previous.textContent='‹';previous.title='Inspect previous bar';previous.setAttribute('aria-label',previous.title);
  const next=node('button');next.id='analysisNextBar';next.type='button';next.textContent='›';next.title='Inspect next bar';next.setAttribute('aria-label',next.title);
  const jump=node('select');jump.setAttribute('aria-label','Jump to Bar Detail section');
  const placeholder=node('option');placeholder.value='';placeholder.textContent='Jump to detail…';jump.append(placeholder);
  for(const section of document.querySelectorAll('#barDetailInspector .detail-section')){
    const option=node('option');option.value=section.dataset.section;
    option.textContent=section.querySelector('summary strong').textContent;jump.append(option);
  }
  previous.addEventListener('click',()=>selectBar(state.selectedIndex-1,false));
  next.addEventListener('click',()=>selectBar(state.selectedIndex+1,false));
  jump.addEventListener('change',()=>{
    const section=document.querySelector(`#barDetailInspector .detail-section[data-section="${jump.value}"]`);
    if(section){section.open=true;section.scrollIntoView({block:'nearest'});section.querySelector('summary').focus({preventScroll:true});}
    jump.value='';
  });
  navigation.append(previous,jump,next);
  const inspector=byId('barDetailInspector');inspector.querySelector('.detail-title').after(navigation);
  byId('analysisSettingsToggle').title='Open Analysis Setup';
  byId('analysisSettingsToggle').dataset.analysisSetup='';
  byId('analysisSettingsToggle').addEventListener('click',openAnalysisSetup);
  elements.analyzeBtn.title='Choose analysis targets and review settings before running';
  elements.analyzeBtn.dataset.analysisSetup='';
  elements.analyzeBtn.setAttribute('aria-controls',panel.id);
  for(const summary of panel.querySelectorAll('summary'))summary.addEventListener('keydown',event=>{
    if(event.code==='Space'||event.key==='Enter')event.stopPropagation();
  });
  playbackTitle.addEventListener('keydown',event=>{
    if(event.code==='Space'||event.key==='Enter')event.stopPropagation();
  });
  window.addEventListener('keydown',event=>{if(event.key==='Escape')playbackMenu.open=false;});
  setAnalysisSetupOpen(false, false);
})();
