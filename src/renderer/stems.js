function clearStems() {
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

  elements.audioPlayer.muted = hasStems;
  state.stemPlayers.forEach((player) => {
    const selected = !solo || player.stem.name === solo;
    const audible = selected && !player.muted;
    player.audio.muted = player.muted || !selected;
    player.soloBtn?.classList.toggle("active-control", player.stem.name === solo);
    player.muteBtn?.classList.toggle("active-control", player.muted);

    if (!audible) {
      player.audio.pause();
    } else if (!elements.audioPlayer.paused) {
      syncStemTime(player);
      player.audio.play().catch(() => {});
    }
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
    return;
  }
  if (isSourcePlaybackMode()) {
    pauseStems();
    elements.audioPlayer.muted = false;
    return;
  }
  applyStemMix();
  const solo = state.soloStem;
  state.stemPlayers.forEach((player) => {
    if ((!solo || player.stem.name === solo) && !player.muted) {
      syncStemTime(player);
      player.audio.play().catch(() => {});
    } else {
      player.audio.pause();
    }
  });
}

function pauseStems() {
  state.stemPlayers.forEach((player) => player.audio.pause());
}
