const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const renderer = process.env.SONG_DETAILS_SOURCE || path.join(root, 'src/renderer');
const read = name => fs.readFileSync(path.join(renderer, name), 'utf8');

test('Song navigation is consolidated and original field identities are retained once', () => {
  const html = read('index.html');
  assert.doesNotMatch(html, /data-editor-view="arrange"/);
  assert.match(read('shell.js'), /name === "arrange"/);
  assert.match(read('renderer.js'), /homeGoSongBtn.addEventListener\("click", \(\) => openEditorPanel\("analysis"\)\)/);
  for (const id of ['titleInput','keyInput','tempoInput','timeInput','analysisModeInput','tuningReferenceInput']) {
    assert.equal(html.split(`id="${id}"`).length - 1, 1);
  }
  assert.ok(html.indexOf('./song-details.js') > html.indexOf('./prototype-workspace.js'));
  const prototype = read('prototype-workspace.js');
  for (const obsolete of ['prototypeSongOverview','prototypeArrangementSummary','prototypeSongStems','prototype-song-view']) assert.ok(!prototype.includes(obsolete), obsolete);
});

test('Song Details uses existing input nodes, readonly metadata and session-backed notes', () => {
  const source = read('song-details.js');
  assert.match(source, /elements\.titleInput\.closest\('label'\)/);
  assert.match(source, /elements\.keyInput\.closest\('label'\)/);
  assert.doesNotMatch(source, /cloneNode|innerHTML|state\.chart\.(key|tempo|time_signature)\s*=/);
  assert.match(source, /readOnly\s*=\s*true/);
  assert.match(source, /state\.audio\.comment\s*=/);
  assert.match(read('song-details.css'), /@media\s*\(max-width:860px\)/);
});

// Small DOM double: exercises node movement, listeners and inspector state in Node.
// It deliberately provides no browser, layout engine, audio or backend.
function environment(width=1600, chart=true) {
  const ids=new Map(), listeners={};let active=null;
  class Node {
    constructor(tag='div') {this.tag=tag;this.children=[];this.dataset={};this.attrs={};this.events={};this.value='';this.hidden=false;this.isConnected=true;this.className='';
      this.classList={toggle:(name,on)=>{const list=new Set(this.className.split(' ').filter(Boolean));on?list.add(name):list.delete(name);this.className=[...list].join(' ');},add:name=>this.classList.toggle(name,true)};}
    set id(value){this._id=value;ids.set(value,this);}get id(){return this._id;}
    setAttribute(name,value){this.attrs[name]=value;}removeAttribute(name){delete this.attrs[name];}
    append(...children){for(const child of children){child.remove();child.parentElement=this;this.children.push(child);}}
    replaceChildren(...children){for(const child of [...this.children])child.remove();this.append(...children);}
    remove(){if(this.parentElement){this.parentElement.children=this.parentElement.children.filter(node=>node!==this);this.parentElement=null;}}
    before(node){const parent=this.parentElement,index=parent.children.indexOf(this);node.remove();node.parentElement=parent;parent.children.splice(index,0,node);}
    get lastElementChild(){return this.children.at(-1);}
    closest(selector){return this.tag===selector?this:this.parentElement?.closest(selector);}
    querySelector(selector){const match=node=>selector.startsWith('.')?node.className.split(' ').includes(selector.slice(1)):node.tag===selector;for(const child of this.children){if(match(child))return child;const nested=child.querySelector(selector);if(nested)return nested;}return null;}
    addEventListener(name,callback){(this.events[name]??=[]).push(callback);}
    fire(name){for(const cb of this.events[name]||[])cb({currentTarget:this});}
    focus(){active=this;}getClientRects(){return this.hidden?[]:[1];}scrollIntoView(){}
  }
  const create=(tag,cls='',text='')=>{const n=new Node(tag);n.className=cls;n.textContent=text;return n;};
  const node=id=>{if(!ids.has(id)){const n=create('button');n.id=id;}return ids.get(id);};
  const editor=create('main'),workspace=create('div'),identity=create('div'),meta=create('section'),grid=create('div','meta-grid'),source=create('section'),tools=create('section');
  editor.append(workspace,meta,source,tools);const h1=create('h1');identity.append(h1);
  for(const [panel,text] of [[meta,'Song'],[source,'Source'],[tools,'Edit']]){const head=create('div','section-title');head.append(create('button','collapse-toggle'),create('strong','',text));panel.append(head);}meta.append(grid);
  const elements={editorView:editor,topbarTitle:h1};
  for(const id of ['titleInput','keyInput','tempoInput','timeInput','analysisModeInput','tuningReferenceInput']){const label=create('label'),input=create(id==='keyInput'?'select':'input');input.id=id;elements[id]=input;label.append(input);grid.append(label);}
  grid.append(create('div','audio-preview-control'));
  const originalNodes=[...grid.children];
  const state={currentView:'song',editorPanel:'analysis',selectedIndex:40,selectedChordEventIndex:2,
    chart:chart?{title:'Overjoyed',key:'Bb',tempo:83,time_signature:'4/4',bars:[{chord:'C'}]}:null,
    audio:{name:'source.mp3',title:'Source title',artist:'Stevie Wonder',comment:'Original notes',path:'source.mp3'},sessionPath:'C:/Sessions/Overjoyed.json'};
  const compactWorkspace={detailInspector:false},calls=[];
  const selectors={'.workspace':workspace,'.topbar-identity':identity,'.chart-meta':meta,'.source-panel':source,'.editor-toolbar':tools};
  const context=vm.createContext({console,state,elements,compactWorkspace,innerWidth:width,
    document:{getElementById:id=>ids.get(id)||null,querySelector:s=>selectors[s],get activeElement(){return active;}},
    window:{addEventListener(name,cb){(listeners[name]??=[]).push(cb);}},
    prototypeElement:create,prototypeIcon:name=>create('svg',name),
    prototypeButton(text,action,cls=''){const n=create('button',cls,text);n.addEventListener('click',action);return n;},
    prototypePanel(title){const n=create('section','prototype-panel');n.append(create('div','prototype-panel-head',title),create('div','prototype-panel-body'));return n;},
    hasProject:()=>Boolean(state.audio||state.chart),chartKeyText:c=>c.key,
    createProjectCover:cls=>create('div',cls),refreshPrototypeControlIcons(){},
    setAnalysisSetupOpen(open){calls.push(['setup',open]);},resizeCompactWorkspace(){calls.push(['resize']);},saveCompactWorkspace(){calls.push(['saveLayout']);},
    syncCompactWorkspace(){context.syncSongDetailsVisibility();},openEditorPanel(name){state.editorPanel=name;state.currentView='song';},
  });
  for(const id of ['barDetailInspector','detailInspectorToggle'])node(id);
  vm.runInContext(read('song-details.js'),context,{filename:'song-details.js'});
  return {context,state,elements,compactWorkspace,node,workspace,editor,grid,originalNodes,calls,listeners,active:()=>active,
    open:()=>context.setSongDetailsOpen(true,true,node('songDetailsToggle')),
    close:()=>context.setSongDetailsOpen(false)};
}

for(const width of [1600,1366,600])test(`Song/Bar switching retains selection and preferences at ${width}px (state only)`,()=>{
  const e=environment(width),bar=e.node('barDetailInspector'),panel=e.node('songDetailsInspector');
  assert.equal(panel.hidden,true);
  for(let i=0;i<3;i++){
    e.open();assert.equal(panel.hidden,false);assert.equal(panel.parentElement,e.workspace);assert.equal(bar.inert,true);
    assert.equal(e.node('songDetailsToggle').attrs['aria-expanded'],'true');assert.equal(e.active(),e.node('songDetailsClose'));
    e.close();assert.equal(panel.hidden,true);assert.equal(e.compactWorkspace.detailInspector,false);assert.equal(e.active(),e.node('songDetailsToggle'));
  }
  e.open();assert.equal(e.context.showBarDetailFromSong(),true);assert.equal(panel.hidden,true);assert.equal(e.compactWorkspace.detailInspector,true);
  assert.equal(bar.inert,false);assert.equal(e.state.selectedIndex,40);assert.equal(e.state.selectedChordEventIndex,2);
  if(width===600)assert.equal(e.editor.dataset.mobileDetail,'true');
});

test('the actual original form nodes and listeners survive relocation',()=>{
  const e=environment();
  assert.equal(e.elements.titleInput.closest('label').parentElement,e.grid);
  assert.equal(e.elements.keyInput.closest('label').parentElement.className.includes('song-details-music'),true);
  for(const original of e.originalNodes)assert.ok(original.parentElement,'advanced and musical controls kept');
  let calls=0;e.elements.tempoInput.addEventListener('input',()=>calls++);e.open();e.elements.tempoInput.fire('input');e.close();e.open();assert.equal(calls,1);
  assert.equal(e.node('songDetailsArtist').readOnly,true);assert.equal(e.elements.titleInput.readOnly,false);
});

test('Charts and Lab reuse one overlay and Home info opens Timeline',()=>{
  const e=environment(),panel=e.node('songDetailsInspector');
  for(const route of ['table','study']){e.state.editorPanel=route;e.open();assert.equal(panel.parentElement,e.editor);assert.equal(e.node('songDetailsBarSwitch').hidden,true);e.close();}
  e.state.currentView='home';e.open();assert.equal(e.state.editorPanel,'analysis');assert.equal(panel.parentElement,e.workspace);
  e.state.currentView='help';e.context.syncSongDetails();assert.equal(panel.hidden,true);
});

test('Escape restores focus, Space preserves native forms, empty projects do not open',()=>{
  const e=environment();e.open();let stopped=false,prevented=false;
  const event={key:' ',code:'Space',target:{closest:()=>true},stopPropagation(){stopped=true;},preventDefault(){prevented=true;}};
  e.context.handleSongDetailsKeydown(event);assert.equal(stopped,true);assert.equal(prevented,false);
  e.context.handleSongDetailsKeydown({...event,key:'Escape'});assert.equal(e.node('songDetailsInspector').hidden,true);assert.equal(e.active(),e.node('songDetailsToggle'));
  e.state.chart=null;e.state.audio=null;e.context.syncSongDetails();e.open();assert.equal(e.node('songDetailsInspector').hidden,true);assert.equal(e.node('songDetailsToggle').disabled,true);
});

test('an active modal gets Escape before the background Song Details drawer',()=>{
  const e=environment();e.open();let stopped=false,prevented=false;
  const query=e.context.document.querySelector;
  e.context.document.querySelector=selector=>selector.includes('dialog[open]')?{}:query(selector);
  const event={key:'Escape',target:{closest:()=>null},stopPropagation(){stopped=true;},preventDefault(){prevented=true;}};
  e.listeners.keydown[0](event);
  assert.equal(stopped,false);assert.equal(prevented,false);assert.equal(e.node('songDetailsInspector').hidden,false);
});

test('source metadata is reflowed to one card column and one label/value pair',()=>{
  const css=read('song-details.css');
  assert.match(css, /#songDetailsInspector \.source-info-panel\s*\{[^}]*grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css, /#songDetailsInspector \.source-fields\s*\{[^}]*grid-template-columns:auto minmax\(0,1fr\)/);
});

test('Analysis Setup and Song Details alternate without resetting either form',()=>{
  const e=environment(),setup=e.node('analysisSettingsDock');setup.hidden=true;
  e.node('analysisSetupHide');e.node('analysisSettingsToggle');
  e.context.syncAnalysisWorkspace=()=>e.context.syncSongDetailsVisibility();
  const source=read('analysis-workspace.js'),start=source.indexOf('function setAnalysisSetupOpen('),end=source.indexOf('\nfunction openAnalysisSetup',start);
  vm.runInContext(source.slice(start,end),e.context);
  e.elements.tempoInput.value='99';const bpm=e.node('minBpmInput');bpm.value='72';bpm.checked=true;
  e.open();assert.equal(setup.hidden,true);
  e.context.setAnalysisSetupOpen(true);assert.equal(setup.hidden,false);assert.equal(e.node('songDetailsInspector').hidden,true);
  e.open();assert.equal(setup.hidden,true);assert.equal(e.node('songDetailsInspector').hidden,false);
  assert.equal(e.elements.tempoInput.value,'99');assert.equal(bpm.value,'72');assert.equal(bpm.checked,true);
});

test('audio-only projects keep unbound musical fields readonly and notes editable',()=>{
  const e=environment(600,false);e.open();
  assert.equal(e.elements.titleInput.readOnly,true);assert.equal(e.elements.titleInput.value,'Source title');
  assert.equal(e.elements.tempoInput.readOnly,true);assert.equal(e.node('songHeaderKey').disabled,true);
  e.node('songDetailsNotes').value='Session notes';e.node('songDetailsNotes').fire('input');e.close();e.open();
  assert.equal(e.state.audio.comment,'Session notes');assert.equal(e.node('songDetailsNotes').value,'Session notes');
  e.node('songDetailsNotes').value='';e.node('songDetailsNotes').fire('input');assert.equal(e.state.audio.comment,'');
});

test('changing sessions refreshes focused notes rather than retaining another song text',()=>{
  const e=environment();e.open();const notes=e.node('songDetailsNotes');notes.focus();
  e.state.audio={title:'Another song',comment:'Other notes'};e.context.syncSongDetails();
  assert.equal(notes.value,'Other notes');
});

test('legacy Song route normalizes at the shared route boundary',()=>{
  const source=read('shell.js'),start=source.indexOf('function setEditorPanel(name)'),end=source.indexOf('\nfunction openEditorPanel',start);
  const state={editorPanel:'table',currentView:'song'},elements={editorView:{dataset:{}},navItems:[]};
  const ctx=vm.createContext({state,elements,requestAnimationFrame:()=>{}});vm.runInContext(source.slice(start,end),ctx);
  for(const route of ['arrange',undefined,'analysis']){ctx.setEditorPanel(route);assert.equal(state.editorPanel,'analysis');assert.equal(elements.editorView.dataset.panel,'analysis');}
  for(const route of ['table','study','log']){ctx.setEditorPanel(route);assert.equal(state.editorPanel,route);}
});

test('native session payload saves and restores edited notes and the original musical fields',()=>{
  const e=environment();e.context.updateSongDetailsNotes('Reviewed the bridge');
  Object.assign(e.elements,{analysisModeInput:{value:'fast'},audioPlayer:{currentTime:12,removeAttribute(){}},
    arrangementKeyInput:{},analyzeBtn:{},navItems:[]});
  Object.assign(e.elements.titleInput,{value:'Edited title'});e.elements.keyInput.value='C';e.elements.tempoInput.value='90';e.elements.timeInput.value='3/4';
  Object.assign(e.context,{studyCopy:v=>v,collectAnalysisOptions:()=>({}),chartBarsPerLine:()=>4,
    spreadsheetChartSettings:v=>v||{},melodyNotationSettings:v=>v||{},normalizeStudies:v=>v||[],
    ensureChartKeyState(){},ensureChartTempoState(){},keyOffsetBetween:()=>0,hasChart:()=>Boolean(e.state.chart),
    requestAnimationFrame(){},populateKeyOptions(){}});
  for(const name of ['updateKeyControlState','updateAudioPreviewState','updateKeyInputHint','applyAnalysisOptions','clearStems','updateProjectIdentity','renderSourceInfo','renderBars','renderStems','applyMasterVolume','applyPlaybackRate','applyMetronomeSettings','applyDetailPaneWidth','applyTimelineZoom','updateRowState','updatePlayhead','renderHome'])e.context[name]=()=>{};
  const extract=(file,name,next)=>{const text=read(file),start=text.indexOf(`function ${name}(`),end=text.indexOf(next,start);vm.runInContext(text.slice(start,end),e.context);};
  extract('shell.js','syncMetaToState','\nconst ANALYSIS_PRESETS');
  extract('shell.js','renderMeta','\nfunction createInput');
  extract('shell.js','setEditorPanel','\nfunction openEditorPanel');
  e.context.openEditorPanel=name=>{e.context.setEditorPanel(name);e.state.currentView='song';};
  extract('actions.js','buildSessionPayload','\nasync function saveSession');
  extract('actions.js','restoreSessionPayload','\nasync function openSession()');
  const saved=JSON.parse(JSON.stringify(e.context.buildSessionPayload()));
  assert.equal(saved.audio.comment,'Reviewed the bridge');assert.equal(saved.chart.title,'Edited title');assert.equal(saved.chart.key,'C');assert.equal(saved.chart.tempo,90);assert.equal(saved.chart.time_signature,'3/4');assert.equal(saved.ui.selectedIndex,40);
  saved.ui.editorPanel='arrange';e.context.restoreSessionPayload(saved);e.open();
  assert.equal(e.node('songDetailsNotes').value,'Reviewed the bridge');assert.equal(e.elements.titleInput.value,'Edited title');
  assert.equal(e.elements.tempoInput.value,90);assert.equal(e.elements.timeInput.value,'3/4');assert.equal(e.elements.keyInput.value,'C');assert.equal(e.state.editorPanel,'analysis');
});

test('real saved session musical data survives Song/Bar switches without rewriting the file', {skip:!process.env.CHORDPILOT_QA_SESSION},()=>{
  const original=fs.readFileSync(process.env.CHORDPILOT_QA_SESSION,'utf8'),session=JSON.parse(original);
  for(const width of [1600,1366,600]){
    const e=environment(width);e.state.audio=JSON.parse(JSON.stringify(session.audio));e.state.chart=JSON.parse(JSON.stringify(session.chart));
    const before=JSON.stringify(e.state.chart);e.context.syncSongDetails();
    for(let i=0;i<3;i++){e.open();e.context.showBarDetailFromSong();e.open();e.close();}
    assert.equal(JSON.stringify(e.state.chart),before);
    assert.equal(e.state.chart.bars.length,session.chart.bars.length);
  }
  assert.equal(fs.readFileSync(process.env.CHORDPILOT_QA_SESSION,'utf8'),original);
});
