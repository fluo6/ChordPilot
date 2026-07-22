function formatSeconds(value) {
  if (!Number.isFinite(value)) {
    return "0";
  }
  return String(Math.round(value * 100) / 100);
}

function formatConfidence(value) {
  if (!Number.isFinite(Number(value))) {
    return "-";
  }
  return `${Math.round(Number(value) * 100)}%`;
}

function confidenceClass(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "confidence unknown";
  }
  if (numeric < 0.25) {
    return "confidence low";
  }
  if (numeric < 0.45) {
    return "confidence medium";
  }
  return "confidence high";
}

function cloneBar(bar) {
  return JSON.parse(JSON.stringify(bar));
}

function getSelectedBar() {
  if (!hasChart() || state.selectedIndex < 0) {
    return null;
  }
  return state.chart.bars[state.selectedIndex];
}

function secondsPerBar() {
  syncMetaToState();
  const tempo = Number(state.chart?.tempo) || 120;
  const beats = Number(String(state.chart?.time_signature || "4/4").split("/")[0]) || 4;
  return (60 / tempo) * beats;
}
