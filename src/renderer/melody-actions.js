function hasVocalStem(chart=state.chart) {
  return Boolean(chart?.stems?.ok&&chart.stems.stems?.some(stem=>stem.name==='vocals'&&(stem.path||stem.id)&&stem.status!=='missing'));
}

async function runMelodyJob(prepare=false,force=false) {
  if(state.melodyBusy||state.drumBusy||state.isAnalyzing||state.study?.busy||!state.audio?.path||!hasChart())return;
  const chart=state.chart,audioPath=state.audio.path,current=()=>state.chart===chart&&state.audio?.path===audioPath;
  const label=prepare?'Preparing vocal stem':'Analysing vocal melody';
  state.melodyBusy=true;state.melodyError=null;setAnalysisActive(true,`${label}…`);updateButtons();renderBars();addJob(label,'running');
  try {
    if(prepare){const stems=await window.chordPilot.prepareStems(audioPath);
      if(!stems?.ok)throw Error(stems?.error || 'Stem preparation failed.');if(!current())return;
      chart.stems=stems;if(chart.melody)chart.melody={...chart.melody,stale:true};if(chart.drums)chart.drums={...chart.drums,stale:true};
      renderStems(stems);setStatus('Vocal stem ready. Select Analyse Melody to create the lead sheet.');
    }else{
      const result=await window.chordPilot.analyzeMelody({audioPath,force,language:chart.lyrics?.language || chart.analysis_engine?.options?.lyrics_language || chart.melody?.language || 'auto'});
      if(!result?.ok||!Array.isArray(result.events))throw Error(result?.error || 'Melody analysis returned no result.');
      if(!current())return;
      if(chart.melody?.previous_reviews)result.previous_reviews=chart.melody.previous_reviews;
      if(chart.melody?.voice_review?.melody_fingerprint===result.fingerprint&&JSON.stringify(chart.melody.events)===JSON.stringify(result.events))
        result.voice_review=chart.melody.voice_review;
      chart.melody=result;setStatus(`Lead sheet ready: ${result.events.length} estimated vocal notes${result.cached?' · cached':''}`);
    }
    addJob(`${label} complete`,'done');
  }catch(error){appendLog(`melody: ${error.message}`);addJob(`${label} failed: ${error.message}`,'error');
    if(current()){state.melodyError={chart,message:error.message};setStatus(error.message);showErrorDialog('Melody Analysis',error.message);}
  }finally{state.melodyBusy=false;setAnalysisActive(false);updateButtons();renderBars();renderHome();}
}
async function analyzeMelody(force=false){return runMelodyJob(false,force);}
async function prepareMelodyStems(){return runMelodyJob(true);}

function preserveMelodyAnalysis(chart,previousChart) {
  if(!previousChart?.melody?.ok)return;
  const vocal=value=>value?.stems?.stems?.find(stem=>stem.name==='vocals');
  const before=vocal(previousChart),after=vocal(chart);
  const same=before&&after&&(before.id||before.path)===(after.id||after.path);
  chart.melody={...previousChart.melody,stale:Boolean(previousChart.melody.stale||!same)};
  const archived=[...(previousChart.melody.previous_reviews||[])];
  (previousChart.bars||[]).forEach((bar,index)=>{
    const entry=bar.transcription_review?.melody;if(!entry)return;
    const end=previousChart.bars[index+1]?.start ?? previousChart.duration;
    const target=(chart.bars||[]).find((next,i)=>next.start===bar.start&&(chart.bars[i+1]?.start ?? chart.duration)===end);
    const copy=JSON.parse(JSON.stringify(entry));
    if(target)(target.transcription_review ||= {}).melody=copy;
    else archived.push({start:bar.start,end,review:copy});
  });
  if(archived.length)chart.melody.previous_reviews=archived;
}
