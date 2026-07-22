elements.chooseBtn.addEventListener("click", chooseAudio);
elements.analyzeBtn.addEventListener("click", analyzeAudio);
elements.openSessionBtn.addEventListener("click", openSession);
elements.saveSessionBtn.addEventListener("click", saveSession);
elements.homeNewProjectBtn.addEventListener("click", chooseAudio);
elements.youtubeStartForm.addEventListener("submit", startFromYoutubeLink);
elements.homeOpenSessionBtn.addEventListener("click", openSession);
elements.homeGoSongBtn.addEventListener("click", () => openEditorPanel("arrange"));
elements.clearRecentBtn.addEventListener("click", () => {
  state.recentSessions = [];
  saveRecentSessions();
  renderHome();
});
elements.leftPaneToggle.addEventListener("click", toggleLeftPane);
elements.navItems.forEach((item) => {
  item.addEventListener("click", () => {
    if (item.dataset.view) {
      setView(item.dataset.view);
    } else if (item.dataset.editorView) {
      openEditorPanel(item.dataset.editorView);
    }
  });
});
elements.clearLogBtn.addEventListener("click", clearLog);
elements.masterVolumeInput.addEventListener("input", () => {
  state.masterVolume = Number(elements.masterVolumeInput.value);
  applyMasterVolume();
});
elements.arrangementMasterVolumeInput.addEventListener("input", () => {
  state.masterVolume = Number(elements.arrangementMasterVolumeInput.value);
  applyMasterVolume();
});
elements.playbackRateInput.addEventListener("change", () => {
  state.playbackRate = Number(elements.playbackRateInput.value) || 1;
  applyPlaybackRate();
});
elements.arrangementPlaybackRateInput.addEventListener("change", () => {
  state.playbackRate = Number(elements.arrangementPlaybackRateInput.value) || 1;
  applyPlaybackRate();
});
elements.metronomeEnabledInput.addEventListener("change", () => setMetronomeEnabled(elements.metronomeEnabledInput.checked));
elements.metronomeVolumeInput.addEventListener("input", () => setMetronomeVolume(elements.metronomeVolumeInput.value));
elements.audioPlayer.addEventListener("timeupdate", () => {
  updateActiveBarFromPlayback();
  syncStemTimes();
  updatePlayhead();
});
elements.audioPlayer.addEventListener("seeked", () => {
  updateActiveBarFromPlayback();
  syncStemTimes();
  updatePlayhead();
  resetMetronomeSchedule();
});
elements.audioPlayer.addEventListener("play", () => {
  updateActiveBarFromPlayback();
  updatePlayhead();
  startMetronome();
  if (isSourcePlaybackMode()) {
    pauseStems();
    elements.audioPlayer.muted = false;
  } else {
    playStems();
  }
});
elements.audioPlayer.addEventListener("loadedmetadata", () => {
  updatePlayhead();
  resetMetronomeSchedule();
});
elements.timelineViewport.addEventListener("scroll", updatePlayhead);
elements.arrangementResizeHandle.addEventListener("pointerdown", startArrangementResize);
window.addEventListener("resize", () => {
  applyDetailPaneWidth();
  applyTimelineZoom({ render: true });
});
window.addEventListener("keydown", handleKeyboardShortcut);
window.addEventListener("click", (event) => {
  if (!elements.chordSuggestion.contains(event.target)) {
    hideChordSuggestion();
  }
});
elements.audioPlayer.addEventListener("pause", () => {
  pauseStems();
  stopMetronome();
});
elements.addBarBtn.addEventListener("click", addBar);
elements.duplicateBarBtn.addEventListener("click", duplicateBar);
elements.splitBarBtn.addEventListener("click", splitBar);
elements.mergeBarBtn.addEventListener("click", mergeBar);
elements.deleteBarBtn.addEventListener("click", deleteBar);
elements.reanalyzeChordsBtn.addEventListener("click", () => reanalyzeSection("chords"));
elements.reanalyzeLyricsBtn.addEventListener("click", () => reanalyzeSection("lyrics"));
elements.reanalyzeAllBtn.addEventListener("click", () => reanalyzeSection("all"));
elements.keyNativeBtn.addEventListener("click", resetChartKeyToDetected);
elements.arrangementKeyNativeBtn.addEventListener("click", resetChartKeyToDetected);
elements.applyAudioPreviewBtn.addEventListener("click", applyAudioPreview);
elements.resetAudioPreviewBtn.addEventListener("click", resetAudioPreview);
elements.exportButtons.forEach((button) => {
  button.addEventListener("click", () => exportChart(button.dataset.export));
});

[elements.titleInput, elements.tempoInput, elements.timeInput].forEach((input) => {
  input.addEventListener("input", () => {
    syncMetaToState();
    resetMetronomeSchedule();
    renderTimeline();
    renderChartPreview();
  });
});
elements.keyInput.addEventListener("change", () => {
  setChartTargetKey(elements.keyInput.value);
});
elements.arrangementKeyInput.addEventListener("change", () => {
  setChartTargetKey(elements.arrangementKeyInput.value);
});
elements.tuningReferenceInput.addEventListener("input", () => setTuningReferenceHz(elements.tuningReferenceInput.value));
elements.tuningResetBtn.addEventListener("click", () => setTuningReferenceHz(440));
elements.chartRendererInput.addEventListener("change", () => {
  state.chartRenderer = elements.chartRendererInput.value || "table";
  renderChartPreview();
});

elements.detailSectionInput.addEventListener("input", () => updateSelectedBarFromDetail("section", elements.detailSectionInput.value));
elements.detailChordInput.addEventListener("input", () => updateSelectedBarFromDetail("chord", elements.detailChordInput.value));
elements.detailStartInput.addEventListener("input", () => updateSelectedBarFromDetail("start", elements.detailStartInput.value));
elements.detailRepeatStartInput.addEventListener("change", () => updateSelectedBarFromDetail("repeat_start", elements.detailRepeatStartInput.checked));
elements.detailRepeatEndInput.addEventListener("input", () => updateSelectedBarFromDetail("repeat_end", elements.detailRepeatEndInput.value));
elements.detailLyricsInput.addEventListener("input", () => updateSelectedBarFromDetail("lyrics", elements.detailLyricsInput.value));
elements.detailNotesInput.addEventListener("input", () => updateSelectedBarFromDetail("notes", elements.detailNotesInput.value));
elements.timelineZoomInput.addEventListener("input", () => setTimelineZoom(elements.timelineZoomInput.value));
elements.timelineFollowInput.addEventListener("change", () => setTimelineFollow(elements.timelineFollowInput.checked));
elements.zoomOutBtn.addEventListener("click", () => setTimelineZoom(state.timelineZoom - 0.5));
elements.zoomInBtn.addEventListener("click", () => setTimelineZoom(state.timelineZoom + 0.5));
elements.zoomFitBtn.addEventListener("click", () => setTimelineZoom(1));
elements.collapseToggles.forEach((button) => {
  button.addEventListener("click", () => toggleSection(button));
});

loadRecentSessions();
setupTooltips();
applyMasterVolume();
applyPlaybackRate();
applyMetronomeSettings();
syncTimelineFollowControl();
applyDetailPaneWidth();
renderMeta();
renderBars();
setView("home");

window.chordPilot.onBackendLog((message) => {
  appendLog(message);
});
