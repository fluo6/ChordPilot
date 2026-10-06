function studyElement(id) { return document.getElementById(id); }
function studyDuration() {
  const duration = Number(elements.audioPlayer.duration);
  return Number.isFinite(duration) && duration > 0 ? duration : Number(state.chart?.duration || state.audio?.duration || 0);
}
function studyAudioIdentity() { return state.audio?.id || state.audio?.path || state.audio?.url || ""; }
function studySaveToken() { return JSON.stringify({ studies: state.studies, draft: state.study.draft, pending: state.study.pendingRuns }); }
function setStudyMessage(message) {
  state.study.message = message; setStatus(message);
  if (elements.studyPanel) studyElement("studyStatus").textContent = message;
}
function studyOriginalSources() {
  const stems = state.chart?.stems?.ok ? state.chart.stems.stems || [] : [];
  return { full_mix: state.audio, ...Object.fromEntries(stems.map((stem) => [stem.name, stem])) };
}
function studyCurrentRuns() {
  return [...(state.studies.find((item) => item.id === state.study.openStudyId)?.runs || []), ...state.study.pendingRuns];
}
function studyCurrentRun() {
  const runs = studyCurrentRuns();
  return runs.find((run) => run.id === state.study.selectedRunId) || runs.at(-1) || null;
}
function studyChanged() {
  state.study.dirty = true;
  if (typeof stopStudyPlayback === "function") stopStudyPlayback();
}
function resetStudyState() {
  if (typeof stopStudyPlayback === "function") stopStudyPlayback();
  const generation = (state.study?.requestGeneration || 0) + 1;
  state.study = createStudyState(); state.study.requestGeneration = generation;
  state.studies = [];
}
function studySeedSettings() {
  const source = typeof collectAnalysisOptions === "function" ? collectAnalysisOptions() : state.chart?.analysis_engine?.options || {};
  return studySettings({ ...source, known_key: "", song_key: state.chart?.detected_key || state.chart?.native_key || state.chart?.key || "" });
}
function newStudy() {
  if ((state.study.pendingRuns.length || state.study.openStudyId) && !saveCurrentStudy({ silent: true })) {
    setStudyMessage("Complete the current study's range and sources before starting another study."); return;
  }
  const dirty = state.study.dirty;
  const generation = state.study.requestGeneration + 1;
  if (typeof stopStudyPlayback === "function") stopStudyPlayback();
  state.study = createStudyState(studySeedSettings());
  state.study.dirty = dirty; state.study.requestGeneration = generation;
  renderStudy();
}
function setStudyRange(start, end) {
  state.study.draft.start = start; state.study.draft.end = end;
  studyChanged(); renderStudy();
}
function handleStudyRangeClick(event, body, duration, openWhenComplete = false) {
  if (!(event.ctrlKey || event.metaKey || (!openWhenComplete && state.study.selectMode))) return false;
  if (event.target?.closest?.(".lane-controls, .lane-label")) return false;
  const rect = body.getBoundingClientRect();
  if (!rect.width || !duration) return false;
  event.preventDefault(); event.stopImmediatePropagation();
  const time = Math.round(Math.max(0, Math.min(duration, (event.clientX - rect.left) / rect.width * duration)) * 1000) / 1000;
  const next = advanceStudySelection(state.study.selectionAnchor, time);
  state.study.selectionAnchor = next.anchor;
  if (next.range) {
    setStudyRange(...next.range);
    state.study.selectMode = false;
    if (openWhenComplete) openEditorPanel("study");
  } else {
    state.study.draft.start = null; state.study.draft.end = null;
    studyChanged(); renderStudy();
    setStatus("Click the end of the study range.");
  }
  return true;
}
function saveCurrentStudy({ silent = false } = {}) {
  if (!state.study.pendingRuns.length && !state.study.openStudyId && state.study.draft.start === null) return null;
  let draft = state.study.draft;
  if (studyRangeError(draft.start, draft.end) || !studySourceNames(draft.sources).length) {
    const last = studyCurrentRuns().at(-1);
    if (last) draft = { ...draft, start: last.range[0], end: last.range[1], sources: last.sources, settings: last.settings };
  }
  try {
    const saved = saveStudyRecord(state.studies, draft, state.study.pendingRuns, state.study.openStudyId, new Date().toISOString(), () => crypto.randomUUID());
    if (saved.study.runs.some((run) => run.id === state.study.selectedRunId)) saved.study.selected_run_id = state.study.selectedRunId;
    state.studies = saved.studies; state.study.openStudyId = saved.study.id;
    state.study.pendingRuns = []; state.study.draft.name = saved.study.name;
    state.study.selectedRunId ||= saved.study.selected_run_id;
    state.study.dirty = true; renderStudy();
    if (!silent) setStatus("Study added to this session. Save Session to keep it for later.");
    return saved.study;
  } catch (error) { if (!silent) setStudyMessage(error.message); return null; }
}
function openStudy(id) {
  if ((state.study.pendingRuns.length || state.study.openStudyId) && !saveCurrentStudy({ silent: true })) {
    setStudyMessage("Complete the current study's range and sources before opening another study."); return;
  }
  const item = state.studies.find((study) => study.id === id);
  if (!item) return;
  if (typeof stopStudyPlayback === "function") stopStudyPlayback();
  const previous = state.study;
  state.study = createStudyState(item.settings);
  state.study.draft = studyCopy(Object.fromEntries(["name", "start", "end", "sources", "settings", "notes", "corrected_chord"].map((field) => [field, item[field]])));
  state.study.openStudyId = id; state.study.selectedRunId = item.selected_run_id;
  state.study.dirty = previous.dirty; state.study.requestGeneration = previous.requestGeneration + 1;
  renderStudy();
}
function deleteStudy(id) {
  if (state.study.openStudyId === id) {
    if (typeof stopStudyPlayback === "function") stopStudyPlayback();
    const generation = state.study.requestGeneration + 1;
    state.study = createStudyState(studySeedSettings()); state.study.requestGeneration = generation;
  }
  state.studies = state.studies.filter((study) => study.id !== id);
  state.study.dirty = true; renderStudy();
}
function selectStudyRun(id) {
  if (!studyCurrentRuns().some((run) => run.id === id)) return;
  state.study.selectedRunId = id;
  const record = state.studies.find((study) => study.id === state.study.openStudyId);
  if (record) { record.selected_run_id = id; state.study.dirty = true; }
  renderStudy();
}
async function analyzeStudySelection() {
  const owner = state.study;
  if (owner.busy) return;
  const error = studyRangeError(owner.draft.start, owner.draft.end, studyDuration());
  if (error) { setStatus(error); return; }
  const available = studyOriginalSources();
  const missing = owner.draft.sources.find((name) => !available[name]?.url || available[name]?.exists === false);
  if (!owner.draft.sources.length || missing) { setStatus(missing ? `Selected source ${missing} is unavailable. Run high-quality analysis or choose Full Mix.` : "Choose at least one source."); return; }
  const identity = studyAudioIdentity(); const generation = ++owner.requestGeneration;
  const inputs = studyCopy(owner.draft);
  if (!inputs.settings.song_key) inputs.settings.song_key = studySeedSettings().song_key;
  owner.busy = true; owner.message = "Analyzing selected interval…"; renderStudy();
  try {
    const result = await window.chordPilot.analyzeRange({ audioPath: state.audio.path || state.audio.id, sources: inputs.sources, start: inputs.start, end: inputs.end, options: inputs.settings });
    if (state.study !== owner || studyAudioIdentity() !== identity || generation !== owner.requestGeneration) return;
    const run = { ...studyCopy(result), id: crypto.randomUUID(), created_at: new Date().toISOString() };
    owner.pendingRuns.push(run); owner.selectedRunId = run.id; owner.dirty = true;
    owner.message = "Selection analyzed. Save Study to name this passage.";
    appendLog(`study: ${inputs.start.toFixed(3)}–${inputs.end.toFixed(3)}s → ${result.chord}`);
  } catch (error) {
    if (state.study === owner && studyAudioIdentity() === identity) { owner.message = error.message; setStatus(error.message); }
  } finally {
    if (state.study === owner && generation === owner.requestGeneration) { owner.busy = false; renderStudy(); }
  }
}
function studyText(tag, text, className = "") {
  const node = document.createElement(tag); node.textContent = text; node.className = className; return node;
}
function renderStudyWaveform() {
  const body = studyElement("studyWaveBody"); const canvas = studyElement("studyWaveCanvas");
  const zoom = Number(studyElement("studyZoomInput").value) || 1;
  const width = Math.max(600, studyElement("studyWaveViewport").clientWidth * zoom);
  body.style.width = `${width}px`; canvas.width = width; canvas.height = 100;
  const context = canvas.getContext("2d");
  const peaks = state.chart?.waveform || [];
  context.clearRect(0, 0, width, 100); context.fillStyle = "#7397aa";
  peaks.forEach((peak, index) => {
    const height = Math.max(1, Number(peak) * 84);
    context.fillRect(index / peaks.length * width, (100 - height) / 2, Math.max(1, width / peaks.length - 1), height);
  });
  const duration = studyDuration();
  const range = studyElement("studyRangeOverlay");
  const anchor = studyElement("studyRangeAnchor");
  const draft = state.study.draft;
  const valid = !studyRangeError(draft.start, draft.end, duration);
  range.hidden = !valid;
  if (valid) { range.style.left = `${draft.start / duration * 100}%`; range.style.width = `${(draft.end - draft.start) / duration * 100}%`; }
  anchor.hidden = state.study.selectionAnchor === null;
  if (!anchor.hidden) anchor.style.left = `${state.study.selectionAnchor / duration * 100}%`;
  const ruler = studyElement("studyTimeRuler"); ruler.replaceChildren();
  for (let index = 0; index <= 10; index++) {
    const label = studyText("span", `${(duration * index / 10).toFixed(1)}s`);
    label.style.left = `${index * 10}%`; ruler.append(label);
  }
  studyElement("studyWaveHint").textContent = peaks.length ? "Original audio • Ctrl/⌘-click start and end, or enable Select Range." : "Original audio • Use the time ruler to select. Analyze the song for a waveform preview.";
}
function renderStudyResult() {
  const container = studyElement("studyResult"); container.replaceChildren();
  const run = studyCurrentRun(); const runs = studyCurrentRuns();
  const history = studyElement("studyRunInput"); history.replaceChildren();
  const comparison = studyElement("studyCompareInput"); comparison.replaceChildren(new Option("No comparison", ""));
  runs.forEach((item, index) => {
    const label = `Run ${index + 1} · ${item.chord} · ${item.algorithm_version || "saved"}`;
    history.append(new Option(label, item.id)); comparison.append(new Option(label, item.id));
  });
  history.disabled = !runs.length; comparison.disabled = runs.length < 2;
  history.value = run?.id || ""; comparison.value = state.study.comparisonRunId || "";
  if (!run) { container.append(studyText("p", "Choose a short passage and analyze it to inspect its harmony.", "study-muted")); return; }
  const draft = state.study.draft;
  const matches = JSON.stringify(run.range) === JSON.stringify([draft.start, draft.end]) && JSON.stringify([...run.sources].sort()) === JSON.stringify([...draft.sources].sort()) && JSON.stringify(studySettings(run.settings)) === JSON.stringify(studySettings(draft.settings));
  container.append(studyText("strong", run.chord, "study-chord"));
  container.append(studyText("p", `${run.range[0].toFixed(3)}–${run.range[1].toFixed(3)}s · ${run.sources.join(" + ")} · ${run.key_context?.key || run.settings?.known_key || "?"} key`));
  container.append(studyText("p", `Chord confidence ${Math.round(run.chord_confidence * 100)}% · Pitch focus ${Math.round(run.pitch_confidence * 100)}%`, "study-muted"));
  container.append(studyText("p", matches ? "Saved analysis snapshot · Original audio" : "This result uses earlier inputs. Analyze again for the current selection.", matches ? "study-muted" : "study-stale"));
  const piano = createPianoEvidence({ chord: run.chord, evidence: run.evidence }, run.chord, { pitchClassesOnly: true, bassNote: run.bass_reference?.note });
  container.append(studyText("h3", "Pitch classes"), piano);
  container.append(studyText("p", (run.evidence?.detected_notes || []).map((note) => `${note.note} ${Math.round(note.strength * 100)}%`).join(" · ") || "No strong pitched notes detected."));
  if (run.bass_reference) container.append(studyText("p", `Bass reference: ${run.bass_reference.note} · ${Math.round(run.bass_reference.confidence * 100)}% confidence`));
  const alternatives = studyText("div", "", "study-candidates");
  (run.alternatives || []).forEach((item) => {
    const button = studyText("button", `${item.chord} · ${Math.round(item.score * 100)}%`); button.type = "button";
    button.title = (item.reasons || []).join("; ");
    button.addEventListener("click", () => { state.study.draft.corrected_chord = item.chord; state.study.dirty = true; renderStudy(); });
    alternatives.append(button);
  });
  container.append(alternatives);
  const reasons = run.alternatives?.[0]?.reasons || [];
  if (reasons.length) container.append(studyText("p", reasons.join("; "), "study-muted"));
  const previous = runs.find((item) => item.id === state.study.comparisonRunId);
  if (previous && previous.id !== run.id) {
    const table = document.createElement("table"); table.className = "study-comparison";
    const paired = compareStudyRuns(run, previous);
    container.append(studyText("h3", paired.sameInputs ? "Run comparison · same inputs" : "Run comparison · different inputs"));
    const fingerprints = (item) => Object.entries(item.input_fingerprints || {}).map(([name, value]) => `${name}: ${(value.sample_sha256 || "unknown").slice(0, 10)}`).join(" · ");
    const fields = [["", "Current run", "Previous run"], ["Chord", run.chord, previous.chord], ["Confidence", run.chord_confidence, previous.chord_confidence], ["Range", run.range.join("–"), previous.range.join("–")], ["Sources", run.sources.join(" + "), previous.sources.join(" + ")], ["Settings", JSON.stringify(run.settings), JSON.stringify(previous.settings)], ["Algorithm", run.algorithm_version, previous.algorithm_version], ["Notes", (run.evidence?.detected_notes || []).map((n) => n.note).join(", "), (previous.evidence?.detected_notes || []).map((n) => n.note).join(", ")], ["Audio snapshot", fingerprints(run), fingerprints(previous)]];
    fields.forEach((row) => { const tr = document.createElement("tr"); row.forEach((text) => tr.append(studyText("td", String(text ?? "")))); table.append(tr); });
    container.append(table);
  }
}
function renderStudy() {
  if (!elements.studyPanel) return;
  const draft = state.study.draft;
  if (!draft.settings.song_key && !studyCurrentRuns().length) draft.settings.song_key = studySeedSettings().song_key;
  const fields = { studyStartInput: draft.start, studyEndInput: draft.end, studyNameInput: draft.name, studyNotesInput: draft.notes, studyCorrectionInput: draft.corrected_chord, studyKeyInput: draft.settings.known_key, studyLowInput: draft.settings.chroma_low_hz, studyHighInput: draft.settings.chroma_high_hz, studyAlternativesInput: draft.settings.chord_alternatives };
  Object.entries(fields).forEach(([id, value]) => { const input = studyElement(id); if (document.activeElement !== input) input.value = value ?? ""; });
  studyElement("studySimplifyInput").checked = draft.settings.simplify_chords;
  studyElement("studyVolumeInput").value = state.masterVolume;
  studyElement("studySpeedInput").value = String(state.playbackRate);
  const error = studyRangeError(draft.start, draft.end, studyDuration());
  const available = studyOriginalSources();
  const missing = draft.sources.filter((name) => !available[name]?.url || available[name]?.exists === false);
  document.querySelectorAll("[data-study-source]").forEach((input) => {
    input.checked = draft.sources.includes(input.dataset.studySource);
    input.disabled = !available[input.dataset.studySource]?.url || available[input.dataset.studySource]?.exists === false;
  });
  const blocked = Boolean(error || missing.length || !draft.sources.length || state.study.busy);
  studyElement("studyAnalyzeBtn").disabled = blocked;
  studyElement("studyPlayBtn").disabled = blocked; studyElement("studyLoopBtn").disabled = blocked;
  studyElement("studySaveBtn").disabled = Boolean(error || !draft.sources.length);
  studyElement("studySelectBtn").classList.toggle("active-control", state.study.selectMode);
  studyElement("studySelectBtn").setAttribute("aria-pressed", String(state.study.selectMode));
  studyElement("studyStatus").textContent = state.study.busy ? state.study.message : missing.length ? `Unavailable: ${missing.join(", ")}. Run high-quality analysis or choose Full Mix.` : state.study.selectionAnchor !== null ? "Click the end of the range." : state.study.message || error || "Ready to analyze the selection.";
  studyElement("studyDirtyText").textContent = state.study.dirty ? "Unsaved study changes · Save Session to keep them" : "Studies are stored with this song when you Save Session.";
  const list = studyElement("studyList"); list.replaceChildren();
  if (!state.studies.length) list.append(studyText("p", "Save a passage to revisit it here.", "study-muted"));
  state.studies.forEach((item) => {
    const row = studyText("div", "", "study-list-row");
    const button = studyText("button", `${item.name}\n${item.start.toFixed(3)}–${item.end.toFixed(3)}s`, "study-list-item"); button.type = "button";
    button.classList.toggle("active-control", item.id === state.study.openStudyId); button.addEventListener("click", () => openStudy(item.id));
    const remove = studyText("button", "×", "study-delete"); remove.type = "button"; remove.title = `Delete ${item.name}`; remove.setAttribute("aria-label", remove.title); remove.addEventListener("click", () => deleteStudy(item.id));
    row.append(button, remove); list.append(row);
  });
  renderStudyWaveform(); renderStudyResult();
}
function initializeStudy() {
  if (!elements.studyPanel) return;
  studyElement("studyNewBtn").addEventListener("click", newStudy);
  studyElement("studySelectBtn").addEventListener("click", () => { state.study.selectMode = !state.study.selectMode; state.study.selectionAnchor = null; renderStudy(); });
  studyElement("studyFullMixBtn").addEventListener("click", () => { state.study.draft.sources = ["full_mix"]; studyChanged(); renderStudy(); });
  studyElement("studyAnalyzeBtn").addEventListener("click", analyzeStudySelection);
  studyElement("studyPlayBtn").addEventListener("click", () => playStudySelection());
  studyElement("studyLoopBtn").addEventListener("click", () => playStudySelection({ loop: true }));
  studyElement("studyStopBtn").addEventListener("click", stopStudyPlayback);
  studyElement("studyVolumeInput").addEventListener("input", (event) => {
    state.masterVolume = Number(event.target.value); applyMasterVolume(); applyStudyPlaybackSettings();
  });
  studyElement("studySpeedInput").addEventListener("change", (event) => {
    state.playbackRate = Number(event.target.value); applyPlaybackRate(); applyStudyPlaybackSettings();
  });
  window.addEventListener("beforeunload", stopStudyPlayback);
  studyElement("studySaveBtn").addEventListener("click", () => saveCurrentStudy());
  studyElement("studyWaveBody").addEventListener("click", (event) => handleStudyRangeClick(event, studyElement("studyWaveBody"), studyDuration()), true);
  studyElement("studyZoomInput").addEventListener("input", renderStudyWaveform);
  document.querySelectorAll("[data-study-source]").forEach((input) => input.addEventListener("change", () => {
    const name = input.dataset.studySource;
    state.study.draft.sources = input.checked ? name === "full_mix" ? [name] : [...state.study.draft.sources.filter((value) => value !== "full_mix" && value !== name), name] : state.study.draft.sources.filter((value) => value !== name);
    studyChanged(); renderStudy();
  }));
  const fields = { studyStartInput: "start", studyEndInput: "end", studyNameInput: "name", studyNotesInput: "notes", studyCorrectionInput: "corrected_chord" };
  Object.entries(fields).forEach(([id, field]) => studyElement(id).addEventListener("input", (event) => {
    state.study.draft[field] = ["start", "end"].includes(field) ? event.target.value === "" ? null : Number(event.target.value) : event.target.value;
    state.study.selectionAnchor = null; studyChanged(); renderStudy();
  }));
  const settings = { studyKeyInput: "known_key", studyLowInput: "chroma_low_hz", studyHighInput: "chroma_high_hz", studyAlternativesInput: "chord_alternatives", studySimplifyInput: "simplify_chords" };
  Object.entries(settings).forEach(([id, field]) => studyElement(id).addEventListener("change", (event) => {
    state.study.draft.settings[field] = field === "simplify_chords" ? event.target.checked : field === "known_key" ? event.target.value : Number(event.target.value);
    state.study.draft.settings = studySettings(state.study.draft.settings); studyChanged(); renderStudy();
  }));
  studyElement("studyRunInput").addEventListener("change", (event) => selectStudyRun(event.target.value));
  studyElement("studyCompareInput").addEventListener("change", (event) => { state.study.comparisonRunId = event.target.value; renderStudyResult(); });
  renderStudy();
}
