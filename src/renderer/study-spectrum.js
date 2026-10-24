function fitSpectrumText(container) {
  if (typeof ResizeObserver === 'undefined') return;
  const update = () => {
    const svg = container.querySelector('svg');
    if (!svg) return;
    const viewBoxWidth = Number(svg.getAttribute('viewBox').split(/\s+/)[2]);
    const width = svg.getBoundingClientRect().width;
    // SVG font sizes scale with the viewBox; cap them at their CSS pixel size.
    svg.style.setProperty('--spectrum-text-scale', String(Math.min(1, viewBoxWidth / (width || viewBoxWidth))));
  };
  if (!container._spectrumTextObserver) {
    const observer = new ResizeObserver(() => {
      if (!container.isConnected) {
        observer.disconnect(); delete container._spectrumTextObserver;
      } else update();
    });
    container._spectrumTextObserver = observer;
    observer.observe(container);
  }
  if (container.isConnected) update();
}

function averageSpectrumFrames(frames) {
  const available = frames.filter(frame => frame.end > frame.start && frame.evidence?.spectrum?.frequencies_hz?.length > 1);
  if (!available.length) return null;
  const frequencies = available[0].evidence.spectrum.frequencies_hz;
  const compatible = available.filter(frame => frame.evidence.spectrum.frequencies_hz.length === frequencies.length
    && frame.evidence.spectrum.frequencies_hz.every((frequency, index) => frequency === frequencies[index]));
  const absolute = compatible.every(frame => Number.isFinite(frame.evidence.spectrum.reference_power) && frame.evidence.spectrum.reference_power >= 0);
  const power = frequencies.map(() => 0), pitches = new Map();
  let duration = 0;
  for (const frame of compatible) {
    const spectrum = frame.evidence.spectrum;
    const silent = !spectrum.peaks.length && spectrum.magnitudes_db.every(db => db <= -80);
    const weight = silent ? 0 : (frame.end - frame.start) * (absolute ? spectrum.reference_power : 1);
    duration += frame.end - frame.start;
    spectrum.magnitudes_db.forEach((db, index) => { power[index] += 10 ** (db / 10) * weight; });
    for (const peak of spectrum.peaks) {
      const energy = 10 ** (peak.level_db / 10) * weight;
      const item = pitches.get(peak.midi) || { ...peak, power: 0, frequencySum: 0 };
      item.power += energy; item.frequencySum += peak.frequency_hz * energy;
      pitches.set(peak.midi, item);
    }
  }
  const maximum = Math.max(0, ...power, ...[...pitches.values()].map(peak => peak.power));
  return { frequencies_hz: frequencies, reference_power: maximum / duration,
    magnitudes_db: power.map(value => maximum > 0 ? Math.max(-80, 10 * Math.log10(Math.max(value / maximum, 1e-8))) : -80),
    peaks: [...pitches.values()].filter(peak => peak.power > 0 && peak.power >= maximum * .004)
      .sort((a, b) => b.power - a.power).slice(0, 24).map(peak => ({ midi: peak.midi, note: peak.note,
        frequency_hz: peak.frequencySum / peak.power, level_db: Math.min(0, 10 * Math.log10(peak.power / maximum)) })) };
}

function createSpectrumPlot(spectrum, source, range = [], { compact = false, height = compact ? 240 : 310, comparisonSpectrum = null, tailSpectrum = null, weightedSpectrum = null } = {}) {
  const svgNode = (tag, attributes = {}, text = "") => {
    const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
    element.textContent = text;
    return element;
  };
  const left = compact ? 42 : 50, right = compact ? 340 : 740;
  const top = compact ? 76 : Math.min(90, height - 122), bottom = height - 40;
  const svg = svgNode("svg", { viewBox: `0 0 ${compact ? 360 : 760} ${height}`, role: "img", "aria-label": `${source} frequency spectrum, ${range[0]}–${range[1]} seconds` });
  const low = spectrum.frequencies_hz[0];
  const high = spectrum.frequencies_hz.at(-1);
  const x = (frequency) => left + Math.max(0, Math.min(1, Math.log(frequency / low) / Math.log(high / low))) * (right - left);
  const y = (db) => top + Math.max(0, Math.min(80, -db)) / 80 * (bottom - top);
  for (const db of compact ? [0, -40, -80] : [0, -20, -40, -60, -80]) {
    svg.append(svgNode("line", { x1: left, x2: right, y1: y(db), y2: y(db), class: "spectrum-grid" }),
      svgNode("text", { x: left - 8, y: y(db) + 4, "text-anchor": "end", class: "spectrum-axis" }, String(db)));
  }
  for (const frequency of compact ? [20, 100, 500, 2000, 4000] : [20, 50, 100, 200, 500, 1000, 2000, 4000]) {
    if (frequency < low - 1 || frequency > high) continue;
    svg.append(svgNode("line", { x1: x(frequency), x2: x(frequency), y1: top, y2: bottom, class: "spectrum-grid" }),
      svgNode("text", { x: x(frequency), y: bottom + 20, "text-anchor": "middle", class: "spectrum-axis" }, frequency >= 1000 ? `${frequency / 1000}k` : String(frequency)));
  }
  svg.append(svgNode("text", { x: left, y: top - 12, class: "spectrum-axis" }, "Relative dB"),
    svgNode("text", { x: right, y: bottom + 38, "text-anchor": "end", class: "spectrum-axis" }, "Frequency (Hz)"));
  const points = spectrum.frequencies_hz.map((frequency, index) => `${x(frequency).toFixed(2)},${y(spectrum.magnitudes_db[index]).toFixed(2)}`).join(" ");
  svg.append(svgNode("polyline", { points, "data-spectrum-component": "current", class: comparisonSpectrum || tailSpectrum || weightedSpectrum ? "spectrum-curve spectrum-current" : "spectrum-curve spectrum-final" }));
  if (tailSpectrum) {
    const tailPoints = tailSpectrum.frequencies_hz.map((frequency, index) => `${x(frequency).toFixed(2)},${y(tailSpectrum.magnitudes_db[index]).toFixed(2)}`).join(" ");
    svg.append(svgNode("polyline", { points: tailPoints, "data-spectrum-component": "tail-reduced", class: `spectrum-tail-reduced${!comparisonSpectrum && !weightedSpectrum ? " spectrum-final" : ""}` }));
  }
  if (weightedSpectrum) {
    const weightedPoints = weightedSpectrum.frequencies_hz.map((frequency, index) => `${x(frequency).toFixed(2)},${y(weightedSpectrum.magnitudes_db[index]).toFixed(2)}`).join(" ");
    svg.append(svgNode("polyline", { points: weightedPoints, "data-spectrum-component": "overtone-weighted", class: `spectrum-overtone-weighted${!comparisonSpectrum ? " spectrum-final" : ""}` }));
  }
  if (comparisonSpectrum) {
    const comparisonPoints = comparisonSpectrum.frequencies_hz.map((frequency, index) => `${x(frequency).toFixed(2)},${y(comparisonSpectrum.magnitudes_db[index]).toFixed(2)}`).join(" ");
    svg.append(svgNode("polyline", { points: comparisonPoints, "data-spectrum-component": "stabilized", class: "spectrum-stabilized spectrum-final" }));
  }
  const peaks = (comparisonSpectrum || weightedSpectrum || tailSpectrum || spectrum).peaks;
  const labelled = [...peaks].sort((a, b) => b.level_db - a.level_db).slice(0, compact ? 6 : 12);
  const labelPositions = compact ? [[], [], []] : [[], [], [], []];
  // Final-evidence annotations remain a global reference when curves are hidden.
  const annotations = svgNode("g", { class: "spectrum-annotations", visibility: "visible" });
  peaks.forEach((peak) => {
    const px = x(peak.frequency_hz), py = y(peak.level_db);
    const circle = svgNode("circle", { cx: px, cy: py, r: 3.5, class: "spectrum-peak" });
    circle.append(svgNode("title", {}, `${peak.note} · ${peak.frequency_hz.toFixed(1)} Hz · ${peak.level_db.toFixed(1)} dB`));
    annotations.append(circle);
    if (!labelled.includes(peak)) return;
    const tier = labelPositions.findIndex((positions) => positions.every((other) => Math.abs(other - px) >= 56));
    if (tier < 0) return;
    labelPositions[tier].push(px);
    const labelY = 18 + tier * 16;
    annotations.append(svgNode("line", { x1: px, x2: px, y1: labelY + 4, y2: py - 5, class: "spectrum-guide" }),
      svgNode("text", { x: px, y: labelY, "text-anchor": "middle", class: "spectrum-note" }, peak.note));
  });
  svg.append(annotations);
  return svg;
}

function createSpectrumLegendItem(component, label, plot, hiddenComponents, final = false) {
  const item = document.createElement("button");
  item.setAttribute("type", "button");
  item.className = `${component}${final ? " spectrum-final" : ""}`;
  item.textContent = label;
  const update = () => {
    const visible = !hiddenComponents.has(component);
    item.setAttribute("aria-pressed", String(visible));
    item.setAttribute("title", `${visible ? "Hide" : "Show"} ${label}`);
    plot.querySelectorAll(`[data-spectrum-component="${component}"]`).forEach(node =>
      node.setAttribute("visibility", visible ? "visible" : "hidden"));
  };
  item.addEventListener("click", () => {
    if (hiddenComponents.has(component)) hiddenComponents.delete(component);
    else hiddenComponents.add(component);
    update();
  });
  update();
  return item;
}

function createScoredPitchClassChart(evidence) {
  const values = evidence?.scoring_pitch_classes;
  if (!Array.isArray(values) || values.length !== 12 || values.some(item =>
    typeof item?.note !== 'string' || !Number.isFinite(item.accompaniment) || !Number.isFinite(item.scored))) return null;
  const weight = Number(evidence.scoring_bass_weight) || 0;
  const source = String(evidence.scoring_source || 'accompaniment').replaceAll('_', ' ');
  const section = document.createElement('div');
  section.className = 'study-scoring-evidence';
  const heading = document.createElement('h4');
  heading.textContent = 'Pitch-class input to chord scorer';
  const explanation = document.createElement('p');
  explanation.textContent = weight > 0
    ? `${source} (teal) and scored blend (amber) · Bass contributes ${Math.round(weight * 100)}% at its detected pitch class.`
    : `${source} (teal) and scored input (amber) · no reliable Bass contribution.`;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 360 94');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Pitch-class input to chord scorer; bass weight ${Math.round(weight * 100)}%`);
  const maximum = Math.max(.1, ...values.flatMap(item => [item.accompaniment, item.scored]));
  const make = (tag, attributes, label = '') => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, value));
    node.textContent = label;
    return node;
  };
  values.forEach((item, index) => {
    const x = 11 + index * 29;
    for (const [offset, field, className] of [[0, 'accompaniment', 'scoring-accompaniment'], [9, 'scored', 'scoring-final']]) {
      const height = Math.max(0, Math.min(56, item[field] / maximum * 56));
      const bar = make('rect', { x: x + offset, y: 65 - height, width: 8, height, class: className });
      bar.append(make('title', {}, `${item.note} ${field === 'scored' ? 'scored blend' : 'accompaniment'}: ${Math.round(item[field] * 100)}%`));
      svg.append(bar);
    }
    svg.append(make('text', { x: x + 8, y: 83, 'text-anchor': 'middle', class: 'scoring-note' }, item.note));
  });
  section.append(heading, explanation, svg);
  return section;
}

function renderDetailSpectrum(frame, stabilizedFrame = null) {
  const container = elements.detailSpectrum;
  if (!container) return;
  const spectrum = frame?.evidence?.spectrum;
  const rangeKey = frame ? `${frame.start}:${frame.end}` : "";
  // Event views are cloned, so compare the saved curve rather than object identity.
  const comparison = stabilizedFrame?.evidence?.spectrum;
  const tailSpectrum = frame?.evidence?.tail_reduced_spectrum;
  const weightedSpectrum = frame?.evidence?.overtone_weighted_spectrum;
  const scoringEvidence = stabilizedFrame?.evidence || frame?.evidence;
  const signature = spectrum ? `${rangeKey}:${frame.evidence.source}:${JSON.stringify(spectrum)}:${stabilizedFrame?.start}:${stabilizedFrame?.end}:${JSON.stringify(comparison)}:${JSON.stringify(tailSpectrum)}:${JSON.stringify(weightedSpectrum)}:${JSON.stringify([scoringEvidence?.scoring_pitch_classes, scoringEvidence?.scoring_source, scoringEvidence?.scoring_bass_weight])}` : "";
  if (container._spectrumSignature === signature) return;
  container._spectrumSignature = signature;
  const heading = document.createElement("h3");
  heading.textContent = "Frequency Spectrum";
  const caption = document.createElement("p");
  caption.className = "study-muted";
  if (!spectrum?.frequencies_hz?.length) {
    caption.textContent = "Reanalyze in Auto or Fixed mode to show beat spectra.";
    container.replaceChildren(heading, caption);
    return;
  }
  const previous = container.querySelector(".spectrum-curve")?.getAttribute("points");
  const source = frame.evidence.source || "analysis";
  const plot = createSpectrumPlot(spectrum, source, [frame.start, frame.end], { compact: true, comparisonSpectrum: comparison, tailSpectrum, weightedSpectrum });
  const curve = plot.querySelector(".spectrum-curve");
  const points = curve.getAttribute("points");
  let animation;
  if (previous && previous !== points && previous.split(" ").length === points.split(" ").length
    && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    animation = document.createElementNS("http://www.w3.org/2000/svg", "animate");
    Object.entries({ attributeName: "points", from: previous, to: points, dur: "0.18s", begin: "indefinite" })
      .forEach(([key, value]) => animation.setAttribute(key, value));
    curve.append(animation);
  }
  const legend = document.createElement("div");
  legend.className = "spectrum-comparison-legend";
  {
    const hiddenComponents = container._spectrumHiddenComponents ||= new Set();
    const labels = [["current", "Current cell"]];
    if (tailSpectrum) labels.push(["tail-reduced", "Tail reduced"]);
    if (weightedSpectrum) labels.push(["overtone-weighted", "Overtone weighted"]);
    if (comparison) labels.push(["stabilized", "Chord average"]);
    for (const [index, [className, label]] of labels.entries()) {
      legend.append(createSpectrumLegendItem(className, label, plot, hiddenComponents, index === labels.length - 1));
    }
  }
  const tailInfo = frame.evidence.tail_reduction;
  caption.textContent = `${source === "full_mix" ? "Full mix" : source} · cell ${Number(frame.start).toFixed(2)}–${Number(frame.end).toFixed(2)} s${comparison ? ` · chord ${Number(stabilizedFrame.start).toFixed(2)}–${Number(stabilizedFrame.end).toFixed(2)} s` : ""}`;
  if (tailSpectrum) caption.textContent += ` · tail removed ${Math.round((tailInfo?.removed_fraction || 0) * 100)}% power`;
  if (weightedSpectrum) caption.textContent += ` · overtones removed ${Math.round((frame.evidence.overtone_weighting?.removed_fraction || 0) * 100)}% ${tailSpectrum ? "remaining power" : "power"}`;
  caption.textContent += tailSpectrum || weightedSpectrum ? " · reduced curves share original 0 dB" : " · curves use their own 0 dB peaks";
  if (comparison && (tailSpectrum || weightedSpectrum)) caption.textContent += "; average uses its own peak";
  caption.title = "Peak labels describe final analysis evidence and stay visible when curves are hidden. Measured peaks may include overtones. Weighting changes evidence, not the source audio. See Help for the formula and limitations.";
  const scoring = createScoredPitchClassChart(scoringEvidence);
  container.replaceChildren(heading, legend, plot, ...(scoring ? [scoring] : []), caption);
  fitSpectrumText(container);
  animation?.beginElement?.();
}

function createStudySpectrum(run, { plotHeight = 310 } = {}) {
  const textNode = (tag, text, className = "") => {
    const element = document.createElement(tag);
    element.textContent = text; element.className = className;
    return element;
  };
  const section = textNode("section", "", "study-spectrum");
  section.append(textNode("h3", "Frequency Spectrum"));
  const sources = Object.entries(run.source_evidence || {}).filter(([, evidence]) => evidence.spectrum?.frequencies_hz?.length > 1);
  if (!sources.length) {
    section.append(textNode("p", "Reanalyze this selection to add a saved frequency spectrum.", "study-muted"));
    return section;
  }
  const selector = document.createElement("select");
  selector.setAttribute("aria-label", "Spectrum source");
  for (const [name] of sources) {
    const option = textNode("option", name === "full_mix" ? "Full mix" : name[0].toUpperCase() + name.slice(1));
    option.value = name; selector.append(option);
  }
  selector.value = sources.some(([name]) => name === "other") ? "other" : sources[0][0];
  const label = textNode("label", "Source "); label.append(selector);
  const plot = textNode("div", "", "study-spectrum-plot");
  const legend = textNode("div", "", "spectrum-comparison-legend");
  const peaks = textNode("p", "", "study-spectrum-peaks");
  const hiddenComponents = new Set();
  const redraw = () => {
    const evidence = run.source_evidence[selector.value];
    const spectrum = evidence.spectrum;
    const tailSpectrum = evidence.tail_reduced_spectrum;
    const weightedSpectrum = evidence.overtone_weighted_spectrum;
    plot.replaceChildren(createSpectrumPlot(spectrum, selector.value, run.range, { tailSpectrum, weightedSpectrum, height: plotHeight }));
    fitSpectrumText(section);
    legend.replaceChildren();
    const labels = [["current", "Original"]];
    if (tailSpectrum) {
      labels.push(["tail-reduced", "Tail reduced"]);
      peaks.textContent = `${Math.round((evidence.tail_reduction?.removed_fraction || 0) * 100)}% spectral power removed · original and reduced share the original 0 dB reference.`;
    } else peaks.textContent = spectrum.peaks.length ? spectrum.peaks.map((peak) => `${peak.note} · ${peak.frequency_hz.toFixed(1)} Hz`).join("   |   ") : "No strong spectral peaks.";
    if (weightedSpectrum) {
      labels.push(["overtone-weighted", "Overtone weighted"]);
      peaks.textContent = `${tailSpectrum ? `Tail: ${Math.round((evidence.tail_reduction?.removed_fraction || 0) * 100)}% removed · ` : ""}Overtone weighting: ${Math.round((evidence.overtone_weighting?.removed_fraction || 0) * 100)}% power removed${tailSpectrum ? " after tail reduction" : ""} · curves share original 0 dB reference.`;
    }
    for (const [index, [component, label]] of labels.entries()) {
      legend.append(createSpectrumLegendItem(component, label, plot, hiddenComponents, index === labels.length - 1));
    }
  };
  selector.addEventListener("change", redraw);
  const scoring = createScoredPitchClassChart(run.evidence);
  section.append(label, legend, plot, peaks, ...(scoring ? [scoring] : []), textNode("p", "Windowed average over this saved range · 0 dB is the loudest original peak in this source. Labels show nearest notes from final evidence and stay visible when curves are hidden; peaks can include overtones. Hover a peak for its frequency and level. Pitch-class bars show normalized scoring input, not a combined audio spectrum or the full chord score.", "study-muted"));
  redraw();
  return section;
}
