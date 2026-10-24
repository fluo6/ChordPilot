function studyElement(id) { return document.getElementById(id); }
function studyDuration() {
  const duration = Number(elements.audioPlayer.duration) * (Number(state.audioPreview?.tempoRate) || 1);
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
  if ((state.study.pendingRuns.length || state.study.openStudyId || state.study.draft.start !== null) && !saveCurrentStudy({ silent: true })) {
    setStudyMessage("Complete the current study's range and sources before starting another study."); return false;
  }
  const dirty = state.study.dirty;
  const generation = state.study.requestGeneration + 1;
  if (typeof stopStudyPlayback === "function") stopStudyPlayback();
  state.study = createStudyState(studySeedSettings());
  state.study.dirty = dirty; state.study.requestGeneration = generation;
  renderStudy();
  return true;
}
function studyCurrentMoment() {
  const duration = studyDuration(); const time = Number(elements.audioPlayer.currentTime) * (Number(state.audioPreview?.tempoRate) || 1);
  if (!state.audio || !Number.isFinite(duration) || duration < .05 || !Number.isFinite(time)) {
    setStatus("Load audio and wait for its duration before studying this moment."); return;
  }
  const position = Math.max(0, Math.min(duration, time));
  const start = Math.max(0, Math.round((position - .5) * 1000) / 1000);
  const end = Math.min(duration, Math.round((position + .5) * 1000) / 1000);
  if (!newStudy()) return;
  setStudyRange(start, end);
  openEditorPanel("study");
  if (elements.studyPanel) zoomStudyWaveform(studyElement("studyZoomInput").value);
}
function openChordEventStudy(barIndex, eventIndex) {
  const bar = state.chart?.bars?.[barIndex];
  const events = bar && typeof barChordEvents === "function" ? barChordEvents(bar, barEndTime(barIndex)) : [];
  const event = events[eventIndex];
  if (!state.audio || !event || !Number.isFinite(Number(event.start)) || !Number.isFinite(Number(event.end)) || event.end - event.start < 0.05) return false;
  if (!newStudy()) return false;
  setStudyRange(Number(event.start), Number(event.end));
  openEditorPanel("study");
  if (elements.studyPanel) zoomStudyWaveform(studyElement("studyZoomInput").value);
  return true;
}
function setStudyRange(start, end) {
  state.study.draft.start = start; state.study.draft.end = end;
  state.study.wavePanned = false;
  studyChanged(); renderStudy();
}
let studyWaveDrag = null;
let studyWaveSuppressClick = false;
function startStudyWaveDrag(event, body, viewport, duration) {
  studyWaveSuppressClick = false;
  if (event.button !== 0 || event.isPrimary === false || event.ctrlKey || event.metaKey || state.study.selectMode) return false;
  const rect = body.getBoundingClientRect();
  if (!rect.width || !Number.isFinite(duration) || duration <= 0) return false;
  const draft = state.study.draft;
  const boundary = event.target.closest?.("[data-study-boundary]")?.dataset.studyBoundary || event.target.dataset?.studyBoundary;
  const validRange = !studyRangeError(draft.start, draft.end, duration);
  const kind = validRange && ["start", "end"].includes(boundary) ? boundary : validRange && event.target.closest?.(".study-range-overlay") ? "move" : "pan";
  studyWaveDrag = { owner: state.study, identity: studyAudioIdentity(), body, viewport, duration, width: rect.width,
    pointerId: event.pointerId, clientX: event.clientX, scrollLeft: viewport.scrollLeft,
    start: draft.start, end: draft.end, kind, moved: false };
  event.preventDefault(); body.setPointerCapture(event.pointerId);
  body.classList.add(kind === "pan" ? "study-panning" : "study-range-dragging");
  return true;
}
function moveStudyWaveDrag(event) {
  const drag = studyWaveDrag;
  if (!drag || event.pointerId !== drag.pointerId) return;
  if (state.study !== drag.owner || studyAudioIdentity() !== drag.identity || state.currentView !== "song" || state.editorPanel !== "study") {
    finishStudyWaveDrag(event); return;
  }
  const delta = event.clientX - drag.clientX;
  if (!drag.moved && Math.abs(delta) < 3) return;
  drag.moved = true; event.preventDefault();
  if (drag.kind === "pan") {
    const previousScroll = drag.viewport.scrollLeft;
    drag.viewport.scrollLeft = Math.max(0, Math.min(drag.viewport.scrollWidth - drag.viewport.clientWidth, drag.scrollLeft - delta));
    if (drag.viewport.scrollLeft !== previousScroll) state.study.wavePanned = true;
    return;
  }
  const round = (value) => Math.round(value * 1000) / 1000;
  const seconds = delta / drag.width * drag.duration;
  let start = drag.start; let end = drag.end;
  if (drag.kind === "start") start = Math.max(0, Math.min(end - .05, start + seconds));
  else if (drag.kind === "end") end = Math.max(start + .05, Math.min(drag.duration, end + seconds));
  else {
    const shift = Math.max(-start, Math.min(drag.duration - end, seconds));
    start += shift; end += shift;
  }
  state.study.selectionAnchor = null;
  setStudyRange(round(start), round(end));
}
function finishStudyWaveDrag(event) {
  const drag = studyWaveDrag;
  if (!drag || event.pointerId !== drag.pointerId) return;
  studyWaveSuppressClick = drag.moved;
  studyWaveDrag = null;
  drag.body.classList.remove("study-panning", "study-range-dragging");
  if (!drag.body.hasPointerCapture || drag.body.hasPointerCapture(drag.pointerId)) drag.body.releasePointerCapture(drag.pointerId);
}
function handleStudyRangeClick(event, body, duration, openWhenComplete = false) {
  if (!openWhenComplete && studyWaveSuppressClick) {
    studyWaveSuppressClick = false; event.preventDefault(); event.stopImmediatePropagation(); return true;
  }
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
  if (owner.busy || state.drumBusy || state.melodyBusy) return;
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
function zoomStudyWaveform(value, clientX = null) {
  if (studyWaveDrag) return;
  const viewport = studyElement("studyWaveViewport"); const input = studyElement("studyZoomInput");
  const oldWidth = studyElement("studyWaveBody").getBoundingClientRect().width;
  if (!oldWidth || !viewport.clientWidth || !Number.isFinite(Number(value))) return;
  const draft = state.study.draft; const duration = studyDuration();
  const centerSelection = !state.study.wavePanned && !studyRangeError(draft.start, draft.end, duration);
  const offset = centerSelection || clientX === null ? viewport.clientWidth / 2 : Math.max(0, Math.min(viewport.clientWidth, clientX - viewport.getBoundingClientRect().left));
  const fraction = centerSelection ? (draft.start + draft.end) / 2 / duration : (viewport.scrollLeft + offset) / oldWidth;
  input.value = String(Math.max(Number(input.min), Math.min(Number(input.max), Number(value))));
  renderStudyWaveform();
  const newWidth = studyElement("studyWaveBody").getBoundingClientRect().width;
  viewport.scrollLeft = Math.max(0, Math.min(newWidth - viewport.clientWidth, fraction * newWidth - offset));
  state.study.waveScrollLeft = viewport.scrollLeft;
}
function handleStudyWaveScroll() {
  const viewport = studyElement("studyWaveViewport");
  if (viewport.scrollLeft !== state.study.waveScrollLeft) state.study.wavePanned = true;
  state.study.waveScrollLeft = viewport.scrollLeft;
}
function handleStudyWaveWheel(event) {
  if (!event.deltaY || Math.abs(event.deltaX || 0) > Math.abs(event.deltaY)) return;
  event.preventDefault();
  const input = studyElement("studyZoomInput");
  zoomStudyWaveform(Number(input.value) - Math.sign(event.deltaY) * Number(input.step), event.clientX);
}
function renderStudyWaveform() {
  const body = studyElement("studyWaveBody"); const canvas = studyElement("studyWaveCanvas");
  const zoom = Number(studyElement("studyZoomInput").value) || 1;
  const width = Math.max(600, studyElement("studyWaveViewport").clientWidth * zoom);
  body.style.width = `${width}px`; canvas.width = width; canvas.height = 100;
  const peaks = state.chart?.waveform || [];
  drawWaveform(canvas, peaks);
  const duration = studyDuration();
  const range = studyElement("studyRangeOverlay");
  const anchor = studyElement("studyRangeAnchor");
  const draft = state.study.draft;
  const valid = !studyRangeError(draft.start, draft.end, duration);
  range.hidden = !valid;
  if (valid) { range.style.left = `${draft.start / duration * 100}%`; range.style.width = `${(draft.end - draft.start) / duration * 100}%`; }
  body.classList.toggle("study-selecting", state.study.selectMode);
  anchor.hidden = state.study.selectionAnchor === null;
  if (!anchor.hidden) anchor.style.left = `${state.study.selectionAnchor / duration * 100}%`;
  const ruler = studyElement("studyTimeRuler"); ruler.replaceChildren();
  for (let index = 0; index <= 10; index++) {
    const label = studyText("span", `${(duration * index / 10).toFixed(1)}s`);
    label.style.left = `${index * 10}%`; ruler.append(label);
  }
  studyElement("studyWaveHint").textContent = "Wheel to zoom around the selection; pan away to zoom under the mouse. Drag waveform to pan; drag selection or its edges to adjust. Ctrl/⌘-click endpoints or enable Select Range." + (peaks.length ? "" : " Analyze the song for a waveform preview.");
  state.study.waveScrollLeft = studyElement("studyWaveViewport").scrollLeft;
  if(typeof renderPrototypeStudyTimeline==='function')renderPrototypeStudyTimeline();
}
function renderStudyChordOverlaps(run, container) {
  const overlaps = studyChordOverlaps(state.chart?.bars, run.range[0], run.range[1]);
  if (!overlaps.length) return;
  const section = studyText("section", "", "study-overlaps");
  section.append(studyText("h3", "Arrangement chords in this selection"));
  section.append(studyText("p", "Current song analysis estimates a chord change here; its boundaries are approximate. The large chord above summarizes the full selection. Choose a part, then Analyze Selection to inspect it separately.", "study-muted"));
  const list = studyText("div", "", "study-overlap-list");
  for (const part of overlaps) {
    const chord = displayChordSymbol(part.chord, false, run.key_context?.key || run.settings?.known_key || run.settings?.song_key);
    const button = studyText("button", `${part.start.toFixed(3)}–${part.end.toFixed(3)}s · ${chord}`, "study-overlap-part");
    button.type = "button";
    button.title = "Use this interval as the Local Study range";
    button.addEventListener("click", () => {
      state.study.message = "Range selected from the arrangement. Analyze Selection to inspect its audio.";
      setStudyRange(part.start, part.end);
    });
    list.append(button);
  }
  section.append(list);
  container.append(section);
}
function renderStudyResult() {
  if (typeof preparePrototypeStudyResult === 'function') preparePrototypeStudyResult();
  const container = studyElement("studyResult"); container.replaceChildren();
  const run = studyCurrentRun(); const runs = studyCurrentRuns();
  const history = studyElement("studyRunInput"); history.replaceChildren();
  const comparison = studyElement("studyCompareInput"); comparison.replaceChildren(new Option("No comparison", ""));
  runs.forEach((item, index) => {
    const label = `Run ${index + 1} · ${displayChordSymbol(item.chord, false, item.key_context?.key || item.settings?.known_key || item.settings?.song_key)} · ${item.algorithm_version || "saved"}`;
    history.append(new Option(label, item.id)); comparison.append(new Option(label, item.id));
  });
  history.disabled = !runs.length; comparison.disabled = runs.length < 2;
  history.value = run?.id || ""; comparison.value = state.study.comparisonRunId || "";
  if (!run) { container.append(studyText("p", "Choose a short passage and analyze it to inspect its harmony.", "study-muted")); return; }
  const draft = state.study.draft;
  const matches = JSON.stringify(run.range) === JSON.stringify([draft.start, draft.end]) && JSON.stringify([...run.sources].sort()) === JSON.stringify([...draft.sources].sort()) && JSON.stringify(studyDetectionSettings(run.settings, run.algorithm_version)) === JSON.stringify(studyDetectionSettings(draft.settings, run.algorithm_version));
  const displayedChord = displayChordSymbol(run.chord, draft.settings.simplify_chords, run.key_context?.key || run.settings?.known_key || run.settings?.song_key);
  container.append(studyText("strong", displayedChord, "study-chord"));
  const voicing = studyText('div', '', 'chord-voicing');
  renderChordVoicing(voicing, run, run.chord);
  container.append(voicing);
  if (displayedChord !== displayChordSymbol(run.chord, false, run.key_context?.key || run.settings?.known_key || run.settings?.song_key)) container.append(studyText("p", `Detected: ${run.chord}`, "study-muted"));
  container.append(studyText("p", `${run.range[0].toFixed(3)}–${run.range[1].toFixed(3)}s · ${run.sources.join(" + ")} · ${run.key_context?.key || run.settings?.known_key || "?"} key`));
  renderStudyChordOverlaps(run, container);
  const confidenceLine = studyText("p", `Chord confidence ${Math.round(run.chord_confidence * 100)}% · Pitch focus ${Math.round(run.pitch_confidence * 100)}%`, "study-muted");
  confidenceLine.title = "Heuristic ranking scores, not calibrated probabilities of correctness.";
  container.append(confidenceLine);
  container.append(studyText("p", matches ? "Saved analysis snapshot · Original audio" : "This result uses earlier inputs. Analyze again for the current selection.", matches ? "study-muted" : "study-stale"));
  const exactPitches = Array.isArray(run.evidence?.detected_pitches);
  const bassMidi = measuredBassMidi(run.bass_reference, run.bass_reference?.detected_pitches || run.source_evidence?.bass?.detected_pitches || []);
  const piano = createPianoEvidence({ chord: run.chord, evidence: run.evidence }, run.chord, { exactPitches, pitchClassesOnly: !exactPitches, bassMidi, bassNote: run.bass_reference?.note, focusEvidence: true });
  container.append(studyText("h3", exactPitches ? "Detected notes · A0–C8" : "Pitch classes · reanalyze for octaves"), piano);
  const notes = exactPitches ? run.evidence.detected_pitches : run.evidence?.detected_notes || [];
  container.append(studyText("p", notes.map((note) => `${note.note} ${Math.round(note.strength * 100)}%`).join(" · ") || "No strong pitched notes detected."));
  if (exactPitches && notes.length) {
    const viewport = piano.querySelector(".piano-viewport");
    const positions = notes.map((note) => piano.querySelector(`[data-midi="${note.midi}"]`).offsetLeft);
    viewport.scrollLeft = Math.max(0, (Math.min(...positions) + Math.max(...positions)) / 2 - viewport.clientWidth / 2);
  }
  if (run.bass_reference) container.append(studyText("p", `${run.bass_reference.origin === "accompaniment" ? "Low accompaniment note" : "Bass reference"}: ${run.bass_reference.note} · ${Math.round(run.bass_reference.confidence * 100)}% confidence`));
  if (run.source_evidence?.bass?.used_for_notes === false) container.append(studyText("p", "No reliable bass fundamental was found; its original spectrum remains available.", "study-muted"));
  container.append(createStudySpectrum(run, { plotHeight: 200 }));
  const alternatives = studyText("div", "", "study-candidates");
  (run.alternatives || []).forEach((item) => {
    const button = studyText("button", `${displayChordSymbol(item.chord, false, run.key_context?.key || run.settings?.known_key || run.settings?.song_key)} · ${Math.round(item.score * 100)}%`); button.type = "button";
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
    const fields = [["", "Current run", "Previous run"], ["Chord", run.chord, previous.chord], ["Confidence", run.chord_confidence, previous.chord_confidence], ["Range", run.range.join("–"), previous.range.join("–")], ["Sources", run.sources.join(" + "), previous.sources.join(" + ")], ["Settings", JSON.stringify(run.settings), JSON.stringify(previous.settings)], ["Algorithm", run.algorithm_version, previous.algorithm_version], ["Notes", (run.evidence?.detected_pitches || run.evidence?.detected_notes || []).map((n) => n.note).join(", "), (previous.evidence?.detected_pitches || previous.evidence?.detected_notes || []).map((n) => n.note).join(", ")], ["Audio snapshot", fingerprints(run), fingerprints(previous)]];
    fields.forEach((row) => { const tr = document.createElement("tr"); row.forEach((text) => tr.append(studyText("td", String(text ?? "")))); table.append(tr); });
    container.append(table);
  }
  if (typeof arrangePrototypeStudyResult === 'function') arrangePrototypeStudyResult();
}
function renderStudy() {
  if (!elements.studyPanel) return;
  const draft = state.study.draft;
  if (!draft.settings.song_key && !studyCurrentRuns().length) draft.settings.song_key = studySeedSettings().song_key;
  const fields = { studyStartInput: draft.start, studyEndInput: draft.end, studyNameInput: draft.name, studyNotesInput: draft.notes, studyCorrectionInput: draft.corrected_chord, studyKeyInput: draft.settings.known_key, studyLowInput: draft.settings.chroma_low_hz, studyHighInput: draft.settings.chroma_high_hz, studyAlternativesInput: draft.settings.chord_alternatives, studyTailReductionInput: draft.settings.tail_reduction * 100, studyTailHalfLifeInput: draft.settings.tail_half_life, studyOvertoneWeightingInput: draft.settings.overtone_weighting * 100 };
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
  if (typeof syncPrototypeStudy === 'function') syncPrototypeStudy();
}
function initializeStudy() {
  if (!elements.studyPanel) return;
  document.querySelectorAll("[data-study-current]").forEach((button) => button.addEventListener("click", studyCurrentMoment));
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
  const waveBody = studyElement("studyWaveBody");
  waveBody.addEventListener("pointerdown", (event) => startStudyWaveDrag(event, waveBody, studyElement("studyWaveViewport"), studyDuration()));
  waveBody.addEventListener("pointermove", moveStudyWaveDrag);
  ["pointerup", "pointercancel", "lostpointercapture"].forEach((name) => waveBody.addEventListener(name, finishStudyWaveDrag));
  const waveViewport = studyElement("studyWaveViewport");
  waveViewport.addEventListener("wheel", handleStudyWaveWheel, { passive: false });
  waveViewport.addEventListener("scroll", handleStudyWaveScroll);
  studyElement("studyZoomInput").addEventListener("input", (event) => zoomStudyWaveform(event.target.value));
  document.querySelectorAll("[data-study-source]").forEach((input) => input.addEventListener("change", () => {
    const name = input.dataset.studySource;
    state.study.draft.sources = input.checked ? name === "full_mix" ? [name] : [...state.study.draft.sources.filter((value) => value !== "full_mix" && value !== name), name] : state.study.draft.sources.filter((value) => value !== name);
    studyChanged(); renderStudy();
  }));
  const fields = { studyStartInput: "start", studyEndInput: "end", studyNameInput: "name", studyNotesInput: "notes", studyCorrectionInput: "corrected_chord" };
  Object.entries(fields).forEach(([id, field]) => studyElement(id).addEventListener("input", (event) => {
    state.study.draft[field] = ["start", "end"].includes(field) ? event.target.value === "" ? null : Number(event.target.value) : event.target.value;
    if (["start", "end"].includes(field)) state.study.wavePanned = false;
    state.study.selectionAnchor = null; studyChanged(); renderStudy();
  }));
  const settings = { studyKeyInput: "known_key", studyLowInput: "chroma_low_hz", studyHighInput: "chroma_high_hz", studyAlternativesInput: "chord_alternatives", studySimplifyInput: "simplify_chords", studyTailReductionInput: "tail_reduction", studyTailHalfLifeInput: "tail_half_life", studyOvertoneWeightingInput: "overtone_weighting" };
  Object.entries(settings).forEach(([id, field]) => studyElement(id).addEventListener("change", (event) => {
    state.study.draft.settings[field] = field === "simplify_chords" ? event.target.checked : field === "known_key" ? event.target.value : Number(event.target.value);
    if (["tail_reduction", "overtone_weighting"].includes(field)) state.study.draft.settings[field] /= 100;
    state.study.draft.settings = studySettings(state.study.draft.settings); studyChanged(); renderStudy();
  }));
  studyElement("studyRunInput").addEventListener("change", (event) => selectStudyRun(event.target.value));
  studyElement("studyCompareInput").addEventListener("change", (event) => { state.study.comparisonRunId = event.target.value; renderStudyResult(); });
  renderStudy();
}
