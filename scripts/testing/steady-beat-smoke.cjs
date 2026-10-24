// Headless comparison of saved timing and audio-only candidate beat grids.
// Run after steady-beat-benchmark.py; all artifacts stay in its output folder.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
const out=path.resolve(process.env.CHORDPILOT_BEAT_BENCHMARK_OUTPUT||path.join(root,'.tool-cache/melody/cross-song-beats'));
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
app.setPath('userData',path.join(out,'native-profile'));app.disableHardwareAcceleration();
const preload=path.join(out,'preload.cjs');fs.writeFileSync(preload,"require('electron').contextBridge.exposeInMainWorld('chordPilot',{onBackendLog:()=>()=>{},showMessage:async()=>null});");
(async()=>{
  await app.whenReady();
  const win=new BrowserWindow({show:false,width:1600,height:1150,webPreferences:{preload,contextIsolation:true,backgroundThrottling:false}});
  const errors=[],records=[];
  win.webContents.on('console-message',(_event,level,message)=>{if(level>=2&&!message.includes('Electron Security Warning')){errors.push(message);console.error(message);}});
  await win.loadFile(path.join(root,'src/renderer/index.html'));
  const run=source=>win.webContents.executeJavaScript(source);
  const songs=JSON.parse(fs.readFileSync(path.join(out,'results.json'),'utf8'));
  for(let song=0;song<songs.length;song++){
    const info=songs[song],source=fs.readFileSync(info.session);
    assert.equal(digest(source),info.input_sha256,'Input changed before native checks');
    const original=JSON.parse(source.toString('utf8').replace(/^\uFEFF/,''));
    const folder=path.join(out,'song-'+(song+1));
    const candidate=JSON.parse(fs.readFileSync(path.join(folder,'chart.json'),'utf8'));
    const preparedPath=path.join(out,'prepared',`song-${song+1}.chordpilot-session.json`);
    let preparedSessionSha256;
    if(fs.existsSync(preparedPath)){
      const preparedBytes=fs.readFileSync(preparedPath);
      assert.equal(JSON.stringify(JSON.parse(preparedBytes.toString('utf8')).chart),JSON.stringify(candidate),'Prepared session/chart differ');
      preparedSessionSha256=digest(preparedBytes);
    }
    for(const [version,chart] of [['saved',original.chart],['candidate',candidate]]){
      await run(`destroyAlphaTabChart();state.chart=${JSON.stringify(chart)};state.audio={title:state.chart.title};state.selectedIndex=0;state.activeIndex=0;state.chartAutoFollow=false;state.melodyNotation={resolution:16,cleanChords:true};state.reviewKind=null;openEditorPanel('table');true`);
      const kinds=chart.melody?.ok?['numbered','melody']:chart.bars.some(b=>b.bass_events?.length)?['bass']:['numbered'];
      for(const kind of kinds)for(const density of [4,2]){
        await run(`state.chartRenderer='${kind}';elements.chartRendererInput.value='${kind}';state.barsPerLine=${density};elements.barsPerLineInput.value='${density}';renderChartPreview();true`);
        const empty=kind==='numbered'&&!chart.melody?.ok;
        if(kind!=='numbered')await run('renderAlphaTabChartPreview()');
        await run('document.fonts.ready');
        const check=await run(`(()=>{const panel=elements.chartPreview,sheet=panel.querySelector('${kind==='numbered'?'.numbered-chart':'.alpha-chart'}');
          const count=panel.querySelectorAll('${kind==='numbered'?'.numbered-chart-measure':'.alpha-chart-measure'}').length;
          return {count,overflow:sheet.scrollWidth-sheet.clientWidth,error:!!panel.querySelector('.alpha-chart-error-panel'),empty:panel.textContent.includes('Select Analyse Melody')};})()`);
        assert.equal(check.error,false);assert.ok(check.overflow<2);assert.equal(check.count,empty?0:chart.bars.length);
        if(empty)assert.ok(check.empty);
        let accounting=null;
        if(!empty){
          accounting=await run(`(()=>{const fixture=AlphaTabScore.buildFixture('${kind==='numbered'?'melody':kind}');let missing=0,diagnostics=0;
            fixture.measures.forEach(measure=>{if(measure.model.events.reduce((sum,e)=>sum+e.units,0)!==measure.model.totalUnits)throw Error('Unfilled measure');
              measure.notes.forEach((note,index)=>{if(!measure.model.events.some(e=>e.sourceIndex===index)&&!measure.model.diagnostics?.some(e=>e.sourceIndex===index))missing++;});diagnostics+=measure.model.diagnostics?.length||0;});
            const converted=AlphaTabScore.createScore(alphaTab,fixture,{barsPerLine:${density}});return {missing,diagnostics,pitchAudit:converted.audit.length};})()`);
          assert.equal(accounting.missing,0);
          const selection=await run(`(()=>{const node=elements.chartPreview.querySelector('${kind==='numbered'?'.numbered-chart-measure':'.alpha-chart-measure'}');node.dispatchEvent(new MouseEvent('click',{bubbles:true}));updateChartPlayback(state.chart.bars[0].start,0);return {selected:state.selectedIndex,active:node.classList.contains('active')};})()`);
          assert.equal(selection.selected,0);assert.ok(selection.active);
          await run('prepareChartPrint()');const pdf=await win.webContents.printToPDF({printBackground:true,preferCSSPageSize:true});assert.ok(pdf.length>10000);
          fs.writeFileSync(path.join(folder,`${version}-${kind}-${density}.pdf`),pdf);
        }
        records.push({song:info.title,version,kind,density,...check,accounting,...(version==='candidate'?{preparedSessionSha256}:{})});
      }
      if(version==='candidate')fs.writeFileSync(path.join(folder,'candidate.png'),(await win.webContents.capturePage()).toPNG());
    }
    assert.equal(digest(fs.readFileSync(info.session)),info.input_sha256,'Input session modified');
    fs.writeFileSync(path.join(out,'native-results.json'),JSON.stringify({records,errors},null,2));
    console.log(JSON.stringify({song:info.title,checks:records.filter(row=>row.song===info.title).length,originalUnchanged:true}));
  }
  const unexpected=errors.filter(message=>!/^\[AlphaTab\]\[Rendering\] Could not load font/.test(message));
  assert.deepEqual(unexpected,[]);
  win.destroy();app.quit();
})().catch(error=>{console.error(error);app.exit(1)});
