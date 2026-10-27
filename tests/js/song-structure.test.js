const test = require('node:test');
const assert = require('node:assert/strict');
const {loadScript, plain} = require('./helpers/load-script');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const filename = path.resolve(__dirname, '../../src/renderer/song-structure.js');
function api() { return fs.existsSync(filename) ? loadScript('src/renderer/song-structure.js', ['SongStructure']).SongStructure : {}; }
function chart() { return {duration: 8, source_path: 'mix.wav', bars: [
  {start: 0, section: 'My intro'}, {start: 2, section: 'Verse'},
  {start: 4, section: 'Verse'}, {start: 6, section: 'Ending'}]}; }

test('legacy text survives migration with source-time ownership and no detector scores', () => {
  const s = api(), c = chart();
  assert.equal(typeof s.ensure, 'function'); s.ensure(c);
  assert.deepEqual(plain(s.segments(c).map(x => [x.start,x.end,x.label,x.origin])),
    [[0,2,'My intro','legacy'],[2,6,'Verse','legacy'],[6,8,'Ending','legacy']]);
  assert.equal(c.structure.analysis.status, 'not_analyzed');
  assert.equal(s.segments(c)[1].role, null);
  assert.equal(c.bars[1].section_id, c.bars[2].section_id);
});

test('per-bar edits split the manual interval without changing original estimates or neighbours', () => {
  const s=api(), c=chart(); assert.equal(typeof s.editBar,'function'); s.ensure(c);
  const detected=JSON.stringify(c.structure.analysis); s.editBar(c,2,'Pre-chorus');
  assert.deepEqual(c.bars.map(b=>b.section),['My intro','Verse','Pre-chorus','Ending']);
  assert.equal(JSON.stringify(c.structure.analysis),detected);
  assert.equal(s.segments(c).find(x=>x.start===4).origin,'manual');
  c.bars.splice(1,0,{start:1,section:'wrong cloned label'}); s.project(c,true);
  assert.equal(c.bars[1].section,'My intro'); assert.equal(c.structure.stale,true);
  assert.deepEqual(plain(s.segments(c).map(x=>x.start)),[0,2,4,6]);
});

test('same-source refresh preserves edits by time, while different sources cannot inherit them',()=>{
  const s=api(), before=chart(); assert.equal(typeof s.preserve,'function'); s.ensure(before);
  const after={duration:8,source_path:'mix.wav',bars:[{start:0},{start:4}]}; s.preserve(after,before);
  assert.deepEqual(after.bars.map(b=>b.section),['My intro','Verse']);
  const other={duration:8,source_path:'different.wav',bars:[{start:0}]}; s.preserve(other,before);
  assert.equal(other.structure.manual_segments,null); assert.equal(other.bars[0].section,'Unlabelled');
});

test('content identity permits a moved recording and rejects replacement at the same path',()=>{
  const s=api(),before=chart();s.ensure(before);before.structure.analysis.source_hash='original-content';
  const moved=chart();moved.source_path='moved.wav';moved.structure={version:1,analysis:{status:'not_analyzed',source_hash:'original-content',segments:[{id:'s',start:0,end:8}]},manual_segments:null};
  s.preserve(moved,before);assert.equal(moved.bars[0].section,'My intro');
  const replaced=chart();replaced.structure={version:1,analysis:{status:'not_analyzed',source_hash:'different-content',segments:[{id:'s',start:0,end:8}]},manual_segments:null};
  s.preserve(replaced,before);assert.equal(replaced.structure.manual_segments,null);assert.equal(replaced.bars[0].section,'Unlabelled');
});

test('a failed full refresh retains the last successful automatic structure and current source identity',()=>{
  const s=api(),before=chart();s.ensure(before);s.useDetected(before);
  before.structure.analysis={status:'estimated',source_hash:'same',segments:[{id:'a',start:0,end:4,group:'A'},{id:'b',start:4,end:8,group:'B'}]};s.project(before);
  const after={duration:8,source_path:'mix.wav',bars:[{start:0},{start:4}],structure:{version:1,analysis:{status:'unavailable',source_hash:'same',diagnostics:['failed'],segments:[]},manual_segments:null}};
  s.preserve(after,before);assert.deepEqual(after.bars.map(bar=>bar.section),['A','B']);
  assert.ok(after.structure.analysis.diagnostics.includes('failed'));
});

test('table and detail timing edits use source-time section ownership after sorting',()=>{
  const s=api(),c=chart();s.ensure(c);
  const state={chart:c,selectedIndex:2};
  const loaded=loadScript('src/renderer/bars.js',['updateBarStart'],{SongStructure:s,state,renumberBars:()=>{},setStatus:()=>{}});
  assert.equal(typeof loaded.updateBarStart,'function');
  assert.equal(loaded.updateBarStart(3,3),true);
  assert.equal(c.bars.find(bar=>bar.start===3).section,'Verse');assert.equal(c.structure.stale,true);
});

test('unknown schemas round-trip without mutation and malformed intervals fall back to legacy display',()=>{
  const s=api(), c=chart(); assert.equal(typeof s.ensure,'function');
  c.structure={version:99,extra:'keep me'};const original=JSON.stringify(c);s.ensure(c);assert.equal(JSON.stringify(c),original);
  c.structure={version:1,analysis:{segments:[{id:'bad',start:4,end:2}]},manual_segments:null};
  assert.doesNotThrow(()=>s.ensure(c)); assert.equal(c.bars[0].section,'My intro');
  assert.equal(c.structure.analysis.segments[0].id,'bad');
});

test('manual occurrence operations preserve same-name boundaries and raw automatic evidence',()=>{
  const s=api(),c=chart();assert.equal(typeof s.split,'function');s.ensure(c);
  s.split(c,4);let ids=s.segments(c).filter(x=>x.label==='Verse').map(x=>x.id);
  assert.equal(ids.length,2);assert.notEqual(ids[0],ids[1]);
  s.rename(c,ids[1],'Verse');assert.equal(s.navigation(c).filter(x=>x.name==='Verse').length,2);
  s.joinPrevious(c,ids[1]);assert.equal(s.segments(c).filter(x=>x.label==='Verse').length,1);
  s.useDetected(c);assert.equal(c.structure.manual_segments,null);
  assert.equal(c.bars[0].section,'Unlabelled');
});

test('unavailable automatic analysis still permits manual section correction',()=>{
  const s=api(),c=chart();c.structure={version:1,analysis:{status:'unavailable',segments:[]},manual_segments:null};
  assert.equal(s.editBar(c,1,'Manual verse'),true);
  assert.equal(c.bars[1].section,'Manual verse');
  assert.deepEqual(plain(c.structure.analysis.segments),[]);
});

test('manual role and repeated group changes belong only to the selected occurrence',()=>{
  const s=api(),c=chart();assert.equal(typeof s.setDetails,'function');s.ensure(c);
  const row=s.segments(c)[1];s.setDetails(c,row.id,{label:'',role:'verse',group:'A'});
  assert.equal(c.bars[1].section,'Verse');assert.equal(s.segments(c)[1].group,'A');
  assert.equal(s.segments(c)[0].role,null);assert.equal(s.segments(c)[1].evidence,undefined);
});

test('structure-only refresh keeps current manual edits and rejects stale song completion',async()=>{
  const filename=path.resolve(__dirname,'../../src/renderer/song-structure-ui.js');
  assert.ok(fs.existsSync(filename),'structure controls and refresh action are missing');
  const s=api(),c=chart();let finish;const state={chart:c,audio:{path:'mix.wav'}};s.ensure(c);
  const {refreshSongStructure}=loadScript('src/renderer/song-structure-ui.js',['refreshSongStructure'],{
    SongStructure:s,state,hasChart:()=>true,window:{chordPilot:{analyzeStructure:()=>new Promise(resolve=>{finish=resolve;})}},
    document:{getElementById:()=>null},setAnalysisActive:value=>{state.isAnalyzing=value;},setStatus:()=>{},appendLog:()=>{},renderBars:()=>{},
    showErrorDialog:()=>{}});
  const run=refreshSongStructure();const other=chart();state.chart=other;
  finish({version:1,analysis:{segments:[{id:'a',start:0,end:8,group:'A',role:null}]},manual_segments:null});await run;
  assert.equal(other.structure,undefined);assert.equal(c.bars[0].section,'My intro');
  state.chart=c;const next=refreshSongStructure();s.editBar(c,1,'Edited while running');
  finish({version:1,analysis:{segments:[{id:'a',start:0,end:8,group:'A',role:null}]},manual_segments:null});await next;
  assert.equal(c.bars[1].section,'Edited while running');assert.equal(c.structure.analysis.segments[0].group,'A');
});

test('web refresh rejects different content even when source paths are absent',async()=>{
  const s=api(),c=chart();delete c.source_path;s.ensure(c);c.structure.analysis.source_hash='old';
  const state={chart:c,audio:{path:'opaque-id'}};
  const {refreshSongStructure}=loadScript('src/renderer/song-structure-ui.js',['refreshSongStructure'],{
    SongStructure:s,state,hasChart:()=>true,window:{chordPilot:{analyzeStructure:async()=>({version:1,analysis:{status:'estimated',source_hash:'new',segments:[{id:'a',start:0,end:8,group:'A'}]}})}},
    document:{getElementById:()=>null},setAnalysisActive:x=>{state.isAnalyzing=x;},setStatus:()=>{},appendLog:()=>{},renderBars:()=>{}});
  await refreshSongStructure();assert.equal(c.structure.analysis.source_hash,'old');assert.equal(c.bars[0].section,'My intro');
});

test('per-bar naming covers every canonical occurrence inside the edited measure',()=>{
  const s=api(),c={duration:8,bars:[{start:0},{start:4}],structure:{version:1,analysis:{status:'estimated',segments:[
    {id:'a',start:0,end:2,group:'A'},{id:'b',start:2,end:8,group:'B'}]},manual_segments:null}};
  s.editBar(c,0,'Verse');
  assert.deepEqual(plain(s.segments(c).map(row=>[row.start,row.end,s.label(row)])),[[0,4,'Verse'],[4,8,'B']]);
});

test('future and malformed optional metadata cannot crash the section inspector',()=>{
  const s=api(),c=chart();c.structure={version:99,analysis:{status:{future:true},diagnostics:{representation:'future'}}};
  const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{contains:()=>false});return nodes.get(id);};
  const {renderSongStructureControls}=loadScript('src/renderer/song-structure-ui.js',['renderSongStructureControls'],{
    SongStructure:s,state:{chart:c,selectedIndex:0,audio:{path:'mix.wav'}},window:{chordPilot:{}},formatSeconds:String,
    document:{getElementById:id=>id==='barDetailInspector'?null:node(id),activeElement:null}});
  assert.doesNotThrow(renderSongStructureControls);
  c.structure={version:1,analysis:{status:123,diagnostics:{bad:true},segments:[{id:'a',start:0,end:8}]},manual_segments:null};
  assert.doesNotThrow(renderSongStructureControls);
  for(const version of [1,99])for(const manual_segments of [{future:true},[null]]){
    c.structure={version,analysis:{segments:[{id:'a',start:0,end:8}]},manual_segments};
    const before=JSON.stringify(c);
    assert.doesNotThrow(renderSongStructureControls);
    assert.equal(JSON.stringify(c),before);
  }
});

test('compact navigation and ChordPro retain adjacent same-name occurrence headings',()=>{
  const chart={duration:8,bars:[{start:0,number:1,section:'Verse',section_id:'v1'},{start:4,number:2,section:'Verse',section_id:'v2'}]};
  const nav={dataset:{},children:[],replaceChildren(){this.children=[];},append(child){this.children.push(child);}};
  const context={state:{chart},elements:{editorView:{dataset:{},style:{setProperty(){}}},navItems:[]},
    document:{getElementById:id=>id==='chartSectionNav'?nav:null,querySelector:()=>null,querySelectorAll:()=>[],
      createElement:()=>({dataset:{},addEventListener(){}})}};
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../src/renderer/compact-workspace.js'),'utf8').split('(function initializeCompactWorkspace')[0],context);
  context.syncCompactWorkspace();assert.equal(nav.children.length,2);
  const texts=[];const node=()=>({dataset:{},append(){},appendChild(){},addEventListener(){}});
  const {renderChordProPreview}=loadScript('src/renderer/bars.js',['renderChordProPreview'],{state:{chart},chartKeyText:()=> 'C',
    hasChart:()=>true,getChartDuration:()=>8,secondsPerBar:()=>4,barChordEvents:loadScript('src/renderer/chord-events.js',['barChordEvents']).barChordEvents,
    chordEventsForBar:()=>[],chordBeatLayout:()=>({events:[]}),document:{createElement:node,createTextNode:text=>{texts.push(text);return {};}}});
  renderChordProPreview(node());assert.equal(texts.filter(text=>text==='[Verse]\n').length,2);
});

test('an opaque legacy source identity prevents a web relink from transferring unverified edits',async()=>{
  const s=api(),c=chart();delete c.source_path;s.ensure(c);
  assert.equal(typeof s.bindSource,'function');s.bindSource(c,'original-media');
  const state={chart:c,audio:{path:'replacement-media'}};
  const {refreshSongStructure}=loadScript('src/renderer/song-structure-ui.js',['refreshSongStructure'],{
    SongStructure:s,state,hasChart:()=>true,window:{chordPilot:{analyzeStructure:async()=>({version:1,analysis:{source_hash:'new',segments:[{id:'s',start:0,end:8}]}})}},
    document:{getElementById:()=>null},setAnalysisActive:x=>{state.isAnalyzing=x;},setStatus:()=>{},appendLog:()=>{},renderBars:()=>{}});
  await refreshSongStructure();assert.equal(c.structure.analysis.source_id,'original-media');assert.equal(c.structure.manual_segments[0].label,'My intro');
});

function detectedChart() {
  return {duration:8,source_path:'mix.wav',bars:[{start:0},{start:4}],structure:{version:1,
    analysis:{status:'estimated',source_hash:'same',segments:[
      {id:'a',start:0,end:4,role:'verse',group:'A'},
      {id:'b',start:4,end:8,role:null,group:'B'}]},manual_segments:null}};
}

test('automatic headings use a single convention and mixed naming requires a choice',()=>{
  const s=api(),c=detectedChart(),before=JSON.stringify(c.structure.analysis);
  s.project(c);
  assert.deepEqual(c.bars.map(b=>b.section),['Verse','Unclassified']);
  assert.equal(s.setDisplayMode(c,'groups'),true);
  assert.deepEqual(plain(s.navigation(c).map(r=>r.name)),['A','B']);
  assert.equal(s.setDisplayMode(c,'mixed'),true);
  assert.deepEqual(c.bars.map(b=>b.section),['Verse','B']);
  assert.equal(c.structure.manual_segments,null);
  assert.equal(JSON.stringify(c.structure.analysis),before);
  assert.equal(s.setDisplayMode(c,'invalid'),false);
  assert.equal(c.structure.display_mode,'mixed');
});

test('a saved naming choice survives reopening and same-source full refresh only',()=>{
  const s=api(),before=detectedChart();
  assert.equal(typeof s.setDisplayMode,'function');s.setDisplayMode(before,'groups');
  const reopened=JSON.parse(JSON.stringify(before));s.ensure(reopened);
  assert.deepEqual(reopened.bars.map(b=>b.section),['A','B']);
  const after=detectedChart();s.preserve(after,reopened);
  assert.equal(after.structure.display_mode,'groups');
  assert.deepEqual(after.bars.map(b=>b.section),['A','B']);
  const other=detectedChart();other.structure.analysis.source_hash='different';s.preserve(other,reopened);
  assert.equal(other.structure.display_mode,undefined);
  assert.deepEqual(other.bars.map(b=>b.section),['Verse','Unclassified']);
});

test('group-only detection stays useful and legacy names remain intact until a convention is chosen',()=>{
  const s=api(),c=detectedChart();c.structure.analysis.segments[0].role=null;s.project(c);
  assert.deepEqual(c.bars.map(b=>b.section),['A','B']);
  const legacy=chart();s.ensure(legacy);
  assert.equal(typeof s.setDisplayMode,'function');
  assert.deepEqual(legacy.bars.map(b=>b.section),['My intro','Verse','Verse','Ending']);
  s.setDisplayMode(legacy,'roles');
  assert.deepEqual(legacy.bars.map(b=>b.section),Array(4).fill('Unclassified'));
  assert.equal(legacy.structure.manual_segments[0].label,'My intro');
});

test('structure-only refresh preserves the current naming choice without creating manual answers',async()=>{
  const s=api(),c=detectedChart();assert.equal(typeof s.setDisplayMode,'function');s.setDisplayMode(c,'groups');
  const state={chart:c,audio:{path:'mix.wav'}};
  const {refreshSongStructure}=loadScript('src/renderer/song-structure-ui.js',['refreshSongStructure'],{
    SongStructure:s,state,hasChart:()=>true,window:{chordPilot:{analyzeStructure:async()=>detectedChart().structure}},
    document:{getElementById:()=>null},setAnalysisActive:x=>{state.isAnalyzing=x;},setStatus:()=>{},appendLog:()=>{},renderBars:()=>{}});
  await refreshSongStructure();
  assert.equal(c.structure.display_mode,'groups');
  assert.deepEqual(c.bars.map(b=>b.section),['A','B']);
  assert.equal(c.structure.manual_segments,null);
});
