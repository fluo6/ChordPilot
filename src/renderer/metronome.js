let metronomeContext = null;
let metronomeTimer = null;
const metronomeScheduledTicks = new Map();

const METRONOME_INTERVAL_MS = 25;
const METRONOME_LOOKAHEAD_SECONDS = 0.18;

function metronomeBeatsPerBar() {
  const beats = Number(String(state.chart?.time_signature || elements.timeInput?.value || "4/4").split("/")[0]);
  return Math.max(1, Math.min(16, Number.isFinite(beats) ? beats : 4));
}

function metronomeSecondsPerBeat() {
  const tempo = Math.max(30, Math.min(260, Number(state.chart?.tempo || elements.tempoInput?.value) || 120));
  return 60 / tempo;
}

function ensureMetronomeContext() {
  if (!metronomeContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      setStatus("Metronome is not available in this browser");
      return null;
    }
    metronomeContext = new AudioContextClass();
  }
  if (metronomeContext.state === "suspended") {
    metronomeContext.resume().catch(() => {});
  }
  return metronomeContext;
}

function applyMetronomeSettings() {
  state.metronomeEnabled = Boolean(state.metronomeEnabled);
  state.metronomeVolume = Math.max(0, Math.min(1, Number(state.metronomeVolume) || 0));
  elements.metronomeEnabledInput.checked = state.metronomeEnabled;
  elements.metronomeVolumeInput.value = String(state.metronomeVolume);
  elements.metronomeVolumeText.textContent = `${Math.round(state.metronomeVolume * 100)}%`;
  elements.metronomeVolumeInput.disabled = !state.metronomeEnabled;
  if (state.metronomeEnabled && !elements.audioPlayer.paused) {
    startMetronome();
  } else if (!state.metronomeEnabled) {
    stopMetronome();
  }
}

function setMetronomeEnabled(value) {
  state.metronomeEnabled = Boolean(value);
  resetMetronomeSchedule();
  applyMetronomeSettings();
  setStatus(state.metronomeEnabled ? "Metronome on" : "Metronome off");
}

function setMetronomeVolume(value) {
  state.metronomeVolume = Number(value);
  applyMetronomeSettings();
}

function resetMetronomeSchedule() {
  metronomeScheduledTicks.clear();
}

function startMetronome() {
  if (!state.metronomeEnabled || elements.audioPlayer.paused) {
    return;
  }
  const context = ensureMetronomeContext();
  if (!context) {
    return;
  }
  if (!metronomeTimer) {
    metronomeTimer = window.setInterval(scheduleMetronomeTicks, METRONOME_INTERVAL_MS);
  }
  scheduleMetronomeTicks();
}

function stopMetronome() {
  if (metronomeTimer) {
    window.clearInterval(metronomeTimer);
    metronomeTimer = null;
  }
  resetMetronomeSchedule();
}

function scheduleMetronomeTicks() {
  if (!state.metronomeEnabled || elements.audioPlayer.paused) {
    stopMetronome();
    return;
  }

  const context = ensureMetronomeContext();
  if (!context) {
    stopMetronome();
    return;
  }

  const mediaTime = Number(elements.audioPlayer.currentTime) || 0;
  const playbackRate = Math.max(0.05, Number(elements.audioPlayer.playbackRate || state.playbackRate) || 1);
  const mediaLookahead = (METRONOME_LOOKAHEAD_SECONDS + METRONOME_INTERVAL_MS / 1000) * playbackRate;
  const ticks = collectMetronomeTicks(mediaTime - 0.02, mediaTime + mediaLookahead);

  ticks.forEach((tick) => {
    if (metronomeScheduledTicks.has(tick.key)) {
      return;
    }
    const secondsUntilTick = (tick.time - mediaTime) / playbackRate;
    if (secondsUntilTick < -0.04) {
      return;
    }
    metronomeScheduledTicks.set(tick.key, tick.time);
    playMetronomeClick(context, context.currentTime + Math.max(0, secondsUntilTick), tick.accented);
  });

  const pruneBefore = mediaTime - metronomeSecondsPerBeat() * metronomeBeatsPerBar();
  metronomeScheduledTicks.forEach((time, key) => {
    if (time < pruneBefore) {
      metronomeScheduledTicks.delete(key);
    }
  });
}

function collectMetronomeTicks(startTime, endTime) {
  const secondsPerBeat = metronomeSecondsPerBeat();
  const beatsPerBar = metronomeBeatsPerBar();
  const bars = Array.isArray(state.chart?.bars) ? state.chart.bars : [];
  if (!bars.length) {
    return collectGridMetronomeTicks(startTime, endTime, secondsPerBeat, beatsPerBar);
  }

  const ticks = [];
  bars.forEach((bar, barIndex) => {
    const barStart = Number(bar.start);
    if (!Number.isFinite(barStart)) {
      return;
    }
    const nextBarStart = Number(bars[barIndex + 1]?.start);
    const barEnd = Number.isFinite(nextBarStart) ? nextBarStart : barStart + secondsPerBeat * beatsPerBar;
    if (barEnd < startTime || barStart > endTime) {
      return;
    }
    for (let beat = 0; beat < beatsPerBar; beat += 1) {
      const time = barStart + beat * secondsPerBeat;
      if (time >= startTime && time <= endTime && time < barEnd - 0.015) {
        ticks.push({
          time,
          accented: beat === 0,
          key: `bar:${barIndex}:${beat}:${time.toFixed(3)}`
        });
      }
    }
  });
  return ticks;
}

function collectGridMetronomeTicks(startTime, endTime, secondsPerBeat, beatsPerBar) {
  const ticks = [];
  const firstBeat = Math.max(0, Math.floor(startTime / secondsPerBeat));
  const lastBeat = Math.ceil(endTime / secondsPerBeat);
  for (let beat = firstBeat; beat <= lastBeat; beat += 1) {
    const time = beat * secondsPerBeat;
    if (time >= startTime && time <= endTime) {
      ticks.push({
        time,
        accented: beat % beatsPerBar === 0,
        key: `grid:${beat}:${time.toFixed(3)}`
      });
    }
  }
  return ticks;
}

function playMetronomeClick(context, startTime, accented) {
  if (!context?.createOscillator || !Number.isFinite(startTime)) {
    setStatus("Metronome click could not be scheduled");
    return;
  }

  const volume = Math.max(0, Math.min(1, Number(state.metronomeVolume) || 0));
  if (volume <= 0) {
    return;
  }

  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const duration = accented ? 0.055 : 0.04;
  const peak = volume * (accented ? 0.42 : 0.28);

  oscillator.type = "square";
  oscillator.frequency.setValueAtTime(accented ? 1760 : 1174.66, startTime);
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), startTime + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.02);
}
