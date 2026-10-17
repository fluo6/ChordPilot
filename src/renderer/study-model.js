const STUDY_SOURCES = ["bass", "other", "vocals", "drums", "full_mix"];

function studyCopy(value) {
  return JSON.parse(JSON.stringify(value));
}

function studyRangeError(start, end, duration = Infinity) {
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "Enter valid start and end times.";
  if (start < 0 || end > duration || end - start < .05 - 1e-9) return "Select at least 0.05 seconds within the song.";
  return "";
}

function studyChordOverlaps(bars, start, end) {
  if (studyRangeError(start, end)) return [];
  const slices = (Array.isArray(bars) ? bars : []).flatMap((bar) => Array.isArray(bar?.chord_events) ? bar.chord_events : [])
    .filter((event) => Number.isFinite(event?.start) && Number.isFinite(event?.end) &&
      event.end > event.start && typeof event.chord === "string" && event.chord && event.end > start && event.start < end)
    .map((event) => ({ start: Math.max(start, event.start), end: Math.min(end, event.end), chord: event.chord }))
    .sort((left, right) => left.start - right.start || left.end - right.end);
  const merged = [];
  for (const slice of slices) {
    const previous = merged.at(-1);
    if (previous && previous.chord === slice.chord && slice.start <= previous.end + .001) previous.end = Math.max(previous.end, slice.end);
    else merged.push(slice);
  }
  const visible = merged.filter((slice) => slice.end - slice.start >= .05 - 1e-9);
  return new Set(visible.map((slice) => slice.chord)).size > 1 ? visible : [];
}

function advanceStudySelection(anchor, time) {
  return anchor === null ? { anchor: time, range: null } : { anchor: null, range: [Math.min(anchor, time), Math.max(anchor, time)] };
}

function studySourceNames(value) {
  if (!Array.isArray(value)) return [];
  const names = [...new Set(value.filter((name) => STUDY_SOURCES.includes(name)))];
  return names.includes("full_mix") ? ["full_mix"] : names;
}

function studySettings(value = {}) {
  const number = (key, fallback, min, max) => Number.isFinite(Number(value?.[key])) ? Math.max(min, Math.min(max, Number(value[key]))) : fallback;
  const key = (name) => /^[A-G][#b]?m?$/.test(value?.[name]) ? value[name] : "";
  return {
    known_key: key("known_key"), song_key: key("song_key"),
    chroma_low_hz: number("chroma_low_hz", 65, 20, 500),
    chroma_high_hz: number("chroma_high_hz", 1800, 500, 5000),
    chord_alternatives: Math.round(number("chord_alternatives", 6, 1, 12)),
    tail_reduction: number("tail_reduction", 0, 0, 1),
    tail_half_life: number("tail_half_life", .5, .1, 3),
    overtone_weighting: number("overtone_weighting", .5, 0, 1),
    simplify_chords: value?.simplify_chords !== false
  };
}

function createStudyState(settings = {}) {
  return {
    draft: { name: "", start: null, end: null, sources: ["bass", "other"], settings: studySettings(settings), notes: "", corrected_chord: "" },
    openStudyId: null, selectedRunId: null, selectionAnchor: null, selectMode: false,
    dirty: false, requestGeneration: 0, busy: false, pendingRuns: [], comparisonRunId: null
  };
}

function studyDetectionSettings(settings, algorithmVersion) {
  const normalized = studySettings(settings);
  const version = Number(/^local-study-v(\d+)$/.exec(algorithmVersion)?.[1] || 0);
  if (version >= 3) delete normalized.simplify_chords;
  if (version < 10 && settings?.overtone_weighting === undefined) normalized.overtone_weighting = 0;
  return normalized;
}

function normalizeStudyRun(run) {
  if (!run || typeof run.id !== "string" || !run.id || typeof run.chord !== "string" ||
      !Array.isArray(run.range) || studyRangeError(run.range[0], run.range[1]) ||
      !Number.isFinite(run.chord_confidence) || !Number.isFinite(run.pitch_confidence)) return null;
  const object = (value) => value && typeof value === "object" && !Array.isArray(value);
  const spectrum = (value) => object(value) && Array.isArray(value.frequencies_hz) && value.frequencies_hz.length >= 2 && value.frequencies_hz.length <= 768 &&
    (value.reference_power === undefined || Number.isFinite(value.reference_power) && value.reference_power >= 0) &&
    value.frequencies_hz.every((frequency, index, all) => Number.isFinite(frequency) && frequency > 0 && (index === 0 || frequency > all[index - 1])) &&
    Array.isArray(value.magnitudes_db) && value.magnitudes_db.length === value.frequencies_hz.length &&
    value.magnitudes_db.every((db) => Number.isFinite(db) && db >= -80 && db <= 0) &&
    Array.isArray(value.peaks) && value.peaks.length <= 24 && value.peaks.every((peak) => object(peak) &&
      Number.isInteger(peak.midi) && peak.midi >= 21 && peak.midi <= 108 && typeof peak.note === "string" &&
      Number.isFinite(peak.frequency_hz) && peak.frequency_hz > 0 && Number.isFinite(peak.level_db) && peak.level_db >= -80 && peak.level_db <= 0);
  const evidence = (value) => object(value) && (value.detected_notes === undefined ||
    Array.isArray(value.detected_notes) && value.detected_notes.every((note) => object(note) && typeof note.note === "string" && Number.isFinite(note.strength))) &&
    (value.scoring_pitch_classes === undefined || Array.isArray(value.scoring_pitch_classes) && value.scoring_pitch_classes.length === 12 &&
      value.scoring_pitch_classes.every((item) => object(item) && typeof item.note === "string" &&
        Number.isFinite(item.accompaniment) && item.accompaniment >= 0 && item.accompaniment <= 1 &&
        Number.isFinite(item.scored) && item.scored >= 0 && item.scored <= 1)) &&
    (value.scoring_bass_weight === undefined || Number.isFinite(value.scoring_bass_weight) && value.scoring_bass_weight >= 0 && value.scoring_bass_weight <= .3) &&
    (value.scoring_source === undefined || typeof value.scoring_source === "string" && value.scoring_source.length <= 80) &&
    (value.detected_pitches === undefined || Array.isArray(value.detected_pitches) && value.detected_pitches.every((note) =>
      object(note) && Number.isInteger(note.midi) && note.midi >= 21 && note.midi <= 108 && typeof note.note === "string" &&
      Number.isFinite(note.strength) && note.strength >= 0 && note.strength <= 1 && Number.isFinite(note.frequency_hz) && note.frequency_hz > 0)) &&
    (value.spectrum === undefined || spectrum(value.spectrum)) &&
    (value.tail_reduced_spectrum === undefined || spectrum(value.tail_reduced_spectrum)) &&
    (value.overtone_weighted_spectrum === undefined || spectrum(value.overtone_weighted_spectrum));
  if (run.evidence !== undefined && !evidence(run.evidence)) return null;
  if (run.source_evidence !== undefined && (!object(run.source_evidence) || !Object.values(run.source_evidence).every(evidence))) return null;
  if (run.alternatives !== undefined && (!Array.isArray(run.alternatives) || !run.alternatives.every((item) =>
    object(item) && typeof item.chord === "string" && Number.isFinite(item.score) &&
    (item.reasons === undefined || Array.isArray(item.reasons) && item.reasons.every((reason) => typeof reason === "string"))))) return null;
  if (run.bass_reference != null && (!object(run.bass_reference) || typeof run.bass_reference.note !== "string" || !Number.isFinite(run.bass_reference.confidence))) return null;
  if (run.input_fingerprints !== undefined && (!object(run.input_fingerprints) || !Object.values(run.input_fingerprints).every((value) =>
    object(value) && (value.sample_sha256 === undefined || typeof value.sample_sha256 === "string")))) return null;
  const safe = studyCopy(run);
  safe.sources = studySourceNames(run.sources);
  if (!safe.sources.length) return null;
  safe.settings = studySettings({ ...run.settings, overtone_weighting: run.settings?.overtone_weighting ?? 0 });
  // Historical evidence is data, never permission to open a saved filesystem location.
  const stripLocations = (value) => {
    if (Array.isArray(value)) return value.map(stripLocations);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).filter(([name]) => !/path|url|uri|directory/i.test(name)).map(([name, child]) => [name, stripLocations(child)]));
  };
  return stripLocations(safe);
}

function normalizeStudies(value) {
  const ids = new Set();
  return (Array.isArray(value) ? value : []).flatMap((item) => {
    if (!item || typeof item.id !== "string" || !item.id || ids.has(item.id) || studyRangeError(item.start, item.end)) return [];
    const sources = studySourceNames(item.sources);
    if (!sources.length) return [];
    ids.add(item.id);
    const runIds = new Set();
    const runs = (Array.isArray(item.runs) ? item.runs : []).flatMap((run) => {
      const normalized = normalizeStudyRun(run);
      if (!normalized || runIds.has(normalized.id)) return [];
      runIds.add(normalized.id); return [normalized];
    });
    return [{
      id: item.id, name: String(item.name || "Study"), start: item.start, end: item.end,
      sources, settings: studySettings({ ...item.settings, overtone_weighting: item.settings?.overtone_weighting ?? 0 }), notes: String(item.notes || ""),
      corrected_chord: String(item.corrected_chord || ""), created_at: String(item.created_at || ""),
      updated_at: String(item.updated_at || ""), runs,
      selected_run_id: runIds.has(item.selected_run_id) ? item.selected_run_id : runs.at(-1)?.id || null
    }];
  });
}

function appendStudyRun(study, result, now, createId) {
  const run = studyCopy({ ...result, id: createId(), created_at: now });
  return { ...studyCopy(study), runs: [...studyCopy(study.runs || []), run], updated_at: now, selected_run_id: run.id };
}

function saveStudyRecord(studies, draft, pendingRuns, openStudyId, now, createId) {
  const error = studyRangeError(draft.start, draft.end);
  if (error || !studySourceNames(draft.sources).length) throw new Error(error || "Choose at least one source.");
  const previous = studies.find((item) => item.id === openStudyId);
  const runs = [...studyCopy(previous?.runs || []), ...studyCopy(pendingRuns)];
  const study = {
    ...studyCopy(draft), id: previous?.id || createId(),
    name: String(draft.name || "").trim() || `Study ${draft.start.toFixed(3)}–${draft.end.toFixed(3)}s`,
    created_at: previous?.created_at || now, updated_at: now, runs,
    selected_run_id: pendingRuns.at(-1)?.id || previous?.selected_run_id || runs.at(-1)?.id || null
  };
  return { studies: previous ? studies.map((item) => item.id === study.id ? study : item) : [...studies, study], study };
}

function compareStudyRuns(current, previous) {
  const input = (run) => JSON.stringify({ range: run?.range, sources: [...(run?.sources || [])].sort(), settings: studyDetectionSettings(run?.settings, run?.algorithm_version) });
  return { sameInputs: input(current) === input(previous), current: studyCopy(current), previous: studyCopy(previous) };
}
