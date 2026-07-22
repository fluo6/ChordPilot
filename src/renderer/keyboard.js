function isTypingTarget(target) {
  const tag = target?.tagName?.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable;
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
  syncStemTimes();
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
  if (isTypingTarget(event.target) || event.altKey || event.metaKey) {
    return;
  }

  const key = event.key.toLowerCase();
  if (key === "escape") {
    hideChordSuggestion();
  } else if (event.code === "Space") {
    event.preventDefault();
    togglePlayback();
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
    if (!changeChartKey(1)) {
      setTimelineZoom(state.timelineZoom + 0.5);
    }
  } else if ((key === "-" || key === "_") && !event.ctrlKey) {
    event.preventDefault();
    if (!changeChartKey(-1)) {
      setTimelineZoom(state.timelineZoom - 0.5);
    }
  } else if (key === "0" && !event.ctrlKey) {
    event.preventDefault();
    setTimelineZoom(1);
  } else if (key === "n" && hasChart()) {
    event.preventDefault();
    resetChartKeyToDetected();
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
