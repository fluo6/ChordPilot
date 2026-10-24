// Run with Electron to render the saved and updated timing against the same raw hits.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'../..');
const output=path.join(root,'outputs/rhythm-validation');
app.setPath('userData',path.join(output,'preview-runtime'));
app.disableHardwareAcceleration();
app.whenReady().then(async()=>{
  const saved=JSON.parse(fs.readFileSync(path.join(root,'outputs/Waste Of Time - Drum Sheet.chordpilot-session.json'),'utf8')).chart;
  const report=JSON.parse(fs.readFileSync(path.join(output,'waste-of-time.json'),'utf8'));
  const updated={...saved,beat_times:report.rhythm.beat_times,bars:report.new_bar_starts.map((start,index)=>({start,number:index+1}))};
  const scripts=['vendor/vexflow-bravura-4.2.5.js','bass-view.js','drum-view.js'].map(name=>`<script src="${pathToFileURL(path.join(root,'src/renderer',name))}"></script>`).join('');
  const html=`<!doctype html><meta charset="utf-8"><title>Waste Of Time — timing comparison</title>
    <style>body{font:16px system-ui;margin:28px;color:#18212b;background:white}h1{font-size:25px}h2{font-size:19px;margin-bottom:8px}.row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:28px}.row>div{min-width:0}.score{overflow:hidden}small{color:#52606d}.drum-measure-hit{pointer-events:none}</style>
    <h1>Waste Of Time — first 12 bars</h1>
    <p>Same saved drum hits; current notation renderer. Only the beat and bar timestamps differ.</p>
    <p><small>This checks engraving alignment, not independently labelled musical downbeats.</small></p>
    <div class="row"><h2>Saved uniform timing</h2><h2>Updated measured timing</h2></div><main></main>${scripts}
    <script>
    const charts=${JSON.stringify([saved,updated]).replaceAll('<','\\u003c')};
    const summary=[];
    for(let start=0;start<12;start+=2){
      const row=document.createElement('div');row.className='row';document.querySelector('main').append(row);
      charts.forEach((chart,version)=>{
        const cell=document.createElement('div');row.append(cell);
        const label=document.createElement('small');label.textContent='Bars '+(start+1)+'–'+(start+2)+' · '+chart.bars[start].start.toFixed(3)+' s';cell.append(label);
        const score=document.createElement('div');score.className='score';cell.append(score);
        const sources=chart.bars.slice(start,start+2).map((bar,i)=>{const barEnd=chart.bars[start+i+1]?.start || chart.duration;return {bar,barEnd,events:drumBarEvents(chart,bar,barEnd)}});
        const system=renderDrumScore(score,sources,chart,true);
        const svg=score.querySelector('svg');svg.style.width='100%';
        system.measures.forEach(m=>summary.push({version:version?'measured':'saved',bar:m.bar.number,start:m.bar.start,first_hit_offset:m.model.events.find(e=>e.hits.length)?.offset??null}));
      });
    }
    window.previewSummary=summary;
    </script>`;
  const htmlPath=path.join(output,'waste-of-time-drum-comparison.html');
  fs.writeFileSync(htmlPath,html);
  const window=new BrowserWindow({show:false,width:1500,height:1700,webPreferences:{contextIsolation:true,backgroundThrottling:false}});
  await window.loadFile(htmlPath);
  const summary=await window.webContents.executeJavaScript('window.previewSummary');
  if(summary?.length!==24) throw new Error('Incomplete drum comparison');
  fs.writeFileSync(path.join(output,'drum-notation-check.json'),JSON.stringify(summary,null,2));
  await window.webContents.executeJavaScript('document.fonts.ready');
  const height=await window.webContents.executeJavaScript('document.documentElement.scrollHeight');
  window.setContentSize(1500,Math.min(4000,height+4));
  await window.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  fs.writeFileSync(path.join(output,'waste-of-time-drum-comparison.png'),(await window.webContents.capturePage()).toPNG());
  console.log(JSON.stringify({html:htmlPath,measured:summary.filter(row=>row.version==='measured')}));
  window.destroy();app.quit();
}).catch(error=>{console.error(error);app.exit(1)});
