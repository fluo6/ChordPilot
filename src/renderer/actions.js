function startProjectWithAudio(audio, statusText = "Audio loaded") {
  state.audio = audio;
  state.chart = null;
  state.audioPreview = null;
  state.audioPreviewBusy = false;
  state.tuningReferenceHz = 440;
  state.selectedIndex = -1;
  state.activeIndex = -1;
  clearStems();
  updateProjectIdentity();
  elements.audioPlayer.src = audio.url;
  applyPlaybackRate();
  elements.analyzeBtn.disabled = false;
  renderMeta();
  renderSourceInfo();
  renderBars();
  renderTimeline();
  openEditorPanel("arrange");
  renderHome();
  addJob(`Project created: ${audio.name}`, "done");
  setStatus(statusText);
}

async function chooseAudio() {
  const finishLoading = beginLoading("Choosing audio...");
  try {
    const audio = await window.chordPilot.chooseAudio();
    if (!audio) {
      return;
    }

    elements.loadingText.textContent = "Loading audio...";
    startProjectWithAudio(audio);
  } finally {
    finishLoading();
  }
}

async function startFromYoutubeLink(event) {
  event?.preventDefault();
  const url = elements.youtubeUrlInput.value.trim();
  if (!url) {
    setStatus("Paste a YouTube link first");
    elements.youtubeUrlInput.focus();
    return;
  }

  const finishLoading = beginLoading("Downloading YouTube audio...");
  elements.youtubeStartBtn.disabled = true;
  elements.youtubeSourceHint.textContent = "Downloading and converting audio...";
  setStatus("Downloading YouTube audio...");
  clearLog();

  try {
    const audio = await window.chordPilot.downloadYoutubeAudio(url);
    startProjectWithAudio(audio, "YouTube audio loaded");
    elements.youtubeUrlInput.value = "";
    elements.youtubeSourceHint.textContent = "Downloads audio as MP3, then opens it as a new project.";
  } catch (error) {
    elements.youtubeSourceHint.textContent = "Download failed.";
    setStatus(error.message);
    showErrorDialog("YouTube Download Error", error.message);
  } finally {
    elements.youtubeStartBtn.disabled = false;
    finishLoading();
  }
}

async function relinkAudioSourceForPreview() {
  const audio = await window.chordPilot.chooseAudio();
  if (!audio) {
    setStatus("Audio preview needs the original source file.");
    return false;
  }
  state.audio = { ...(state.audio || {}), ...audio, exists: true };
  state.audioPreview = null;
  elements.audioPlayer.src = audio.url;
  elements.analyzeBtn.disabled = false;
  updateProjectIdentity("Source audio linked.");
  renderSourceInfo();
  return true;
}

async function applyAudioPreview(options = {}) {
  if (options.silentMissingSource && (!state.audio?.path || state.audio.exists === false)) {
    setStatus("Chart transposed; source audio is unavailable for preview.");
    return;
  }
  if (!state.audio?.path || !hasChart()) {
    setStatus(hasChart() ? "Choose source audio before applying preview." : "Choose audio and analyze a chart first");
    return;
  }

  syncMetaToState();
  ensureChartKeyState(state.chart);
  ensureChartTempoState(state.chart);
  const chartSemitones = Number(state.chart.key_offset) || 0;
  const semitones = chartSemitones + tuningSemitones();
  const tempoRate = audioTempoRate();

  if (Math.abs(semitones) < 0.001 && Math.abs(tempoRate - 1) < 0.001) {
    resetAudioPreview();
    setStatus("Already using original key, standard tuning, and tempo");
    return;
  }

  const finishLoading = beginLoading("Rendering audio preview...");
  state.audioPreviewBusy = true;
  updateAudioPreviewState();
  setStatus("Rendering audio preview...");

  try {
    const result = await processAudioPreviewBundle(state.audio.path, audioPreviewStemSources(), semitones, tempoRate);
    const previousPreviewTempo = Number(state.audioPreview?.tempoRate) || 1;
    const sourceTime = (elements.audioPlayer.currentTime || 0) * previousPreviewTempo;
    const resumePlayback = !elements.audioPlayer.paused;
    state.audioPreview = result;
    elements.audioPlayer.src = result.url;
    elements.audioPlayer.load?.();
    setMediaPlaybackRate(elements.audioPlayer, 1);
    try {
      elements.audioPlayer.currentTime = Math.max(0, sourceTime / Math.max(0.001, tempoRate));
    } catch (_error) {
      // The audio element may not have metadata for the newly rendered file yet.
    }
    renderStems(state.chart?.stems);
    if (resumePlayback) {
      try {
        await elements.audioPlayer.play();
      } catch (_error) {
        // The preview is ready even if Electron requires another play gesture.
      }
    }
    updateAudioPreviewState();
    const cents = tuningCents();
    const tuningText = Math.abs(cents) < 0.05 ? "A4 440 Hz" : `A4 ${state.tuningReferenceHz} Hz (${formatCents(cents)})`;
    setStatus(`Audio preview applied: ${chartSemitones > 0 ? "+" : ""}${chartSemitones} semitones, ${tuningText}, ${tempoRate.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}x tempo`);
  } catch (error) {
    if (options.silentMissingSource && isMissingAudioPreviewSourceError(error)) {
      setStatus("Chart transposed; source audio is unavailable for preview.");
      return;
    }
    if (!options.relinkAttempted && isMissingAudioPreviewSourceError(error) && await relinkAudioSourceForPreview()) {
      await applyAudioPreview({ ...options, relinkAttempted: true });
      return;
    }
    setStatus(error.message);
    showErrorDialog("Audio Preview Error", error.message);
  } finally {
    state.audioPreviewBusy = false;
    updateAudioPreviewState();
    finishLoading();
  }
}

function audioPreviewStemSources(chart = state.chart) {
  const stems = chart?.stems?.ok && Array.isArray(chart.stems.stems) ? chart.stems.stems : [];
  return stems
    .filter((stem) => stem?.path)
    .map((stem) => ({ ...stem }));
}

async function processAudioPreviewBundle(audioPath, stems, semitones, tempoRate) {
  const previewInputs = Array.isArray(stems) ? stems.filter((stem) => stem?.path) : [];
  const mixPromise = window.chordPilot.processAudio({ audioPath, semitones, tempoRate });
  const stemPromises = previewInputs.map(async (stem) => {
    try {
      const result = await window.chordPilot.processAudio({
        audioPath: stem.path,
        semitones,
        tempoRate
      });
      return {
        ...stem,
        path: result.path,
        url: result.url,
        source_path: stem.path,
        semitones: result.semitones,
        tempoRate: result.tempoRate
      };
    } catch (_error) {
      return null;
    }
  });
  const [mixResult, previewStems] = await Promise.all([mixPromise, Promise.all(stemPromises)]);
  const completePreviewStems = previewStems.filter(Boolean);
  if (completePreviewStems.length === previewInputs.length && completePreviewStems.length) {
    mixResult.stems = {
      ok: true,
      stems: completePreviewStems
    };
  }
  return mixResult;
}

function resetAudioPreview() {
  if (!state.audio?.url) {
    return;
  }
  const currentTime = elements.audioPlayer.currentTime || 0;
  const previewTempo = Number(state.audioPreview?.tempoRate) || 1;
  const resumePlayback = !elements.audioPlayer.paused;
  state.audioPreview = null;
  elements.audioPlayer.src = state.audio.url;
  try {
    elements.audioPlayer.currentTime = Math.max(0, currentTime * previewTempo);
  } catch (_error) {
    // The original audio may not have metadata loaded yet.
  }
  if (resumePlayback) {
    elements.audioPlayer.play().catch((error) => setStatus(error.message));
  }
  renderStems(state.chart?.stems);
  applyPlaybackRate();
  updateAudioPreviewState();
  setStatus("Original audio restored");
}

function isMissingAudioPreviewSourceError(error) {
  const message = String(error?.message || error || "");
  return /Choose an audio file before applying audio preview/i.test(message);
}

function changeKeyWithAudioPreview(changeKey, previewAudio = applyAudioPreview) {
  if (state.audioPreviewBusy) {
    renderMeta();
    setStatus("Wait for the current audio transpose to finish");
    return false;
  }
  const changed = typeof changeKey === "function" && changeKey();
  if (!changed) {
    return false;
  }
  Promise.resolve(previewAudio({ silentMissingSource: true })).catch((error) => {
    if (isMissingAudioPreviewSourceError(error)) {
      setStatus("Chart transposed; source audio is unavailable for preview.");
      return;
    }
    setStatus(error.message);
    showErrorDialog("Audio Preview Error", error.message);
  });
  return true;
}

async function lookupSourceMetadata() {
  if (!state.audio?.path) {
    setStatus("Choose source audio first");
    return;
  }

  const finishLoading = beginLoading("Looking up metadata online...");
  setStatus("Looking up source metadata online...");
  try {
    const result = await window.chordPilot.lookupMetadata(state.audio);
    if (!result) {
      setStatus("No online metadata match found");
      return;
    }

    const previousAudioName = state.audio.name;
    state.audio = {
      ...state.audio,
      title: result.title || state.audio.title,
      artist: result.artist || state.audio.artist,
      album: result.album || state.audio.album,
      date: result.date || state.audio.date,
      coverUrl: result.coverUrl || state.audio.coverUrl,
      metadataSource: result.metadataSource || "Online lookup",
      metadataUrl: result.metadataUrl || "",
      matchScore: result.matchScore
    };

    if (state.chart && (!state.chart.title || state.chart.title === "Untitled" || state.chart.title === previousAudioName)) {
      state.chart.title = state.audio.title || state.chart.title;
    }

    renderMeta();
    renderSourceInfo();
    updateProjectIdentity();
    renderHome();
    setStatus(`Metadata set from ${state.audio.metadataSource}`);
  } catch (error) {
    setStatus(error.message);
    showErrorDialog("Metadata Error", error.message);
  } finally {
    finishLoading();
  }
}

async function analyzeAudio(settings = {}) {
  if (!state.audio) {
    return;
  }

  const requireStems = Boolean(settings.requireStems);
  if (requireStems) {
    elements.analysisModeInput.value = "high-quality";
  }

  const mode = elements.analysisModeInput.value;
  if (mode === "high-quality" && window.chordPilot?.isWebRuntime) {
    const proceed = window.confirm(
      "High Quality Stems uses heavy AI processing.\n\nIn the web runtime, this currently runs on the server CPU and may take several minutes depending on the hardware.\n\nAre you sure you want to proceed?"
    );
    if (!proceed) {
      return;
    }
  }

  setStatus("Analyzing...");
  clearLog();
  openEditorPanel("log");
  appendLog(`app: analyzing ${state.audio.name} (${mode})`);
  addJob(`Analyzing ${state.audio.name} (${mode})`, "running");
  setAnalysisActive(true, `Analyzing ${state.audio.name}...`);

  try {
    const options = collectAnalysisOptions();
    options.require_stems = requireStems;
    appendLog(`options: key ${options.known_key || "auto"}, bpm ${options.min_bpm}-${options.max_bpm}, beat offset ${options.beat_offset}s, chroma ${options.chroma_low_hz}-${options.chroma_high_hz}Hz, alternatives ${options.chord_alternatives}, chord source ${options.chord_source}, simplify ${options.simplify_chords ? "on" : "off"}, lyrics ${options.lyrics_enabled ? `${options.lyrics_model}/${options.lyrics_language || "auto"}` : "off"}`);
    state.chart = await window.chordPilot.analyze(state.audio.path, mode, options);
    ensureChartKeyState(state.chart);
    ensureChartTempoState(state.chart);
    state.audioPreview = null;
    state.selectedIndex = state.chart.bars.length ? 0 : -1;
    state.activeIndex = state.selectedIndex;
    renderMeta();
    renderBars();
    renderStems(state.chart.stems);
    const engine = state.chart.analysis_engine?.chords || "analysis complete";
    if (state.chart.analysis_engine?.cache) {
      appendLog(`cache: ${state.chart.analysis_engine.cache}`);
    }
    if (state.chart.lyrics?.ok) {
      appendLog(`lyrics: ${state.chart.lyrics.lines.length} reference lines from ${state.chart.lyrics.source}, language ${state.chart.lyrics.language || "auto"} (${state.chart.lyrics.language_mode || "detected"})`);
    } else if (state.chart.lyrics?.error) {
      appendLog(`lyrics: ${state.chart.lyrics.error}`);
      showErrorDialog("Lyrics Unavailable", state.chart.lyrics.error, "Chord and stem analysis completed, but lyric transcription could not finish.");
    }
    appendLog(`result: ${state.chart.bars.length} bars, key ${chartKeyText(state.chart)}, tempo ${state.chart.tempo}`);
    addJob(`Analysis ready: ${state.chart.bars.length} bars`, "done");
    renderHome();
    setStatus(`Draft ready: ${state.chart.bars.length} bars - ${engine}`);
  } catch (error) {
    appendLog(`error: ${error.message}`);
    addJob(`Analysis failed: ${error.message}`, "error");
    setStatus(error.message);
    showErrorDialog("Analysis Error", error.message);
  } finally {
    setAnalysisActive(false);
  }
}

function applyAnalyzedChart(chart, options = {}) {
  state.chart = chart;
  ensureChartKeyState(state.chart);
  ensureChartTempoState(state.chart);
  if (options.resetSelection !== false) {
    state.selectedIndex = state.chart.bars.length ? 0 : -1;
    state.activeIndex = state.selectedIndex;
  } else {
    state.selectedIndex = Math.max(-1, Math.min(state.selectedIndex, state.chart.bars.length - 1));
    state.activeIndex = Math.max(-1, Math.min(state.activeIndex, state.chart.bars.length - 1));
  }
  renderMeta();
  renderBars();
  renderStems(state.chart.stems);
  renderHome();
  updateButtons();
}

async function runAnalysisWithOptions(options, loadingText, jobText) {
  const mode = elements.analysisModeInput.value;
  openEditorPanel("log");
  appendLog(`app: ${jobText} (${mode})`);
  addJob(jobText, "running");
  setAnalysisActive(true, loadingText || jobText || "Analyzing...");
  try {
    const result = await window.chordPilot.analyze(state.audio.path, mode, options);
    addJob(`${jobText} ready`, "done");
    return result;
  } catch (error) {
    appendLog(`error: ${error.message}`);
    addJob(`${jobText} failed: ${error.message}`, "error");
    setStatus(error.message);
    showErrorDialog(`${jobText} Error`, error.message);
    return null;
  } finally {
    setAnalysisActive(false);
  }
}

function copyExistingLyricsToBars(targetBars, sourceBars) {
  if (!Array.isArray(targetBars) || !Array.isArray(sourceBars)) {
    return;
  }
  targetBars.forEach((bar, index) => {
    const source = sourceBars[index];
    if (!source) {
      return;
    }
    bar.lyrics = source.lyrics || "";
    bar.lyrics_source = source.lyrics_source || "";
    bar.lyric_confidence = source.lyric_confidence;
  });
}

function applyLyricsReferenceToCurrentChart(lyricsResult) {
  if (!hasChart()) {
    return;
  }
  state.chart.lyrics = lyricsResult || { ok: false, lines: [] };
  state.chart.bars.forEach((bar) => {
    if (bar.lyrics_source !== "manual") {
      bar.lyrics = "";
      bar.lyrics_source = "";
      bar.lyric_confidence = null;
    }
  });

  const lines = Array.isArray(lyricsResult?.lines) ? lyricsResult.lines : [];
  lines.forEach((line) => {
    const midpoint = ((Number(line.start) || 0) + (Number(line.end) || Number(line.start) || 0)) / 2;
    const index = findActiveBarIndex(midpoint);
    const bar = state.chart.bars[index];
    if (!bar || bar.lyrics_source === "manual") {
      return;
    }
    const text = String(line.text || "").trim();
    if (!text) {
      return;
    }
    bar.lyrics = [bar.lyrics, text].filter(Boolean).join(" / ");
    bar.lyrics_source = "auto";
    bar.lyric_confidence = Number(line.confidence);
  });
}

async function reanalyzeSection(section) {
  if (!state.audio?.path) {
    setStatus("Open a session with audio before reanalysis");
    return;
  }
  if (section === "all") {
    await analyzeAudio({ requireStems: true });
    return;
  }

  syncMetaToState();
  clearLog();
  const options = collectAnalysisOptions();

  if (section === "lyrics") {
    options.lyrics_enabled = true;
    options.use_cache = false;
    const result = await runAnalysisWithOptions(options, "Reanalysing lyrics...", "Reanalysing lyrics");
    if (!result) {
      return;
    }
    applyLyricsReferenceToCurrentChart(result.lyrics);
    renderBars();
    renderTimeline();
    renderChartPreview();
    updateRowState();
    if (result.lyrics?.ok) {
      setStatus(`Lyrics refreshed: ${result.lyrics.lines.length} lines`);
    } else {
      const message = result.lyrics?.error || "no transcription backend";
      setStatus(`Lyrics unavailable: ${message}`);
      appendLog(`lyrics: ${message}`);
      showErrorDialog("Lyrics Unavailable", message, "ChordPilot kept the existing chart; only the lyric refresh failed.");
    }
    return;
  }

  if (section === "chords") {
    options.lyrics_enabled = false;
    const previousChart = state.chart ? JSON.parse(JSON.stringify(state.chart)) : null;
    const result = await runAnalysisWithOptions(options, "Reanalysing chords...", "Reanalysing chords");
    if (!result) {
      return;
    }
    result.title = previousChart?.title || result.title;
    result.lyrics = previousChart?.lyrics;
    copyExistingLyricsToBars(result.bars, previousChart?.bars || []);
    applyAnalyzedChart(result, { resetSelection: false });
    setStatus(`Chords refreshed: ${result.bars.length} bars`);
  }
}

function addBar() {
  syncMetaToState();
  const selected = getSelectedBar();
  const bar = selected ? cloneBar(selected) : {
    number: state.chart.bars.length + 1,
    section: "Verse",
    chord: "C",
    repeat_start: false,
    repeat_end: 0,
    start: 0,
    lyrics: "",
    notes: ""
  };
  bar.start = selected ? selected.start + secondsPerBar() : 0;
  state.chart.bars.splice(state.selectedIndex + 1 || state.chart.bars.length, 0, bar);
  state.selectedIndex = Math.max(0, state.selectedIndex + 1);
  state.activeIndex = state.selectedIndex;
  renumberBars();
  renderBars();
}

function duplicateBar() {
  const selected = getSelectedBar();
  if (!selected) {
    return;
  }
  const next = cloneBar(selected);
  next.start = selected.start + secondsPerBar();
  state.chart.bars.splice(state.selectedIndex + 1, 0, next);
  state.selectedIndex += 1;
  state.activeIndex = state.selectedIndex;
  renumberBars();
  renderBars();
}

function splitBar() {
  const selected = getSelectedBar();
  if (!selected) {
    return;
  }
  const secondHalf = cloneBar(selected);
  selected.chord = `${selected.chord} /`;
  secondHalf.chord = `/ ${secondHalf.chord}`;
  secondHalf.lyrics = "";
  secondHalf.start = selected.start + secondsPerBar() / 2;
  state.chart.bars.splice(state.selectedIndex + 1, 0, secondHalf);
  state.activeIndex = state.selectedIndex;
  renumberBars();
  renderBars();
}

function mergeBar() {
  if (!hasChart() || state.selectedIndex < 0 || state.selectedIndex >= state.chart.bars.length - 1) {
    return;
  }
  const current = state.chart.bars[state.selectedIndex];
  const next = state.chart.bars[state.selectedIndex + 1];
  current.chord = `${current.chord} ${next.chord}`.trim();
  current.lyrics = [current.lyrics, next.lyrics].filter(Boolean).join(" / ");
  current.notes = [current.notes, next.notes].filter(Boolean).join(" / ");
  state.chart.bars.splice(state.selectedIndex + 1, 1);
  state.activeIndex = state.selectedIndex;
  renumberBars();
  renderBars();
}

function deleteBar() {
  if (!hasChart() || state.selectedIndex < 0) {
    return;
  }
  state.chart.bars.splice(state.selectedIndex, 1);
  state.selectedIndex = Math.min(state.selectedIndex, state.chart.bars.length - 1);
  state.activeIndex = state.selectedIndex;
  renumberBars();
  renderBars();
}

async function exportChart(format) {
  if (!hasChart()) {
    return;
  }
  syncMetaToState();
  const finishLoading = beginLoading(`Exporting ${format.toUpperCase()}...`);
  setStatus(`Exporting ${format.toUpperCase()}...`);
  try {
    const result = await window.chordPilot.exportChart(state.chart, format);
    setStatus(result ? `Exported ${format.toUpperCase()}` : "Export cancelled");
  } catch (error) {
    setStatus(error.message);
    showErrorDialog("Export Error", error.message);
  } finally {
    finishLoading();
  }
}

async function exportAudioTrack(source) {
  if (!source?.path) {
    setStatus("No audio track available to export");
    return;
  }

  const finishLoading = beginLoading(`Exporting ${source.label || "audio"}...`);
  setStatus(`Exporting ${source.label || "audio"}...`);
  try {
    const result = await window.chordPilot.exportAudioTrack(source);
    setStatus(result ? `Exported ${source.label || "audio"} as ${String(result.format || "audio").toUpperCase()}` : "Audio export cancelled");
  } catch (error) {
    setStatus(error.message);
    showErrorDialog("Audio Export Error", error.message);
  } finally {
    finishLoading();
  }
}

function buildSessionPayload() {
  syncMetaToState();
  return {
    app: "ChordPilot",
    version: 1,
    saved_at: new Date().toISOString(),
    audio: state.audio,
    chart: state.chart,
    analysis: {
      mode: elements.analysisModeInput.value,
      options: collectAnalysisOptions()
    },
    ui: {
      selectedIndex: state.selectedIndex,
      activeIndex: state.activeIndex,
      editorPanel: state.editorPanel,
      masterVolume: state.masterVolume,
      playbackRate: state.playbackRate,
      metronomeEnabled: state.metronomeEnabled,
      metronomeVolume: state.metronomeVolume,
      tuningReferenceHz: state.tuningReferenceHz,
      timelineZoom: state.timelineZoom,
      followTimeCursor: state.followTimeCursor !== false,
      detailPaneWidth: state.detailPaneWidth,
      currentTime: elements.audioPlayer.currentTime || 0
    }
  };
}

async function saveSession() {
  const session = buildSessionPayload();
  if (!session.audio && !session.chart) {
    setStatus("Nothing to save");
    return;
  }

  const finishLoading = beginLoading("Saving session...");
  try {
    const result = await window.chordPilot.saveSession(session);
    if (result?.path) {
      rememberSession(result.path, session);
      addJob(`Session saved: ${session.chart?.title || session.audio?.name || "Untitled"}`, "done");
    }
    setStatus(result ? "Session saved" : "Save cancelled");
  } catch (error) {
    setStatus(error.message);
    showErrorDialog("Save Session Error", error.message);
  } finally {
    finishLoading();
  }
}

function restoreSessionPayload(session) {
  state.audio = session.audio || null;
  state.chart = session.chart || null;
  state.audioPreview = null;
  state.audioPreviewBusy = false;
  ensureChartKeyState(state.chart);
  ensureChartTempoState(state.chart);
  state.selectedIndex = Number.isInteger(session.ui?.selectedIndex) ? session.ui.selectedIndex : (hasChart() ? 0 : -1);
  state.activeIndex = Number.isInteger(session.ui?.activeIndex) ? session.ui.activeIndex : state.selectedIndex;
  state.masterVolume = Number.isFinite(Number(session.ui?.masterVolume)) ? Number(session.ui.masterVolume) : state.masterVolume;
  state.playbackRate = Number.isFinite(Number(session.ui?.playbackRate)) ? Number(session.ui.playbackRate) : 1;
  state.metronomeEnabled = Boolean(session.ui?.metronomeEnabled);
  state.metronomeVolume = Number.isFinite(Number(session.ui?.metronomeVolume)) ? Number(session.ui.metronomeVolume) : state.metronomeVolume;
  state.tuningReferenceHz = Number.isFinite(Number(session.ui?.tuningReferenceHz)) ? Number(session.ui.tuningReferenceHz) : 440;
  state.timelineZoom = Number(session.ui?.timelineZoom) || 1;
  state.followTimeCursor = session.ui?.followTimeCursor !== false;
  state.detailPaneWidth = Number(session.ui?.detailPaneWidth) || state.detailPaneWidth;
  elements.analysisModeInput.value = session.analysis?.mode || state.chart?.analysis_engine?.mode || "fast";
  applyAnalysisOptions(session.analysis?.options || state.chart?.analysis_engine?.options || {});

  clearStems();
  if (state.audio?.url && state.audio.exists !== false) {
    elements.audioPlayer.src = state.audio.url;
    elements.analyzeBtn.disabled = false;
    updateProjectIdentity();
  } else {
    elements.audioPlayer.removeAttribute("src");
    elements.analyzeBtn.disabled = true;
    updateProjectIdentity("Session has no audio file.");
  }

  renderMeta();
  renderSourceInfo();
  renderBars();
  renderStems(state.chart?.stems);
  applyMasterVolume();
  applyPlaybackRate();
  applyMetronomeSettings();
  applyDetailPaneWidth();
  applyTimelineZoom({ render: true });

  const currentTime = Number(session.ui?.currentTime);
  if (Number.isFinite(currentTime) && currentTime > 0 && state.audio?.url) {
    elements.audioPlayer.currentTime = currentTime;
  }
  updateRowState({ scroll: true });
  updatePlayhead();
  const restoredPanel = session.ui?.editorPanel === "log" ? (hasChart() ? "arrange" : "analysis") : (session.ui?.editorPanel || "arrange");
  openEditorPanel(restoredPanel);
  renderHome();
}

async function openSession() {
  const finishLoading = beginLoading("Opening session...");
  try {
    const result = await window.chordPilot.openSession();
    if (!result?.session) {
      setStatus("Open cancelled");
      return;
    }
    restoreSessionPayload(result.session);
    rememberSession(result.path, result.session);
    addJob(`Session opened: ${result.session.chart?.title || result.session.audio?.name || "Untitled"}`, "done");
    const missing = result.session.audio?.exists === false ? " - audio file missing" : "";
    setStatus(`Session loaded${missing}`);
  } catch (error) {
    setStatus(error.message);
    showErrorDialog("Open Session Error", error.message);
  } finally {
    finishLoading();
  }
}

async function openSessionPath(sessionPath) {
  const finishLoading = beginLoading("Opening recent session...");
  try {
    const result = await window.chordPilot.openSessionPath(sessionPath);
    if (!result?.session) {
      return;
    }
    restoreSessionPayload(result.session);
    rememberSession(result.path, result.session);
    addJob(`Session opened: ${result.session.chart?.title || result.session.audio?.name || "Untitled"}`, "done");
    const missing = result.session.audio?.exists === false ? " - audio file missing" : "";
    setStatus(`Session loaded${missing}`);
  } catch (error) {
    addJob(`Could not open recent session`, "error");
    setStatus(error.message);
    showErrorDialog("Open Session Error", error.message);
  } finally {
    finishLoading();
  }
}
