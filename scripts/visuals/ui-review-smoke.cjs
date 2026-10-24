// Run with Electron: node_modules/.bin/electron scripts/visuals/ui-review-smoke.cjs
const {app, BrowserWindow} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const out = path.join(root, 'tmp/ui-review-check');
const file = path.join(root, 'outputs/uiux/ChordPilot-uiux-review.html');
fs.mkdirSync(out, {recursive:true});
app.setPath('userData', path.join(out, 'runtime'));
app.disableHardwareAcceleration();
const timeout = setTimeout(() => {console.error('UI review check timed out');app.exit(1);}, 60000);
(async () => {
  await app.whenReady();
  const win = new BrowserWindow({show:false,width:1440,height:1000,webPreferences:{contextIsolation:true,backgroundThrottling:false}});
  const errors=[],requests=[],screens=[],charts=[];
  win.webContents.on('console-message', event => {if(event.level==='error')errors.push(event.message);});
  win.webContents.on('render-process-gone', (_event,detail)=>errors.push(detail.reason));
  const downloaded=path.join(out,'ChordPilot-uiux-feedback.html');
  const allowed=new Set([file,downloaded].map(value=>require('node:url').pathToFileURL(value).href));
  win.webContents.session.webRequest.onBeforeRequest({urls:['<all_urls>']},(details,callback)=>{
    const ok=allowed.has(details.url)||/^(data|blob):/.test(details.url);
    if(!ok)requests.push(details.url);callback({cancel:!ok});
  });
  const evaluate=source=>win.webContents.executeJavaScript(source);
  await win.loadFile(file);
  assert.equal(await evaluate('window.__reviewReady'),true,JSON.stringify(errors));
  assert.equal(await evaluate('state.chart.bars.length'),16);
  assert.equal(await evaluate('document.querySelectorAll("script[src],link[rel=stylesheet],img[src^=http]").length'),0);
  assert.equal(await evaluate('Object.keys(JSON.parse(document.getElementById("review-manifest").textContent).ids).length'),220);
  await evaluate('document.getElementById("review-tools").open=false');
  const frame=()=>evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  for(const screen of ['home','arrange','study','analysis','log','table','help']){
    await evaluate(`document.getElementById('review-screen').value='${screen}';document.getElementById('review-screen').dispatchEvent(new Event('change'));true`);
    await frame();
    assert.equal(await evaluate(`state.currentView==='song'?state.editorPanel:state.currentView`),screen);
    assert.equal(await evaluate(`!elements.${screen==='home'?'homeView':screen==='help'?'helpView':'editorView'}.classList.contains('hidden')`),true);
    screens.push(screen);
    if(screen==='analysis'){
      assert.equal(await evaluate('getComputedStyle(elements.timelineViewport.closest(".workspace")).display'), 'grid');
      fs.writeFileSync(path.join(out,'arrangement.png'),(await win.webContents.capturePage()).toPNG());
    }
    if(screen==='arrange'){
      assert.ok(await evaluate('elements.timelineViewport.querySelectorAll(".chord-region").length')>0);
      fs.writeFileSync(path.join(out,'song.png'),(await win.webContents.capturePage()).toPNG());
    }
  }
  await evaluate('openEditorPanel("table");true');
  for(const mode of ['ireal','table','grid','bass','drums','melody','chordpro']){
    await evaluate(`elements.chartRendererInput.value='${mode}';elements.chartRendererInput.dispatchEvent(new Event('change'));true`);
    await frame();
    if(['bass','drums','melody'].includes(mode)){
      await evaluate('renderAlphaTabChartPreview()');
      assert.equal(await evaluate('!!elements.chartPreview.querySelector(".alpha-chart-error-panel")'),false,mode);
      assert.ok(await evaluate('elements.chartPreview.querySelectorAll(".alpha-chart-engine svg").length')>0,mode);
      assert.equal(await evaluate('elements.chartPreview.querySelectorAll(".alpha-chart-measure").length'),16,mode);
    }
    charts.push(mode);
    if(mode==='melody')fs.writeFileSync(path.join(out,'lead-sheet.png'),(await win.webContents.capturePage()).toPNG());
  }
  // Editing is the actual app UI; picking intercepts clicks without editing.
  await evaluate('openEditorPanel("arrange");elements.titleInput.value="Review title";elements.titleInput.dispatchEvent(new Event("input"));true');
  assert.equal(await evaluate('state.chart.title'),'Review title');
  await evaluate('document.getElementById("review-inspect").click();elements.timelineSummary.click();true');
  assert.equal(await evaluate('document.getElementById("review-selector").value'),'#timelineSummary');
  await evaluate('document.getElementById("review-feedback").value="Consider clearer timeline hierarchy.";document.getElementById("review-add-note").click();true');
  assert.equal(await evaluate('JSON.parse(document.getElementById("review-data").textContent).notes.length'),1);
  await evaluate('document.getElementById("homeNewProjectBtn").click();true');
  assert.match(await evaluate('document.getElementById("review-notice").textContent'),/Demo only/);
  await evaluate('openEditorPanel("analysis");document.querySelector(".lane-export").click();true');
  assert.match(await evaluate('document.getElementById("review-notice").textContent'),/Demo only/);
  await evaluate('playPianoNotes([60]);elements.arrangementKeyInput.value="D";elements.arrangementKeyInput.dispatchEvent(new Event("change"));true');
  assert.equal(await evaluate('state.chart.key'),'D');
  await evaluate('document.getElementById("review-notice").hidden=true;document.getElementById("review-tools").open=false;true');
  win.setSize(900,760);await frame();
  fs.writeFileSync(path.join(out,'compact.png'),(await win.webContents.capturePage()).toPNG());
  win.setSize(1440,1000);
  const finished=new Promise((resolve,reject)=>{
    win.webContents.session.once('will-download',(_event,item)=>{
      item.setSavePath(downloaded);item.once('done',(_event,status)=>status==='completed'?resolve():reject(Error(status)));
    });
  });
  await evaluate('document.getElementById("review-download").click();true');await finished;
  assert.ok(fs.statSync(downloaded).size>6000000);
  await win.loadFile(downloaded);
  assert.equal(await evaluate('window.__reviewReady'),true);
  assert.equal(await evaluate('JSON.parse(document.getElementById("review-data").textContent).notes[0].feedback'),'Consider clearer timeline hierarchy.');
  assert.equal(await evaluate('document.querySelectorAll("#review-tools").length'),1);
  assert.equal(await evaluate('document.querySelectorAll("[data-review-runtime]").length'),1);
  assert.equal(await evaluate('state.chart.title'),'Morning Light');
  assert.equal(await evaluate('state.chartRenderer'),'chordpro');
  await evaluate('openEditorPanel("table");elements.chartRendererInput.value="melody";elements.chartRendererInput.dispatchEvent(new Event("change"));true');
  await evaluate('renderAlphaTabChartPreview()');
  assert.ok(await evaluate('elements.chartPreview.querySelectorAll(".alpha-chart-engine svg").length')>0);
  assert.deepEqual(requests,[],'No network or sibling-file dependencies');
  assert.deepEqual(errors,[],'No browser script errors');
  const result={screens,charts,ids:220,offline:true,feedbackRoundTrip:true,browserErrors:errors,unexpectedRequests:requests};
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  clearTimeout(timeout);win.destroy();app.quit();
})().catch(error=>{console.error(error);clearTimeout(timeout);app.exit(1);});
