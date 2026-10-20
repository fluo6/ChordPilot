function hasDrumStem(chart = state.chart) {
  return Boolean(chart?.stems?.ok && chart.stems.stems?.some(stem => stem.name === 'drums' && (stem.path || stem.id) && stem.status !== 'missing'));
}

async function runDrumJob(prepare = false, force = false) {
  if (state.drumBusy || state.isAnalyzing || state.study?.busy || !state.audio?.path || !hasChart()) return;
  const chart = state.chart, audioPath = state.audio.path;
  const current = () => state.chart === chart && state.audio?.path === audioPath;
  const label = prepare ? 'Preparing stems' : 'Analysing drums';
  state.drumBusy = true; state.drumError = null;
  setAnalysisActive(true, `${label}…`);updateButtons();
  renderBars();addJob(label, 'running');appendLog(`drums: ${label.toLowerCase()}`);
  try {
    if (prepare) {
      const stems = await window.chordPilot.prepareStems(audioPath);
      if (!stems?.ok) throw new Error(stems?.error || 'Stem preparation failed.');
      if (!current()) return;
      chart.stems = stems;
      // A newly prepared stem may differ from the one used by an older result.
      if (chart.drums) chart.drums = {...chart.drums, stale:true};
      renderStems(stems);
      setStatus('Stems ready. Select Analyse Drums to create the drum sheet.');
    } else {
      const result = await window.chordPilot.analyzeDrums({audioPath,force});
      if (!result?.ok || !Array.isArray(result.events)) throw new Error(result?.error || 'Drum analysis returned no result.');
      if (!current()) return;
      chart.drums = result;
      setStatus(`Drum sheet ready: ${result.events.length} estimated hits${result.cached ? ' · cached' : ''}`);
    }
    addJob(`${label} complete`, 'done');
  } catch (error) {
    appendLog(`drums: ${error.message}`);addJob(`${label} failed: ${error.message}`, 'error');
    if (current()) {
      state.drumError = {chart,message:error.message};
      setStatus(error.message);showErrorDialog('Drum Analysis',error.message);
    }
  } finally {
    state.drumBusy = false;setAnalysisActive(false);updateButtons();renderBars();renderHome();
  }
}

async function analyzeDrums(force = false) { return runDrumJob(false,force); }
async function prepareDrumStems() { return runDrumJob(true); }
