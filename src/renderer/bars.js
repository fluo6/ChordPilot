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

function updateActiveBarFromPlayback() {
  const nextIndex = findActiveBarIndex(elements.audioPlayer.currentTime || 0);
  if (nextIndex === state.activeIndex) {
    return;
  }

  state.activeIndex = nextIndex;
  updateRowState({ scroll: true });
}

function renderBars() {
  elements.barsBody.innerHTML = "";
  if (elements.chartPreview) {
    elements.chartPreview.innerHTML = "";
  }
  renderLyricsReferencePanel();
  state.barRows = [];

  if (!hasChart()) {
    elements.activeBarText.textContent = "Bar -";
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
      bar.chord = value;
      renderTimeline();
    });
    if (Array.isArray(bar.alternatives) && bar.alternatives.length) {
      chordInput.title = `Alternatives: ${bar.alternatives.map((item) => `${item.chord} ${Math.round(item.score * 100)}%`).join(", ")}`;
    }
    chordCell.appendChild(chordInput);

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

    row.append(barCell, sectionCell, chordCell, confidenceCell, repeatCell, startCell, lyricsCell, notesCell);
    elements.barsBody.appendChild(row);
    state.barRows.push(row);
  });

  renderTimeline();
  renderChartPreview();
  updateRowState();
}

function chartRows(measuresPerRow = 4) {
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

function barChordText(bar) {
  const choice = highestConfidenceChordChoice(bar);
  const chord = String(choice?.chord || bar?.chord || "").trim();
  return chord || "N.C.";
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
  const clean = barChordText({ chord: symbol });
  if (clean.toUpperCase() === "N.C.") {
    return { root: "N.C.", quality: "", extension: "", bass: "" };
  }

  const slashIndex = clean.indexOf("/");
  const main = slashIndex >= 0 ? clean.slice(0, slashIndex) : clean;
  const bass = slashIndex >= 0 ? clean.slice(slashIndex + 1) : "";
  const rootMatch = main.match(/^([A-G](?:#|b)?)(.*)$/);
  if (!rootMatch) {
    return { root: clean, quality: "", extension: "", bass: "" };
  }

  const root = rootMatch[1];
  let rest = rootMatch[2] || "";
  let quality = "";

  if (/^(maj|M)/.test(rest)) {
    rest = rest.replace(/^(maj|M)/, "^");
  } else if (/^min/i.test(rest)) {
    quality = "-";
    rest = rest.replace(/^min/i, "");
  } else if (/^m(?!aj)/.test(rest)) {
    quality = "-";
    rest = rest.slice(1);
  } else if (/^dim/i.test(rest)) {
    quality = "o";
    rest = rest.replace(/^dim/i, "");
  } else if (/^aug/i.test(rest)) {
    quality = "+";
    rest = rest.replace(/^aug/i, "");
  }

  rest = rest.replace(/Δ/g, "^").replace(/ø/g, "h");
  return { root, quality, extension: rest, bass };
}

function appendIrealChord(parent, symbol) {
  const parts = irealChordParts(symbol);
  const root = document.createElement("span");
  root.className = "ireal-root";
  root.textContent = parts.root;
  parent.appendChild(root);

  if (parts.quality) {
    const quality = document.createElement("span");
    quality.className = "ireal-quality";
    quality.textContent = parts.quality;
    parent.appendChild(quality);
  }

  if (parts.extension) {
    const extension = document.createElement("sup");
    extension.textContent = parts.extension;
    parent.appendChild(extension);
  }

  if (parts.bass) {
    const bass = document.createElement("span");
    bass.className = "ireal-bass";
    bass.textContent = `/${parts.bass}`;
    parent.appendChild(bass);
  }
}

function renderMeasureGridPreview(container) {
  const grid = document.createElement("div");
  grid.className = "measure-grid-chart";
  chartRows(4).forEach((row) => {
    const rowEl = document.createElement("div");
    rowEl.className = "measure-grid-row";
    row.forEach(({ bar, index, section }) => {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "measure-cell";
      cell.classList.toggle("selected", index === state.selectedIndex);
      cell.classList.toggle("active", index === state.activeIndex);
      cell.title = `Bar ${bar.number || index + 1} - ${formatSeconds(bar.start)}s`;
      cell.addEventListener("click", () => selectBar(index, true));

      const number = document.createElement("span");
      number.className = "measure-number";
      number.textContent = bar.number || index + 1;
      const chord = document.createElement("strong");
      chord.textContent = barChordText(bar);
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
  header.textContent = `${state.chart?.title || "Untitled"} - ${chartKeyText(state.chart) || "?"} - ${state.chart?.tempo || "?"} BPM`;
  chart.appendChild(header);

  chartRows(4).forEach((row) => {
    const rowEl = document.createElement("div");
    rowEl.className = "ireal-row";
    row.forEach(({ bar, index }) => {
      const measure = document.createElement("button");
      measure.type = "button";
      measure.className = "ireal-measure";
      measure.classList.toggle("selected", index === state.selectedIndex);
      measure.classList.toggle("active", index === state.activeIndex);
      measure.title = `Bar ${bar.number || index + 1} - ${formatSeconds(bar.start)}s`;
      measure.addEventListener("click", () => selectBar(index, true));

      const leftBar = document.createElement("span");
      leftBar.className = "ireal-barline left";
      leftBar.classList.toggle("repeat", Boolean(bar.repeat_start));
      leftBar.textContent = bar.repeat_start ? "|:" : "|";
      const chord = document.createElement("strong");
      appendIrealChord(chord, barChordText(bar));
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
    `{title: ${state.chart?.title || "Untitled"}}`,
    `{key: ${chartKeyText(state.chart) || state.chart?.key || "C"}}`,
    `{tempo: ${state.chart?.tempo || ""}}`,
    ""
  ];
  chartRows(4).forEach((row) => {
    const section = row.find((item) => item.section)?.section;
    if (section) {
      lines.push(`[${section}]`);
    }
    lines.push(row.map(({ bar }) => `| [${barChordText(bar)}]`).join(" ") + " |");
    const lyricLine = row.map(({ bar }) => barLyricText(bar)).filter(Boolean).join(" / ");
    if (lyricLine) {
      lines.push(lyricLine);
    }
    lines.push("");
  });
  text.textContent = lines.join("\n").trim();
  container.appendChild(text);
}

function renderChartPreview() {
  if (!elements.chartPreview || !elements.barsTable) {
    return;
  }
  renderLyricsReferencePanel();

  const renderer = state.chartRenderer || "table";
  const showTable = renderer === "table";
  elements.barsTable.classList.toggle("hidden", !showTable);
  elements.chartPreview.classList.toggle("hidden", showTable);
  elements.chartPreview.innerHTML = "";

  if (showTable) {
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
  } else if (renderer === "chordpro") {
    renderChordProPreview(elements.chartPreview);
  } else {
    renderMeasureGridPreview(elements.chartPreview);
  }
}

function updateDetailPane() {
  const bar = getSelectedBar();
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
    elements.detailBarLabel.textContent = "No bar";
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

  elements.detailBarLabel.textContent = `Bar ${bar.number || state.selectedIndex + 1}`;
  if (document.activeElement !== elements.detailSectionInput) {
    elements.detailSectionInput.value = bar.section || "";
  }
  if (document.activeElement !== elements.detailChordInput) {
    elements.detailChordInput.value = bar.chord || "";
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
    elements.detailNotesInput.value = bar.notes || "";
  }

  renderDetailLyricsReference(state.selectedIndex);

  elements.detailAlternatives.innerHTML = "";
  const confidence = document.createElement("span");
  confidence.className = confidenceClass(bar.confidence);
  confidence.textContent = `Chord ${formatConfidence(bar.chord_confidence ?? bar.confidence)} / pitch ${formatConfidence(bar.pitch_confidence ?? bar.evidence?.pitch_confidence)}`;
  elements.detailAlternatives.appendChild(confidence);

  const alternatives = Array.isArray(bar.alternatives) ? bar.alternatives.slice(0, 4) : [];
  alternatives.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `${item.chord} ${formatConfidence(item.score)}`;
    button.addEventListener("click", () => {
      bar.chord = item.chord;
      renderBars();
    });
    elements.detailAlternatives.appendChild(button);
  });

  const evidence = document.createElement("div");
  evidence.className = "detail-evidence";

  const evidenceTitle = document.createElement("strong");
  evidenceTitle.textContent = "Why";
  const evidenceRange = document.createElement("span");
  evidenceRange.textContent = chordEvidenceText(bar, state.selectedIndex);
  evidence.append(evidenceTitle, evidenceRange);
  evidence.appendChild(createPianoEvidence(bar));

  const notes = Array.isArray(bar.evidence?.detected_notes) ? bar.evidence.detected_notes.slice(0, 6) : [];
  if (notes.length) {
    const noteStrip = document.createElement("div");
    noteStrip.className = "note-strip";
    notes.forEach((item) => {
      const note = document.createElement("span");
      note.textContent = `${item.note} ${formatConfidence(item.strength)}`;
      noteStrip.appendChild(note);
    });
    evidence.appendChild(noteStrip);
  }
  evidence.appendChild(createChordDebug(bar));
  elements.detailAlternatives.appendChild(evidence);
  renderChartReasonPane(bar);
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

  elements.chartReasonLabel.textContent = `Bar ${bar.number || state.selectedIndex + 1}`;
  const chord = document.createElement("strong");
  chord.className = "chart-reason-chord";
  chord.textContent = barChordText(bar);
  const confidence = document.createElement("span");
  confidence.className = confidenceClass(bar.chord_confidence ?? bar.confidence);
  confidence.textContent = `Chord ${formatConfidence(bar.chord_confidence ?? bar.confidence)} / pitch ${formatConfidence(bar.pitch_confidence ?? bar.evidence?.pitch_confidence)}`;
  const why = document.createElement("p");
  why.textContent = chordEvidenceText(bar, state.selectedIndex);
  elements.chartReasonPane.append(chord, confidence, why, createPianoEvidence(bar));

  const alternatives = Array.isArray(bar.alternatives) ? bar.alternatives.slice(0, 6) : [];
  if (alternatives.length) {
    const list = document.createElement("div");
    list.className = "chart-reason-options";
    alternatives.forEach((item) => {
      const option = document.createElement("button");
      option.type = "button";
      option.textContent = `${item.chord} ${formatConfidence(item.score)}`;
      option.addEventListener("click", () => {
        bar.chord = item.chord;
        renderBars();
      });
      list.appendChild(option);
    });
    elements.chartReasonPane.appendChild(list);
  }
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

function beatsPerBar() {
  return Number(String(state.chart?.time_signature || "4/4").split("/")[0]) || 4;
}

function beatTimes() {
  if (Array.isArray(state.chart?.beat_times) && state.chart.beat_times.length) {
    return state.chart.beat_times.map(Number).filter(Number.isFinite);
  }
  if (!hasChart()) {
    return [];
  }
  const beats = beatsPerBar();
  const times = [];
  state.chart.bars.forEach((bar, barIndex) => {
    const start = Number(bar.start) || 0;
    const end = barEndTime(barIndex) || start + secondsPerBar();
    const step = Math.max(0.01, (end - start) / beats);
    for (let beat = 0; beat < beats; beat += 1) {
      times.push(start + (beat * step));
    }
  });
  return times;
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
  const clean = String(symbol || "").trim().split("/")[0];
  if (!clean || clean.toUpperCase() === "N.C.") {
    return new Set();
  }
  const root = normalizePitchName(clean);
  const rootIndex = pitchIndex(root);
  if (rootIndex < 0) {
    return new Set();
  }
  const qualityText = clean.slice(root.length).toLowerCase();
  let intervals = [0, 4, 7];
  if (qualityText.includes("m7b5")) {
    intervals = [0, 3, 6, 10];
  } else if (qualityText.startsWith("dim")) {
    intervals = [0, 3, 6];
  } else if (qualityText.startsWith("aug")) {
    intervals = [0, 4, 8];
  } else if (qualityText.startsWith("sus2")) {
    intervals = [0, 2, 7];
  } else if (qualityText.startsWith("sus")) {
    intervals = [0, 5, 7];
  } else if (qualityText.startsWith("m") && !qualityText.startsWith("maj")) {
    intervals = [0, 3, 7];
  }
  if (qualityText.includes("maj7")) {
    intervals.push(11);
  } else if (qualityText.includes("7")) {
    intervals.push(10);
  } else if (qualityText.includes("6")) {
    intervals.push(9);
  }
  return new Set(intervals.map((interval) => PITCH_NAMES[(rootIndex + interval) % 12]));
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

function createPianoEvidence(bar, chordSymbol = bar?.chord) {
  const piano = document.createElement("div");
  piano.className = "piano-evidence";
  piano.title = "Detected notes glow by strength; outlined keys are notes in the selected chord.";

  const strengths = detectedStrengthMap(bar);
  const chordTones = chordToneSet(chordSymbol);
  const keys = document.createElement("div");
  keys.className = "piano-keys";

  PIANO_OCTAVES.forEach((octave) => {
    WHITE_KEYS.forEach((note) => {
      const key = document.createElement("div");
      const strength = strengths.get(note) || 0;
      key.className = "piano-key white-key";
      key.style.setProperty("--note-strength", String(Math.max(0, Math.min(1, strength * 3))));
      key.classList.toggle("detected", strength > 0);
      key.classList.toggle("chord-tone", chordTones.has(note));
      key.title = `${note}${octave}: detected ${formatConfidence(strength)}${chordTones.has(note) ? ", chord tone" : ""}`;
      const label = document.createElement("span");
      label.textContent = `${note}${octave}`;
      key.appendChild(label);
      keys.appendChild(key);
    });
  });

  PIANO_OCTAVES.forEach((octave, octaveIndex) => {
    BLACK_KEYS.forEach((item) => {
      const key = document.createElement("div");
      const strength = strengths.get(item.note) || 0;
      const whiteIndex = (octaveIndex * WHITE_KEYS.length) + item.afterWhite + 1;
      key.className = "piano-key black-key";
      key.style.left = `${(whiteIndex / (WHITE_KEYS.length * PIANO_OCTAVES.length)) * 100}%`;
      key.style.setProperty("--note-strength", String(Math.max(0, Math.min(1, strength * 3))));
      key.classList.toggle("detected", strength > 0);
      key.classList.toggle("chord-tone", chordTones.has(item.note));
      key.title = `${item.note}${octave}: detected ${formatConfidence(strength)}${chordTones.has(item.note) ? ", chord tone" : ""}`;
      const label = document.createElement("span");
      label.textContent = item.note;
      key.appendChild(label);
      keys.appendChild(key);
    });
  });

  const legend = document.createElement("div");
  legend.className = "piano-legend";
  legend.textContent = "Glow = detected strength, outline = chord tones";
  piano.append(keys, legend);
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
  const items = suggestionItemsForBar(bar);
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
  evidence.textContent = chordEvidenceText(bar, index);
  elements.chordSuggestion.appendChild(evidence);
  elements.chordSuggestion.appendChild(createPianoEvidence(bar));

  items.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = item.chord === bar.chord ? "suggestion-option current" : "suggestion-option";
    const score = Number.isFinite(item.score) ? formatConfidence(item.score) : "-";
    const chord = document.createElement("span");
    chord.textContent = item.chord;
    const confidence = document.createElement("em");
    confidence.textContent = score;
    button.append(chord, confidence);
    button.title = `${item.source}: ${item.chord} (${score})`;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      bar.chord = item.chord;
      if (Number.isFinite(item.score)) {
        bar.confidence = Math.max(0, Math.min(0.95, item.score));
      }
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

function selectBar(index, seek) {
  if (!hasChart() || index < 0 || index >= state.chart.bars.length) {
    return;
  }
  state.selectedIndex = index;
  if (seek && Number.isFinite(state.chart.bars[index].start)) {
    elements.audioPlayer.currentTime = Math.max(0, state.chart.bars[index].start);
    syncStemTimes();
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
    bar.chord = value;
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
    bar.notes = value;
  }

  renderBars();
}
