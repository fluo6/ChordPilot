let studyPlayback = { players: [], generation: 0, frame: null, active: false, loop: false, range: null };

function isStudyPlaying() { return studyPlayback.active; }
function stopStudyPlayback() {
  studyPlayback.generation += 1;
  if (studyPlayback.frame !== null) cancelAnimationFrame(studyPlayback.frame);
  studyPlayback.players.forEach((player) => { player.pause(); player.src = ""; });
  studyPlayback.players = []; studyPlayback.active = false; studyPlayback.frame = null;
}
function applyStudyPlaybackSettings() {
  studyPlayback.players.forEach((player) => {
    player.volume = Math.max(0, Math.min(1, Number(state.masterVolume) || 0));
    player.playbackRate = Number(state.playbackRate) || 1;
  });
}
async function playStudySelection({ loop = false } = {}) {
  if(typeof stopTranscriptionListen==='function')stopTranscriptionListen();
  const draft = state.study.draft;
  const error = studyRangeError(draft.start, draft.end, studyDuration());
  if (error) { setStudyMessage(error); return false; }
  stopStudyPlayback();
  const generation = studyPlayback.generation;
  const sources = studyOriginalSources();
  if (!draft.sources.length || draft.sources.some((name) => !sources[name]?.url || sources[name]?.exists === false)) {
    setStudyMessage("Selected audio sources are unavailable. Prepare stems or choose Full Mix."); return false;
  }
  elements.audioPlayer.pause(); pauseStems(); stopMetronome();
  const range = [draft.start, draft.end];
  const players = draft.sources.map((name) => {
    const player = new Audio(sources[name].url); player.preload = "auto";
    player.currentTime = range[0];
    player.addEventListener("loadedmetadata", () => {
      if (generation !== studyPlayback.generation) return;
      if (Number.isFinite(player.duration) && player.duration < range[1]) {
        stopStudyPlayback(); setStudyMessage(`Source ${name} does not cover this interval.`); return;
      }
      player.currentTime = range[0];
    });
    player.addEventListener("error", () => {
      if (generation === studyPlayback.generation) { stopStudyPlayback(); setStudyMessage(`Unable to play source ${name}.`); }
    });
    return player;
  });
  studyPlayback.players = players; studyPlayback.range = range; studyPlayback.loop = loop;
  applyStudyPlaybackSettings();
  // Media events keep the interval bounded when a background tab suspends animation frames.
  const checkBoundary = () => {
    if (generation !== studyPlayback.generation) return;
    const master = players[0];
    if (master.currentTime < range[1] && !master.ended) return;
    if (!loop) { stopStudyPlayback(); return; }
    players.forEach((player) => { player.currentTime = range[0]; });
    Promise.all(players.map((player) => player.play())).then(() => {
      if (generation !== studyPlayback.generation) players.forEach((player) => player.pause());
    }).catch(() => { if (generation === studyPlayback.generation) { stopStudyPlayback(); setStudyMessage("Selection playback failed."); } });
  };
  players[0].addEventListener("timeupdate", checkBoundary);
  players[0].addEventListener("ended", checkBoundary);
  try {
    await Promise.all(players.map((player) => player.play()));
    if (generation !== studyPlayback.generation) { players.forEach((player) => player.pause()); return false; }
    studyPlayback.active = true;
    const tick = () => {
      if (generation !== studyPlayback.generation) return;
      const master = players[0];
      checkBoundary();
      if (generation !== studyPlayback.generation) return;
      if (!master.ended) {
        players.slice(1).forEach((player) => {
          if (Math.abs(player.currentTime - master.currentTime) > .08) player.currentTime = master.currentTime;
        });
      }
      studyPlayback.frame = requestAnimationFrame(tick);
    };
    studyPlayback.frame = requestAnimationFrame(tick);
    setStudyMessage(loop ? "Looping selected original audio. Space or Stop ends playback." : "Playing selected original audio.");
    return true;
  } catch (error) {
    players.forEach((player) => player.pause());
    if (generation === studyPlayback.generation) { stopStudyPlayback(); setStudyMessage(`Selection playback failed: ${error.message}`); }
    return false;
  }
}
