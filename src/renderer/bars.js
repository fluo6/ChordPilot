function findActiveBarIndex(time) {
  if (!hasChart()) {
    return -1;
  }

  for (let index = state.chart.bars.length - 1; index >= 0; index -= 1) {
    const start = Number(state.chart.bars[index].start);
    if (Number.isFinite(start) && time >= start - 0.03) {
      return index;
    }
  }

  return state.chart.bars.length ? 0 : -1;
}

function chordEventsForBar(index) {
  if (!hasChart() || index < 0 || index >= state.chart.bars.length) return [];
  const bar = state.chart.bars[index];
  return barChordEvents(bar, barEndTime(index));
}

function getSelectedChordEvent(index = state.selectedIndex) {
  const bar = hasChart() ? state.chart.bars[index] : null;
  const events = chordEventsForBar(index);
  if (!events.length) return null;
  const selected = Number(state.selectedChordEventIndex);
  const eventIndex = Number.isInteger(selected) && selected >= 0 && selected < events.length ? selected : 0;
  const source = bar?.chord_events;
  if (Array.isArray(source) && source.length === events.length && source.every((event, position) => event?.start === events[position].start && event?.end === events[position].end && event?.chord === events[position].chord)) {
    return source[eventIndex];
  }
  return events[eventIndex];
}

function selectedChordTarget(index = state.selectedIndex) {
  const bar = hasChart() ? state.chart.bars[index] : null;
  return validStoredChordEvents(bar, index) ? getSelectedChordEvent(index) : bar;
}

function validStoredChordEvents(bar, index) {
  if (!Array.isArray(bar?.chord_events) || !bar.chord_events.length) return false;
  return JSON.stringify(bar.chord_events) === JSON.stringify(barChordEvents(bar, barEndTime(index)));
}

function syncBarChordSummary(bar) {
  const events = barChordEvents(bar, barEndTime(state.chart.bars.indexOf(bar)));
  const dominant = summarizeChordEvents(events);
  if (!dominant) return;
  for (const field of ["chord", "confidence", "chord_confidence", "pitch_confidence", "alternatives", "evidence", "bass_reference", "debug", "evidence_stale", "evidence_history"]) {
    if (dominant[field] !== undefined) bar[field] = dominant[field];
  }
}

function detailSpectrumFrame(display, time) {
  const cells = display?.debug?.cells || [];
  const frame = cells.find((cell) => time >= cell.start && time < cell.end);
  if (frame) return frame;
  if (cells.length) return cells[0];
  return display?.evidence?.spectrum ? display : null;
}

function measuredBassMidi(reference, pitches = []) {
  if (!reference) return null;
  const pitchClass = Number.isInteger(reference.pitch_class) ? reference.pitch_class : pitchIndex(reference.note);
  if (reference.method === 'periodicity' && Number.isInteger(reference.midi) && reference.midi >= 21
      && reference.midi <= 67 && reference.midi % 12 === pitchClass) return reference.midi;
  const matching = pitches.filter(pitch => Number.isInteger(pitch.midi) && pitch.midi >= 21 && pitch.midi <= 108
    && pitch.midi % 12 === pitchClass && pitch.strength > 0);
  return matching.length ? Math.min(...matching.map(pitch => pitch.midi)) : null;
}

function stabilizedChordFrame(display) {
  if (!display) return null;
  if (!Number.isFinite(display.start) || !Number.isFinite(display.end)) return display;
  const events = (state.chart?.bars || []).flatMap(bar => bar.chord_events || []);
  const selected = events.findIndex(event => event.start === display.start && event.end === display.end && event.chord === display.chord);
  let span = [display];
  if (selected >= 0) {
    let first = selected, last = selected;
    const source = event => event.evidence?.source || event.debug?.cells?.[0]?.evidence?.source;
    const adjacent = (left, right) => left.chord === right.chord && Math.abs(left.end - right.start) <= .005 && source(left) === source(right);
    while (first > 0 && adjacent(events[first - 1], events[first])) first -= 1;
    while (last + 1 < events.length && adjacent(events[last], events[last + 1])) last += 1;
    span = events.slice(first, last + 1);
  }
  const cells = span.flatMap(event => (event.debug?.cells || [event]).map(cell => ({ ...cell,
    start: Math.max(event.start, cell.start), end: Math.min(event.end, cell.end)
  })).filter(cell => cell.end > cell.start));
  const strengths = new Map();
  for (const cell of cells) {
    const weight = cell.end - cell.start;
    for (const note of cell.evidence?.detected_notes || []) {
      if (Number.isFinite(note.strength) && note.strength > 0) strengths.set(note.note, (strengths.get(note.note) || 0) + note.strength * weight);
    }
  }
  const total = [...strengths.values()].reduce((sum, strength) => sum + strength, 0);
  const detected = [...strengths].map(([note, strength]) => ({ note, strength: strength / total }))
    .filter(note => note.strength > .02).sort((a, b) => b.strength - a.strength).slice(0, 6);
  const pitches = new Map(), bassPitches = new Map();
  let pitchDuration = 0, hasPitchEvidence = false;
  for (const cell of cells) {
    const spectrum = cell.evidence?.overtone_weighted_spectrum || cell.evidence?.tail_reduced_spectrum || cell.evidence?.spectrum;
    let harmonic = cell.evidence?.detected_pitches;
    if (!Array.isArray(harmonic) && Array.isArray(spectrum?.peaks)) {
      const power = spectrum.peaks.reduce((sum, peak) => sum + 10 ** (peak.level_db / 10), 0);
      harmonic = spectrum.peaks.map(peak => ({ ...peak, strength: power ? 10 ** (peak.level_db / 10) / power : 0 }));
    }
    const bass = cell.bass_reference?.detected_pitches;
    hasPitchEvidence ||= Array.isArray(harmonic) || Array.isArray(bass);
    const sources = [harmonic, bass].filter(source => Array.isArray(source) && source.length);
    if (!sources.length) continue;
    const duration = cell.end - cell.start;
    pitchDuration += duration;
    for (const source of sources) {
      for (const pitch of source) {
        if (!Number.isInteger(pitch.midi) || !Number.isFinite(pitch.strength) || pitch.strength <= 0) continue;
        const weight = pitch.strength * duration / sources.length;
        const item = pitches.get(pitch.midi) || { ...pitch, strength: 0 };
        item.strength += weight; pitches.set(pitch.midi, item);
        if (source === bass) bassPitches.set(pitch.midi, { ...item });
      }
    }
  }
  const combinedPitches = [...pitches.values()].map(pitch => ({ ...pitch, strength: pitch.strength / (pitchDuration || 1) }))
    .sort((a, b) => b.strength - a.strength);
  const bassReference = display.bass_reference || cells.find(cell => cell.bass_reference)?.bass_reference;
  return { start: span[0].start, end: span.at(-1).end, chord: display.chord,
    bassMidi: measuredBassMidi(bassReference, [...bassPitches.values()]),
    bassOctaveMissing: Boolean(bassReference?.note && cells.some(cell => cell.bass_reference && !Array.isArray(cell.bass_reference.detected_pitches))),
    evidence: {
    source: display.evidence?.source || cells[0]?.evidence?.source,
    detected_notes: detected,
    scoring_pitch_classes: display.evidence?.scoring_pitch_classes,
    scoring_bass_weight: display.evidence?.scoring_bass_weight,
    scoring_source: display.evidence?.scoring_source,
    overtone_weighted: cells.some(cell => cell.evidence?.overtone_weighting?.applied || cell.bass_reference?.overtone_weighting?.applied),
    ...(hasPitchEvidence ? { detected_pitches: combinedPitches } : {}),
    spectrum: averageSpectrumFrames(cells.map(cell => cell.evidence?.overtone_weighted_spectrum || cell.evidence?.tail_reduced_spectrum
      ? { ...cell, evidence: { ...cell.evidence, spectrum: cell.evidence.overtone_weighted_spectrum || cell.evidence.tail_reduced_spectrum } } : cell))
  } };
}

function updateActiveBarFromPlayback() {
  const originalTime = Number(elements.audioPlayer.currentTime || 0) * (Number(state.audioPreview?.tempoRate) || 1);
  let nextIndex = findActiveBarIndex(originalTime);
  let events = chordEventsForBar(nextIndex);
  let nextEventIndex = activeChordEvent(events, originalTime);
  if (nextEventIndex < 0 && hasChart()) {
    const containingIndex = state.chart.bars.findIndex((bar, index) => originalTime >= Number(bar.start)
      && originalTime < barEndTime(index));
    if (containingIndex >= 0) {
      nextIndex = containingIndex;
      events = chordEventsForBar(nextIndex);
      nextEventIndex = activeChordEvent(events, originalTime);
    }
  }
  const nextBeatNumber = beatNumberAtTime(nextIndex, originalTime);
  const nextSpectrumStart = detailSpectrumFrame(events[nextEventIndex], originalTime)?.start ?? null;
  if (nextIndex === state.activeIndex
    && nextEventIndex === state.activeChordEventIndex
    && nextBeatNumber === state.activeBeatNumber
    && nextSpectrumStart === state.activeDetailSpectrumStart
    && nextIndex === state.selectedIndex
    && Math.max(0, nextEventIndex) === state.selectedChordEventIndex) {
    // Bass source-cell timing remains independent of manual chord boundaries.
    if (nextIndex >= 0 && typeof renderDetailBass === "function") {
      renderDetailBass(state.chart.bars[nextIndex], barEndTime(nextIndex), originalTime);
    }
    if (nextIndex >= 0 && typeof renderDetailGuitar === "function") {
      renderDetailGuitar(state.chart.bars[nextIndex], barEndTime(nextIndex), originalTime);
    }
    if (nextIndex >= 0 && typeof renderDetailDrums === 'function') {
      renderDetailDrums(state.chart.bars[nextIndex],barEndTime(nextIndex),originalTime);
    }
    if (typeof updateChartPlayback === 'function') updateChartPlayback(originalTime,nextIndex);
    return;
  }

  state.activeIndex = nextIndex;
  state.activeChordEventIndex = nextEventIndex;
  state.activeBeatNumber = nextBeatNumber;
  state.activeDetailSpectrumStart = nextSpectrumStart;
  if (nextIndex >= 0) {
    state.selectedIndex = nextIndex;
    state.selectedChordEventIndex = Math.max(0, nextEventIndex);
  }
  if (typeof updateChartPlayback === 'function') updateChartPlayback(originalTime,nextIndex);
  updateRowState({ playback: true });
}

function renderBars() {
  if (typeof syncCompactWorkspace === "function") syncCompactWorkspace();
  elements.barsBody.innerHTML = "";
  if (elements.chartPreview) {
    elements.chartPreview.innerHTML = "";
  }
  renderLyricsReferencePanel();
  if(typeof renderTranscriptionReview==='function') renderTranscriptionReview();
  state.barRows = [];

  if (!hasChart()) {
    elements.activeBarText.textContent = "Bar -";
    updateTimelineTransportInfo();
    renderChartPreview();
    renderChartReasonPane(null);
    renderTimeline();
    updateButtons();
    return;
  }

  state.chart.bars.forEach((bar, index) => {
    const row = document.createElement("tr");
    row.dataset.index = String(index);
    row.addEventListener("click", () => {
      selectBar(index, true);
    });

    const barCell = document.createElement("td");
    barCell.appendChild(createInput(bar.number, (value) => {
      bar.number = Number(value) || index + 1;
      renderTimeline();
    }, "bar-number"));

    const sectionCell = document.createElement("td");
    sectionCell.appendChild(createInput(bar.section, (value) => {
      bar.section = value;
      renderTimeline();
    }));

    const chordCell = document.createElement("td");
    const chordInput = createInput(bar.chord, (value) => {
      if(typeof captureDetectedChords==='function')captureDetectedChords(bar,barEndTime(index),Number(state.chart.key_offset) || 0);
      const markManual=target=>{target.manual=true;target.evidence_stale=true;delete target.confidence;delete target.chord_confidence;};
      if (Array.isArray(bar.chord_events) && bar.chord_events.length) {
        const dominantIndex = bar.chord_events.reduce((best, event, eventIndex, all) => event.end - event.start > all[best].end - all[best].start ? eventIndex : best, 0);
        bar.chord_events[dominantIndex].chord = value;
        markManual(bar.chord_events[dominantIndex]);
        syncBarChordSummary(bar);
      } else bar.chord = value;
      markManual(bar);
      renderTimeline();
    }, "table-chord-input");
    chordInput.value = displayChordSymbol(bar.chord, false);
    chordInput.addEventListener('focus', () => { chordInput.value = bar.chord || ''; });
    chordInput.addEventListener('blur', () => { chordInput.value = displayChordSymbol(bar.chord, false); });
    if (Array.isArray(bar.alternatives) && bar.alternatives.length) {
      chordInput.title = `Alternatives: ${bar.alternatives.map((item) => `${item.chord} ${Math.round(item.score * 100)}%`).join(", ")}`;
    }
    chordInput.title = `Edit using letter-name chords. ${chordInput.title || ''}`.trim();
    chordCell.appendChild(chordInput);
    const events = chordEventsForBar(index);
    if (events.length > 1) {
      const eventList = document.createElement("div");
      eventList.className = "bar-chord-events";
      events.forEach((item, eventIndex) => {
        const eventButton = document.createElement("button");
        eventButton.type = "button";
        eventButton.className = "bar-chord-event";
        eventButton.textContent = `${eventIndex + 1}: ${displayChordSymbol(item.chord)}`;
        eventButton.title = `${formatSeconds(item.start)}–${formatSeconds(item.end)}s · click to inspect this chord`;
        eventButton.setAttribute("aria-label", `Chord event ${eventIndex + 1}: ${item.chord}`);
        eventButton.addEventListener("click", (event) => {
          event.stopPropagation();
          selectBar(index, true, eventIndex);
        });
        eventList.appendChild(eventButton);
      });
      chordCell.appendChild(eventList);
    }

    const confidenceCell = document.createElement("td");
    confidenceCell.className = confidenceClass(bar.confidence);
    confidenceCell.textContent = formatConfidence(bar.confidence);

    const repeatCell = document.createElement("td");
    repeatCell.className = "repeat-cell";
    repeatCell.appendChild(createInput(bar.repeat_start ? "start" : "", (value) => {
      bar.repeat_start = value.trim().toLowerCase() === "start";
      updateDetailPane();
    }));
    repeatCell.appendChild(createInput(bar.repeat_end ? String(bar.repeat_end) : "", (value) => {
      bar.repeat_end = Number(value) || 0;
      updateDetailPane();
    }));

    const startCell = document.createElement("td");
    startCell.appendChild(createInput(formatSeconds(bar.start), (value) => {
      bar.start = Number(value) || 0;
      renderTimeline();
    }));

    const lyricsCell = document.createElement("td");
    lyricsCell.className = "lyrics-table-cell";
    lyricsCell.appendChild(createTextarea(bar.lyrics, (value) => {
      bar.lyrics = value;
      bar.lyrics_source = "manual";
      renderTimeline();
      renderLyricsReferencePanel();
      renderChartPreview();
      updateDetailPane();
    }, "lyrics-table-input"));

    const notesCell = document.createElement("td");
    notesCell.appendChild(createInput(bar.notes, (value) => {
      bar.notes = value;
      updateDetailPane();
    }));

    const drumCell = document.createElement('td');drumCell.className='drum-table-cell';
    drumCell.textContent = typeof drumSummary === 'function' ? drumSummary(state.chart,bar,barEndTime(index)) : 'Not analysed';
    drumCell.title='K kick · S snare · T toms · H hi-hat · C cymbals/ride';
    row.append(barCell, sectionCell, chordCell, confidenceCell, repeatCell, startCell, lyricsCell, drumCell, notesCell);
    elements.barsBody.appendChild(row);
    state.barRows.push(row);
  });

  renderTimeline();
  renderChartPreview();
  updateRowState();
}

function chartRows(measuresPerRow = typeof chartBarsPerLine === 'function' ? chartBarsPerLine() : 4) {
  if (!hasChart()) {
    return [];
  }
  const rows = [];
  let current = [];
  let lastSection = null;
  state.chart.bars.forEach((bar, index) => {
    const section = String(bar.section || "").trim();
    if (section && lastSection !== null && section !== lastSection && current.length) {
      rows.push(current);
      current = [];
    }
    lastSection = section || lastSection;
    current.push({ bar, index, section });
    if (current.length >= measuresPerRow) {
      rows.push(current);
      current = [];
    }
  });
  if (current.length) {
    rows.push(current);
  }
  return rows;
}

function displayChordSymbol(symbol, simplify = elements.simplifyChordsInput?.checked ?? state.chart?.analysis_engine?.options?.simplify_chords ?? true, key) {
  const canonical = String(symbol || "N.C.").replace(/^([A-G][#b]?)M(7|9|13)(?=[#b/]|$)/, "$1maj$2");
  const visible = !simplify ? canonical : canonical.replace(/^([A-G][#b]?)9sus4(?=\/|$)/, (_, root) => `${root}7sus4`).replace(/^([A-G][#b]?)(maj(?:9|13)|m(?:9|11)|9|11|13|m?add9)(?=\/|$)/, (_, root, quality) => {
    const simple = quality.startsWith("maj") ? "maj7" : quality.startsWith("madd") ? "m" : quality === "add9" ? "" : quality.startsWith("m") ? "m7" : "7";
    return root + simple;
  });
  return typeof formatChordDisplay === 'function' ? formatChordDisplay(visible, key) : visible;
}

function chordSymbolParts(symbol) {
  const text = String(symbol || "N.C.").trim();
  const match = /^([A-G][#b]?)(.*?)(?:\/([A-G][#b]?))?$/.exec(text);
  if (!match) return { root: text, quality: "", bass: "" };
  const accidental = (note) => note.replace("#", "♯").replace("b", "♭");
  return {
    root: accidental(match[1]),
    quality: match[2].replace(/#(?=\d)/g, "♯").replace(/b(?=\d)/g, "♭"),
    bass: match[3] ? accidental(match[3]) : ""
  };
}

function renderDetailChordSymbol(symbol, confidence) {
  const parts = typeof formatChordDisplayParts === 'function' ? formatChordDisplayParts(symbol) : chordSymbolParts(symbol);
  const root = document.createElement("span");
  root.textContent = parts.root.replace('#', '♯').replace('b', '♭');
  const quality = document.createElement("span");
  quality.className = "detail-chord-quality";
  quality.textContent = parts.quality.replace(/#(?=\d)/g, '♯').replace(/b(?=\d)/g, '♭');
  const bass = document.createElement("span");
  bass.className = "detail-chord-bass";
  bass.textContent = parts.bass ? `/${parts.bass.replace('#', '♯').replace('b', '♭')}` : "";
  elements.detailChordDisplay.replaceChildren(root, quality, bass);
  const badge = elements.detailChordConfidence;
  if (badge) {
    badge.className = `${confidenceClass(confidence)} detail-chord-confidence`;
    badge.textContent = formatConfidence(confidence);
    badge.title = "Heuristic chord ranking score, not a calibrated probability. Check notes and alternatives.";
    badge.hidden = false;
  }
}

function barChordText(bar) {
  if (bar?.debug?.stability && bar.chord) return displayChordSymbol(bar.chord);
  const choice = highestConfidenceChordChoice(bar);
  const chord = String(choice?.chord || bar?.chord || "").trim();
  return displayChordSymbol(chord);
}

function highestConfidenceChordChoice(bar) {
  const choices = [];
  const addChoice = (chord, score) => {
    const clean = String(chord || "").trim();
    const confidence = Number(score);
    if (!clean || !Number.isFinite(confidence)) {
      return;
    }
    choices.push({ chord: clean, confidence });
  };

  addChoice(bar?.chord, bar?.chord_confidence ?? bar?.confidence);
  (Array.isArray(bar?.alternatives) ? bar.alternatives : []).forEach((item) => {
    addChoice(item.chord, item.score ?? item.confidence);
  });

  if (!choices.length) {
    return null;
  }
  return choices.sort((left, right) => right.confidence - left.confidence)[0];
}

function barLyricText(bar) {
  return String(bar?.lyrics || "").trim();
}

function lyricEntries() {
  if (!hasChart()) {
    return [];
  }

  const manualOverrides = state.chart.bars.some((bar) => barLyricText(bar) && bar.lyrics_source === "manual");
  const referenceLines = Array.isArray(state.chart.lyrics?.lines) ? state.chart.lyrics.lines : [];
  if (!manualOverrides && referenceLines.length) {
    return referenceLines
      .map((line) => ({
        start: Number(line.start) || 0,
        end: Number(line.end) || Number(line.start) + secondsPerBar(),
        text: String(line.text || "").trim(),
        confidence: Number(line.confidence)
      }))
      .filter((line) => line.text);
  }

  return state.chart.bars
    .map((bar, index) => ({
      start: Number(bar.start) || 0,
      end: barEndTime(index) || Number(bar.start) + secondsPerBar(),
      text: barLyricText(bar),
      confidence: Number.isFinite(Number(bar.lyric_confidence)) ? Number(bar.lyric_confidence) : null
    }))
    .filter((line) => line.text);
}

function lyricSummaryText() {
  if (!hasChart()) {
    return "";
  }
  const result = state.chart.lyrics;
  if (result?.ok) {
    const language = result.language ? `${result.language_mode === "specified" ? "specified" : "detected"} ${result.language}` : "auto language";
    return `${result.lines?.length || 0} detected lines from ${result.source || "audio"} - ${language} - ${result.engine || "lyrics engine"}`;
  }
  if (result?.error) {
    return `Lyrics unavailable: ${result.error}`;
  }
  const manualCount = state.chart.bars.filter((bar) => barLyricText(bar)).length;
  return manualCount ? `${manualCount} bars have manual lyrics` : "No detected lyrics yet";
}

function renderLyricsReferencePanel() {
  if (!elements.lyricsReferencePanel) {
    return;
  }
  elements.lyricsReferencePanel.innerHTML = "";
  elements.lyricsReferencePanel.classList.toggle("hidden", !hasChart());
  if (!hasChart()) {
    return;
  }

  const header = document.createElement("div");
  header.className = "lyrics-reference-head";
  const title = document.createElement("strong");
  title.textContent = "Detected Lyrics";
  const summary = document.createElement("span");
  summary.textContent = lyricSummaryText();
  header.append(title, summary);
  elements.lyricsReferencePanel.appendChild(header);

  const result = state.chart.lyrics;
  const lines = Array.isArray(result?.lines) ? result.lines : [];
  if (lines.length) {
    const list = document.createElement("div");
    list.className = "lyrics-reference-list";
    lines.slice(0, 16).forEach((line) => {
      const start = Number(line.start) || 0;
      const end = Number(line.end) || start;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "lyrics-reference-line";
      button.title = `Jump to ${formatSeconds(start)}s`;
      const time = document.createElement("em");
      time.textContent = `${formatSeconds(start)}-${formatSeconds(end)}s`;
      const text = document.createElement("span");
      text.textContent = String(line.text || "").trim();
      button.append(time, text);
      button.addEventListener("click", () => {
        elements.audioPlayer.currentTime = Math.max(0, start);
        const index = findActiveBarIndex(start);
        if (index >= 0) {
          selectBar(index, true);
        }
        updatePlayhead();
      });
      list.appendChild(button);
    });
    elements.lyricsReferencePanel.appendChild(list);
    if (lines.length > 16) {
      const more = document.createElement("div");
      more.className = "lyrics-reference-more";
      more.textContent = `${lines.length - 16} more lines are mapped into the table below.`;
      elements.lyricsReferencePanel.appendChild(more);
    }
    return;
  }

  const mapped = state.chart.bars.filter((bar) => barLyricText(bar));
  if (mapped.length) {
    const list = document.createElement("div");
    list.className = "lyrics-reference-list compact";
    mapped.slice(0, 12).forEach((bar) => {
      const row = document.createElement("span");
      row.className = "lyrics-reference-static";
      row.textContent = `Bar ${bar.number}: ${barLyricText(bar)}`;
      list.appendChild(row);
    });
    elements.lyricsReferencePanel.appendChild(list);
  }
}

function lyricReferenceLinesForBar(index) {
  if (!hasChart() || index < 0) {
    return [];
  }
  const lines = Array.isArray(state.chart.lyrics?.lines) ? state.chart.lyrics.lines : [];
  if (!lines.length) {
    return [];
  }
  const start = Number(state.chart.bars[index]?.start) || 0;
  const end = barEndTime(index) || start + secondsPerBar();
  return lines.filter((line) => {
    const lineStart = Number(line.start) || 0;
    const lineEnd = Number(line.end) || lineStart;
    return Math.max(start, lineStart) < Math.min(end, lineEnd) || (lineStart >= start && lineStart < end);
  });
}

function barRepeatText(bar) {
  const parts = [];
  if (bar?.repeat_start) {
    parts.push("repeat start");
  }
  if (Number(bar?.repeat_end) > 0) {
    parts.push(`${bar.repeat_end}x`);
  }
  return parts.join(" / ");
}

function irealChordParts(symbol) {
  const clean = String(symbol || "N.C.").trim();
  if (clean.toUpperCase() === "N.C.") {
    return { root: "N.C.", quality: "", extension: "", bass: "" };
  }

  const slashIndex = /\/(?:[A-G][#b]?|[♭♯]?[1-7])$/.exec(clean)?.index ?? -1;
  const main = slashIndex >= 0 ? clean.slice(0, slashIndex) : clean;
  const bass = slashIndex >= 0 ? clean.slice(slashIndex + 1) : "";
  const rootMatch = main.match(/^([A-G][#b]?|[♭♯]?[1-7])(.*)$/);
  if (!rootMatch) {
    return { root: clean, quality: "", extension: "", bass: "" };
  }

  const root = rootMatch[1];
  let rest = (rootMatch[2] || "").trim();
  let quality = "";

  if (/^(maj|M)/.test(rest)) {
    rest = rest.replace(/^(maj|M)/, "^");
  } else if (/^(?:min|m(?!aj)|[-−])/i.test(rest)) {
    quality = "-";
    rest = rest.replace(/^(?:min|m(?!aj)|[-−])/i, "");
  } else if (/^(?:dim|°)/i.test(rest)) {
    quality = "o";
    rest = rest.replace(/^(?:dim|°)/i, "");
  } else if (/^(?:aug|\+)/i.test(rest)) {
    quality = "+";
    rest = rest.replace(/^(?:aug|\+)/i, "");
  }

  rest = rest.replace(/Δ/g, "^").replace(/ø/g, "h");
  return { root, quality, extension: rest, bass };
}

function appendIrealChord(parent, symbol) {
  const parts = irealChordParts(symbol);
  const root = document.createElement("span");
  root.className = "ireal-root";
  root.textContent = parts.root.replace("#", "♯").replace("b", "♭");
  parent.appendChild(root);

  if (parts.quality) {
    const quality = document.createElement("span");
    quality.className = "ireal-quality";
    quality.textContent = parts.quality === "o" ? "°" : parts.quality;
    parent.appendChild(quality);
  }

  if (parts.extension) {
    const extension = document.createElement("sup");
    extension.textContent = parts.extension.replace(/\^/g, "Δ").replace(/h/g, "ø").replace(/#(?=\d)/g, "♯").replace(/b(?=\d)/g, "♭");
    parent.appendChild(extension);
  }

  if (parts.bass) {
    const bass = document.createElement("span");
    bass.className = "ireal-bass";
    bass.textContent = `/${parts.bass.replace("#", "♯").replace("b", "♭")}`;
    parent.appendChild(bass);
  }
}

function appendChordBeatTrack(parent, index, ireal = false) {
  const model = chordBeatLayout(state.chart.bars[index], barEndTime(index), state.chart, chordEventsForBar(index));
  parent.className = 'chord-beat-track';
  parent.setAttribute('aria-label', `${model.beats} beats; chord positions and lengths`);
  model.labels.forEach((label, i) => {
    const tick = document.createElement('span');
    tick.className = 'chord-beat-tick'; tick.textContent = label;
    tick.style.left = `${100*i/model.beats}%`;
    parent.append(tick);
  });
  model.events.forEach(({event, eventIndex, offset, duration}) => {
    const region = document.createElement('span');
    region.className = 'chord-beat-event';
    region.dataset.start = event.start; region.dataset.end = event.end;
    region.style.left = `${100*offset/model.beats}%`;
    region.style.width = `${100*duration/model.beats}%`;
    const firstBeat = model.labels[0]+offset;
    const text = `${displayChordSymbol(event.chord)} · beat ${+firstBeat.toFixed(3)} · ${+duration.toFixed(3)} beats`;
    region.title = text; region.setAttribute('aria-label', text);
    const symbol = document.createElement('span');
    symbol.className = `chord-beat-symbol${ireal ? ' ireal-chord' : ''}`;
    if (ireal) appendIrealChord(symbol, displayChordSymbol(event.chord));
    else symbol.textContent = displayChordSymbol(event.chord);
    region.append(symbol);
    region.addEventListener('click', event => {event.stopPropagation(); selectBar(index, true, eventIndex);});
    parent.append(region);
  });
}

function renderMeasureGridPreview(container) {
  const grid = document.createElement("div");
  grid.className = "measure-grid-chart";
  let lastSection='';
  chartRows().forEach((row) => {
    if(row[0].section && row[0].section!==lastSection) {
      const section=document.createElement('h3');section.className='chart-section-label';section.textContent=row[0].section;grid.append(section);lastSection=row[0].section;
    }
    const rowEl = document.createElement("div");
    rowEl.className = "measure-grid-row";
    row.forEach(({ bar, index, section }) => {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "measure-cell";
      cell.dataset.index = String(index);
      cell.classList.toggle("selected", index === state.selectedIndex);
      cell.classList.toggle("active", index === state.activeIndex);
      cell.title = `Bar ${bar.number || index + 1} - ${formatSeconds(bar.start)}s`;
      cell.addEventListener("click", () => selectBar(index, true));

      const number = document.createElement("span");
      number.className = "measure-number";
      number.textContent = bar.number || index + 1;
      const chord = document.createElement("strong");
      appendChordBeatTrack(chord, index);
      const meta = document.createElement("em");
      meta.textContent = [section, barRepeatText(bar)].filter(Boolean).join(" / ");
      const lyrics = document.createElement("span");
      lyrics.className = "measure-lyrics";
      lyrics.textContent = barLyricText(bar);
      cell.append(number, chord, meta, lyrics);
      rowEl.appendChild(cell);
    });
    grid.appendChild(rowEl);
  });
  container.appendChild(grid);
}

function renderIrealPreview(container) {
  const chart = document.createElement("div");
  chart.className = "ireal-chart";
  const header = document.createElement("div");
  header.className = "ireal-header";
  const title = document.createElement("strong");
  title.textContent = typeof chartDisplayTitle==='function'?chartDisplayTitle(state.chart,state.audio || {}):state.chart?.title || "Untitled";
  const metadata = document.createElement("span");
  metadata.textContent = `${chartKeyText(state.chart) || "?"} · ${state.chart?.tempo || "?"} BPM`;
  header.append(title, metadata);
  chart.appendChild(header);

  let lastSection='';
  chartRows().forEach((row) => {
    const rowEl = document.createElement("div");
    rowEl.className = "ireal-row";
    if(row[0].section && row[0].section!==lastSection) {
      const section=document.createElement('span');
      section.className='ireal-section-label';section.textContent=row[0].section;
      section.title=row[0].section;rowEl.append(section);lastSection=row[0].section;
    }
    row.forEach(({ bar, index }) => {
      const measure = document.createElement("button");
      measure.type = "button";
      measure.className = "ireal-measure";
      measure.dataset.index = String(index);
      measure.classList.toggle("selected", index === state.selectedIndex);
      measure.classList.toggle("active", index === state.activeIndex);
      measure.title = `Bar ${bar.number || index + 1} - ${formatSeconds(bar.start)}s`;
      measure.addEventListener("click", () => selectBar(index, true));

      const leftBar = document.createElement("span");
      leftBar.className = "ireal-barline left";
      leftBar.classList.toggle("repeat", Boolean(bar.repeat_start));
      leftBar.textContent = bar.repeat_start ? "|:" : "|";
      const chord = document.createElement("strong");
      appendChordBeatTrack(chord, index, true);
      const rightBar = document.createElement("span");
      rightBar.className = "ireal-barline right";
      rightBar.classList.toggle("repeat", Number(bar.repeat_end) > 0);
      rightBar.textContent = Number(bar.repeat_end) > 0 ? ":|" : "|";
      const number = document.createElement("em");
      number.textContent = bar.number || index + 1;
      const repeat = document.createElement("small");
      repeat.textContent = Number(bar.repeat_end) > 1 ? `${bar.repeat_end}x` : "";
      measure.append(leftBar, chord, repeat, rightBar, number);
      rowEl.appendChild(measure);
    });
    chart.appendChild(rowEl);
  });
  container.appendChild(chart);
}

function renderChordProPreview(container) {
  const text = document.createElement("pre");
  text.className = "chordpro-chart";
  const lines = [
    `{title: ${typeof chartDisplayTitle==='function'?chartDisplayTitle(state.chart,state.audio || {}):state.chart?.title || "Untitled"}}`,
    `{key: ${chartKeyText(state.chart) || state.chart?.key || "C"}}`,
    `{tempo: ${state.chart?.tempo || ""}}`,
    ""
  ];
  text.textContent=lines.join('\n')+'\n';
  let lastSection='';
  chartRows().forEach(row=>{
    const system=document.createElement('span');system.className='chordpro-system';
    const section=row.find(item=>item.section)?.section;
    if(section && section!==lastSection) {system.append(document.createTextNode(`[${section}]\n`));lastSection=section;}
    row.forEach(({bar,index})=>{
      const timing=chordBeatLayout(bar,barEndTime(index),state.chart,chordEventsForBar(index));
      const measure=document.createElement('span');measure.className='chordpro-measure';measure.dataset.index=String(index);
      measure.append(document.createTextNode('| ['));
      timing.events.forEach(({event,eventIndex,offset,duration},i)=>{
        if(i) measure.append(document.createTextNode(' ; '));
        const symbol=document.createElement('span');symbol.className='chordpro-event';symbol.tabIndex=0;symbol.setAttribute('role','button');
        symbol.dataset.start=event.start;symbol.dataset.end=event.end;
        symbol.textContent=`${displayChordSymbol(event.chord)} @${+(timing.labels[0]+offset).toFixed(3)} (${+duration.toFixed(3)}b)`;
        const select=ev=>{ev.stopPropagation();selectBar(index,true,eventIndex)};
        symbol.addEventListener('click',select);
        symbol.addEventListener('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();select(ev)}});
        measure.append(symbol);
      });
      measure.append(document.createTextNode('] '));
      measure.addEventListener('click',()=>selectBar(index,true));
      system.append(measure);
    });
    system.append(document.createTextNode('|\n'));
    const lyrics=row.map(({bar})=>barLyricText(bar)).filter(Boolean).join(' / ');
    if(lyrics) system.append(document.createTextNode(lyrics+'\n'));
    system.append(document.createTextNode('\n'));text.append(system);
  });
  container.appendChild(text);
}

function renderChartPreview() {
  if (!elements.chartPreview || !elements.barsTable) {
    return;
  }
  renderLyricsReferencePanel();
  if(typeof renderTranscriptionReview==='function') renderTranscriptionReview();

  if (typeof syncChartWorkspace === "function") syncChartWorkspace();
  const renderer = state.chartRenderer || "ireal";
  if(typeof updateSpreadsheetChartControls==='function') updateSpreadsheetChartControls();
  if(elements.barsPerLineInput) elements.barsPerLineInput.disabled=renderer==='table';
  const showTable = renderer === "table";
  elements.barsTable.classList.toggle("hidden", !showTable);
  elements.chartPreview.classList.toggle("hidden", showTable);
  if (['bass','drums','melody'].includes(renderer) && hasChart()) {
    renderAlphaTabChartPreview();
    return;
  }
  destroyAlphaTabChart();
  elements.chartPreview.innerHTML = "";

  if (showTable) {
    if(typeof registerChartPlayback==='function') registerChartPlayback();
    return;
  }
  if (!hasChart()) {
    const empty = document.createElement("div");
    empty.className = "empty-chart-preview";
    empty.textContent = "Analyze a song to show a chord chart.";
    elements.chartPreview.appendChild(empty);
    return;
  }

  if (renderer === "ireal") {
    renderIrealPreview(elements.chartPreview);
  } else if (renderer === "spreadsheet") {
    renderSpreadsheetChart(elements.chartPreview);
  } else if (renderer === "numbered") {
    renderNumberedChart(elements.chartPreview);
  } else if (renderer === "chordpro") {
    renderChordProPreview(elements.chartPreview);
  } else {
    renderMeasureGridPreview(elements.chartPreview);
  }
  if(typeof finishChartLayout==='function') finishChartLayout();
}

function setDetailChordEditing(editing) {
  const input = elements.detailChordInput;
  editing = Boolean(editing && !input.disabled);
  input.hidden = !editing;
  elements.detailChordDisplay.hidden = editing;
  elements.detailChordEditBtn?.setAttribute("aria-expanded", String(editing));
  input._editTarget = editing ? `${state.selectedIndex}:${state.selectedChordEventIndex}` : null;
  if (editing) { input.focus(); input.select(); }
}

function updateDetailPane() {
  if(typeof syncAnalysisWorkspace==='function')syncAnalysisWorkspace();
  if(typeof renderTranscriptionReview==='function') renderTranscriptionReview();
  const bar = getSelectedBar();
  if (elements.detailChordEditBtn) {
    elements.detailChordEditBtn.disabled = !bar;
    if (!bar || elements.detailChordInput._editTarget !== `${state.selectedIndex}:${state.selectedChordEventIndex}`) {
      setDetailChordEditing(false);
    }
  }
  const fields = [
    elements.detailSectionInput,
    elements.detailChordInput,
    elements.detailStartInput,
    elements.detailRepeatStartInput,
    elements.detailRepeatEndInput,
    elements.detailLyricsInput,
    elements.detailNotesInput
  ];
  fields.forEach((input) => {
    input.disabled = !bar;
  });

  if (!bar) {
    if (typeof renderDetailBass === "function") renderDetailBass(null, 0, 0);
    if (typeof renderDetailGuitar === "function") renderDetailGuitar(null, 0, 0);
    if (typeof renderDetailDrums === 'function') renderDetailDrums(null,0,0);
    if (typeof renderDetailSpectrum === "function") renderDetailSpectrum(null);
    if (elements.detailChordConfidence) elements.detailChordConfidence.hidden = true;
    elements.detailKeyboard?.replaceChildren();
    elements.detailBarLabel.textContent = "No beat";
    elements.detailChordDisplay.replaceChildren();
    if (typeof renderChordVoicing === 'function') renderChordVoicing(elements.detailChordVoicing, null, 'N.C.');
    if (typeof renderDetailChordNotation === "function") renderDetailChordNotation(null, "N.C.");
    elements.detailChordAlternatives?.replaceChildren();
    elements.detailSectionInput.value = "";
    elements.detailChordInput.value = "";
    elements.detailStartInput.value = "";
    elements.detailRepeatStartInput.checked = false;
    elements.detailRepeatEndInput.value = "";
    elements.detailLyricsInput.value = "";
    elements.detailNotesInput.value = "";
    elements.detailLyricsReference.innerHTML = "";
    elements.detailAlternatives.textContent = "";
    renderChartReasonPane(null);
    return;
  }

  const event = validStoredChordEvents(bar, state.selectedIndex) ? getSelectedChordEvent() : null;
  const display = event || bar;
  renderDetailChordSymbol(display.chord, display.chord_confidence ?? display.confidence);
  if (typeof renderChordVoicing === 'function') renderChordVoicing(elements.detailChordVoicing, display, display.chord, Number(state.chart.key_offset) || 0);
  const followsPlayback = state.selectedIndex === state.activeIndex
    && state.selectedChordEventIndex === state.activeChordEventIndex;
  const detailTime = followsPlayback
    ? Number(elements.audioPlayer.currentTime || 0) * (Number(state.audioPreview?.tempoRate) || 1)
    : Number(event?.start ?? bar.start);
  const spectrumFrame = detailSpectrumFrame(display, detailTime);
  if (typeof renderDetailBass === "function") renderDetailBass(bar, barEndTime(state.selectedIndex), detailTime);
  if (typeof renderDetailGuitar === "function") renderDetailGuitar(bar, barEndTime(state.selectedIndex), detailTime);
  if (typeof renderDetailDrums === 'function') renderDetailDrums(bar,barEndTime(state.selectedIndex),detailTime);
  const stabilizedFrame = stabilizedChordFrame(display);
  if (typeof renderDetailChordNotation === "function") renderDetailChordNotation(stabilizedFrame || display, display.chord);
  if (typeof renderDetailSpectrum === "function") renderDetailSpectrum(spectrumFrame, stabilizedFrame);
  const keyboardScroll = elements.detailKeyboard?.querySelector(".piano-viewport")?.scrollLeft || 0;
  const keyboardEvidence = stabilizedFrame?.evidence || display.evidence;
  elements.detailKeyboard?.replaceChildren(createPianoEvidence({ ...display, evidence: keyboardEvidence }, display.chord, {
    stabilized: true, exactPitches: Array.isArray(keyboardEvidence?.detected_pitches),
    pitchClassesOnly: !Array.isArray(keyboardEvidence?.detected_pitches), octaves: [1, 2, 3, 4],
    bassMidi: stabilizedFrame?.bassMidi, bassOctaveMissing: stabilizedFrame?.bassOctaveMissing, bassNote: display.bass_reference?.note
  }));
  const keyboardViewport = elements.detailKeyboard?.querySelector(".piano-viewport");
  if (keyboardViewport) keyboardViewport.scrollLeft = keyboardScroll;
  const beatNumber = followsPlayback
    ? state.activeBeatNumber
    : beatNumberAtTime(state.selectedIndex, Number(event?.start ?? bar.start));
  elements.detailBarLabel.textContent = `Bar ${bar.number || state.selectedIndex + 1} · Beat ${beatNumber || 1}`;
  if (document.activeElement !== elements.detailSectionInput) {
    elements.detailSectionInput.value = bar.section || "";
  }
  if (document.activeElement !== elements.detailChordInput) {
    elements.detailChordInput.value = display.chord || "";
  }
  if (document.activeElement !== elements.detailStartInput) {
    elements.detailStartInput.value = formatSeconds(Number(bar.start) || 0);
  }
  if (document.activeElement !== elements.detailRepeatStartInput) {
    elements.detailRepeatStartInput.checked = Boolean(bar.repeat_start);
  }
  if (document.activeElement !== elements.detailRepeatEndInput) {
    elements.detailRepeatEndInput.value = bar.repeat_end ? String(bar.repeat_end) : "";
  }
  if (document.activeElement !== elements.detailLyricsInput) {
    elements.detailLyricsInput.value = bar.lyrics || "";
  }
  if (document.activeElement !== elements.detailNotesInput) {
    elements.detailNotesInput.value = display.notes || bar.notes || "";
  }

  renderDetailLyricsReference(state.selectedIndex);

  elements.detailAlternatives.innerHTML = "";
  if (display.evidence_stale) {
    const stale = document.createElement("em");
    stale.className = "evidence-stale";
    stale.textContent = "Timing edited · analysis evidence is historical";
    elements.detailAlternatives.appendChild(stale);
  }
  if (event && typeof openChordEventStudy === "function") {
    const studyButton = document.createElement("button");
    studyButton.type = "button";
    studyButton.textContent = "Study this chord";
    studyButton.addEventListener("click", () => openChordEventStudy(state.selectedIndex, state.selectedChordEventIndex));
    elements.detailAlternatives.appendChild(studyButton);
  }

  const alternativeContainer = elements.detailChordAlternatives || elements.detailAlternatives;
  if (elements.detailChordAlternatives) elements.detailChordAlternatives.replaceChildren();
  const alternatives = Array.isArray(display.alternatives) ? display.alternatives.filter(item => item.chord !== display.chord) : [];
  alternatives.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `${displayChordSymbol(item.chord, false)} · ${formatConfidence(item.score)}`;
    button.title = `Use ${item.chord}`;
    button.addEventListener("click", () => {
      applySelectedChordCorrection('chord', item.chord);
      renderBars();
    });
    alternativeContainer.appendChild(button);
  });

  renderChartReasonPane(display);
}

function renderChartReasonPane(bar = getSelectedBar()) {
  if (!elements.chartReasonPane || !elements.chartReasonLabel) {
    return;
  }
  elements.chartReasonPane.innerHTML = "";
  if (!bar) {
    elements.chartReasonLabel.textContent = "No bar";
    elements.chartReasonPane.innerHTML = "<span>Select a bar to inspect chord evidence.</span>";
    return;
  }

  const display = bar === getSelectedBar() ? selectedChordTarget() || bar : bar;
  const barNumber = getSelectedBar()?.number || state.selectedIndex + 1;
  elements.chartReasonLabel.textContent = `Bar ${barNumber}${display !== bar ? ` · ${display.chord}` : ""}`;
  const chord = document.createElement("strong");
  chord.className = "chart-reason-chord";
  chord.textContent = barChordText(display);
  const confidence = document.createElement("span");
  confidence.className = confidenceClass(display.chord_confidence ?? display.confidence);
  confidence.textContent = `Chord ${formatConfidence(display.chord_confidence ?? display.confidence)} / pitch ${formatConfidence(display.pitch_confidence ?? display.evidence?.pitch_confidence)}`;
  const why = document.createElement("p");
  why.textContent = chordEvidenceText(display, state.selectedIndex);
  elements.chartReasonPane.append(chord, confidence, why, createPianoEvidence(display));

  const alternatives = Array.isArray(display.alternatives) ? display.alternatives : [];
  if (alternatives.length) {
    const list = document.createElement("div");
    list.className = "chart-reason-options";
    alternatives.forEach((item) => {
      const option = document.createElement("button");
      option.type = "button";
      const symbol = document.createElement("span");
      symbol.className = "chord-symbol";
      symbol.textContent = displayChordSymbol(item.chord, false);
      option.append(symbol, ` ${formatConfidence(item.score)}`);
      option.addEventListener("click", () => {
        applySelectedChordCorrection('chord',item.chord);
        renderBars();
      });
      list.appendChild(option);
    });
    elements.chartReasonPane.appendChild(list);
  }
  if(typeof renderChartWorkspaceInspector==='function')renderChartWorkspaceInspector(display);
}

function suggestionItemsForBar(bar) {
  if (!bar) {
    return [];
  }
  const seen = new Set();
  const items = [];
  const addItem = (chord, score, source) => {
    const clean = String(chord || "").trim();
    if (!clean || seen.has(clean)) {
      return;
    }
    seen.add(clean);
    items.push({
      chord: clean,
      score: Number(score),
      source
    });
  };

  addItem(bar.chord || "N.C.", bar.confidence, "Current");
  (Array.isArray(bar.alternatives) ? bar.alternatives : []).forEach((item) => {
    addItem(item.chord, item.score, "Alternative");
  });
  return items;
}

function renderDetailLyricsReference(index) {
  elements.detailLyricsReference.innerHTML = "";
  const lines = lyricReferenceLinesForBar(index);
  if (!lines.length) {
    return;
  }
  const title = document.createElement("strong");
  title.textContent = "Reference";
  elements.detailLyricsReference.appendChild(title);
  lines.slice(0, 4).forEach((line) => {
    const row = document.createElement("span");
    const start = formatSeconds(Number(line.start) || 0);
    const confidence = Number.isFinite(Number(line.confidence)) ? ` ${formatConfidence(line.confidence)}` : "";
    row.textContent = `${start}s${confidence}: ${String(line.text || "").trim()}`;
    elements.detailLyricsReference.appendChild(row);
  });
}

function barEndTime(index) {
  if (!hasChart() || index < 0) {
    return 0;
  }
  return Number(state.chart.bars[index + 1]?.start ?? state.chart.duration ?? elements.audioPlayer.duration ?? 0);
}

function beatsPerBar(bar) {
  return Number(String(bar?.time_signature || state.chart?.time_signature || "4/4").split("/")[0]) || 4;
}

function beatTimes() {
  if (Array.isArray(state.chart?.beat_times) && state.chart.beat_times.length) {
    return state.chart.beat_times.map(Number).filter(Number.isFinite);
  }
  if (!hasChart()) {
    return [];
  }
  const times = [];
  state.chart.bars.forEach((bar, barIndex) => {
    const beats = bar.pickup_beats || beatsPerBar(bar);
    const start = Number(bar.start) || 0;
    const end = barEndTime(barIndex) || start + secondsPerBar();
    const step = Math.max(0.01, (end - start) / beats);
    for (let beat = 0; beat < beats; beat += 1) {
      times.push(start + (beat * step));
    }
  });
  return times;
}

function beatNumberAtTime(barIndex, time) {
  if (!hasChart() || barIndex < 0 || barIndex >= state.chart.bars.length) {
    return 0;
  }
  const start = Number(state.chart.bars[barIndex].start) || 0;
  const end = barEndTime(barIndex);
  const beats = beatTimes().filter((beat) => beat >= start - 0.04 && beat < end - 0.04);
  let active = 0;
  for (let index = 0; index < beats.length; index += 1) {
    if (time >= beats[index] - 0.04) active = index;
    else break;
  }
  return Math.min(beatsPerBar(state.chart.bars[barIndex]), active + 1);
}

function evidenceRangeText(bar, index) {
  const range = Array.isArray(bar?.evidence?.range) ? bar.evidence.range : [bar?.start || 0, barEndTime(index)];
  return `${formatSeconds(Number(range[0]) || 0)}s to ${formatSeconds(Number(range[1]) || 0)}s`;
}

function detectedNotesText(bar, limit = 6) {
  const notes = Array.isArray(bar?.evidence?.detected_notes) ? bar.evidence.detected_notes.slice(0, limit) : [];
  if (!notes.length) {
    return "No detected notes saved for this bar.";
  }
  return notes.map((item) => `${item.note} ${formatConfidence(item.strength)}`).join(", ");
}

function createChordDebug(bar) {
  const debug = bar?.debug || {};
  const panel = document.createElement("div");
  panel.className = "chord-debug";

  const title = document.createElement("strong");
  title.textContent = "Debug";
  panel.appendChild(title);

  const addLine = (label, value) => {
    const row = document.createElement("span");
    row.textContent = `${label}: ${value || "-"}`;
    panel.appendChild(row);
  };

  const alternatives = Array.isArray(debug.alternatives) ? debug.alternatives : Array.isArray(bar?.alternatives) ? bar.alternatives : [];
  const reasons = Array.isArray(debug.selection_reasons) ? debug.selection_reasons : [];
  const bass = debug.bass_reference;

  addLine("Chord tones source", debug.chord_tones_source || bar?.evidence?.source);
  addLine("Bass reference source", debug.bass_reference_source);
  addLine("Detected notes", detectedNotesText(bar, 7));
  addLine("Chosen chord", `${debug.chosen_chord || bar?.chord || "-"} (${formatConfidence(debug.chosen_score ?? bar?.chord_confidence ?? bar?.confidence)})`);
  addLine("Alternatives", alternatives.slice(0, 5).map((item) => `${item.chord} ${formatConfidence(item.score)}`).join(", "));
  addLine("Bass evidence", bass ? `${bass.note} ${formatConfidence(bass.confidence)}` : "none");
  addLine("Why selected", reasons.length ? reasons.join("; ") : bar?.evidence?.summary);
  return panel;
}

function normalizePitchName(note) {
  const clean = String(note || "").trim();
  if (!clean) {
    return "";
  }
  const root = clean.length >= 2 && ["#", "b"].includes(clean[1]) ? clean.slice(0, 2) : clean.slice(0, 1);
  const normalized = root[0]?.toUpperCase() + (root[1] || "");
  return ENHARMONIC_TO_PITCH[normalized.toUpperCase()] || normalized;
}

function pitchIndex(note) {
  const normalized = normalizePitchName(note);
  return PITCH_NAMES.indexOf(normalized);
}

function chordToneSet(symbol) {
  const text = String(symbol || "").trim();
  const slash = /\/([A-G][#b]?)$/.exec(text);
  const clean = slash ? text.slice(0, slash.index) : text;
  if (!clean || clean.toUpperCase() === "N.C.") {
    return new Set();
  }
  const root = normalizePitchName(clean);
  const rootIndex = pitchIndex(root);
  if (rootIndex < 0) {
    return new Set();
  }
  const qualityText = clean.slice(root.length).replace("♯", "#").replace("♭", "b").replace(/^M(7|9|13)(?=[#b(]|$)/, "maj$1")
    .replace(/\(([#b+]\d+)\)$/, '$1').replace('+5', '#5').replace(/^([79])\(sus4\)$/i, "$1sus4")
    .replace(/^m(?:\(maj([79])\)|M([79]))$/, (_match, long, short) => `mmaj${long || short}`)
    .replace('°', 'dim').replace('Δ', 'maj').replace(/^-/, 'm').toLowerCase();
  let intervals = [0, 4, 7];
  if (qualityText.includes("m7b5")) {
    intervals = [0, 3, 6, 10];
  } else if (qualityText.startsWith("dim")) {
    intervals = [0, 3, 6];
  } else if (qualityText.startsWith("aug")) {
    intervals = [0, 4, 8];
  } else if (qualityText.startsWith("sus2")) {
    intervals = [0, 2, 7];
  } else if (qualityText.includes("sus4") || qualityText.startsWith("sus")) {
    intervals = [0, 5, 7];
  } else if (qualityText.startsWith("m") && !qualityText.startsWith("maj")) {
    intervals = [0, 3, 7];
  }
  const extended = /^(maj(?:9|13)|m(?:9|11)|9|11|13|9sus4)$/.test(qualityText);
  if (extended) {
    if (qualityText === "11") intervals = [0, 7];
    intervals.push(qualityText.startsWith("maj") ? 11 : 10, 2);
    if (qualityText.endsWith("11")) intervals.push(5);
    if (qualityText.endsWith("13")) intervals.push(9);
  } else if (qualityText.includes("maj7")) {
    intervals.push(11);
  } else if (qualityText.includes("7")) {
    intervals.push(10);
  } else if (qualityText.includes("6")) {
    intervals.push(9);
  }
  if (qualityText.endsWith("add9")) intervals.push(2);
  if (qualityText === "7#9") intervals.push(3);
  const formulas = {
    '6/9':[0,4,7,9,2], '69':[0,4,7,9,2], '6add9':[0,4,7,9,2],
    'm6/9':[0,3,7,9,2], 'm69':[0,3,7,9,2], 'm6add9':[0,3,7,9,2],
    'dim7':[0,3,6,9], 'o7':[0,3,6,9], 'mmaj7':[0,3,7,11],
    '7b5':[0,4,6,10], '7#5':[0,4,8,10], '7b9':[0,4,7,10,1],
    '7#11':[0,4,7,10,6], '7b13':[0,4,7,10,8], 'maj7#11':[0,4,7,11,6],
    '9#11':[0,4,7,10,2,6], '13#11':[0,4,7,10,6,9],
    '13b9':[0,4,7,10,1,9], 'mmaj9':[0,3,7,11,2],
    '7b9#11':[0,4,7,10,1,6], '7#9#11':[0,4,7,10,3,6]
  };
  if (formulas[qualityText]) intervals = formulas[qualityText];
  const tones = new Set(intervals.map((interval) => PITCH_NAMES[(rootIndex + interval) % 12]));
  const bass = slash?.[1];
  if (bass && pitchIndex(bass) >= 0) tones.add(PITCH_NAMES[pitchIndex(bass)]);
  return tones;
}

function detectedStrengthMap(bar) {
  const strengths = new Map();
  (Array.isArray(bar?.evidence?.detected_notes) ? bar.evidence.detected_notes : []).forEach((item) => {
    const note = normalizePitchName(item.note);
    if (!note) {
      return;
    }
    strengths.set(note, Math.max(strengths.get(note) || 0, Number(item.strength) || 0));
  });
  return strengths;
}

function pianoLevelMap(evidence, strengths, exactPitches) {
  const levels = new Map();
  const maximum = Math.max(0, ...strengths.values());
  for (const [note, strength] of strengths) {
    // Exact pitches store power; folded chroma strengths store FFT magnitudes.
    if (strength > 0 && maximum > 0) levels.set(note, Math.max(-80, (exactPitches ? 10 : 20) * Math.log10(strength / maximum)));
  }
  const measured = new Map();
  // Exact pitches already combine sources; a single-source spectrum would skew their levels.
  for (const peak of exactPitches ? [] : (evidence?.tail_reduced_spectrum || evidence?.spectrum)?.peaks || []) {
    if (!Number.isInteger(peak.midi) || !Number.isFinite(peak.level_db)) continue;
    const note = exactPitches ? peak.midi : PITCH_NAMES[peak.midi % 12];
    if (strengths.has(note)) measured.set(note, Math.max(measured.get(note) ?? -80, Math.min(0, peak.level_db)));
  }
  for (const [note, db] of measured) levels.set(note, db);
  return levels;
}

function createPianoEvidence(bar, chordSymbol = bar?.chord, options = {}) {
  const focusEvidence = options.focusEvidence ?? Boolean(options.stabilized);
  const piano = document.createElement("div");
  piano.className = "piano-evidence";
  if (focusEvidence) piano.classList.toggle("piano-focused", true);
  if (options.stabilized) piano.classList.toggle("piano-detail", true);
  piano.title = "Detected notes glow by relative dB; outlined keys are notes in the selected chord.";

  const strengths = options.exactPitches
    ? new Map()
    : detectedStrengthMap(bar);
  if (options.exactPitches) {
    for (const pitch of bar?.evidence?.detected_pitches || []) {
      strengths.set(pitch.midi, Math.max(strengths.get(pitch.midi) || 0, Number(pitch.strength) || 0));
    }
  }
  const levels = pianoLevelMap(bar?.evidence, strengths, options.exactPitches);
  const levelFor = (note, midi) => levels.get(options.exactPitches ? midi : note) ?? 0;
  const chordTones = chordToneSet(chordSymbol);
  const supported = (note, midi, strength) => strength > 0 && chordTones.has(note) && levelFor(note, midi) >= -24;
  const intensityFor = (note, midi, strength) => {
    const intensity = strength > 0 ? Math.max(.1, Math.min(1, 1 + levelFor(note, midi) / 40)) : 0;
    if (!focusEvidence || supported(note, midi, strength)) return intensity;
    return intensity * (levelFor(note, midi) < -24 ? .05 : .15);
  };
  const playableKey = (note, octave, midi) => {
    const key = document.createElement("button");
    key.type = "button";
    key.setAttribute("aria-label", `Play ${note}${octave}`);
    key.addEventListener("click", () => playPianoNote(midi, levelFor(note, midi)));
    key.addEventListener("keydown", (event) => {
      if (event.code === "Space" || event.key === "Enter") event.stopPropagation();
    });
    return key;
  };
  const keys = document.createElement("div");
  keys.className = "piano-keys";

  const octaves = options.pitchClassesOnly ? [3] : options.octaves || (options.exactPitches ? [0, 1, 2, 3, 4, 5, 6, 7, 8] : options.stabilized ? [1, 2, 3, 4] : PIANO_OCTAVES);
  const whites = octaves.flatMap((octave) => WHITE_KEYS.map((note) => ({ note, octave, midi: (octave + 1) * 12 + pitchIndex(note) })))
    .filter((item) => !options.exactPitches || item.midi >= 21 && item.midi <= 108);
  whites.forEach(({ note, octave, midi }) => {
      const key = playableKey(note, octave, midi);
      const strength = strengths.get(options.exactPitches ? midi : note) || 0;
      key.className = "piano-key white-key";
      key.dataset.midi = String(midi); key.style.width = `${100 / whites.length}%`;
      key.style.setProperty("--note-strength", String(intensityFor(note, midi, strength)));
      key.classList.toggle("detected", strength > 0);
      key.classList.toggle("chord-tone", chordTones.has(note) && (!options.exactPitches || strength > 0));
      key.classList.toggle("support-highlight", supported(note, midi, strength));
      key.classList.toggle("bass-tone", options.exactPitches ? options.bassMidi === midi : normalizePitchName(options.bassNote) === note);
      key.title = `${note}${options.pitchClassesOnly ? "" : octave}: ${strength > 0 ? `${levelFor(note, midi).toFixed(1)} dB relative (estimated)` : "not detected"}${chordTones.has(note) ? ", chord tone" : ""}`;
      const label = document.createElement("span");
      label.textContent = options.pitchClassesOnly ? note : `${note}${octave}`;
      key.appendChild(label);
      keys.appendChild(key);
  });

  octaves.forEach((octave, octaveIndex) => {
    BLACK_KEYS.forEach((item) => {
      const midi = (octave + 1) * 12 + pitchIndex(item.note);
      if (options.exactPitches && (midi < 21 || midi > 108)) return;
      const key = playableKey(item.note, octave, midi);
      const strength = strengths.get(options.exactPitches ? midi : item.note) || 0;
      const whiteIndex = options.exactPitches ? whites.findIndex((white) => white.octave === octave && white.note === WHITE_KEYS[item.afterWhite]) + 1 : (octaveIndex * WHITE_KEYS.length) + item.afterWhite + 1;
      key.className = "piano-key black-key";
      key.dataset.midi = String(midi); key.style.width = `${65 / whites.length}%`;
      key.style.left = `${(whiteIndex / whites.length) * 100}%`;
      key.style.setProperty("--note-strength", String(intensityFor(item.note, midi, strength)));
      key.classList.toggle("detected", strength > 0);
      key.classList.toggle("chord-tone", chordTones.has(item.note) && (!options.exactPitches || strength > 0));
      key.classList.toggle("support-highlight", supported(item.note, midi, strength));
      key.classList.toggle("bass-tone", options.exactPitches ? options.bassMidi === midi : normalizePitchName(options.bassNote) === item.note);
      key.title = `${item.note}${options.pitchClassesOnly ? "" : octave}: ${strength > 0 ? `${levelFor(item.note, midi).toFixed(1)} dB relative (estimated)` : "not detected"}${chordTones.has(item.note) ? ", chord tone" : ""}`;
      const label = document.createElement("span");
      label.textContent = options.exactPitches ? `${item.note}${octave}` : item.note;
      key.appendChild(label);
      keys.appendChild(key);
    });
  });

  const legend = document.createElement("div");
  const playbackOctave = octaves.includes(3) ? 3 : octaves[0];
  const detectedMidis = options.exactPitches
    ? [...strengths].filter(([midi, strength]) => Number.isInteger(midi) && midi >= 21 && midi <= 108 && strength > 0).map(([midi]) => midi)
    : [...strengths].filter(([note, strength]) => pitchIndex(note) >= 0 && strength > 0).map(([note]) => (playbackOctave + 1) * 12 + pitchIndex(note));
  const playDetected = document.createElement("button");
  playDetected.type = "button";
  playDetected.className = "piano-play-detected";
  playDetected.textContent = options.exactPitches ? "Play detected notes" : "Play pitch classes";
  playDetected.title = options.exactPitches ? "Hear all highlighted detected pitches together" : "Hear detected pitch classes together in the displayed octave";
  playDetected.disabled = !detectedMidis.length;
  playDetected.addEventListener("click", () => playPianoNotes(detectedMidis.sort((a, b) => a - b),
    Object.fromEntries(detectedMidis.map((midi) => [midi, levelFor(PITCH_NAMES[midi % 12], midi)]))));
  playDetected.addEventListener("keydown", (event) => {
    if (event.code === "Space" || event.key === "Enter") event.stopPropagation();
  });
  piano.appendChild(playDetected);
  legend.className = "piano-legend";
  legend.textContent = options.exactPitches ? "Glow and playback = relative dB, outline = detected chord tones, dot = detected bass pitch · scroll for all 88 keys" : `Glow and playback = relative dB, outline = chord tones${options.pitchClassesOnly ? ", dot = bass reference · pitch classes, not octaves" : ""}`;
  legend.textContent += " · click a key to hear its note";
  if (options.stabilized) {
    legend.textContent = options.exactPitches ? "Estimated pitches · chord average · scroll C1–B4"
      : "Pitch classes · chord average · reanalyze for measured octaves";
    if (options.exactPitches && options.bassOctaveMissing) legend.textContent += ` · bass ${options.bassNote || "reference"}: reanalyze for octave`;
  }
  if (focusEvidence) {
    if (!options.stabilized) legend.textContent = "Estimated pitches · bright = detected chord support · other evidence muted";
    piano.title = "Shared keyboard highlighting: detected chord tones at or above -24 dB are emphasized; other evidence is muted visually. Hover and playback preserve estimated dB values. Exact-pitch views highlight measured octaves only.";
  }
  if (bar?.evidence?.overtone_weighted) legend.textContent += " · overtone weighted";
  if (options.exactPitches || options.stabilized) {
    if (options.exactPitches) piano.classList.toggle("piano-exact", true);
    const viewport = document.createElement("div"); viewport.className = "piano-viewport";
    viewport.append(keys); piano.append(viewport, legend);
  } else piano.append(keys, legend);
  return piano;
}

function chordEvidenceText(bar, index) {
  if (!bar) {
    return "";
  }
  const source = bar.evidence?.source || "analysis audio";
  const notes = detectedNotesText(bar, 5);
  const chordScore = formatConfidence(bar.chord_confidence ?? bar.confidence);
  const pitchScore = formatConfidence(bar.pitch_confidence ?? bar.evidence?.pitch_confidence);
  return `Based on ${source}, ${evidenceRangeText(bar, index)}. Detected notes: ${notes}. Chord score: ${chordScore}. Pitch confidence: ${pitchScore}.`;
}

function hideChordSuggestion() {
  elements.chordSuggestion.classList.add("hidden");
  elements.chordSuggestion.innerHTML = "";
}

function showChordSuggestion(index, anchor) {
  const bar = hasChart() ? state.chart.bars[index] : null;
  const target = selectedChordTarget(index) || bar;
  const items = suggestionItemsForBar(target);
  elements.chordSuggestion.innerHTML = "";

  if (!bar || !items.length) {
    hideChordSuggestion();
    return;
  }

  const header = document.createElement("div");
  header.className = "suggestion-head";
  header.textContent = `Bar ${bar.number || index + 1}`;
  elements.chordSuggestion.appendChild(header);

  const evidence = document.createElement("div");
  evidence.className = "suggestion-evidence";
  evidence.textContent = chordEvidenceText(target, index);
  elements.chordSuggestion.appendChild(evidence);
  elements.chordSuggestion.appendChild(createPianoEvidence(target));

  items.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = item.chord === target.chord ? "suggestion-option current" : "suggestion-option";
    const score = Number.isFinite(item.score) ? formatConfidence(item.score) : "-";
    const chord = document.createElement("span");
    chord.textContent = displayChordSymbol(item.chord, false);
    const confidence = document.createElement("em");
    confidence.textContent = score;
    button.append(chord, confidence);
    button.title = `${item.source}: ${item.chord} (${score})`;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      target.chord = item.chord;
      if (Number.isFinite(item.score)) {
        target.confidence = Math.max(0, Math.min(0.95, item.score));
      }
      if (target !== bar) syncBarChordSummary(bar);
      hideChordSuggestion();
      renderBars();
    });
    elements.chordSuggestion.appendChild(button);
  });

  const anchorRect = anchor.getBoundingClientRect();
  const popoverWidth = 220;
  const left = Math.max(8, Math.min(window.innerWidth - popoverWidth - 8, anchorRect.left));
  const top = Math.max(8, Math.min(window.innerHeight - 170, anchorRect.bottom + 6));
  elements.chordSuggestion.style.left = `${left}px`;
  elements.chordSuggestion.style.top = `${top}px`;
  elements.chordSuggestion.classList.remove("hidden");
}

function selectBar(index, seek, eventIndex = 0) {
  if (!hasChart() || index < 0 || index >= state.chart.bars.length) {
    return;
  }
  state.selectedIndex = index;
  const events = chordEventsForBar(index);
  state.selectedChordEventIndex = Number.isInteger(eventIndex) && eventIndex >= 0 && eventIndex < events.length ? eventIndex : 0;
  const event = events[state.selectedChordEventIndex];
  if (seek && Number.isFinite(event?.start ?? state.chart.bars[index].start)) {
    elements.audioPlayer.currentTime = Math.max(0, Number(event?.start ?? state.chart.bars[index].start) / (Number(state.audioPreview?.tempoRate) || 1));
    syncStemTimes({ isSeek: true });
  }
  updateRowState({ scroll: true });
}

function updateSelectedBarFromDetail(field, value) {
  const bar = getSelectedBar();
  if (!bar) {
    return;
  }

  if (field === "section") {
    bar.section = value;
  } else if (field === "chord") {
    applySelectedChordCorrection("chord", value);
  } else if (field === "start") {
    bar.start = Number(value) || 0;
    state.chart.bars.sort((left, right) => (Number(left.start) || 0) - (Number(right.start) || 0));
    renumberBars();
    state.selectedIndex = state.chart.bars.indexOf(bar);
  } else if (field === "repeat_start") {
    bar.repeat_start = Boolean(value);
  } else if (field === "repeat_end") {
    bar.repeat_end = Number(value) || 0;
  } else if (field === "lyrics") {
    bar.lyrics = value;
    bar.lyrics_source = "manual";
  } else if (field === "notes") {
    applySelectedChordCorrection("notes", value);
  }

  renderBars();
}

function applySelectedChordCorrection(field, value) {
  const bar = getSelectedBar();
  if (!bar) return;
  const target = selectedChordTarget();
  if(field==='chord' && typeof captureDetectedChords==='function') captureDetectedChords(bar,barEndTime(state.selectedIndex),Number(state.chart.key_offset) || 0);
  if (field === "chord") {
    target.chord = value;target.manual=true;target.evidence_stale=true;
    delete target.confidence;delete target.chord_confidence;
    delete bar.confidence;delete bar.chord_confidence;
  }
  else if (field === "notes" && target !== bar) target.notes = value;
  else if (field === "notes") bar.notes = value;
  if (target !== bar && field === "chord") syncBarChordSummary(bar);
}
