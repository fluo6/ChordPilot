function transposeModulo(value, base = 12) {
  return ((value % base) + base) % base;
}

function wrapTransposeOffset(offset) {
  let wrapped = Number(offset) || 0;
  while (wrapped > 11) {
    wrapped -= 12;
  }
  while (wrapped < -11) {
    wrapped += 12;
  }
  return wrapped;
}

function transposeNormalizePitchName(note) {
  const clean = String(note || "").trim();
  if (!clean) {
    return "";
  }
  const root = clean.length >= 2 && ["#", "b"].includes(clean[1]) ? clean.slice(0, 2) : clean.slice(0, 1);
  const normalized = root[0]?.toUpperCase() + (root[1] || "");
  const enharmonics = {
    ...ENHARMONIC_TO_PITCH,
    "E#": "F",
    "B#": "C",
    "CB": "B",
    "FB": "E"
  };
  return enharmonics[normalized.toUpperCase()] || normalized;
}

function transposePitchIndex(note) {
  return PITCH_NAMES.indexOf(transposeNormalizePitchName(note));
}

function transposePitchName(note, semitones) {
  const index = transposePitchIndex(note);
  if (index < 0) {
    return String(note || "");
  }
  return PITCH_NAMES[transposeModulo(index + semitones)];
}

function keyOffsetBetween(sourceKey, targetKey) {
  const keyRoot = (value) => String(value || "").trim().match(/^([A-Ga-g][#b]?)(?:\s*(?:m|minor|major))?$/)?.[1] || "";
  const sourceRoot = keyRoot(sourceKey);
  const targetRoot = keyRoot(targetKey);
  if (!sourceRoot || !targetRoot) {
    return 0;
  }
  const source = transposePitchIndex(sourceRoot);
  const target = transposePitchIndex(targetRoot);
  if (source < 0 || target < 0) {
    return 0;
  }
  const upward = transposeModulo(target - source);
  return upward > 6 ? upward - 12 : upward;
}

function transposeKeyName(keyName, semitones) {
  const clean = String(keyName || "C").trim();
  const match = clean.match(/^([A-Ga-g])([#b]?)(.*)$/);
  if (!match) {
    return clean || "C";
  }
  return `${transposePitchName(`${match[1].toUpperCase()}${match[2] || ""}`, semitones)}${match[3] || ""}`;
}

function ensureChartKeyState(chart) {
  if (!chart) {
    return;
  }
  const currentKey = String(chart.key || "").trim() || "C";
  const detectedKey = String(chart.detected_key || chart.native_key || currentKey).trim() || currentKey;
  chart.detected_key = detectedKey;
  chart.native_key = chart.native_key || detectedKey;
  if (!Number.isFinite(Number(chart.key_offset))) {
    chart.key_offset = keyOffsetBetween(detectedKey, currentKey);
  } else {
    chart.key_offset = wrapTransposeOffset(Number(chart.key_offset));
  }
}

function ensureChartTempoState(chart) {
  if (!chart) {
    return;
  }
  const currentTempo = Number(chart.tempo) || 120;
  chart.detected_tempo = Number(chart.detected_tempo || chart.native_tempo || currentTempo) || currentTempo;
  chart.native_tempo = chart.native_tempo || chart.detected_tempo;
}

function chartKeyText(chart = state.chart) {
  if (!chart?.key) {
    return "";
  }
  ensureChartKeyState(chart);
  const offset = Number(chart.key_offset) || 0;
  const suffix = offset ? ` (${offset > 0 ? "+" : ""}${offset})` : "";
  return `${chart.key}${suffix}`;
}

function detectedKeySuffix(chart = state.chart) {
  const detected = String(chart?.detected_key || chart?.key || "C").trim();
  const match = detected.match(/^[A-Ga-g][#b]?(.*)$/);
  return match ? match[1] || "" : "";
}

function populateKeyOptions() {
  if (!elements.keyInput) {
    return;
  }
  const suffix = detectedKeySuffix();
  const values = PITCH_NAMES.map((name) => `${name}${suffix}`);
  const current = String(state.chart?.key || "").trim();
  if (current && !values.includes(current)) {
    values.push(current);
  }
  [elements.keyInput, elements.arrangementKeyInput].filter(Boolean).forEach((select) => {
    select.innerHTML = "";
    values.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
  });
}

function updateKeyInputHint() {
  if (!elements.keyInput) {
    return;
  }
  if (!state.chart) {
    [elements.keyInput, elements.arrangementKeyInput].filter(Boolean).forEach((select) => {
      select.title = "";
    });
    [elements.keyOffsetText, elements.arrangementKeyOffsetText].filter(Boolean).forEach((item) => {
      item.textContent = "-";
      item.title = "No chart loaded";
    });
    return;
  }
  ensureChartKeyState(state.chart);
  ensureChartTempoState(state.chart);
  const detected = state.chart.detected_key || state.chart.key || "C";
  [elements.keyInput, elements.arrangementKeyInput].filter(Boolean).forEach((select) => {
    select.title = `Original analysis key: ${detected}. Choose a transpose target key; the audio preview updates automatically.`;
  });
  const offset = Number(state.chart.key_offset) || 0;
  [elements.keyOffsetText, elements.arrangementKeyOffsetText].filter(Boolean).forEach((item) => {
    item.textContent = offset ? `${offset > 0 ? "+" : ""}${offset}` : "0";
    item.title = `Original analysis key: ${detected}`;
  });
}

function updateKeyControlState() {
  const chartReady = hasChart();
  [elements.keyNativeBtn, elements.arrangementKeyNativeBtn].forEach((button) => {
    if (button) {
      button.disabled = !chartReady;
    }
  });
  updateKeyInputHint();
}

function audioTempoRate() {
  ensureChartTempoState(state.chart);
  const detectedTempo = Number(state.chart?.detected_tempo) || Number(state.chart?.tempo) || 120;
  const targetTempo = Number(state.chart?.tempo) || detectedTempo;
  return Math.max(0.5, Math.min(2, targetTempo / detectedTempo));
}

function clampTuningReferenceHz(value) {
  return Math.max(400, Math.min(480, Number(value) || 440));
}

function tuningCents() {
  const referenceHz = clampTuningReferenceHz(state.tuningReferenceHz);
  return 1200 * Math.log2(referenceHz / 440);
}

function tuningSemitones() {
  return tuningCents() / 100;
}

function formatCents(cents) {
  if (Math.abs(cents) < 0.05) {
    return "0 cents";
  }
  const rounded = Math.round(cents * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded} cents`;
}

function updateTuningControlState() {
  state.tuningReferenceHz = clampTuningReferenceHz(state.tuningReferenceHz);
  if (elements.tuningReferenceInput) {
    elements.tuningReferenceInput.value = String(Math.round(state.tuningReferenceHz * 10) / 10);
    elements.tuningReferenceInput.title = `Reference tuning ${state.tuningReferenceHz} Hz`;
  }
  if (elements.tuningOffsetText) {
    elements.tuningOffsetText.textContent = formatCents(tuningCents());
  }
}

function setTuningReferenceHz(value) {
  state.tuningReferenceHz = clampTuningReferenceHz(value);
  updateTuningControlState();
  updateAudioPreviewState();
}

function updateAudioPreviewState() {
  const chartReady = hasChart();
  const audioReady = Boolean(state.audio?.path);
  updateTuningControlState();
  if (elements.applyAudioPreviewBtn) {
    elements.applyAudioPreviewBtn.disabled = !chartReady || !audioReady || state.audioPreviewBusy;
    elements.applyAudioPreviewBtn.textContent = state.audioPreviewBusy ? "Rendering..." : "Apply Audio Preview";
  }
  if (elements.resetAudioPreviewBtn) {
    elements.resetAudioPreviewBtn.disabled = !state.audioPreview;
  }
  if (elements.audioPreviewText) {
    if (state.audioPreviewBusy) {
      elements.audioPreviewText.textContent = "Rendering preview";
    } else if (state.audioPreview) {
      const keyOffset = Number(state.audioPreview.semitones) || 0;
      const tempo = Number(state.audioPreview.tempoRate) || 1;
      const pitchText = Math.abs(keyOffset - Math.round(keyOffset)) < 0.01
        ? `${keyOffset > 0 ? "+" : ""}${Math.round(keyOffset)} st`
        : `${keyOffset > 0 ? "+" : ""}${keyOffset.toFixed(2)} st`;
      elements.audioPreviewText.textContent = `Preview ${pitchText}, ${tempo.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}x`;
    } else {
      const cents = tuningCents();
      elements.audioPreviewText.textContent = Math.abs(cents) < 0.05 ? "Original audio" : `Ready ${formatCents(cents)}`;
    }
  }
}

function transposeChordText(symbol, semitones) {
  if (symbol === null || symbol === undefined) {
    return "";
  }
  const text = String(symbol);
  if (!text || semitones === 0 || /^\s*(N\.?C\.?|\/)\s*$/i.test(text)) {
    return text;
  }
  return text.replace(/(^|[\s(\[{/|,;])([A-Ga-g])([#b]?)(?=$|[\s)\]}|,;/:+0-9#b]|m|M|a|d|s)/g, (_match, prefix, root, accidental) => {
    const transposed = transposePitchName(`${root.toUpperCase()}${accidental || ""}`, semitones);
    return `${prefix}${transposed}`;
  });
}

function transposeChordChoice(choice, semitones) {
  if (choice && typeof choice === "object" && "chord" in choice) {
    choice.chord = transposeChordText(choice.chord, semitones);
  }
}

function transposeBarChordFields(bar, semitones) {
  if (!bar) {
    return;
  }
  bar.chord = transposeChordText(bar.chord, semitones);
  if (Array.isArray(bar.alternatives)) {
    bar.alternatives.forEach((item) => transposeChordChoice(item, semitones));
  }
  if (bar.debug && typeof bar.debug === "object") {
    if (bar.debug.chosen_chord) {
      bar.debug.chosen_chord = transposeChordText(bar.debug.chosen_chord, semitones);
    }
    if (Array.isArray(bar.debug.alternatives)) {
      bar.debug.alternatives.forEach((item) => transposeChordChoice(item, semitones));
    }
  }
}

function transposeChartBySemitones(semitones) {
  if (!hasChart() || semitones === 0) {
    return;
  }
  state.chart.bars.forEach((bar) => transposeBarChordFields(bar, semitones));
}

function refreshTransposedChart(status) {
  hideChordSuggestion();
  renderMeta();
  renderBars();
  renderHome();
  setStatus(status);
}

function changeChartKey(step) {
  if (!hasChart()) {
    return false;
  }
  syncMetaToState();
  ensureChartKeyState(state.chart);
  const currentOffset = Number(state.chart.key_offset) || 0;
  const nextOffset = wrapTransposeOffset(currentOffset + step);
  const delta = nextOffset - currentOffset;
  transposeChartBySemitones(delta);
  state.chart.key_offset = nextOffset;
  state.chart.key = transposeKeyName(state.chart.detected_key, nextOffset);
  refreshTransposedChart(`Transposed to ${chartKeyText()} from ${state.chart.detected_key}`);
  return true;
}

function setChartTargetKey(targetKey) {
  if (!hasChart()) {
    return false;
  }
  ensureChartKeyState(state.chart);
  const currentOffset = Number(state.chart.key_offset) || 0;
  const nextOffset = wrapTransposeOffset(keyOffsetBetween(state.chart.detected_key, targetKey));
  const delta = nextOffset - currentOffset;
  transposeChartBySemitones(delta);
  state.chart.key_offset = nextOffset;
  state.chart.key = targetKey || transposeKeyName(state.chart.detected_key, nextOffset);
  refreshTransposedChart(`Transposed to ${chartKeyText()} from ${state.chart.detected_key}`);
  updateAudioPreviewState();
  return true;
}

function resetChartKeyToDetected() {
  if (!hasChart()) {
    return false;
  }
  syncMetaToState();
  ensureChartKeyState(state.chart);
  const currentOffset = Number(state.chart.key_offset) || 0;
  transposeChartBySemitones(-currentOffset);
  state.chart.key_offset = 0;
  state.chart.key = state.chart.detected_key || state.chart.native_key || state.chart.key || "C";
  refreshTransposedChart(`Restored original key ${state.chart.key}`);
  updateAudioPreviewState();
  return true;
}
