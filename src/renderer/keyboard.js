function isTypingTarget(target) {
  const tag = target?.tagName?.toLowerCase();
  return Boolean(tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable);
}

function isSpaceTypingTarget(target) {
  const tag = target?.tagName?.toLowerCase();
  if (tag === "textarea" || target?.isContentEditable) {
    return true;
  }
  if (tag !== "input") {
    return false;
  }
  const type = String(target.type || "text").toLowerCase();
  return ["text", "search", "email", "url", "tel", "password"].includes(type);
}

function togglePlayback() {
  if (!elements.audioPlayer.src) {
    return;
  }
  if (elements.audioPlayer.paused) {
    elements.audioPlayer.play().catch((error) => setStatus(error.message));
  } else {
    elements.audioPlayer.pause();
  }
}

function seekRelative(seconds) {
  if (!elements.audioPlayer.src) {
    return;
  }
  const duration = Number(elements.audioPlayer.duration);
  const max = Number.isFinite(duration) ? duration : getChartDuration();
  elements.audioPlayer.currentTime = Math.max(0, Math.min(max, (elements.audioPlayer.currentTime || 0) + seconds));
  syncStemTimes({ isSeek: true });
  updateActiveBarFromPlayback();
  updatePlayhead();
}

function selectRelativeBar(offset) {
  if (!hasChart()) {
    return;
  }
  const base = state.selectedIndex >= 0 ? state.selectedIndex : state.activeIndex;
  const next = Math.max(0, Math.min(state.chart.bars.length - 1, base + offset));
  selectBar(next, true);
}

function handleKeyboardShortcut(event) {
  if (typeof state !== "undefined" && event.key.toLowerCase() === "escape" && state.study?.selectionAnchor !== null && state.study?.selectionAnchor !== undefined && !isTypingTarget(event.target)) {
    state.study.selectionAnchor = null; state.study.selectMode = false;
    if (typeof renderStudy === "function") renderStudy();
  }
  if (typeof state !== "undefined" && event.code === "Space" && state.currentView === "song" && state.editorPanel === "study" && !isSpaceTypingTarget(event.target)) {
    event.preventDefault();
    if (isStudyPlaying()) stopStudyPlayback(); else playStudySelection();
    return;
  }
  if (event.altKey || event.metaKey) {
    return;
  }

  const key = event.key.toLowerCase();
  if (event.code === "Space") {
    if (isSpaceTypingTarget(event.target)) {
      return;
    }
    event.preventDefault();
    togglePlayback();
    return;
  }

  if (isTypingTarget(event.target)) {
    return;
  }

  if (key === "escape") {
    hideChordSuggestion();
  } else if (key === "arrowleft") {
    event.preventDefault();
    if (event.shiftKey) {
      selectRelativeBar(-1);
    } else {
      seekRelative(-5);
    }
  } else if (key === "arrowright") {
    event.preventDefault();
    if (event.shiftKey) {
      selectRelativeBar(1);
    } else {
      seekRelative(5);
    }
  } else if (key === "," || key === "<") {
    event.preventDefault();
    selectRelativeBar(-1);
  } else if (key === "." || key === ">") {
    event.preventDefault();
    selectRelativeBar(1);
  } else if ((key === "=" || key === "+") && !event.ctrlKey) {
    event.preventDefault();
    if (!changeKeyWithAudioPreview(() => changeChartKey(1))) {
      setTimelineZoom(state.timelineZoom + 0.5);
    }
  } else if ((key === "-" || key === "_") && !event.ctrlKey) {
    event.preventDefault();
    if (!changeKeyWithAudioPreview(() => changeChartKey(-1))) {
      setTimelineZoom(state.timelineZoom - 0.5);
    }
  } else if (key === "0" && !event.ctrlKey) {
    event.preventDefault();
    setTimelineZoom(1);
  } else if (key === "n" && hasChart()) {
    event.preventDefault();
    changeKeyWithAudioPreview(resetChartKeyToDetected);
  } else if (key === "a" && hasChart()) {
    event.preventDefault();
    addBar();
  } else if (key === "d" && hasChart() && state.selectedIndex >= 0) {
    event.preventDefault();
    duplicateBar();
  } else if (key === "s" && hasChart() && state.selectedIndex >= 0) {
    event.preventDefault();
    splitBar();
  } else if (key === "backspace" || key === "delete") {
    if (hasChart() && state.selectedIndex >= 0) {
      event.preventDefault();
      deleteBar();
    }
  }
}
