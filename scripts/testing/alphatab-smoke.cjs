const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),out=process.env.CHORDPILOT_NOTATION_OUTPUT||path.join(root,'tmp','alphatab-smoke');
const fixtureDir=process.env.CHORDPILOT_NOTATION_FIXTURES;
// Synthetic music keeps this smoke runnable after a fresh clone. Optionally
// supply local saved-score snapshots for a full-song transcription check.
function syntheticFixture(kind){
  const bars=Array.from({length:4},(_,index)=>({number:index+1,start:index*2,section:index<2?'Intro':'Verse',chord:'C7',
    chord_events:[{chord:'C7',start:index*2,end:index*2+2}],
    bass_events:[{start:index*2,end:index*2+1,midi:40,attack_start:index*2,confidence:.9}]}));
  const events=bars.flatMap(bar=>[{time:bar.start,instrument:'kick',score:.9},{time:bar.start+.5,instrument:'hihat',score:.9},{time:bar.start+1,instrument:'snare',score:.9}]);
  const melodyEvents=bars.flatMap(bar=>[{start:bar.start,end:bar.start+.5,midi:72},{start:bar.start+.5,end:bar.start+1,midi:72},{start:bar.start+1,end:bar.start+1.5,midi:67}]);
  const chart={title:'Notation smoke',key:'C',key_offset:0,tempo:120,time_signature:'4/4',duration:8,beat_times:Array.from({length:17},(_,i)=>i*.5),bars,drums:{ok:true,events},melody:{ok:true,model:'known-note fixture',events:melodyEvents}};
  const measures=bars.map(bar=>({start:bar.start,end:bar.start+2,chords:bar.chord_events,notes:kind==='melody'?melodyEvents.filter(note=>note.start>=bar.start&&note.start<bar.start+2):bar.bass_events,
    model:{events:events.filter(hit=>hit.time>=bar.start&&hit.time<bar.start+2).map(hit=>({hits:[hit]}))}}));
  return {kind,title:chart.title,chart,measures};
}
const fixtures=fixtureDir?require(path.join(fixtureDir,'fixtures.json')):{bass:syntheticFixture('bass'),drums:syntheticFixture('drums')};
fixtures.melody ||= syntheticFixture('melody');
if(process.env.CHORDPILOT_MELODY_FIXTURE)fixtures.melody=require(path.resolve(process.env.CHORDPILOT_MELODY_FIXTURE));
fs.mkdirSync(out,{recursive:true});app.setPath('userData',path.join(out,'runtime'));app.disableHardwareAcceleration();
const preload=path.join(out,'preload.cjs');
const sessionPath=process.env.CHORDPILOT_MELODY_SESSION;
let services,failNext=false;
if(sessionPath){
  const {createChordPilotServices}=require('../../src/runtime/chordpilot-services');
  const backendScript=path.join(root,'backend/chordpilot.py');
  services=createChordPilotServices({appRoot:root,backendScript,tempDir:path.join(out,'backend'),
    pythonCandidates:[{command:process.env.CHORDPILOT_PYTHON||'python',prefix:[backendScript]}],
    env:process.env,toUrl:file=>require('node:url').pathToFileURL(file).href});
  ipcMain.handle('smoke:open',(_event,file)=>services.readSessionFile(file));
  ipcMain.handle('smoke:save',(_event,session)=>services.writeSessionFile(path.join(out,'saved.chordpilot-session.json'),session));
  ipcMain.handle('smoke:melody',(_event,request)=>{
    if(failNext){failNext=false;throw Error('Injected model failure');}
    return services.analyzeMelody(request);
  });
}
fs.writeFileSync(preload,`const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('chordPilot',{
  onBackendLog:()=>()=>{},showMessage:async()=>null,
  openSessionPath:file=>ipcRenderer.invoke('smoke:open',file),
  saveSession:session=>ipcRenderer.invoke('smoke:save',session),
  analyzeMelody:request=>ipcRenderer.invoke('smoke:melody',request)
});`);
(async()=>{
  await app.whenReady();
  const win=new BrowserWindow({show:false,width:1680,height:1200,webPreferences:{preload,contextIsolation:true,backgroundThrottling:false}}),errors=[];
  const started=Date.now();let phase='load';
  win.webContents.on('console-message',(_event,level,message)=>{if(level>=2&&!message.includes('Electron Security Warning')){
    errors.push(message);console.warn(`${Date.now()-started}ms [${phase}] ${message}`);
  }});
  await win.loadFile(path.join(root,'src/renderer/index.html'));win.webContents.setZoomFactor(.8);
  const evaluate=source=>win.webContents.executeJavaScript(source);
  async function ready(count){
    await evaluate('renderAlphaTabChartPreview()');
    assert.equal(await evaluate("elements.chartPreview.querySelectorAll('.alpha-chart-measure').length"),count);
    assert.ok(await evaluate("!!elements.chartPreview.querySelector('.alpha-chart-engine svg')"));
    assert.equal(await evaluate("!!elements.chartPreview.querySelector('.alpha-chart-error-panel')"),false);
  }
  async function pdf(name){
    await evaluate('prepareChartPrint()');const data=await win.webContents.printToPDF({printBackground:true,preferCSSPageSize:true});
    assert.ok(data.length>10000);fs.writeFileSync(path.join(out,name+'.pdf'),data);
  }
  assert.equal(await evaluate("!!document.getElementById('chartNotationRendererInput')"),false);
  assert.deepEqual(await evaluate("[typeof renderBassChartPreview,typeof renderDrumChartPreview,typeof renderRendererComparison]"),['undefined','undefined','undefined']);
  const records=[];
  if(sessionPath){
    phase='session';
    const original=fs.readFileSync(sessionPath);
    await evaluate(`openSessionPath(${JSON.stringify(path.resolve(sessionPath))})`);
    assert.equal(await evaluate('state.chartRenderer'),'melody');
    const measureCount=await evaluate('state.chart.bars.length');await ready(measureCount);
    const originalEvents=await evaluate('JSON.stringify(state.chart.melody.events)');
    const originalVoiceReview=await evaluate('JSON.stringify(state.chart.melody.voice_review ?? null)');
    // Exercise the real IPC/service/CLI/cache, then a failed job and recovery.
    phase='analysis';
    await evaluate('analyzeMelody()');
    await ready(measureCount);
    assert.equal(await evaluate('state.chart.melody.cached'),true);
    assert.equal(await evaluate('JSON.stringify(state.chart.melody.events)'),originalEvents);
    assert.equal(await evaluate('JSON.stringify(state.chart.melody.voice_review ?? null)'),originalVoiceReview);
    failNext=true;await evaluate('analyzeMelody()');
    await ready(measureCount);
    assert.match(await evaluate('state.melodyError.message'),/Injected model failure/);
    assert.equal(await evaluate('JSON.stringify(state.chart.melody.events)'),originalEvents);
    await evaluate('analyzeMelody()');
    await ready(measureCount);
    assert.equal(await evaluate('state.melodyError'),null);
    await evaluate("(()=>{const select=elements.chartPreview.querySelector('[aria-label=\"Lead sheet rhythm grid\"]');select.value='32';select.dispatchEvent(new Event('change'));})()");
    await ready(measureCount);
    await evaluate("elements.chartPreview.querySelector('.alpha-chart-controls input[type=checkbox]').click()");
    await ready(measureCount);
    assert.deepEqual(await evaluate('state.melodyNotation'),{resolution:32,cleanChords:false});
    assert.equal(await evaluate('JSON.stringify(state.chart.melody.events)'),originalEvents);
    await evaluate('saveSession({saveAs:true})');
    const saved=path.join(out,'saved.chordpilot-session.json');
    assert.ok(fs.existsSync(saved));
    await evaluate(`state.chart=null;state.chartRenderer='ireal';openSessionPath(${JSON.stringify(saved)})`);
    assert.equal(await evaluate('state.chartRenderer'),'melody');
    await ready(measureCount);
    assert.equal(await evaluate('JSON.stringify(state.chart.melody.events)'),originalEvents);
    assert.deepEqual(await evaluate('state.melodyNotation'),{resolution:32,cleanChords:false});
    await evaluate("state.melodyNotation={resolution:16,cleanChords:true};renderChartPreview();true");await ready(measureCount);
    assert.equal(await evaluate('JSON.stringify(state.chart.melody.voice_review ?? null)'),originalVoiceReview);
    assert.deepEqual(fs.readFileSync(sessionPath),original);
    records.push({kind:'melody-ui-job',cache:true,failureRetained:true,saveReopen:true});
  }
  for(const kind of ['bass','drums','melody']){
    phase=kind;
    const fixture=fixtures[kind];
    await evaluate(`state.chart=${JSON.stringify(fixture.chart)};state.audio={title:${JSON.stringify(fixture.title)}};state.chartRenderer='${kind}';state.selectedIndex=0;state.activeIndex=0;state.chartAutoFollow=false;elements.chartRendererInput.value='${kind}';renderBars();openEditorPanel('table');renderChartPreview();true`);
    // Finish worker startup before changing density; cancelling importScripts
    // during setup produces an irrelevant worker-load error on file:// pages.
    await ready(fixture.measures.length);
    if(kind==='melody'){
      const review=await evaluate(`(()=>{
        state.selectedIndex=0;state.reviewKind='melody';state.melodyNotation={resolution:16,cleanChords:true};
        verifyTranscription(state.chart,state.chart.bars[0],barEndTime(0),'melody',true);renderTranscriptionReview();
        const panel=document.getElementById('transcriptionReview'),before=panel.querySelector('summary').textContent;
        const select=elements.chartPreview.querySelector('[aria-label="Lead sheet rhythm grid"]');
        select.value='32';select.dispatchEvent(new Event('change'));
        const after=panel.querySelector('summary').textContent,buttons=[...panel.querySelectorAll('button')].map(node=>node.textContent);
        verifyTranscription(state.chart,state.chart.bars[0],barEndTime(0),'melody',false);
        state.melodyNotation={resolution:16,cleanChords:true};renderTranscriptionReview();renderChartPreview();
        return {before,after,buttons};
      })()`);
      assert.match(review.before,/Verified/);assert.match(review.after,/Needs review/);assert.ok(review.buttons.includes('Mark verified'));
      await ready(fixture.measures.length);
    }
    const before=await evaluate('JSON.stringify(state.chart)');
    if(kind==='melody'){
      const accounting=await evaluate(`(()=>{
        const fixture=AlphaTabScore.buildFixture('melody'),start=fixture.measures[0].start,end=fixture.measures.at(-1).end;
        const missing=[];
        fixture.measures.forEach(measure=>measure.notes.forEach((note,index)=>{
          if(!measure.model.events.some(event=>event.sourceIndex===index)&&!measure.model.diagnostics.some(item=>item.sourceIndex===index))missing.push(note);
        }));
        const source=fixture.chart.melody.events;
        const outside=source.filter(note=>note.start<start||note.end>end);
        const omitted=source.filter(note=>note.start<end&&note.end>start&&!fixture.measures.some(measure=>measure.notes.some(mapped=>
          (mapped.source_start ?? mapped.attack_start)===note.start&&mapped.midi===note.midi+(Number(fixture.chart.key_offset)||0))));
        AlphaTabScore.createScore(alphaTab,fixture,{barsPerLine:chartBarsPerLine()});
        return {missing:missing.length,omitted:omitted.length,outside:outside.length,coverage:melodyCoverageDiagnostics(fixture.chart,start,end).length};
      })()`);
      assert.equal(accounting.missing,0);assert.equal(accounting.omitted,0);assert.equal(accounting.outside,accounting.coverage);
    }
    for(const density of [4,2]){
      await evaluate(`state.barsPerLine=${density};elements.barsPerLineInput.value='${density}';renderChartPreview();true`);await ready(fixture.measures.length);
      const checks=await evaluate(`(()=>{const measures=[...elements.chartPreview.querySelectorAll('.alpha-chart-measure')];state.selectedIndex=0;updateChartPlayback(${fixture.measures[0].start},0);return {rows:[...new Set(measures.map(n=>n.dataset.systemIndex))].map(i=>measures.filter(n=>n.dataset.systemIndex===i).length),notes:elements.chartPreview.querySelectorAll('.alpha-chart-note-hit').length,active:!!elements.chartPreview.querySelector('.alpha-chart-measure.active')};})()`);
      assert.ok(checks.rows.every(n=>n>0&&n<=density));assert.ok(checks.notes>0);assert.equal(checks.active,true);
      assert.ok(await evaluate('elements.chartPreview.scrollWidth<=elements.chartPreview.clientWidth+1'),'no horizontal score overflow');
      const geometry=await evaluate("(()=>{const nodes=[...elements.chartPreview.querySelectorAll('.alpha-chart-measure,.alpha-chart-note-hit')];return {right:Math.max(...nodes.map(node=>parseFloat(node.style.left)+parseFloat(node.style.width))),width:elements.chartPreview.querySelector('.alpha-chart-screen').clientWidth};})()");
      assert.ok(geometry.right<=geometry.width+2,`notation fits parent: ${JSON.stringify(geometry)}`);
      await pdf(`${kind}-${density}`);records.push({kind,density,bars:fixture.measures.length,notes:checks.notes});
      if(kind==='melody'){
        const first=fixture.measures.findIndex(measure=>measure.notes?.length);
        await evaluate(`elements.chartPreview.querySelectorAll('.alpha-chart-measure')[${Math.max(0,first)}].scrollIntoView({block:'start'});true`);
        await new Promise(resolve=>setTimeout(resolve,150));
        fs.writeFileSync(path.join(out,`melody-${density}.png`),(await win.webContents.capturePage()).toPNG());
      }
    }
    const seek=await evaluate(`(()=>{const player=elements.audioPlayer;let time=0;Object.defineProperty(player,'currentTime',{configurable:true,get:()=>time,set:value=>time=value});state.audioPreview={tempoRate:.8};try{elements.chartPreview.querySelector('.alpha-chart-note-hit').click();const note=time;elements.chartPreview.querySelector('.alpha-chart-chord').click();return {note,chord:time};}finally{state.audioPreview=null;delete player.currentTime;}})()`);
    const time=kind!=='drums'?fixture.measures.flatMap(measure=>measure.notes||[])[0].start:fixture.measures[0].model.events.find(e=>e.hits?.length).hits[0].time;
    assert.ok(Math.abs(seek.note-time/.8)<.001);assert.ok(Math.abs(seek.chord-fixture.measures[0].chords[0].start/.8)<.001);
    assert.equal(await evaluate('JSON.stringify(state.chart)'),before);
    // Table refreshes clear the preview; cached alphaTab DOM must be reattached.
    await evaluate('renderBars();renderChartPreview();true');await ready(fixture.measures.length);
    // The shared sidebar still uses its original compact notation and fretboards.
    await evaluate('updateDetailPane();true');
    if(kind!=='melody')assert.ok(await evaluate(`!!elements.${kind==='bass'?'detailBass':'detailDrums'}.querySelector('svg')`),`${kind} sidebar score`);
  }
  // A conversion error must report the problem, block empty PDF exports, and recover.
  await evaluate("window.originalCreateScore=AlphaTabScore.createScore;AlphaTabScore.createScore=()=>{throw Error('Injected rendering failure')};destroyAlphaTabChart();renderAlphaTabChartPreview();true");
  assert.match(await evaluate("elements.chartPreview.querySelector('[role=alert]').textContent"),/Injected rendering failure/);
  assert.equal(await evaluate("elements.chartPreview.querySelector('.alpha-chart-error-panel button').textContent"),'Retry rendering');
  assert.equal(await evaluate("prepareAlphaTabPrint().then(()=>false,()=>true)"),true);
  await evaluate("AlphaTabScore.createScore=window.originalCreateScore;elements.chartPreview.querySelector('.alpha-chart-error-panel button').click();true");await ready(fixtures.melody.measures.length);
  if(fixtureDir){
  const full=require(path.join(fixtureDir,'full-bass-5.json'));full.mode='both';
  await evaluate(`window.originalBuildFixture=AlphaTabScore.buildFixture;window.fullFixture=${JSON.stringify(full)};window.fullFixture.chart={title:window.fullFixture.title,key:window.fullFixture.key,tempo:window.fullFixture.tempo,bars:[],duration:window.fullFixture.measures.at(-1).end};AlphaTabScore.buildFixture=()=>window.fullFixture;state.chartRenderer='bass';elements.chartRendererInput.value='bass';true`);
  for(const density of [4,2]){
    await evaluate(`state.barsPerLine=${density};renderChartPreview();true`);await ready(75);
    assert.equal(await evaluate("elements.chartPreview.querySelectorAll('.alpha-chart-note-hit').length"),497);
    const warning=await evaluate("elements.chartPreview.querySelector('.alpha-chart-diagnostic').textContent");assert.match(warning,/Bar 64.*21/);assert.doesNotMatch(warning,/Bar 41.*27/);
    await pdf('overjoyed-'+density);records.push({kind:'full-overjoyed',density,bars:75,notes:497});
  }
  await evaluate('AlphaTabScore.buildFixture=window.originalBuildFixture;true');
  }
  const fontWarnings=errors.filter(message=>/^\[AlphaTab\]\[Rendering\] Could not load font '.+' within \d+ seconds null$/.test(message));
  // Retain polling warnings separately; independently fail on missing fonts.
  const fonts=await evaluate("document.fonts.ready.then(()=>Object.fromEntries(['alphaTab','Georgia','Arial'].map(font=>[font,document.fonts.check('1em '+font)])))");
  assert.ok(Object.values(fonts).every(Boolean),`all notation fonts available: ${JSON.stringify(fonts)}`);
  const faces=await evaluate("[...document.fonts].filter(face=>face.family.toLowerCase().includes('alphatab')).map(face=>({family:face.family,status:face.status}))");
  assert.ok(faces.some(face=>face.status==='loaded'),`registered alphaTab font is loaded: ${JSON.stringify(faces)}`);
  fs.writeFileSync(path.join(out,'font-check.json'),JSON.stringify({fonts,faces,warnings:fontWarnings},null,2));
  // Chord-only views remove alphaTab's font registration with its DOM.
  for(const kind of ['ireal','grid','table']){
    await evaluate(`state.chartRenderer='${kind}';renderChartPreview();true`);
    assert.equal(await evaluate("!!elements.chartPreview.querySelector('.alpha-chart-engine')"),false);
    if(kind!=='table')assert.ok(await evaluate('elements.chartPreview.children.length>0'));
  }
  const unexpected=errors.filter(message=>!message.includes('Injected rendering failure')&&!fontWarnings.includes(message));
  assert.deepEqual(unexpected,[]);
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(records,null,2));console.log(JSON.stringify(records));
  win.destroy();app.quit();
})().catch(error=>{console.error(error.stack||error);app.exit(1);});
