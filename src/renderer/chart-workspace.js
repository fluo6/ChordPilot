// Table presentation and review actions share the existing chart and transport.
const chartWorkspace = {zoom:100, detail:'clean', printing:false};
let chartZoomTimer;

function chartWorkspaceZoom() {
  return chartWorkspace.printing ? 1 : chartWorkspace.zoom / 100;
}

function saveChartWorkspace() {
  try {
    localStorage.setItem('chordpilot.chartWorkspace', JSON.stringify({zoom:chartWorkspace.zoom,detail:chartWorkspace.detail}));
  } catch (_) { /* Presentation still works without local storage. */ }
}

function applyChartWorkspacePresentation() {
  elements.chartPreview.style.setProperty('--chart-zoom', String(chartWorkspaceZoom()));
  elements.editorView.dataset.chartDetail=chartWorkspace.detail;
  document.getElementById('chartZoomInput').value=String(chartWorkspace.zoom);
  document.getElementById('chartZoomOutput').value=`${chartWorkspace.zoom}%`;
  document.getElementById('chartDetailInput').value=chartWorkspace.detail;
  const table=state.chartRenderer==='table';
  document.getElementById('chartZoomInput').disabled=table;
  document.getElementById('chartZoomReset').disabled=table;
  document.getElementById('chartDetailInput').disabled=table;
  document.querySelectorAll('[data-chart-format]').forEach(button=>{
    button.setAttribute('aria-pressed',String(button.dataset.chartFormat===state.chartRenderer));
  });
}

function setCompactChartPrinting(printing) {
  const next=Boolean(printing);
  if(chartWorkspace.printing===next)return;
  clearTimeout(chartZoomTimer);
  chartWorkspace.printing=next;
  applyChartWorkspacePresentation();
  if(!printing)requestAnimationFrame(()=>renderChartPreview());
}

function chartWorkspaceReviewKind() {
  if(state.reviewKind)return state.reviewKind;
  if(state.chartRenderer==='numbered')return 'melody';
  return ['bass','drums','melody'].includes(state.chartRenderer)?state.chartRenderer:'chords';
}

function syncChartSectionSelection() {
  const selected=state.selectedIndex;
  for(const button of document.getElementById('chartSectionNav').children) {
    const index=Number(button.dataset.index),end=Number(button.dataset.endIndex);
    if(selected>=index&&selected<end)button.setAttribute('aria-current','location');
    else button.removeAttribute('aria-current');
  }
}

function syncChartWorkspace() {
  applyChartWorkspacePresentation();
  syncChartSectionSelection();
  renderChartReasonPane();
}

function renderChartWorkspaceInspector(display) {
  const chart=state.chart,bar=getSelectedBar(),host=elements.chartReasonPane;
  if(!chart||!bar||!host)return;
  syncChartSectionSelection();
  const end=barEndTime(state.selectedIndex),kind=chartWorkspaceReviewKind();
  const labels={chords:'chords',bass:'bass notes',drums:'drum hits',melody:'vocal melody'};
  const status=transcriptionReviewStatus(chart,bar,end,kind);
  const node=(tag,text,className='')=>{
    const element=document.createElement(tag);element.textContent=text;element.className=className;return element;
  };
  const context=node('div',`BAR ${bar.number||state.selectedIndex+1} · ${bar.section||'No section'} · ${bar.time_signature||chart.time_signature||'4/4'}`,'chart-review-context');
  const statusNode=node('span',`${labels[kind]} · ${status}`,'chart-review-status');
  statusNode.classList.toggle('is-verified',status==='Verified');
  context.append(statusNode);host.prepend(context);
  const actions=node('div','','chart-review-actions');
  const button=(label,run)=>{
    const element=node('button',label);element.type='button';element.addEventListener('click',run);return element;
  };
  const verify=button(status==='Verified'?'Mark unverified':`Verify ${labels[kind]}`,()=>{
    if(!verifyTranscription(chart,bar,end,kind,status!=='Verified')){
      setStatus('Reset stale edits or refresh analysis before verifying.');return;
    }
    renderBars();
  });
  verify.disabled=(['drums','melody'].includes(kind)&&(!chart[kind]?.ok||chart[kind].stale))
    ||(kind==='bass'&&!hasReviewedBassEvents(chart,bar,end));
  const listen=button('Listen to bar',()=>listenTranscriptionBar(chart,bar,end));
  listen.disabled=!state.audio?.url;
  actions.append(verify,listen,button('Stop',stopTranscriptionListen));
  actions.append(button('Event editor',()=>{
    const editor=document.getElementById('transcriptionReview');editor.open=true;
    editor.scrollIntoView({block:'nearest'});
  }));
  const why=host.querySelector('p');
  host.insertBefore(actions,why);
  const form=node('form','','chart-chord-edit');
  const label=node('label','Correct selected chord');
  const input=document.createElement('input');input.type='text';input.value=display.chord||'';
  input.required=true;input.maxLength=128;input.setAttribute('aria-label','Correct selected chord');
  input.title='Enter a letter-name chord such as Cm7, Fmaj7/A or N.C.';
  label.append(input);
  const submit=node('button','Apply chord');submit.type='submit';
  form.append(label,submit);
  const owner=`${state.selectedIndex}:${state.selectedChordEventIndex}`;
  form.addEventListener('submit',event=>{
    event.preventDefault();
    if(owner!==`${state.selectedIndex}:${state.selectedChordEventIndex}`)return;
    const value=input.value.trim();
    if(!value){input.reportValidity();return;}
    applySelectedChordCorrection('chord',value);renderBars();
  });
  host.insertBefore(form,why);
  if(why){
    const evidence=document.createElement('details');evidence.className='chart-evidence';
    evidence.open=chartWorkspace.detail==='detailed';
    evidence.append(node('summary','Detection evidence'));why.replaceWith(evidence);evidence.append(why);
  }
  const count=chart.bars.filter((item,index)=>transcriptionReviewStatus(chart,item,barEndTime(index),kind)==='Verified').length;
  const progress=node('div',`${count} / ${chart.bars.length} measures verified · ${labels[kind]}`,'chart-review-progress');
  const meter=document.createElement('progress');meter.max=chart.bars.length;meter.value=count;
  meter.setAttribute('aria-label',`Verified ${labels[kind]} measures`);progress.append(meter);host.append(progress);
  if(typeof decoratePrototypeChartInspector==='function')decoratePrototypeChartInspector();
}

(function initializeChartWorkspace(){
  let saved;
  try{saved=JSON.parse(localStorage.getItem('chordpilot.chartWorkspace')||'{}');}catch(_){}
  if(Number.isFinite(saved?.zoom))chartWorkspace.zoom=Math.max(75,Math.min(150,Math.round(saved.zoom/5)*5));
  if(saved?.detail==='detailed')chartWorkspace.detail='detailed';
  document.querySelectorAll('[data-chart-format]').forEach(button=>button.addEventListener('click',()=>{
    elements.chartRendererInput.value=button.dataset.chartFormat;
    elements.chartRendererInput.dispatchEvent(new Event('change'));
  }));
  const zoom=document.getElementById('chartZoomInput');
  const changeZoom=value=>{
    chartWorkspace.zoom=Math.max(75,Math.min(150,Number(value)||100));
    applyChartWorkspacePresentation();saveChartWorkspace();
    clearTimeout(chartZoomTimer);chartZoomTimer=setTimeout(()=>renderChartPreview(),120);
  };
  zoom.addEventListener('input',()=>changeZoom(zoom.value));
  document.getElementById('chartZoomReset').addEventListener('click',()=>changeZoom(100));
  document.getElementById('chartDetailInput').addEventListener('change',event=>{
    chartWorkspace.detail=event.target.value;applyChartWorkspacePresentation();
    saveChartWorkspace();renderChartReasonPane();
  });
  document.getElementById('chartMixerToggle').addEventListener('click',event=>{
    const hidden=elements.editorView.dataset.chartMixer!=='false';
    elements.editorView.dataset.chartMixer=String(!hidden);
    event.currentTarget.setAttribute('aria-expanded',String(!hidden));
  });
  window.addEventListener('afterprint',()=>{if(chartWorkspace.printing)setCompactChartPrinting(false);});
  syncChartWorkspace();
})();
