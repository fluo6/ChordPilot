// Real-renderer geometry and PDF checks for timed chord charts; no reference labels enter analysis.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const out=path.join(root,'outputs/promises-validation/layout');
fs.mkdirSync(out,{recursive:true});
app.setPath('userData',path.join(out,'runtime'));app.disableHardwareAcceleration();
const preload=path.join(out,'preload.cjs');
fs.writeFileSync(preload,`require('electron').contextBridge.exposeInMainWorld('chordPilot',{onBackendLog:()=>()=>{},showMessage:async()=>null});`);
app.whenReady().then(async()=>{
  // Unequal beat intervals make a time-percentage renderer fail this check.
  const chart={title:'Promises — beat placement layout check',key:'E',tempo:154,time_signature:'4/4',duration:8,
    beat_times:[0,.4,1,1.5,2,2.5,3,3.5,4,4.5,5,5.5,6,6.5,7,7.5],
    analysis_engine:{options:{simplify_chords:false}},bars:[
      {number:1,start:0,chord:'E',chord_events:[{start:0,end:.4,chord:'E'},{start:.4,end:1,chord:'D/F#'},{start:1,end:1.5,chord:'E/G#'},{start:1.5,end:2,chord:'Amaj9'}]},
      {number:2,start:2,chord:'F#m11',chord_events:[{start:2,end:2.75,chord:'F#m11'},{start:2.75,end:4,chord:'B13b9'}]},
      {number:3,start:4,chord:'Emaj9',chord_events:[{start:4,end:6,chord:'Emaj9'}]},
      {number:4,start:6,chord:'D13#11',chord_events:[{start:6,end:8,chord:'D13#11'}]}]};
  const snapshot=JSON.stringify({bars:chart.bars,beats:chart.beat_times});
  const win=new BrowserWindow({show:false,width:1500,height:1000,webPreferences:{preload,contextIsolation:true,backgroundThrottling:false}});
  await win.loadFile(path.join(root,'src/renderer/index.html'));
  await win.webContents.executeJavaScript(`window.checkChordLabelCollisions=()=>[...elements.chartPreview.querySelectorAll('.chord-beat-track')].flatMap(track=>{
    const labels=[...track.querySelectorAll('.chord-beat-symbol')].map(e=>({text:e.textContent,box:e.getBoundingClientRect()}));
    return labels.flatMap((a,i)=>labels.slice(i+1).filter(b=>a.box.left<b.box.right+3 && a.box.right+3>b.box.left && a.box.top<b.box.bottom && a.box.bottom>b.box.top).map(b=>a.text+' / '+b.text));
  });void 0;`);
  await win.webContents.executeJavaScript(`state.chart=${JSON.stringify(chart)};state.audio={name:'Promises'};state.selectedIndex=0;state.activeIndex=0;state.selectedChordEventIndex=0;elements.titleInput.value=state.chart.title;elements.keyInput.value=state.chart.key;elements.tempoInput.value=state.chart.tempo;elements.timeInput.value='4/4';elements.simplifyChordsInput.checked=false;renderBars();openEditorPanel('table');`);
  const results=[];
  for(const renderer of ['ireal','grid','chordpro']) for(const density of [2,4]) {
    const result=await win.webContents.executeJavaScript(`(async()=>{
      state.chartRenderer='${renderer}';state.barsPerLine=${density};renderChartPreview();await document.fonts.ready;finishChartLayout();
      const track=elements.chartPreview.querySelector('.chord-beat-track');
      const regions=track?[...track.querySelectorAll('.chord-beat-event')]:[];
      const positions=regions.map(node=>{const a=node.getBoundingClientRect(),b=track.getBoundingClientRect();return (a.left-b.left)/b.width});
      const collisions=window.checkChordLabelCollisions();
      if(track){updateChartPlayback(.45,0);regions[1].click();}
      else elements.chartPreview.querySelectorAll('.chordpro-measure')[1].querySelectorAll('.chordpro-event')[1].click();
      return {renderer:'${renderer}',density:${density},positions,collisions,
        playing:regions.map(e=>e.classList.contains('playing')),seek:elements.audioPlayer.currentTime,
        eventIndex:state.selectedChordEventIndex,unchanged:JSON.stringify({bars:state.chart.bars,beats:state.chart.beat_times})===${JSON.stringify(snapshot)},
        text:elements.chartPreview.textContent};
    })()`);
    if(renderer!=='chordpro') {
      assert.deepEqual(result.positions.map(x=>Math.round(x*100)),[0,25,50,75]);
      assert.deepEqual(result.collisions,[]);
      assert.deepEqual(result.playing,[false,true,false,false]);
      assert.equal(result.eventIndex,1);assert.equal(result.seek,.4);
    } else {
      assert.ok(result.text.includes('B13b9 @2.5 (2.5b)'));
      assert.equal(result.eventIndex,1);assert.equal(result.seek,2.75);
    }
    assert.ok(result.unchanged);
    await win.webContents.executeJavaScript('prepareChartPrint()');
    fs.writeFileSync(path.join(out,`${renderer}-${density}.pdf`),await win.webContents.printToPDF({printBackground:true,preferCSSPageSize:true}));
    if(renderer!=='chordpro') {
      const bounds=await win.webContents.executeJavaScript(`(()=>{const r=elements.chartPreview.getBoundingClientRect();return {x:Math.ceil(r.x),y:Math.ceil(r.y),width:Math.min(1250,Math.floor(r.width)),height:Math.min(650,Math.floor(r.height))}})()`);
      fs.writeFileSync(path.join(out,`${renderer}-${density}.png`),(await win.webContents.capturePage(bounds)).toPNG());
    }
    delete result.text;results.push(result);
  }
  const selectedPath=path.join(out,'../selected.chart.json');
  if(fs.existsSync(selectedPath)) {
    const full=JSON.parse(fs.readFileSync(selectedPath,'utf8'));
    const music={title:full.title,key:full.key,tempo:full.tempo,duration:full.duration,time_signature:full.time_signature,
      beat_times:full.beat_times,analysis_engine:full.analysis_engine,
      bars:full.bars.map(bar=>({number:bar.number,start:bar.start,section:bar.section,chord:bar.chord,
        chord_events:bar.chord_events.map(({start,end,chord})=>({start,end,chord}))}))};
    const actual=await win.webContents.executeJavaScript(`(async()=>{
      state.chart=${JSON.stringify(music)};state.chartRenderer='ireal';state.barsPerLine=2;state.selectedIndex=1;state.activeIndex=1;
      elements.audioPlayer.currentTime=state.chart.bars[1].start;renderChartPreview();await document.fonts.ready;finishChartLayout();
      elements.chartPreview.scrollTop=0;elements.chartPreview.scrollLeft=0;
      const collisions=window.checkChordLabelCollisions();
      return {bars:state.chart.bars.length,collisions,width:elements.chartPreview.firstElementChild.getBoundingClientRect().width};
    })()`);
    assert.equal(actual.bars,101);assert.deepEqual(actual.collisions,[]);assert.ok(actual.width<1500,'Short detections must not make the whole chart excessively wide');
    await win.webContents.executeJavaScript('prepareChartPrint()');
    fs.writeFileSync(path.join(out,'promises-audio-chart.pdf'),await win.webContents.printToPDF({printBackground:true,preferCSSPageSize:true}));
    const bounds=await win.webContents.executeJavaScript(`(()=>{const r=elements.chartPreview.getBoundingClientRect();return {x:Math.ceil(r.x),y:Math.ceil(r.y),width:Math.min(1250,Math.floor(r.width)),height:Math.min(650,Math.floor(r.height))}})()`);
    fs.writeFileSync(path.join(out,'promises-audio-chart.png'),(await win.webContents.capturePage(bounds)).toPNG());
    results.push({actual});
    for(const width of [1700,1100]) {
      win.setSize(width,1000);
      await new Promise(resolve=>setTimeout(resolve,200));
      const collisions=await win.webContents.executeJavaScript('window.checkChordLabelCollisions()');
      assert.deepEqual(collisions,[],`Chord labels collided after resizing to ${width}`);
    }
  }
  fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify(results,null,2));
  console.log('PASS: measured beat geometry, offbeats, duration, seeking, playback, unchanged chart, 6 PDFs');
  win.destroy();app.quit();
}).catch(error=>{console.error(error);app.exit(1)});
