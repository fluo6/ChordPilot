let stemPlaybackRequest = 0;

function clearStems() {
  stemPlaybackRequest += 1;
  state.stemPlayers.forEach((item) => {
    item.audio.pause();
    item.audio.src = "";
  });
  state.stemPlayers = [];
  state.soloStem = null;
  state.useStemMixPlayback = false;
  elements.audioPlayer.muted = false;
  renderTableStemMixer();
}

function enableStemMixPlayback() {
  state.useStemMixPlayback = true;
}

function stemMixSnapshot() {
  return {
    soloStem: state.soloStem,
    players: new Map(state.stemPlayers.map((player) => [player.stem.name, {
      muted: player.muted,
      volume: player.volume
    }]))
  };
}

function isSourcePlaybackMode() {
  return state.currentView === "song" && state.editorPanel === "arrange" && !state.useStemMixPlayback;
}

function previewStemByName() {
  const stems = state.audioPreview?.stems?.ok && Array.isArray(state.audioPreview.stems.stems)
    ? state.audioPreview.stems.stems
    : [];
  return new Map(stems.map((stem) => [stem.name, stem]));
}

function hasCompletePreviewStems(stems, previewStems = previewStemByName()) {
  if (!state.audioPreview || !stems.length) {
    return true;
  }
  return stems.every((stem) => {
    const preview = previewStems.get(stem.name);
    return preview?.url && (preview?.path || window.chordPilot?.isWebRuntime);
  });
}

function createStemPlayers(stemsResult, previousMix = stemMixSnapshot()) {
  clearStems();
  if (!stemsResult || !stemsResult.ok) {
    return false;
  }

  const stems = Array.isArray(stemsResult.stems) ? stemsResult.stems : [];
  const previewStems = previewStemByName();
  if (!hasCompletePreviewStems(stems, previewStems)) {
    appendLog?.("stems: using transposed preview mix because matching preview stems are unavailable");
    return false;
  }

  stems.forEach((sourceStem) => {
    const previewStem = previewStems.get(sourceStem.name);
    const stem = previewStem ? { ...sourceStem, ...previewStem } : sourceStem;
    const previous = previousMix.players.get(stem.name);
    const audio = new Audio(stem.url);
    audio.preload = "auto";
    const player = {
      stem,
      audio,
      soloBtn: null,
      muteBtn: null,
      muted: previous?.muted || false,
      volume: Number.isFinite(Number(previous?.volume)) ? Number(previous.volume) : 0.8
    };
    state.stemPlayers.push(player);
  });
  if (previousMix.soloStem && state.stemPlayers.some((player) => player.stem.name === previousMix.soloStem)) {
    state.soloStem = previousMix.soloStem;
  }
  renderTableStemMixer();
  return state.stemPlayers.length > 0;
}

function createStemVolumeInput(player, output = null) {
  const input = document.createElement("input");
  input.className = "lane-volume";
  input.type = "range";
  input.min = "0";
  input.max = "1";
  input.step = "0.01";
  input.value = String(player.volume);
  input.title = `${player.stem.name} volume`;
  input.setAttribute("aria-label", input.title);
  input.setAttribute("aria-valuetext", `${Math.round(player.volume * 100)}%`);
  if (output) output.textContent = `${Math.round(player.volume * 100)}%`;
  // Rebuilt timeline lanes must not retain detached sliders.
  player.volumeControls = (player.volumeControls || []).filter(control => control.input.isConnected);
  player.volumeControls.push({ input, output });
  input.addEventListener("input", () => setStemVolume(player, input.value));
  return input;
}

function renderTableStemMixer() {
  const mixer = elements.tableStemMixer;
  if (!mixer) return;
  mixer.replaceChildren();
  mixer.hidden = !state.stemPlayers.length;
  if (mixer.hidden) return;
  const title = document.createElement("strong");
  title.textContent = "Stem volumes";
  mixer.append(title);
  state.stemPlayers.forEach(player => {
    const label = document.createElement("label");
    label.className = "table-stem-volume";
    const name = document.createElement("span");
    name.textContent = player.stem.name;
    const output = document.createElement("output");
    label.append(name, createStemVolumeInput(player, output), output);
    mixer.append(label);
  });
}

function ensureStemPlayersForTimeline(stemsResult) {
  if (state.stemPlayers.length || !stemsResult?.ok) {
    return false;
  }
  return createStemPlayers(stemsResult);
}

function renderStems(stemsResult) {
  if (!stemsResult) {
    clearStems();
    renderTimeline();
    return;
  }

  if (!stemsResult.ok) {
    clearStems();
    appendLog(`stems: ${stemsResult.error || "Stem separation unavailable"}`);
    renderTimeline();
    return;
  }

  const stems = Array.isArray(stemsResult.stems) ? stemsResult.stems : [];
  appendLog(`stems: ${stems.length} ready in arrangement lanes`);
  createStemPlayers(stemsResult);

  syncStemTimes();
  renderTimeline();
  applyMasterVolume();
  applyPlaybackRate();
  applyStemMix();
}

function setStemVolume(player, value) {
  if (!player) {
    return;
  }
  const volume = Number(value);
  player.volume = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0;
  player.volumeControls = (player.volumeControls || []).filter(control => control.input.isConnected);
  player.volumeControls.forEach(({ input, output }) => {
    input.value = String(player.volume);
    input.setAttribute("aria-valuetext", `${Math.round(player.volume * 100)}%`);
    if (output) output.textContent = `${Math.round(player.volume * 100)}%`;
  });
  enableStemMixPlayback();
  applyMasterVolume();
  if (!elements.audioPlayer.paused) {
    return applyStemMix();
  }
}

function applyStemMix() {

  const request = ++stemPlaybackRequest;
  const solo = state.soloStem;
  const hasStems = state.stemPlayers.length > 0;
  if (isSourcePlaybackMode()) {
    elements.audioPlayer.muted = false;
    state.stemPlayers.forEach((player) => {
      player.audio.pause();
      player.soloBtn?.classList.toggle("active-control", player.stem.name === solo);
      player.muteBtn?.classList.toggle("active-control", player.muted);
    });
    return;
  }

  const audiblePlayers = [];
  state.stemPlayers.forEach((player) => {
    const selected = !solo || player.stem.name === solo;
    const audible = selected && !player.muted;
    player.audio.muted = player.muted || !selected;
    player.soloBtn?.classList.toggle("active-control", player.stem.name === solo);
    player.muteBtn?.classList.toggle("active-control", player.muted);

    if (!audible) {
      player.audio.pause();
    } else {
      audiblePlayers.push(player);
    }
  });

  if (elements.audioPlayer.paused) {
    elements.audioPlayer.muted = false;
    return Promise.resolve(false);
  }

  if (!audiblePlayers.length) {
    elements.audioPlayer.muted = hasStems;
    return Promise.resolve(false);
  }

  // Keep the source muted while stem mix is starting to prevent double playback / phasing.
  elements.audioPlayer.muted = true;
  return Promise.all(audiblePlayers.map(async (player) => {
    syncStemTime(player, { isSeek: true });
    try {
      await player.audio.play();
      return true;
    } catch (_error) {
      return false;
    }
  })).then((results) => {
    if (request !== stemPlaybackRequest || isSourcePlaybackMode() || elements.audioPlayer.paused) {
      return false;
    }
    const stemStarted = results.some(Boolean);
    elements.audioPlayer.muted = stemStarted;
    return stemStarted;
  }).catch(() => {
    if (request === stemPlaybackRequest && !isSourcePlaybackMode() && !elements.audioPlayer.paused) {
      elements.audioPlayer.muted = false;
    }
    return false;
  });
}

function setPlayerPlaybackRate(player, rate) {
  if (typeof setMediaPlaybackRate === "function") {
    setMediaPlaybackRate(player.audio, rate);
  } else {
    try {
      player.audio.playbackRate = rate;
      player.audio.defaultPlaybackRate = rate;
    } catch (_error) {}
  }
}

function syncStemTime(player, { isSeek = false } = {}) {
  const masterTime = Number(elements.audioPlayer?.currentTime) || 0;
  const stemTime = Number(player.audio?.currentTime) || 0;
  const drift = stemTime - masterTime;
  const baseRate = Math.max(0.05, Number(elements.audioPlayer?.playbackRate || state.playbackRate) || 1);

  if (isSeek || elements.audioPlayer?.paused) {
    if (Math.abs(drift) > 0.01 && !player.audio?.seeking) {
      player.audio.currentTime = masterTime;
    }
    setPlayerPlaybackRate(player, baseRate);
    return;
  }

  // Catastrophic drift (> 0.4s) - e.g. background tab or severe system lag
  if (Math.abs(drift) > 0.4) {
    const now = Date.now();
    if (!player.audio?.seeking && (!player._lastHardSeek || now - player._lastHardSeek > 1500)) {
      player._lastHardSeek = now;
      player.audio.currentTime = masterTime;
      setPlayerPlaybackRate(player, baseRate);
    }
    return;
  }

  // Micro-rate adjustment (PLL slewing) to eliminate drift smoothly without audio seeks/dropouts
  if (drift < -0.025) {
    const slew = Math.min(1.05, 1.0 + Math.abs(drift) * 0.25);
    setPlayerPlaybackRate(player, baseRate * slew);
  } else if (drift > 0.025) {
    const slew = Math.max(0.95, 1.0 - Math.abs(drift) * 0.25);
    setPlayerPlaybackRate(player, baseRate * slew);
  } else {
    setPlayerPlaybackRate(player, baseRate);
  }
}

function syncStemTimes({ isSeek = false } = {}) {
  if (!state.stemPlayers.length) {
    return;
  }
  const solo = state.soloStem;
  state.stemPlayers.forEach((player) => {
    if ((!solo || player.stem.name === solo) && !player.muted) {
      syncStemTime(player, { isSeek });
    }
  });
}

function playStems() {
  if (!state.stemPlayers.length) {
    elements.audioPlayer.muted = false;
    return Promise.resolve(false);
  }
  if (isSourcePlaybackMode()) {
    pauseStems();
    elements.audioPlayer.muted = false;
    return Promise.resolve(false);
  }
  return applyStemMix();
}

function pauseStems() {
  state.stemPlayers.forEach((player) => {
    player.audio.pause();
    setPlayerPlaybackRate(player, Number(state.playbackRate) || 1);
  });
}
