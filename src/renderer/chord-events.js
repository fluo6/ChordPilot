function copyChordEvent(event) {
  return typeof structuredClone === "function" ? structuredClone(event) : JSON.parse(JSON.stringify(event));
}

function barChordEvents(bar, endTime) {
  if (!bar || typeof bar !== "object") return [];
  const start = Number(bar.start);
  const end = Number(endTime);
  const source = bar.chord_events;
  if (Number.isFinite(start) && Number.isFinite(end) && end > start && Array.isArray(source) && source.length) {
    let previousEnd = start;
    const valid = source.every((event) => {
      if (!event || typeof event !== "object") return false;
      const eventStart = Number(event.start);
      const eventEnd = Number(event.end);
      if (!Number.isFinite(eventStart) || !Number.isFinite(eventEnd) || eventStart < start - 1e-6 || eventEnd > end + 1e-6 || eventEnd <= eventStart || Math.abs(eventStart - previousEnd) > 1e-6 || typeof event.chord !== "string" || !event.chord.trim() || (event.alternatives !== undefined && !Array.isArray(event.alternatives))) return false;
      previousEnd = eventEnd;
      return true;
    });
    if (valid && Math.abs(previousEnd - end) <= 1e-6) return source.map(copyChordEvent);
  }
  const chord = typeof bar.chord === "string" && bar.chord.trim() ? bar.chord : "N.C.";
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
  const legacy = { start, end, chord };
  for (const key of ["confidence", "chord_confidence", "pitch_confidence", "alternatives", "evidence", "bass_reference", "debug"]) {
    if (bar[key] !== undefined) legacy[key] = copyChordEvent(bar[key]);
  }
  if (legacy.alternatives !== undefined && !Array.isArray(legacy.alternatives)) delete legacy.alternatives;
  return [legacy];
}

function activeChordEvent(events, time) {
  const position = Number(time);
  if (!Number.isFinite(position) || !Array.isArray(events)) return -1;
  return events.findIndex((event) => event && Number.isFinite(Number(event.start)) && Number.isFinite(Number(event.end)) && Number(event.end) > Number(event.start) && position >= Number(event.start) && position < Number(event.end) && typeof event.chord === "string" && event.chord.trim());
}

function summarizeChordEvents(events) {
  if (!Array.isArray(events) || !events.length) return null;
  let best = null;
  let duration = -1;
  for (const event of events) {
    if (!event || !Number.isFinite(Number(event.start)) || !Number.isFinite(Number(event.end)) || Number(event.end) <= Number(event.start)) continue;
    const next = Number(event.end) - Number(event.start);
    if (next > duration) { best = event; duration = next; }
  }
  return best;
}

function splitChordEvent(events, index, time) {
  const copy = (events || []).map(copyChordEvent);
  const event = copy[index]; const split = Number(time);
  if (!event || !Number.isFinite(split) || split - event.start < 0.05 || event.end - split < 0.05) return copy;
  const right = copyChordEvent(event); event.end = split; right.start = split;
  event.evidence_stale = true; right.evidence_stale = true;
  copy.splice(index + 1, 0, right); return copy;
}

function moveChordBoundary(events, index, time) {
  const copy = (events || []).map(copyChordEvent);
  const left = copy[index]; const right = copy[index + 1]; const position = Number(time);
  if (!left || !right || !Number.isFinite(position)) return copy;
  const boundary = Math.max(left.start + 0.05, Math.min(right.end - 0.05, position));
  if (right.end - left.start < 0.1) return copy;
  left.end = boundary; right.start = boundary;
  left.evidence_stale = true; right.evidence_stale = true;
  return copy;
}

function mergeChordEvents(events, index) {
  const copy = (events || []).map(copyChordEvent);
  const left = copy[index]; const right = copy[index + 1];
  if (!left || !right || Math.abs(left.end - right.start) > 1e-6) return copy;
  const leftEnd = left.end;
  // Keep source cells from both sides for beat spectra and bass-note previews.
  if (left.debug?.cells?.length || right.debug?.cells?.length) {
    const cells = event => event.debug?.cells?.length ? event.debug.cells : [{
      start: event.start, end: event.end, chord: event.chord,
      evidence: event.evidence, bass_reference: event.bass_reference
    }];
    const combined = [...cells(left), ...cells(right)];
    left.debug = {...left.debug, cells: [...new Map(combined.map(cell => [JSON.stringify(cell), cell])).values()]
      .sort((a, b) => a.start - b.start)};
  }
  left.end = right.end;
  left.evidence_history = [...(left.evidence_history || []), { start: left.start, end: leftEnd, evidence: left.evidence, alternatives: left.alternatives }, { start: right.start, end: right.end, evidence: right.evidence, alternatives: right.alternatives }].filter((item) => item.evidence || item.alternatives);
  const alternatives = [...(left.alternatives || []), ...(right.alternatives || [])];
  left.alternatives = [...new Map(alternatives.map((item) => [item.chord, item])).values()];
  left.evidence_stale = true;
  copy.splice(index + 1, 1);
  return copy;
}

function splitEventsAtBoundary(events, boundary) {
  const left = []; const right = []; const split = Number(boundary);
  if (!Number.isFinite(split)) return [left, right];
  (events || []).forEach((source) => {
    if (source.start < split) {
      const item = copyChordEvent(source);
      if (item.end > split) { item.end = split; item.evidence_stale = true; }
      if (item.end > item.start) left.push(item);
    }
    if (source.end > split) {
      const item = copyChordEvent(source);
      if (item.start < split) { item.start = split; item.evidence_stale = true; }
      if (item.end > item.start) right.push(item);
    }
  });
  return [left, right];
}

function shiftChordEventTimes(events, offset) {
  const shift = Number(offset) || 0;
  return (events || []).map((source) => {
    const event = copyChordEvent(source);
    event.start = Number(event.start) + shift;
    event.end = Number(event.end) + shift;
    return event;
  });
}

function retimeChordEvents(events, start, end) {
  const first = Number(events?.[0]?.start);
  const last = Number(events?.[events.length - 1]?.end);
  const targetStart = Number(start); const targetEnd = Number(end);
  if (!Array.isArray(events) || !events.length || !Number.isFinite(first) || !Number.isFinite(last) || last <= first || targetEnd <= targetStart) return [];
  const scale = (targetEnd - targetStart) / (last - first);
  return events.map((source) => {
    const event = copyChordEvent(source);
    event.start = targetStart + (Number(source.start) - first) * scale;
    event.end = targetStart + (Number(source.end) - first) * scale;
    event.evidence_stale = true;
    return event;
  });
}
