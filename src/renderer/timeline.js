function renderTimeline() {
  elements.chordLane.innerHTML = "";
  elements.lyricLane.innerHTML = "";
  elements.beatLane.innerHTML = "";
  elements.visualStemLanes.innerHTML = "";
  applyTimelineZoom();

  if (!hasChart()) {
    elements.timelineSummary.textContent = "Analyze a song to show bars and chords.";
    elements.lyricLane.style.display = "none";
    updatePlayhead();
    return;
  }

  const stems = state.chart.stems?.ok && Array.isArray(state.chart.stems.stems) ? state.chart.stems.stems : [];
  if (typeof ensureStemPlayersForTimeline === "function") {
    ensureStemPlayersForTimeline(state.chart.stems);
  }
  const stemText = stems.length ? ` - ${stems.length} stems` : "";
  const lyricCount = lyricEntries().length;
  const lyricText = lyricCount ? ` - ${lyricCount} lyric lines` : "";
  elements.timelineSummary.textContent = `${state.chart.bars.length} bars - ${chartKeyText(state.chart) || "?"} - ${state.chart.tempo || "?"} BPM${stemText}${lyricText}`;
  buildLane(elements.chordLane, {
    name: "Bars",
    waveform: [],
    type: "chord"
  });
  elements.lyricLane.style.display = "";
  buildLane(elements.lyricLane, {
    name: "Lyrics",
    waveform: [],
    type: "lyrics"
  });
  buildBeatLane();

  const fullMixLane = document.createElement("div");
  fullMixLane.className = "timeline-lane waveform-lane";
  buildLane(fullMixLane, { name: "Full Mix", waveform: state.chart.waveform || [], type: "waveform" });
  elements.visualStemLanes.appendChild(fullMixLane);

  stems.forEach((stem) => {
    const lane = document.createElement("div");
    lane.className = "timeline-lane waveform-lane";
    buildLane(lane, { name: stem.name, waveform: stem.waveform || [], type: "waveform" });
    elements.visualStemLanes.appendChild(lane);
  });

  updateTimelineSelection();
  updatePlayhead();
  if (state.stemPlayers.length) {
    applyStemMix();
  }
}

function chordEventRegionLayout(index) {
  const bar = state.chart?.bars?.[index];
  if (!bar) return [];
  const events = chordEventsForBar(index);
  return events.map((chordEvent, eventIndex) => ({
    eventIndex,
    chordEvent,
    left: percentAt(chordEvent.start),
    width: Math.max(0.1, percentAt(chordEvent.end) - percentAt(chordEvent.start))
  }));
}

function buildLane(lane, options) {
  lane.innerHTML = "";
  lane.style.setProperty("--timeline-body-width", `${timelineBodyWidth()}px`);
  const label = document.createElement("div");
  label.className = "lane-label";
  const labelName = document.createElement("span");
  labelName.className = "lane-name";
  labelName.textContent = options.name;
  label.appendChild(labelName);

  const player = state.stemPlayers.find((item) => item.stem.name === options.name);
  const exportSource = audioExportSourceForLane(options.name, player);
  if (player || exportSource) {
    const controls = document.createElement("div");
    controls.className = "lane-controls";

    if (player) {
      const soloBtn = document.createElement("button");
      soloBtn.type = "button";
      soloBtn.textContent = "S";
      soloBtn.title = `Solo ${options.name}`;
      soloBtn.addEventListener("click", () => {
        enableStemMixPlayback();
        state.soloStem = state.soloStem === options.name ? null : options.name;
        applyStemMix();
      });

      const muteBtn = document.createElement("button");
      muteBtn.type = "button";
      muteBtn.textContent = "M";
      muteBtn.title = `Mute ${options.name}`;
      muteBtn.addEventListener("click", () => {
        enableStemMixPlayback();
        player.muted = !player.muted;
        applyStemMix();
      });

      const volume = document.createElement("input");
      volume.className = "lane-volume";
      volume.type = "range";
      volume.min = "0";
      volume.max = "1";
      volume.step = "0.01";
      volume.value = String(player.volume);
      volume.title = `${options.name} volume`;
      volume.addEventListener("input", () => {
        setStemVolume(player, volume.value);
      });

      player.soloBtn = soloBtn;
      player.muteBtn = muteBtn;
      controls.append(soloBtn, muteBtn, volume);
    }

    if (exportSource) {
      const exportBtn = document.createElement("button");
      exportBtn.type = "button";
      exportBtn.className = "lane-export";
      exportBtn.textContent = "Export";
      exportBtn.title = `Export ${options.name} as WAV, MP3, FLAC, or M4A`;
      exportBtn.addEventListener("click", () => exportAudioTrack(exportSource));
      controls.appendChild(exportBtn);
    }
    label.appendChild(controls);
  }
  lane.appendChild(label);

  const body = document.createElement("div");
  body.className = "lane-body";
  if (options.type === "chord") {
    body.addEventListener("pointermove", (event) => updateChordBoundaryDrag(event, body));
    body.addEventListener("pointerup", (event) => finishChordBoundaryDrag(event, body));
    body.addEventListener("pointercancel", (event) => finishChordBoundaryDrag(event, body));
    body.addEventListener("lostpointercapture", (event) => cancelChordBoundaryDrag(event, body));
  }
  if (options.type === "waveform") {
    body.addEventListener("click", (event) => handleStudyRangeClick(event, body, getChartDuration(), true), true);
  }
  const canvas = document.createElement("canvas");
  canvas.className = "lane-waveform";
  canvas.width = Math.max(1200, timelineBodyWidth());
  canvas.height = options.type === "chord" ? 34 : options.type === "lyrics" ? 40 : 48;
  drawArrangementWaveform(canvas, options.waveform || [], options.type);
  body.appendChild(canvas);

  state.chart.bars.forEach((bar, index) => {
    const left = percentAt(bar.start);
    const marker = document.createElement("button");
    marker.type = "button";
    marker.className = "bar-marker";
    marker.dataset.index = String(index);
    marker.style.left = `${left}%`;
    const displayChord = barChordText(bar);
    marker.title = `Bar ${bar.number}: ${displayChord}`;
    marker.addEventListener("click", () => selectBar(index, true));
    body.appendChild(marker);

    if (options.type === "chord") {
      const events = chordEventsForBar(index);
      chordEventRegionLayout(index).forEach(({ chordEvent, eventIndex, left: eventLeft, width: widthPercent }) => {
        const region = document.createElement("button");
        region.type = "button";
        region.className = "chord-region chord-event-region";
        region.dataset.index = String(index);
        region.dataset.eventIndex = String(eventIndex);
        region.style.left = `${eventLeft}%`;
        region.style.width = `${widthPercent}%`;
        region.textContent = events.length > 1 ? `${bar.number || index + 1}.${eventIndex + 1} ${barChordText({ chord: chordEvent.chord })}` : barRegionLabel(bar, index, widthPercent);
        region.classList.toggle("compact", region.textContent && !region.textContent.includes(" "));
        region.classList.toggle("unlabeled", !region.textContent);
        region.classList.toggle("selected", index === state.selectedIndex && eventIndex === state.selectedChordEventIndex);
        region.classList.toggle("active", index === state.activeIndex && eventIndex === state.activeChordEventIndex);
        region.title = `Bar ${bar.number || index + 1}: ${chordEvent.chord} - ${formatSeconds(chordEvent.start)}–${formatSeconds(chordEvent.end)}s - confidence ${formatConfidence(chordEvent.confidence ?? chordEvent.chord_confidence)}`;
        if (eventIndex < events.length - 1) {
          const boundary = document.createElement("span");
          boundary.className = "chord-event-boundary";
          boundary.dataset.barIndex = String(index);
          boundary.dataset.eventIndex = String(eventIndex);
          boundary.tabIndex = 0;
          boundary.setAttribute("role", "slider");
          boundary.setAttribute("aria-label", `Adjust boundary after ${chordEvent.chord}`);
          boundary.setAttribute("aria-valuemin", String(chordEvent.start + .05));
          boundary.setAttribute("aria-valuemax", String(events[eventIndex + 1].end - .05));
          boundary.setAttribute("aria-valuenow", String(chordEvent.end));
          boundary.addEventListener("pointerdown", (event) => startChordBoundaryDrag(event, index, eventIndex, body));
          boundary.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); });
          boundary.addEventListener("keydown", (event) => handleChordBoundaryKeydown(event, index, eventIndex));
          region.appendChild(boundary);
        }
        region.addEventListener("click", (event) => {
          event.stopPropagation();
          selectBar(index, true, eventIndex);
          showChordSuggestion(index, region);
        });
        body.appendChild(region);
      });
    }
  });

  if (options.type === "lyrics") {
    const entries = lyricEntries();
    if (entries.length) {
      entries.forEach((line) => {
        const start = Number(line.start) || 0;
        const end = Math.max(start + 0.2, Number(line.end) || start + secondsPerBar());
        const region = document.createElement("button");
        region.type = "button";
        region.className = "lyric-region";
        region.style.left = `${percentAt(start)}%`;
        region.style.width = `${Math.max(2, percentAt(end) - percentAt(start))}%`;
        region.textContent = line.text;
        region.title = `${formatSeconds(start)}s - ${formatSeconds(end)}s${Number.isFinite(Number(line.confidence)) ? ` - ${formatConfidence(line.confidence)}` : ""}`;
        region.addEventListener("click", () => {
          elements.audioPlayer.currentTime = Math.max(0, start);
          const barIndex = findActiveBarIndex(start);
          if (barIndex >= 0) {
            state.selectedIndex = barIndex;
          }
          syncStemTimes();
          updateActiveBarFromPlayback();
          updatePlayhead();
          updateRowState({ scroll: true });
        });
        body.appendChild(region);
      });
    } else {
      state.chart.bars.forEach((bar, index) => {
        const start = Number(bar.start) || 0;
        const end = barEndTime(index) || start + secondsPerBar();
        const region = document.createElement("button");
        region.type = "button";
        region.className = "lyric-region empty";
        region.dataset.index = String(index);
        region.style.left = `${percentAt(start)}%`;
        region.style.width = `${Math.max(2, percentAt(end) - percentAt(start))}%`;
        region.textContent = "Add lyrics";
        region.title = `Add lyrics for bar ${bar.number || index + 1}`;
        region.addEventListener("click", () => {
          selectBar(index, true);
          elements.detailLyricsInput.focus();
        });
        body.appendChild(region);
      });
    }
  }

  lane.appendChild(body);
}

function startChordBoundaryDrag(event, barIndex, eventIndex, body) {
  event.preventDefault(); event.stopPropagation();
  (event.currentTarget || event.target)?.focus?.();
  const rect = body.getBoundingClientRect();
  if (!rect.width) return;
  const bar = state.chart?.bars?.[barIndex];
  if (!bar) return;
  state.chordBoundaryDrag = {
    barIndex, eventIndex, body, left: rect.left, width: rect.width, pointerId: event.pointerId,
    chart: state.chart, audio: state.audio, view: state.currentView, editorPanel: state.editorPanel,
    bar, events: bar.chord_events
  };
  body.setPointerCapture?.(event.pointerId);
}

function chordBoundaryDragIsCurrent(drag) {
  return Boolean(drag && state.chart === drag.chart && state.audio === drag.audio
    && state.currentView === drag.view && state.editorPanel === drag.editorPanel
    && state.chart?.bars?.[drag.barIndex] === drag.bar && drag.bar?.chord_events === drag.events);
}

function updateChordBoundaryDrag(event, body) {
  const drag = state.chordBoundaryDrag;
  if (!drag || drag.body !== body || drag.pointerId !== event.pointerId) return;
  if (!chordBoundaryDragIsCurrent(drag)) {
    state.chordBoundaryDrag = null;
    return;
  }
  event.preventDefault();
  const bar = state.chart?.bars?.[drag.barIndex];
  if (!bar) return;
  const time = Math.max(0, Math.min(getChartDuration(), (event.clientX - drag.left) / drag.width * getChartDuration()));
  bar.chord_events = moveChordBoundary(bar.chord_events, drag.eventIndex, time);
  drag.events = bar.chord_events;
  syncBarChordSummary(bar);
  const events = chordEventsForBar(drag.barIndex);
  [...body.querySelectorAll(".chord-event-region")].forEach((region) => {
    if (Number(region.dataset.index) !== drag.barIndex) return;
    const eventIndex = Number(region.dataset.eventIndex);
    const item = events[eventIndex];
    if (item) {
      region.style.left = `${percentAt(item.start)}%`;
      region.style.width = `${Math.max(.1, percentAt(item.end) - percentAt(item.start))}%`;
    }
  });
}

function finishChordBoundaryDrag(event, body) {
  const drag = state.chordBoundaryDrag;
  if (!drag || drag.body !== body) return;
  if (!chordBoundaryDragIsCurrent(drag)) {
    state.chordBoundaryDrag = null;
    return;
  }
  event.preventDefault(); event.stopPropagation();
  const { barIndex, eventIndex } = drag;
  state.chordBoundaryDrag = null;
  renderBars();
  focusChordBoundaryHandle(barIndex, eventIndex);
}

function handleChordBoundaryKeydown(event, barIndex, eventIndex) {
  if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return false;
  event.preventDefault();
  event.stopPropagation();
  const source = state.chart?.bars?.[barIndex];
  const events = source?.chord_events;
  if (!Array.isArray(events) || !events[eventIndex] || !events[eventIndex + 1]) return false;
  const delta = event.key === "ArrowRight" ? .05 : -.05;
  source.chord_events = moveChordBoundary(events, eventIndex, events[eventIndex].end + delta);
  syncBarChordSummary(source);
  renderBars();
  focusChordBoundaryHandle(barIndex, eventIndex);
  return true;
}

function focusChordBoundaryHandle(barIndex, eventIndex) {
  const selector = `.chord-event-boundary[data-bar-index="${barIndex}"][data-event-index="${eventIndex}"]`;
  document.querySelector(selector)?.focus?.();
}

function cancelChordBoundaryDrag(event, body) {
  const drag = state.chordBoundaryDrag;
  if (!drag || drag.body !== body || (event.pointerId !== undefined && drag.pointerId !== event.pointerId)) return;
  state.chordBoundaryDrag = null;
}

function cancelActiveChordBoundaryDrag() {
  state.chordBoundaryDrag = null;
}

function barRegionLabel(bar, index, widthPercent) {
  const displayChord = barChordText(bar);
  const barNumber = String(bar.number || index + 1);
  const widthPixels = (widthPercent / 100) * timelineBodyWidth();
  const denseInterval = barLabelInterval();

  if (widthPixels >= 76) {
    return `${barNumber}. ${displayChord}`;
  }
  if (widthPixels >= 34 || index % denseInterval === 0) {
    return barNumber;
  }
  return "";
}

function barLabelInterval() {
  const bars = Math.max(1, state.chart?.bars?.length || 1);
  const averageBarPixels = timelineBodyWidth() / bars;
  if (averageBarPixels >= 34) {
    return 1;
  }
  return Math.max(2, Math.ceil(58 / Math.max(8, averageBarPixels)));
}

function audioExportSourceForLane(name, player) {
  if (player?.stem?.path) {
    return {
      path: player.stem.path,
      label: `${state.chart?.title || state.audio?.name || "ChordPilot"} - ${player.stem.name}`
    };
  }
  if (name === "Full Mix") {
    const source = state.audioPreview?.path ? {
      path: state.audioPreview.path,
      label: `${state.chart?.title || state.audio?.name || "ChordPilot"} - preview mix`
    } : {
      path: state.audio?.path,
      label: `${state.chart?.title || state.audio?.name || "ChordPilot"} - full mix`
    };
    return source.path ? source : null;
  }
  return null;
}

function buildBeatLane() {
  elements.beatLane.innerHTML = "";
  elements.beatLane.style.setProperty("--timeline-body-width", `${timelineBodyWidth()}px`);

  const label = document.createElement("div");
  label.className = "lane-label beat-label";
  const labelName = document.createElement("span");
  labelName.className = "lane-name";
  labelName.textContent = "Beats";
  const labelHint = document.createElement("span");
  labelHint.className = "lane-hint";
  labelHint.textContent = "bar + pulse";
  label.append(labelName, labelHint);
  elements.beatLane.appendChild(label);

  const body = document.createElement("div");
  body.className = "lane-body beat-body";

  const beats = beatTimes();
  const beatsInBar = beatsPerBar();
  beats.forEach((time, index) => {
    const marker = document.createElement("button");
    marker.type = "button";
    marker.className = index % beatsInBar === 0 ? "beat-marker downbeat" : "beat-marker";
    marker.dataset.index = String(index);
    marker.style.left = `${percentAt(time)}%`;
    marker.title = index % beatsInBar === 0 ? `Downbeat ${formatSeconds(time)}s` : `Beat ${formatSeconds(time)}s`;
    marker.addEventListener("click", () => {
      elements.audioPlayer.currentTime = Math.max(0, time);
      syncStemTimes();
      updateActiveBarFromPlayback();
      updatePlayhead();
    });
    body.appendChild(marker);
  });

  state.chart.bars.forEach((bar, index) => {
    const left = percentAt(bar.start);
    const barTick = document.createElement("div");
    barTick.className = "beat-bar-number";
    barTick.style.left = `${left}%`;
    barTick.textContent = String(bar.number || index + 1);
    body.appendChild(barTick);
  });

  elements.beatLane.appendChild(body);
}

function drawArrangementWaveform(canvas, peaks, type) {
  const context = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  context.clearRect(0, 0, width, height);
  context.fillStyle = type === "chord" || type === "lyrics" ? "#10151c" : "#080c11";
  context.fillRect(0, 0, width, height);

  context.strokeStyle = "rgba(148, 163, 184, 0.14)";
  context.lineWidth = 1;
  for (let x = 0; x < width; x += 80) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }

  const mid = height / 2;
  context.strokeStyle = type === "chord" ? "rgba(148, 163, 184, 0.2)" : type === "lyrics" ? "rgba(246, 198, 91, 0.24)" : "rgba(53, 217, 187, 0.22)";
  context.beginPath();
  context.moveTo(0, mid);
  context.lineTo(width, mid);
  context.stroke();

  if (type === "chord" || type === "lyrics" || !peaks.length) {
    return;
  }

  const source = peaks.map((value) => Math.max(0, Math.min(1, Number(value) || 0)));
  const step = width / Math.max(1, source.length - 1);
  context.fillStyle = "rgba(38, 185, 159, 0.38)";
  context.strokeStyle = "#35d9bb";
  context.lineWidth = 1.2;

  context.beginPath();
  context.moveTo(0, mid);
  source.forEach((peak, index) => {
    const x = index * step;
    const y = Math.max(1, peak * mid * 0.9);
    context.lineTo(x, mid - y);
  });
  for (let index = source.length - 1; index >= 0; index -= 1) {
    const peak = source[index];
    const x = index * step;
    const y = Math.max(1, peak * mid * 0.9);
    context.lineTo(x, mid + y);
  }
  context.closePath();
  context.fill();

  context.beginPath();
  source.forEach((peak, index) => {
    const x = index * step;
    const y = Math.max(1, peak * mid * 0.9);
    if (index === 0) {
      context.moveTo(x, mid - y);
    } else {
      context.lineTo(x, mid - y);
    }
  });
  context.stroke();

  context.beginPath();
  source.forEach((peak, index) => {
    const x = index * step;
    const y = Math.max(1, peak * mid * 0.9);
    if (index === 0) {
      context.moveTo(x, mid + y);
    } else {
      context.lineTo(x, mid + y);
    }
  });
  context.stroke();

  if (source.length < 80) {
    context.strokeStyle = "rgba(229, 240, 248, 0.45)";
    source.forEach((peak, index) => {
      const x = index * step;
      const y = Math.max(1, peak * mid * 0.9);
      context.beginPath();
      context.moveTo(x, mid - y);
      context.lineTo(x, mid + y);
      context.stroke();
    });
  }
}

function updateTimelineSelection() {
  document.querySelectorAll(".bar-marker, .chord-region").forEach((element) => {
    const index = Number(element.dataset.index);
    const eventIndex = Number(element.dataset.eventIndex ?? 0);
    element.classList.toggle("selected", index === state.selectedIndex);
    element.classList.toggle("active", index === state.activeIndex);
    if (element.classList.contains("chord-event-region")) {
      element.classList.toggle("selected", index === state.selectedIndex && eventIndex === state.selectedChordEventIndex);
      element.classList.toggle("active", index === state.activeIndex && eventIndex === state.activeChordEventIndex);
    }
  });
}

function updatePlayhead() {
  const body = elements.timelineViewport.querySelector(".lane-body");
  if (!body) {
    elements.playhead.style.left = "80px";
    updateTimelineTransportInfo();
    return;
  }
  const duration = getChartDuration();
  const originalTime = Number(elements.audioPlayer.currentTime || 0) * (Number(state.audioPreview?.tempoRate) || 1);
  const progress = Math.max(0, Math.min(1, originalTime / duration));
  const left = body.offsetLeft + (body.offsetWidth * progress);
  elements.playhead.style.left = `${left}px`;
  followPlayhead(left, body);
  updateBeatHighlight();
  updateTimelineTransportInfo();
}

function followPlayhead(left, body) {
  if (!state.followTimeCursor || elements.audioPlayer.paused) {
    return;
  }

  const viewport = elements.timelineViewport;
  const stickyLaneWidth = body.offsetLeft;
  const leftPadding = stickyLaneWidth + 24;
  const rightPadding = 72;
  const visibleLeft = viewport.scrollLeft + leftPadding;
  const visibleRight = viewport.scrollLeft + viewport.clientWidth - rightPadding;

  if (left >= visibleLeft && left <= visibleRight) {
    return;
  }

  const followWindow = Math.max(160, viewport.clientWidth - stickyLaneWidth - rightPadding);
  const target = left - stickyLaneWidth - (followWindow * 0.35);
  const maxScroll = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
  viewport.scrollLeft = Math.max(0, Math.min(maxScroll, target));
}

function updateBeatHighlight() {
  const beats = beatTimes();
  if (!beats.length) {
    return;
  }
  const time = elements.audioPlayer.currentTime || 0;
  let active = 0;
  for (let index = 0; index < beats.length; index += 1) {
    if (time >= beats[index] - 0.04) {
      active = index;
    } else {
      break;
    }
  }
  document.querySelectorAll(".beat-marker").forEach((marker) => {
    marker.classList.toggle("active", Number(marker.dataset.index) === active);
  });
}
