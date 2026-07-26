let stemPlaybackRequest = 0;

function clearStems() {
  stemPlaybackRequest += 1;
  state.stemPlayers.forEach((item) => {
    item.audio.pause();
    item.audio.src = "";
  });
  state.stemPlayers = [];
  state.soloStem = null;
  elements.audioPlayer.muted = false;
}

function isSourcePlaybackMode() {
  return state.currentView === "song" && state.editorPanel === "arrange";
}

function renderStems(stemsResult) {
  clearStems();
  if (!stemsResult) {
    renderTimeline();
    return;
  }

  if (!stemsResult.ok) {
    appendLog(`stems: ${stemsResult.error || "Stem separation unavailable"}`);
    renderTimeline();
    return;
  }

  const stems = Array.isArray(stemsResult.stems) ? stemsResult.stems : [];
  appendLog(`stems: ${stems.length} ready in arrangement lanes`);

  stems.forEach((stem) => {
    const audio = new Audio(stem.url);
    audio.preload = "metadata";
    const player = { stem, audio, soloBtn: null, muteBtn: null, muted: false, volume: 0.8 };
    state.stemPlayers.push(player);
  });

  syncStemTimes();
  renderTimeline();
  applyMasterVolume();
  applyPlaybackRate();
  applyStemMix();
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

  // Keep the source audible until at least one stem has actually started.
  // A rejected stem play request must not leave the Analysis tab silent.
  elements.audioPlayer.muted = false;
  return Promise.all(audiblePlayers.map(async (player) => {
    syncStemTime(player);
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
  });
}

function syncStemTime(player) {
  const time = elements.audioPlayer.currentTime || 0;
  if (Math.abs(player.audio.currentTime - time) > 0.08) {
    player.audio.currentTime = time;
  }
}

function syncStemTimes() {
  if (!state.stemPlayers.length) {
    return;
  }
  const solo = state.soloStem;
  state.stemPlayers.forEach((player) => {
    if ((!solo || player.stem.name === solo) && !player.muted) {
      syncStemTime(player);
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
  state.stemPlayers.forEach((player) => player.audio.pause());
}
