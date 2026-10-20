const {app,BrowserWindow}=require('electron');
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
  const chart={title:'Notation smoke',key:'C',key_offset:0,tempo:120,time_signature:'4/4',duration:8,beat_times:Array.from({length:17},(_,i)=>i*.5),bars,drums:{ok:true,events}};
  const measures=bars.map(bar=>({start:bar.start,end:bar.start+2,chords:bar.chord_events,notes:bar.bass_events,
    model:{events:events.filter(hit=>hit.time>=bar.start&&hit.time<bar.start+2).map(hit=>({hits:[hit]}))}}));
  return {kind,title:chart.title,chart,measures};
}
const fixtures=fixtureDir?require(path.join(fixtureDir,'fixtures.json')):{bass:syntheticFixture('bass'),drums:syntheticFixture('drums')};
fs.mkdirSync(out,{recursive:true});app.setPath('userData',path.join(out,'runtime'));app.disableHardwareAcceleration();
const preload=path.join(out,'preload.cjs');
fs.writeFileSync(preload,"require('electron').contextBridge.exposeInMainWorld('chordPilot',{onBackendLog:()=>()=>{},showMessage:async()=>null});");
(async()=>{
  await app.whenReady();
  const win=new BrowserWindow({show:false,width:1680,height:1200,webPreferences:{preload,contextIsolation:true,backgroundThrottling:false}}),errors=[];
  win.webContents.on('console-message',(_event,level,message)=>{if(level>=2&&!message.includes('Electron Security Warning'))errors.push(message);});
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
  for(const kind of ['bass','drums']){
    const fixture=fixtures[kind];
    await evaluate(`state.chart=${JSON.stringify(fixture.chart)};state.audio={title:${JSON.stringify(fixture.title)}};state.chartRenderer='${kind}';state.selectedIndex=0;state.activeIndex=0;state.chartAutoFollow=false;elements.chartRendererInput.value='${kind}';renderBars();openEditorPanel('table');renderChartPreview();true`);
    const before=await evaluate('JSON.stringify(state.chart)');
    for(const density of [4,2]){
      await evaluate(`state.barsPerLine=${density};elements.barsPerLineInput.value='${density}';renderChartPreview();true`);await ready(fixture.measures.length);
      const checks=await evaluate(`(()=>{const measures=[...elements.chartPreview.querySelectorAll('.alpha-chart-measure')];state.selectedIndex=0;updateChartPlayback(${fixture.measures[0].start},0);return {rows:[...new Set(measures.map(n=>n.dataset.systemIndex))].map(i=>measures.filter(n=>n.dataset.systemIndex===i).length),notes:elements.chartPreview.querySelectorAll('.alpha-chart-note-hit').length,active:!!elements.chartPreview.querySelector('.alpha-chart-measure.active')};})()`);
      assert.ok(checks.rows.every(n=>n>0&&n<=density));assert.ok(checks.notes>0);assert.equal(checks.active,true);
      await pdf(`${kind}-${density}`);records.push({kind,density,bars:fixture.measures.length,notes:checks.notes});
    }
    const seek=await evaluate(`(()=>{const player=elements.audioPlayer;let time=0;Object.defineProperty(player,'currentTime',{configurable:true,get:()=>time,set:value=>time=value});state.audioPreview={tempoRate:.8};try{elements.chartPreview.querySelector('.alpha-chart-note-hit').click();const note=time;elements.chartPreview.querySelector('.alpha-chart-chord').click();return {note,chord:time};}finally{state.audioPreview=null;delete player.currentTime;}})()`);
    const time=kind==='bass'?fixture.measures[0].notes[0].start:fixture.measures[0].model.events.find(e=>e.hits?.length).hits[0].time;
    assert.ok(Math.abs(seek.note-time/.8)<.001);assert.ok(Math.abs(seek.chord-fixture.measures[0].chords[0].start/.8)<.001);
    assert.equal(await evaluate('JSON.stringify(state.chart)'),before);
    // Table refreshes clear the preview; cached alphaTab DOM must be reattached.
    await evaluate('renderBars();renderChartPreview();true');await ready(fixture.measures.length);
    // The shared sidebar still uses its original compact notation and fretboards.
    await evaluate('updateDetailPane();true');
    assert.ok(await evaluate(`!!elements.${kind==='bass'?'detailBass':'detailDrums'}.querySelector('svg')`),`${kind} sidebar score`);
  }
  // A conversion error must report the problem, block empty PDF exports, and recover.
  await evaluate("window.originalCreateScore=AlphaTabScore.createScore;AlphaTabScore.createScore=()=>{throw Error('Injected rendering failure')};destroyAlphaTabChart();renderAlphaTabChartPreview();true");
  assert.match(await evaluate("elements.chartPreview.querySelector('[role=alert]').textContent"),/Injected rendering failure/);
  assert.equal(await evaluate("elements.chartPreview.querySelector('.alpha-chart-error-panel button').textContent"),'Retry rendering');
  assert.equal(await evaluate("prepareAlphaTabPrint().then(()=>false,()=>true)"),true);
  await evaluate("AlphaTabScore.createScore=window.originalCreateScore;elements.chartPreview.querySelector('.alpha-chart-error-panel button').click();true");await ready(fixtures.drums.measures.length);
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
  // Chord-only views are independent of the removed instrument renderer selector.
  for(const kind of ['ireal','grid','table']){
    await evaluate(`state.chartRenderer='${kind}';renderChartPreview();true`);
    assert.equal(await evaluate("!!elements.chartPreview.querySelector('.alpha-chart-engine')"),false);
    if(kind!=='table')assert.ok(await evaluate('elements.chartPreview.children.length>0'));
  }
  const unexpected=errors.filter(message=>!message.includes('Injected rendering failure'));
  assert.deepEqual(unexpected,[]);
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(records,null,2));console.log(JSON.stringify(records));
  win.destroy();app.quit();
})().catch(error=>{console.error(error.stack||error);app.exit(1);});
