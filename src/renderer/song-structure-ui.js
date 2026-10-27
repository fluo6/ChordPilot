// Existing Bar Settings hosts the section workflow; no separate workspace.
async function refreshSongStructure() {
  if(!hasChart() || !state.audio?.path || state.isAnalyzing || state.drumBusy || state.melodyBusy || state.study?.busy)return;
  const chart=state.chart,audio=state.audio;
  if(!SongStructure.ensure(chart)){setStatus('This section format cannot be analysed in this version.');return;}
  const currentGrid=()=>({duration:chart.duration,bars:chart.bars.map(bar=>({start:bar.start})),bar_alignment:chart.analysis_engine?.bar_alignment || 'unverified bar grid'});
  const grid=currentGrid();
  const basis=JSON.stringify(grid);
  setAnalysisActive(true,'Detecting song structure…');renderSongStructureControls();
  try {
    const result=await window.chordPilot.analyzeStructure({audioPath:audio.path,grid});
    if(state.chart!==chart || state.audio!==audio)return;
    if(basis!==JSON.stringify(currentGrid())){
      setStatus('Bar timing changed during structure analysis. Run it again on the current grid.');return;
    }
    if(result?.version!==1 || !SongStructure.valid(result.analysis?.segments,chart.duration))throw Error('No valid section estimate was returned. Previous sections were retained.');
    const oldHash=chart.structure.analysis?.source_hash,newHash=result.analysis.source_hash;
    const previousSource=chart.structure.analysis?.source_id || chart.source_path;
    if(oldHash && oldHash!==newHash || previousSource && previousSource!==audio.path && (!oldHash || oldHash!==newHash))
      throw Error('The linked audio differs from the section source. Open it as a new project to avoid transferring another song’s edits.');
    chart.structure={...result,display_mode:chart.structure.display_mode,manual_segments:chart.structure.manual_segments,stale:false};
    chart.structure.analysis.source_id=audio.path;
    SongStructure.project(chart);renderBars();
    setStatus(`Detected ${result.analysis.segments.length} sections · experimental${chart.structure.manual_segments ? ' · your section edits remain active' : ''}`);
  } catch(error) {
    if(state.chart===chart && state.audio===audio){setStatus(error.message);appendLog(`structure: ${error.message}`);}
  } finally {
    setAnalysisActive(false);renderSongStructureControls();
  }
}

function setSelectedSongSectionRole(role) {
  const chart=state.chart,form=document.getElementById('songStructureForm');
  if(!form || form._chart!==chart || form._id!==chart?.bars?.[state.selectedIndex]?.section_id
    || state.isAnalyzing || state.drumBusy || state.melodyBusy || state.study?.busy)return false;
  const row=SongStructure.segments(chart).find(item=>item.id===form._id);
  if(!row || !SongStructure.setDetails(chart,row.id,{label:'',role,group:row.group}))return false;
  SongStructure.setDisplayMode(chart,'roles');
  document.getElementById('songSectionName').value='';
  renderBars();return true;
}

function setupSongStructureControls() {
  const host=elements.detailSectionInput?.closest('.detail-section-content') || elements.detailSectionInput?.closest('label')?.parentElement;
  if(!host || document.getElementById('songStructureControls'))return;
  const node=(tag,text)=>{const element=document.createElement(tag);if(text)element.textContent=text;return element;};
  const panel=node('fieldset');panel.id='songStructureControls';panel.className='song-structure-controls';
  panel.append(node('legend','Song structure'));
  const naming=node('select');naming.id='songStructureNaming';
  for(const [value,text] of [['roles','Named roles'],['groups','A / B / C groups'],['mixed','Mixed roles, groups and custom names']]){
    const option=node('option',text);option.value=value;naming.append(option);
  }
  const namingLabel=node('label','Section names');namingLabel.append(naming);panel.append(namingLabel);
  naming.addEventListener('change',()=>{
    if(SongStructure.setDisplayMode(state.chart,naming.value))renderBars();
  });
  const status=node('p');status.id='songStructureStatus';status.setAttribute('aria-live','polite');panel.append(status);
  const form=node('form');form.id='songStructureForm';
  const name=node('input');name.id='songSectionName';name.type='text';name.maxLength=160;
  const nameLabel=node('label','Custom name (mixed naming)');nameLabel.append(name);
  const role=node('select');role.id='songSectionRole';
  for(const value of ['', 'intro','verse','pre_chorus','chorus','post_chorus','bridge','interlude','solo','instrumental','breakdown','outro']){
    const option=node('option',value ? value.replace(/_/g,' ').replace(/^./,c=>c.toUpperCase()) : 'Unknown');option.value=value;role.append(option);
  }
  const roleLabel=node('label','Section name');roleLabel.append(role);
  role.title='Applies immediately to this section. Saved with the session; Use detected sections restores the estimates.';
  role.addEventListener('change',()=>setSelectedSongSectionRole(role.value));
  panel.append(roleLabel);
  const group=node('input');group.id='songSectionGroup';group.type='text';group.maxLength=4;group.pattern='[A-Za-z]{1,4}';
  group.title='Repeated group, such as A or B. Leave blank for unknown.';
  const groupLabel=node('label','Repeated group');groupLabel.append(group);
  const apply=node('button','Apply to this section');apply.type='submit';form.append(nameLabel,groupLabel,apply);
  form.addEventListener('submit',event=>{
    event.preventDefault();if(form._chart!==state.chart || form._id!==state.chart?.bars[state.selectedIndex]?.section_id)return;
    if(SongStructure.setDetails(state.chart,form._id,{label:name.value,role:role.value,group:group.value.trim().toUpperCase()}))renderBars();
  });
  const actions=node('div');actions.className='song-structure-actions';
  for(const [id,text,run] of [
    ['songSectionSplit','Start section here',()=>SongStructure.split(state.chart,Number(state.chart.bars[state.selectedIndex]?.start))],
    ['songSectionJoin','Join previous section',()=>SongStructure.joinPrevious(state.chart,state.chart.bars[state.selectedIndex]?.section_id)],
    ['songSectionDetected','Use detected sections',()=>SongStructure.useDetected(state.chart)],
    ['songSectionDetect','Detect sections (experimental)',refreshSongStructure]
  ]){
    const button=node('button',text);button.type='button';button.id=id;
    button.addEventListener('click',()=>{if(id==='songSectionDetect'){run();return;}run();renderBars();});actions.append(button);
  }
  panel.addEventListener('keydown',event=>{if(event.code==='Space'||event.key==='Enter')event.stopPropagation();});
  panel.append(form,actions);host.append(panel);renderSongStructureControls();
}

function renderSongStructureControls() {
  const panel=document.getElementById('songStructureControls');if(!panel)return;
  const chart=state.chart,bar=chart?.bars?.[state.selectedIndex],rows=SongStructure.segments(chart);
  const row=rows.find(item=>item.id===bar?.section_id),busy=state.isAnalyzing||state.drumBusy||state.melodyBusy||state.study?.busy;
  const form=document.getElementById('songStructureForm');
  panel.disabled=Boolean(busy);form.hidden=!row;
  document.getElementById('songSectionRole').disabled=!row || Boolean(busy);
  const analysis=chart?.structure?.version===1 ? chart.structure.analysis : null;
  const evidence=row?.evidence;
  const score=evidence?.repeat_score;
  const naming=document.getElementById('songStructureNaming');
  naming.value=SongStructure.displayMode(chart);naming.disabled=!SongStructure.ensure(chart);
  const display=row ? `${SongStructure.label(row,SongStructure.displayMode(chart))} · ${formatSeconds(row.start)}–${formatSeconds(row.end)} s · ${row.origin || 'automatic'}` : 'No editable section';
  const projected=row && row.start>0 && row.start!==Number(chart?.bars?.find(item=>Number(item.start)>=row.start)?.start);
  const details=[typeof analysis?.status==='string'?analysis.status.replace(/_/g,' '):null,chart?.structure?.stale?'timing basis changed':null,
    projected?'section time lies inside a bar; chart heading uses the following bar':null,
    chart?.structure?.manual_segments && analysis?.status==='estimated'?'manual sections active; estimates available':null,
    Number.isFinite(score)?`repeat similarity ${score.toFixed(2)} (evidence score)`:null];
  document.getElementById('songStructureStatus').textContent=[display,...details.filter(Boolean)].join(' · ');
  document.getElementById('songStructureStatus').title=(Array.isArray(analysis?.diagnostics)?analysis.diagnostics.filter(item=>typeof item==='string'):[]).join('\n');
  if(!form.contains(document.activeElement) || form._chart!==chart || form._id!==row?.id){
    document.getElementById('songSectionName').value=row?.label || '';
    document.getElementById('songSectionRole').value=row?.role || '';
    document.getElementById('songSectionGroup').value=row?.group || '';
  }
  form._chart=chart;form._id=row?.id;
  document.getElementById('songSectionSplit').disabled=!row || !(Number(bar.start)>row.start && Number(bar.start)<row.end);
  document.getElementById('songSectionJoin').disabled=!row || rows[0]===row;
  document.getElementById('songSectionDetected').disabled=!chart?.structure?.manual_segments || !SongStructure.valid(analysis?.segments,chart?.duration);
  document.getElementById('songSectionDetect').disabled=!bar || !state.audio?.path || !window.chordPilot.analyzeStructure || !SongStructure.ensure(chart);
}

if(typeof document!=='undefined' && document.getElementById('barDetailInspector'))setupSongStructureControls();
