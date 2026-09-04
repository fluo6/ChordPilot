function setStatus(message) {
  elements.statusText.textContent = message;
}

function showErrorDialog(title, message, detail = "") {
  const cleanMessage = String(message || "An error occurred.");
  if (typeof appendLog === "function") {
    appendLog(`error: ${title || "ChordPilot"} - ${cleanMessage}${detail ? ` (${detail})` : ""}`);
  }
  if (window.chordPilot?.showMessage) {
    window.chordPilot.showMessage({
      type: "error",
      title: title || "ChordPilot",
      message: cleanMessage,
      detail: detail || ""
    }).catch(() => {
      window.alert(cleanMessage);
    });
    return;
  }
  window.alert(cleanMessage);
}

const tooltipState = {
  element: null,
  target: null,
  timer: null,
  x: 0,
  y: 0
};

function setupTooltips() {
  tooltipState.element = document.createElement("div");
  tooltipState.element.className = "app-tooltip";
  tooltipState.element.setAttribute("role", "tooltip");
  document.body.appendChild(tooltipState.element);

  document.addEventListener("pointerover", handleTooltipOver, true);
  document.addEventListener("pointermove", handleTooltipMove, true);
  document.addEventListener("pointerout", handleTooltipOut, true);
  document.addEventListener("focusin", handleTooltipFocus, true);
  document.addEventListener("focusout", hideTooltip, true);
  document.addEventListener("scroll", hideTooltip, true);
  window.addEventListener("keydown", hideTooltip);
}

function tooltipTargetFrom(eventTarget) {
  const target = eventTarget?.closest?.("[data-tooltip], [title]");
  if (!target || target.disabled) {
    return null;
  }
  const title = target.getAttribute("title");
  if (title) {
    target.dataset.tooltip = title;
    target.setAttribute("aria-label", target.getAttribute("aria-label") || title);
    target.removeAttribute("title");
  }
  return target.dataset.tooltip ? target : null;
}

function handleTooltipOver(event) {
  const target = tooltipTargetFrom(event.target);
  if (!target) {
    return;
  }
  tooltipState.target = target;
  tooltipState.x = event.clientX;
  tooltipState.y = event.clientY;
  clearTimeout(tooltipState.timer);
  tooltipState.timer = setTimeout(showTooltip, 120);
}

function handleTooltipMove(event) {
  if (!tooltipState.target) {
    return;
  }
  tooltipState.x = event.clientX;
  tooltipState.y = event.clientY;
  if (tooltipState.element?.classList.contains("visible")) {
    positionTooltip();
  }
}

function handleTooltipOut(event) {
  if (!tooltipState.target || tooltipState.target.contains(event.relatedTarget)) {
    return;
  }
  hideTooltip();
}

function handleTooltipFocus(event) {
  const target = tooltipTargetFrom(event.target);
  if (!target) {
    return;
  }
  const rect = target.getBoundingClientRect();
  tooltipState.target = target;
  tooltipState.x = rect.left + rect.width / 2;
  tooltipState.y = rect.bottom;
  clearTimeout(tooltipState.timer);
  tooltipState.timer = setTimeout(showTooltip, 80);
}

function showTooltip() {
  const text = tooltipState.target?.dataset.tooltip;
  if (!text || !tooltipState.element) {
    return;
  }
  tooltipState.element.textContent = text;
  tooltipState.element.classList.add("visible");
  positionTooltip();
}

function positionTooltip() {
  const tooltip = tooltipState.element;
  if (!tooltip) {
    return;
  }
  const margin = 10;
  const offset = 14;
  const rect = tooltip.getBoundingClientRect();
  let left = tooltipState.x + offset;
  let top = tooltipState.y + offset;
  if (left + rect.width + margin > window.innerWidth) {
    left = tooltipState.x - rect.width - offset;
  }
  if (top + rect.height + margin > window.innerHeight) {
    top = tooltipState.y - rect.height - offset;
  }
  tooltip.style.left = `${Math.max(margin, left)}px`;
  tooltip.style.top = `${Math.max(margin, top)}px`;
}

function hideTooltip() {
  clearTimeout(tooltipState.timer);
  tooltipState.target = null;
  tooltipState.element?.classList.remove("visible");
}

function setAnalysisActive(active, message = "Analyzing...") {
  state.isAnalyzing = Boolean(active);
  if (elements.analyzeBtn) {
    elements.analyzeBtn.disabled = active;
    elements.analyzeBtn.classList.toggle("analyzing", active);
    elements.analyzeBtn.textContent = active ? "Analyzing..." : "Analyze";
  }
  if (elements.globalProgressBar) {
    elements.globalProgressBar.classList.toggle("hidden", !active);
  }
  if (elements.topbarAnalysisBadge) {
    elements.topbarAnalysisBadge.classList.toggle("hidden", !active);
    if (active && elements.topbarAnalysisText) {
      elements.topbarAnalysisText.textContent = message;
    }
  }
  if (elements.navLogSpinner) {
    elements.navLogSpinner.classList.toggle("hidden", !active);
  }
  if (elements.logActiveBanner) {
    elements.logActiveBanner.classList.toggle("hidden", !active);
    if (active && elements.logActiveText) {
      elements.logActiveText.textContent = message;
    }
  }
  if (active) {
    setStatus(message);
  }
}

function updateAnalysisProgressMessage(message) {
  if (!state.isAnalyzing || !message) return;
  const clean = String(message).trim();
  let label = null;
  if (clean.startsWith("analysis: queued")) label = "Queued for analysis...";
  else if (clean.startsWith("analysis: started")) label = "Analysis started...";
  else if (clean.startsWith("hq: preparing source separation") || clean.startsWith("hq:") || clean.includes("demucs")) label = "Separating stems (Demucs)...";
  else if (clean.startsWith("tempo:") || clean.includes("autocorrelation")) label = "Estimating tempo & beats...";
  else if (clean.startsWith("pitch:") || clean.startsWith("key:") || clean.includes("chroma")) label = "Detecting pitch & key...";
  else if (clean.startsWith("chords:") || clean.includes("candidates")) label = "Ranking chord candidates...";
  else if (clean.startsWith("lyrics:")) label = "Transcribing lyrics...";
  else if (clean.startsWith("analysis: still running")) {
    const match = clean.match(/still running \(([^)]+)\)/);
    label = match ? `Analyzing (${match[1]})...` : "Still analyzing...";
  } else if (clean.startsWith("analysis: complete")) {
    setAnalysisActive(false);
    return;
  } else if (clean.startsWith("analysis: failed")) {
    setAnalysisActive(false);
    return;
  }

  if (label) {
    if (elements.topbarAnalysisText) elements.topbarAnalysisText.textContent = label;
    if (elements.logActiveText) elements.logActiveText.textContent = label;
    setStatus(label);
  }
}

function appendLog(message) {
  if (!message) {
    return;
  }
  updateAnalysisProgressMessage(message);
  const row = document.createElement("div");
  row.className = "log-line";
  const time = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  row.textContent = `${time}  ${message}`;
  elements.analysisLog.appendChild(row);
  elements.analysisLog.scrollTop = elements.analysisLog.scrollHeight;
}

function beginLoading(message = "Working...") {
  state.loadingCount += 1;
  elements.loadingText.textContent = message;
  elements.loadingOverlay.classList.remove("hidden");
  document.body.classList.add("loading");
  return () => endLoading();
}

function endLoading() {
  state.loadingCount = Math.max(0, state.loadingCount - 1);
  if (state.loadingCount > 0) {
    return;
  }
  elements.loadingOverlay.classList.add("hidden");
  document.body.classList.remove("loading");
}

function clearLog() {
  elements.analysisLog.innerHTML = "";
}

function loadRecentSessions() {
  try {
    state.recentSessions = JSON.parse(localStorage.getItem("chordpilot.recentSessions") || "[]");
  } catch (_error) {
    state.recentSessions = [];
  }
}

function saveRecentSessions() {
  localStorage.setItem("chordpilot.recentSessions", JSON.stringify(state.recentSessions.slice(0, 12)));
}

function rememberSession(path, session) {
  if (!path) {
    return;
  }
  const title = session?.chart?.title || session?.audio?.name || "Untitled";
  const row = {
    path,
    title,
    audioName: session?.audio?.name || "",
    artist: session?.audio?.artist || "",
    album: session?.audio?.album || "",
    coverUrl: session?.audio?.coverUrl || "",
    coverPath: session?.audio?.coverPath || "",
    key: chartKeyText(session?.chart) || session?.chart?.key || "",
    tempo: session?.chart?.tempo || "",
    savedAt: new Date().toISOString(),
    bars: Array.isArray(session?.chart?.bars) ? session.chart.bars.length : 0
  };
  state.recentSessions = [row, ...state.recentSessions.filter((item) => item.path !== path)].slice(0, 12);
  saveRecentSessions();
  renderHome();
}

function addJob(message, status = "done") {
  state.jobs = [{
    message,
    status,
    time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
  }, ...state.jobs].slice(0, 8);
  renderJobs();
}

function setView(view) {
  updateProjectNavigation();
  if (view === "song" && !hasProject()) {
    view = "home";
  }
  state.currentView = view;
  elements.homeView.classList.toggle("hidden", view !== "home");
  elements.helpView.classList.toggle("hidden", view !== "help");
  elements.editorView.classList.toggle("hidden", view !== "song");
  elements.navItems.forEach((item) => {
    item.classList.toggle("active", item.dataset.view === view || (view === "song" && item.dataset.editorView === state.editorPanel));
  });
  if (view === "song") {
    setEditorPanel(state.editorPanel || "arrange");
    requestAnimationFrame(() => applyTimelineZoom({ render: true }));
  } else if (view === "home") {
    renderHome();
  }
}

function setEditorPanel(name) {
  state.editorPanel = name || "arrange";
  elements.editorView.dataset.panel = state.editorPanel;
  elements.navItems.forEach((item) => {
    item.classList.toggle("active", item.dataset.editorView === state.editorPanel || (state.currentView === "home" && item.dataset.view === "home"));
  });
  if (typeof applyStemMix === "function") {
    applyStemMix();
  }
  requestAnimationFrame(() => {
    if (state.editorPanel === "arrange" || state.editorPanel === "analysis") {
      applyTimelineZoom({ render: true });
    }
  });
}

function openEditorPanel(name) {
  if (!hasProject()) {
    setView("home");
    setStatus("Open or analyze a song first");
    return;
  }
  setEditorPanel(name);
  setView("song");
}

function toggleLeftPane() {
  const collapsed = elements.leftPane.classList.toggle("collapsed-rail");
  document.querySelector(".app-frame")?.classList.toggle("rail-collapsed", collapsed);
  elements.leftPaneToggle.textContent = collapsed ? ">" : "<";
  elements.leftPaneToggle.title = collapsed ? "Expand navigation" : "Collapse navigation";
  requestAnimationFrame(() => applyTimelineZoom({ render: true }));
}

function applyDetailPaneWidth() {
  const workspace = elements.arrangementResizeHandle?.closest(".workspace");
  const workspaceWidth = workspace?.clientWidth || 0;
  const maxWidth = workspaceWidth ? Math.max(190, Math.min(520, workspaceWidth - 360)) : 520;
  state.detailPaneWidth = Math.max(190, Math.min(maxWidth, Number(state.detailPaneWidth) || 236));
  elements.editorView.style.setProperty("--detail-pane-width", `${state.detailPaneWidth}px`);
}

function startArrangementResize(event) {
  if (event.button !== 0) {
    return;
  }
  event.preventDefault();
  const startX = event.clientX;
  const startWidth = state.detailPaneWidth;
  elements.arrangementResizeHandle.classList.add("active");
  document.body.classList.add("resizing-detail-pane");

  const onPointerMove = (moveEvent) => {
    state.detailPaneWidth = startWidth - (moveEvent.clientX - startX);
    applyDetailPaneWidth();
    applyTimelineZoom();
  };

  const onPointerUp = () => {
    elements.arrangementResizeHandle.classList.remove("active");
    document.body.classList.remove("resizing-detail-pane");
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  };

  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp, { once: true });
}

function renderHome() {
  const projectOpen = hasProject();
  updateProjectNavigation();
  elements.homeGoSongBtn.disabled = !projectOpen;
  elements.homeGoSongBtn.classList.toggle("hidden", !projectOpen);

  if (!projectOpen) {
    elements.currentProjectCard.classList.remove("has-cover");
    elements.currentProjectCard.innerHTML = "<span>No project selected</span>";
  } else {
    const title = state.chart?.title || state.audio?.title || state.audio?.name || "Untitled";
    const meta = [
      state.audio?.artist || "",
      state.audio?.album || "",
      state.chart?.key ? `Key ${chartKeyText(state.chart)}` : "",
      state.chart?.tempo ? `${state.chart.tempo} BPM` : "",
      Array.isArray(state.chart?.bars) ? `${state.chart.bars.length} bars` : "Not analyzed"
    ].filter(Boolean).join(" / ");
    elements.currentProjectCard.innerHTML = "";
    elements.currentProjectCard.classList.add("has-cover");
    const cover = createProjectCover("project-cover");
    elements.currentProjectCard.appendChild(cover);
    const info = document.createElement("div");
    info.className = "project-info";
    const titleEl = document.createElement("strong");
    titleEl.textContent = title;
    const metaEl = document.createElement("span");
    metaEl.textContent = meta;
    const pathEl = document.createElement("span");
    pathEl.textContent = state.audio?.path || "No audio file";
    info.append(titleEl, metaEl, pathEl);
    elements.currentProjectCard.appendChild(info);
  }

  elements.recentSessionsList.innerHTML = "";
  if (!state.recentSessions.length) {
    elements.recentSessionsList.innerHTML = "<span>No saved sessions yet</span>";
  } else {
    state.recentSessions.forEach((session) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "recent-session";
      button.classList.add("has-cover");
      button.appendChild(createCoverTile("recent-cover", session.coverUrl || ""));
      const info = document.createElement("div");
      info.className = "recent-session-info";
      const title = document.createElement("strong");
      title.textContent = session.title;
      const audio = document.createElement("span");
      audio.textContent = [session.artist, session.album].filter(Boolean).join(" / ") || session.audioName || session.path;
      const bars = document.createElement("em");
      bars.textContent = [
        formatRecentSessionTime(session.savedAt),
        session.key ? `Key ${session.key}` : "",
        session.tempo ? `${session.tempo} BPM` : "",
        `${session.bars || 0} bars`
      ].filter(Boolean).join(" / ");
      info.append(title, audio, bars);
      button.appendChild(info);
      button.title = session.path;
      button.addEventListener("click", () => openSessionPath(session.path));
      elements.recentSessionsList.appendChild(button);
    });
  }
  renderJobs();
}

function createProjectCover(className) {
  return createCoverTile(className, state.audio?.coverUrl || "");
}

function createCoverTile(className, coverUrl = "") {
  if (coverUrl) {
    const image = document.createElement("img");
    image.className = className;
    image.src = coverUrl;
    image.alt = "";
    return image;
  }

  const fallback = document.createElement("div");
  fallback.className = `${className} placeholder-cover`;
  fallback.setAttribute("aria-hidden", "true");
  fallback.innerHTML = `
    <svg viewBox="0 0 24 24">
      <path d="M9 18V5l10-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="16" cy="16" r="3" />
    </svg>
  `;
  return fallback;
}

function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "";
  }
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function sourceFileType(audio = state.audio) {
  const extension = String(audio?.extension || "").replace(/^\./, "").trim();
  if (!extension) {
    return "Audio file";
  }
  return `${extension.toUpperCase()} audio`;
}

function formatRecentSessionTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return `Saved ${new Intl.DateTimeFormat([], {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date)}`;
}

function renderSourceInfo() {
  if (!elements.sourceInfoPanel) {
    return;
  }
  elements.sourceInfoPanel.innerHTML = "";
  if (!state.audio) {
    elements.sourceInfoPanel.innerHTML = "<span>No source audio selected</span>";
    return;
  }

  elements.sourceInfoPanel.appendChild(createProjectCover("source-cover"));
  const details = document.createElement("div");
  details.className = "source-details";

  const title = document.createElement("strong");
  title.textContent = state.audio.title || state.audio.name || "Untitled source";
  const subtitle = document.createElement("span");
  subtitle.textContent = [state.audio.artist, state.audio.album].filter(Boolean).join(" / ") || "Unknown artist / album";
  details.append(title, subtitle);

  const actions = document.createElement("div");
  actions.className = "source-actions";
  const lookupButton = document.createElement("button");
  lookupButton.type = "button";
  lookupButton.textContent = "Find Online";
  lookupButton.title = "Manually connect to MusicBrainz and try to fill missing title, artist, album, year, and cover metadata from the file name or existing tags.";
  lookupButton.addEventListener("click", lookupSourceMetadata);
  const lookupStatus = document.createElement("span");
  lookupStatus.textContent = state.audio.metadataSource ? `Set from ${state.audio.metadataSource}` : "Manual internet lookup";
  actions.append(lookupButton, lookupStatus);
  details.appendChild(actions);

  const fields = [
    ["File", state.audio.name],
    ["Type", sourceFileType()],
    ["Size", formatBytes(state.audio.size)],
    ["Artist", state.audio.artist],
    ["Album", state.audio.album],
    ["Year", state.audio.date],
    ["Genre", state.audio.genre],
    ["Metadata", state.audio.metadataUrl || state.audio.metadataSource],
    ["Path", state.audio.path]
  ].filter((item) => item[1]);

  const fileCard = document.createElement("section");
  fileCard.className = "source-file-details";
  const fileTitle = document.createElement("h3");
  fileTitle.textContent = "File Details";
  const grid = document.createElement("dl");
  grid.className = "source-fields";
  fields.forEach(([label, value]) => {
    const term = document.createElement("dt");
    term.textContent = label;
    const description = document.createElement("dd");
    description.textContent = value;
    grid.append(term, description);
  });
  fileCard.append(fileTitle, grid);
  details.appendChild(fileCard);
  elements.sourceInfoPanel.appendChild(details);
}

function updateProjectIdentity(fallbackLabel) {
  const title = state.audio?.title || state.audio?.name || "ChordPilot";
  const meta = fallbackLabel || [
    state.audio?.artist || "",
    state.audio?.album || "",
    state.audio?.name || ""
  ].filter(Boolean).join(" / ") || "Choose an MP3 or WAV to begin.";

  elements.topbarTitle.textContent = title;
  elements.fileLabel.textContent = meta;
  elements.topbarCover.replaceChildren();
  elements.topbarCover.classList.remove("hidden");
  elements.topbarCover.classList.toggle("has-image", Boolean(state.audio?.coverUrl));
  if (state.audio?.coverUrl) {
    elements.topbarCover.style.backgroundImage = `url("${state.audio.coverUrl}")`;
  } else {
    elements.topbarCover.style.backgroundImage = "";
    elements.topbarCover.innerHTML = `
      <svg viewBox="0 0 24 24">
        <path d="M9 18V5l10-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="16" cy="16" r="3" />
      </svg>
    `;
  }
  renderSourceInfo();
}

function renderJobs() {
  elements.jobList.innerHTML = "";
  if (!state.jobs.length) {
    elements.jobList.innerHTML = "<span>No analysis jobs yet</span>";
    return;
  }
  state.jobs.forEach((job) => {
    const row = document.createElement("div");
    row.className = `job-row ${job.status}`;
    const time = document.createElement("strong");
    time.textContent = job.time;
    const message = document.createElement("span");
    message.textContent = job.message;
    row.append(time, message);
    elements.jobList.appendChild(row);
  });
}

function toggleSection(button) {
  const section = button.closest(".editor-section, .collapsible, .timeline-panel");
  if (!section) {
    return;
  }
  const collapsed = section.classList.toggle("collapsed");
  button.textContent = collapsed ? ">" : "v";
  button.title = collapsed ? "Expand section" : "Collapse section";
  requestAnimationFrame(() => {
    applyTimelineZoom({ render: true });
  });
}

function hasChart() {
  return Boolean(state.chart && Array.isArray(state.chart.bars));
}

function hasProject() {
  return Boolean(state.audio || hasChart());
}

function updateProjectNavigation() {
  const projectOpen = hasProject();
  elements.projectNavItems.forEach((item) => {
    item.classList.toggle("hidden", !projectOpen);
    item.disabled = !projectOpen;
  });
  if (!projectOpen && state.currentView === "song") {
    state.currentView = "home";
  }
}

function syncMetaToState() {
  if (!state.chart) {
    return;
  }
  state.chart.title = elements.titleInput.value.trim() || "Untitled";
  state.chart.key = elements.keyInput.value.trim() || "C";
  ensureChartKeyState(state.chart);
  ensureChartTempoState(state.chart);
  state.chart.key_offset = keyOffsetBetween(state.chart.detected_key, state.chart.key);
  state.chart.tempo = Number(elements.tempoInput.value) || 120;
  state.chart.time_signature = elements.timeInput.value.trim() || "4/4";
  updateKeyControlState();
  updateAudioPreviewState();
}

function collectAnalysisOptions() {
  return {
    known_key: elements.analysisKeyInput.value || "",
    min_bpm: Number(elements.minBpmInput.value) || 60,
    max_bpm: Number(elements.maxBpmInput.value) || 190,
    beat_offset: Number(elements.beatOffsetInput.value) || 0,
    onset_frame: Number(elements.onsetFrameInput.value) || 2048,
    onset_hop: Number(elements.onsetHopInput.value) || 512,
    chroma_low_hz: Number(elements.chromaLowInput.value) || 65,
    chroma_high_hz: Number(elements.chromaHighInput.value) || 1800,
    chord_alternatives: Number(elements.alternativesInput.value) || 6,
    chord_source: elements.chordSourceInput.value || "auto",
    demucs_model: elements.demucsModelInput.value || "htdemucs",
    use_cache: elements.useCacheInput.checked,
    simplify_chords: elements.simplifyChordsInput.checked,
    lyrics_enabled: elements.lyricsEnabledInput.checked,
    lyrics_source: elements.lyricsSourceInput.value || "auto",
    lyrics_model: elements.lyricsModelInput.value || "tiny",
    lyrics_language: elements.lyricsLanguageInput.value || ""
  };
}

function applyAnalysisOptions(options = {}) {
  elements.analysisKeyInput.value = options.known_key || "";
  elements.minBpmInput.value = options.min_bpm ?? 60;
  elements.maxBpmInput.value = options.max_bpm ?? 190;
  elements.beatOffsetInput.value = options.beat_offset ?? 0;
  elements.onsetFrameInput.value = String(options.onset_frame ?? 2048);
  elements.onsetHopInput.value = String(options.onset_hop ?? 512);
  elements.chromaLowInput.value = options.chroma_low_hz ?? 65;
  elements.chromaHighInput.value = options.chroma_high_hz ?? 1800;
  elements.alternativesInput.value = options.chord_alternatives ?? 6;
  elements.chordSourceInput.value = options.chord_source || "auto";
  elements.demucsModelInput.value = options.demucs_model || "htdemucs";
  elements.useCacheInput.checked = options.use_cache !== false;
  elements.simplifyChordsInput.checked = options.simplify_chords !== false;
  elements.lyricsEnabledInput.checked = Boolean(options.lyrics_enabled);
  elements.lyricsSourceInput.value = options.lyrics_source || "auto";
  elements.lyricsModelInput.value = options.lyrics_model || "tiny";
  elements.lyricsLanguageInput.value = options.lyrics_language || "";
}

function applyMasterVolume() {
  state.masterVolume = Math.max(0, Math.min(1, Number(state.masterVolume) || 0));
  elements.masterVolumeInput.value = String(state.masterVolume);
  elements.masterVolumeText.textContent = `${Math.round(state.masterVolume * 100)}%`;
  elements.arrangementMasterVolumeInput.value = String(state.masterVolume);
  elements.arrangementMasterVolumeText.textContent = `${Math.round(state.masterVolume * 100)}%`;
  elements.audioPlayer.volume = state.masterVolume;
  state.stemPlayers.forEach((player) => {
    player.audio.volume = Math.max(0, Math.min(1, (Number(player.volume) || 0) * state.masterVolume));
  });
}

function setMediaPlaybackRate(media, rate) {
  if (!media) {
    return;
  }
  ["preservesPitch", "mozPreservesPitch", "webkitPreservesPitch"].forEach((property) => {
    if (property in media) {
      media[property] = true;
    }
  });
  try {
    media.playbackRate = rate;
    media.defaultPlaybackRate = rate;
  } catch (_error) {
    media.playbackRate = 1;
  }
}

function applyPlaybackRate() {
  const rate = Math.max(0.5, Math.min(2, Number(state.playbackRate) || 1));
  state.playbackRate = rate;
  const rateText = Number.isInteger(rate) ? String(rate) : String(rate).replace(/0+$/, "").replace(/\.$/, "");
  elements.playbackRateInput.value = String(rate);
  elements.playbackRateText.textContent = `${rateText}x`;
  elements.playbackRateInput.title = `Playback speed ${rate}x`;
  elements.arrangementPlaybackRateInput.value = String(rate);
  elements.arrangementPlaybackRateText.textContent = `${rateText}x`;
  elements.arrangementPlaybackRateInput.title = `Playback speed ${rate}x`;
  setMediaPlaybackRate(elements.audioPlayer, rate);
  state.stemPlayers.forEach((player) => setMediaPlaybackRate(player.audio, rate));
  if (typeof resetMetronomeSchedule === "function") {
    resetMetronomeSchedule();
  }
}

function updateButtons() {
  const chartReady = hasChart();
  elements.addBarBtn.disabled = !chartReady;
  elements.duplicateBarBtn.disabled = !chartReady || state.selectedIndex < 0;
  elements.splitBarBtn.disabled = !chartReady || state.selectedIndex < 0;
  elements.mergeBarBtn.disabled = !chartReady || state.selectedIndex < 0 || state.selectedIndex >= state.chart.bars.length - 1;
  elements.deleteBarBtn.disabled = !chartReady || state.selectedIndex < 0;
  const canReanalyze = Boolean(state.audio?.path);
  elements.reanalyzeChordsBtn.disabled = !canReanalyze;
  elements.reanalyzeLyricsBtn.disabled = !canReanalyze || !chartReady;
  elements.reanalyzeAllBtn.disabled = !canReanalyze;
  updateKeyControlState();
  updateAudioPreviewState();
  elements.exportButtons.forEach((button) => {
    button.disabled = !chartReady;
  });
  elements.saveSessionBtn.disabled = !state.audio && !chartReady;
}

function renumberBars() {
  if (!hasChart()) {
    return;
  }
  state.chart.bars.forEach((bar, index) => {
    bar.number = index + 1;
  });
}

function getBarLabel(index) {
  if (!hasChart() || index < 0 || index >= state.chart.bars.length) {
    return "Bar -";
  }

  const bar = state.chart.bars[index];
  return `Bar ${bar.number || index + 1} - ${bar.section || "Section"} - ${bar.chord || ""}`;
}

function updateRowState(options = {}) {
  state.barRows.forEach((row, index) => {
    row.classList.toggle("selected", index === state.selectedIndex);
    row.classList.toggle("active", index === state.activeIndex);
  });
  renderChartPreview();

  elements.activeBarText.textContent = getBarLabel(state.activeIndex);
  updateDetailPane();
  updateTimelineSelection();
  updateTimelineTransportInfo();
  updateButtons();

  if (options.scroll && state.activeIndex >= 0) {
    const row = state.barRows[state.activeIndex];
    if (row) {
      row.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }
}

function getChartDuration() {
  const chartDuration = Number(state.chart?.duration);
  if (Number.isFinite(chartDuration) && chartDuration > 0) {
    return chartDuration;
  }
  const audioDuration = Number(elements.audioPlayer.duration);
  if (Number.isFinite(audioDuration) && audioDuration > 0) {
    return audioDuration;
  }
  const last = state.chart?.bars?.at(-1);
  return Math.max(1, Number(last?.start || 0) + secondsPerBar());
}

function percentAt(seconds) {
  return Math.max(0, Math.min(100, (Number(seconds || 0) / getChartDuration()) * 100));
}

function timelineBodyWidth() {
  const duration = getChartDuration();
  const viewportWidth = Math.max(720, elements.timelineViewport.clientWidth - 134);
  const pixelsPerSecond = 8 * state.timelineZoom;
  return Math.max(viewportWidth, Math.round(duration * pixelsPerSecond));
}

function applyTimelineZoom(options = {}) {
  state.timelineZoom = Math.max(1, Math.min(8, Number(state.timelineZoom) || 1));
  elements.timelineZoomInput.value = String(state.timelineZoom);
  syncTimelineFollowControl();
  elements.timelineViewport.style.setProperty("--timeline-body-width", `${timelineBodyWidth()}px`);
  if (options.render) {
    renderTimeline();
  } else {
    updatePlayhead();
  }
}

function syncTimelineFollowControl() {
  if (elements.timelineFollowInput) {
    elements.timelineFollowInput.checked = state.followTimeCursor !== false;
  }
}

function setTimelineFollow(value) {
  state.followTimeCursor = Boolean(value);
  syncTimelineFollowControl();
  updatePlayhead();
}

function formatTimelineTransportTime(value) {
  const total = Math.max(0, Number(value) || 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = Math.floor(total % 60);
  const centiseconds = Math.floor((total % 1) * 100);
  const clock = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
  return hours ? `${hours}:${clock}` : clock;
}

function timelineBeatLabel(bar, index, time) {
  const beats = beatsPerBar();
  const start = Number(bar?.start) || 0;
  const tempo = Number(state.chart?.tempo) || 120;
  const fallbackLength = (60 / tempo) * beats;
  const end = Math.max(start, barEndTime(index) || start + fallbackLength);
  const beatLength = (end - start) / Math.max(1, beats);
  if (!Number.isFinite(beatLength) || beatLength <= 0) {
    return "-";
  }
  const beat = Math.max(1, Math.min(beats, Math.floor((Math.max(0, time - start) / beatLength)) + 1));
  return `${beat} / ${beats}`;
}

function updateTimelineTransportInfo() {
  if (!elements.timelineTransportInfo) {
    return;
  }

  const time = elements.audioPlayer.currentTime || 0;
  const duration = Number(elements.audioPlayer.duration);
  const playState = elements.audioPlayer.paused ? (time > 0 ? "Paused" : "Stopped") : "Playing";
  elements.timelineTransportInfo.classList.toggle("playing", playState === "Playing");
  elements.timelinePlayState.textContent = playState;
  const displayDuration = Number.isFinite(duration) ? duration : (hasChart() ? getChartDuration() : 0);
  elements.timelineTimeText.textContent = `${formatTimelineTransportTime(time)} / ${formatTimelineTransportTime(displayDuration)}`;

  const index = findActiveBarIndex(time);
  const bar = hasChart() && index >= 0 ? state.chart.bars[index] : null;
  elements.timelineBarText.textContent = bar ? String(bar.number || index + 1) : "-";
  elements.timelineBeatText.textContent = bar ? timelineBeatLabel(bar, index, time) : "-";
  elements.timelineChordText.textContent = bar ? `${barChordText(bar)}${bar.section ? ` - ${bar.section}` : ""}` : "-";
}

function setTimelineZoom(value, anchorTime = elements.audioPlayer.currentTime || 0, anchorClientX = null) {
  const previous = state.timelineZoom;
  state.timelineZoom = Math.max(1, Math.min(8, Number(value) || 1));
  if (state.timelineZoom === previous) {
    return;
  }
  renderTimeline();
  const body = elements.timelineViewport.querySelector(".lane-body");
  if (body) {
    const progress = Math.max(0, Math.min(1, Number(anchorTime || 0) / getChartDuration()));
    const viewportOffset = Number.isFinite(anchorClientX)
      ? anchorClientX - elements.timelineViewport.getBoundingClientRect().left
      : elements.timelineViewport.clientWidth / 2;
    const target = body.offsetLeft + (body.offsetWidth * progress) - viewportOffset;
    elements.timelineViewport.scrollLeft = Math.max(0, target);
  }
  updatePlayhead();
}

function handleTimelineWheel(event) {
  if (!event.ctrlKey) {
    return;
  }
  event.preventDefault();
  const body = elements.timelineViewport.querySelector(".lane-body");
  const duration = getChartDuration();
  const bodyRect = body?.getBoundingClientRect();
  const anchorTime = bodyRect?.width
    ? Math.max(0, Math.min(1, (event.clientX - bodyRect.left) / bodyRect.width)) * duration
    : elements.audioPlayer.currentTime || 0;
  const zoomStep = event.deltaY < 0 ? 0.25 : -0.25;
  setTimelineZoom(state.timelineZoom + zoomStep, anchorTime, event.clientX);
}

function renderMeta() {
  if (!state.chart) {
    elements.titleInput.value = "";
    elements.keyInput.value = "";
    elements.arrangementKeyInput.value = "";
    elements.tempoInput.value = "";
    elements.timeInput.value = "";
    updateKeyInputHint();
    updateAudioPreviewState();
    return;
  }

  ensureChartKeyState(state.chart);
  ensureChartTempoState(state.chart);
  populateKeyOptions();
  elements.titleInput.value = state.chart.title || "";
  elements.keyInput.value = state.chart.key || "";
  elements.arrangementKeyInput.value = state.chart.key || "";
  elements.tempoInput.value = state.chart.tempo || "";
  elements.timeInput.value = state.chart.time_signature || "4/4";
  updateKeyInputHint();
  updateAudioPreviewState();
}

function createInput(value, onChange, className) {
  const input = document.createElement("input");
  input.value = value ?? "";
  if (className) {
    input.className = className;
  }
  input.addEventListener("input", () => onChange(input.value));
  return input;
}

function createTextarea(value, onChange, className) {
  const textarea = document.createElement("textarea");
  textarea.value = value ?? "";
  textarea.rows = 2;
  if (className) {
    textarea.className = className;
  }
  textarea.addEventListener("input", () => onChange(textarea.value));
  return textarea;
}
