// Taiwan-style numbered lead sheet. Shares the lead sheet's notes and rhythm;
// the reference PDF supplies appearance only, never musical events.
function numberedChartKey(chart) {
  const key = String(chart.key || chart.detected_key || chart.native_key || '').trim().replaceAll('♭', 'b').replaceAll('♯', '#');
  const match = /^([A-Ga-g][#b]?)(?:\s*(m|minor|major))?$/.exec(key);
  if (!match) return null;
  const minor = ['m', 'minor'].includes(match[2]);
  const pitch = (chordDisplayPitch(match[1][0].toUpperCase() + match[1].slice(1)) + (minor ? 3 : 0)) % 12;
  const flats = key.includes('b') || ['F', 'Dm', 'D minor', 'Gm', 'G minor', 'Cm', 'C minor', 'Fm', 'F minor'].includes(key);
  const name = (flats ? ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'] : ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'])[pitch];
  return { name, midi: 60 + pitch, minor };
}

function numberedChartPitch(midi, key) {
  const relative = midi - key.midi, octave = Math.floor(relative / 12), pitch = ((relative % 12) + 12) % 12;
  const spellings = [['1',''],['2','♭'],['2',''],['3','♭'],['3',''],['4',''],['4','♯'],['5',''],['6','♭'],['6',''],['7','♭'],['7','']];
  return { number: spellings[pitch][0], accidental: spellings[pitch][1], octave };
}

function numberedChartSvg(tag, attributes = {}, content) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, String(value)));
  if (content !== undefined) node.textContent = String(content);
  return node;
}

function numberedChartSystem(group, measures, key, width) {
  const count = chartBarsPerLine(), barWidth = (width - 8) / count, prepared = [], chords = [], laneEnds = [];
  let upperDots = 0, lowerDots = 0;
  group.forEach(({ index }, position) => {
    const measure = measures[index], { model } = measure, start = 4 + position * barWidth;
    const points = new Set([0, model.totalUnits]);
    model.events.forEach(event => {
      points.add(event.offset);
      // Half/whole notes use one numeral followed by quarter-note sustain dashes.
      if (Number(event.duration) < 4)
        for (let unit = event.triplet ? 16 : 24; unit < event.units; unit += event.triplet ? 16 : 24) points.add(event.offset + unit);
      if (event.sourceIndex !== null) {
        const pitch = numberedChartPitch(event.midi, key);
        upperDots = Math.max(upperDots, pitch.octave);lowerDots = Math.max(lowerDots, -pitch.octave);
      }
    });
    const chordModel = chordBeatLayout(measure.bar, measure.end, { ...state.chart, time_signature: measure.bar.time_signature || state.chart.time_signature }, []);
    const changes = measure.chords.map(chord => ({ ...chord, unit: chartBeatAtTime(chord.start, chordModel) * model.unitDenominator / model.beatValue }));
    changes.forEach(chord => points.add(Math.max(0, Math.min(model.totalUnits, chord.unit))));
    const offsets = [...points].sort((a, b) => a - b), weights = [0];
    offsets.slice(1).forEach((offset, i) => weights.push(weights.at(-1) + Math.max(.6, Math.sqrt((offset - offsets[i]) / 24))));
    const scale = (barWidth - 36) / (weights.at(-1) || 1);
    const x = unit => {
      let i = offsets.findIndex(offset => offset >= unit);
      if (i < 0) i = offsets.length - 1;
      const weight = offsets[i] === unit || i === 0 ? weights[i] : weights[i - 1] + (weights[i] - weights[i - 1]) * (unit - offsets[i - 1]) / (offsets[i] - offsets[i - 1]);
      return start + 18 + weight * scale;
    };
    changes.forEach(chord => {
      const label = formatChordDisplay(chord.displaySymbol || chord.chord, key.name, { roots: 'tonic', style: 'text' }).replace(/maj(?=\d)/g, 'M');
      const size = Math.min(barWidth - 12, Math.max(30, label.length * 8 + 14));
      const left = Math.max(start + 5, Math.min(start + barWidth - size - 5, x(chord.unit) - 12));
      let lane = laneEnds.findIndex(end => end + 7 <= left);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = left + size;
      chords.push({ ...chord, label, size, left, lane, index });
    });
    prepared.push({ measure, index, start, x });
  });
  const chordHeight = Math.max(1, laneEnds.length) * 25;
  let minimumGap = 30;
  prepared.forEach(({ measure, x }) => {
    const positions = [];
    measure.model.events.forEach(event => {
      positions.push(x(event.offset));
      if (Number(event.duration) < 4)
        for (let unit = event.triplet ? 16 : 24; unit < event.units; unit += event.triplet ? 16 : 24) positions.push(x(event.offset + unit));
    });
    positions.sort((a, b) => a - b).slice(1).forEach((value, i) => { minimumGap = Math.min(minimumGap, value - positions[i]); });
  });
  const glyphScale = Math.min(1, Math.max(.4, minimumGap / 24));
  const baseline = 24 + chordHeight + 65 + upperDots * 5, height = baseline + 45 + lowerDots * 5;
  const svg = numberedChartSvg('svg', { viewBox: `0 0 ${width} ${height}`, width, height, class: 'numbered-chart-system', role: 'group', 'aria-label': `Numbered melody, bars ${prepared[0].measure.number}–${prepared.at(-1).measure.number}` });
  prepared.forEach(({ measure, index, start, x }) => {
    const g = numberedChartSvg('g', { class: 'numbered-chart-measure', 'data-index': index, tabindex: 0, role: 'button', 'aria-label': `Bar ${measure.number}, play this measure` });
    g.append(numberedChartSvg('rect', { x: start + 1, y: 20, width: barWidth - 2, height: height - 24, rx: 3, class: 'numbered-chart-highlight' }));
    g.addEventListener('click', () => selectBar(index, true));
    g.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault();selectBar(index, true); } });
    g.append(numberedChartSvg('text', { x: start + 8, y: 14, class: 'numbered-chart-bar-number' }, `Bar ${measure.number}`));
    const line = (x1, y1, x2, y2, extra = {}) => g.append(numberedChartSvg('line', { x1, y1, x2, y2, stroke: '#252525', 'stroke-width': 1.25, ...extra }));
    line(start, baseline - 22, start, baseline + 10);
    line(start + barWidth, baseline - 22, start + barWidth, baseline + 10);
    const prior = index > 0 ? measures[index - 1] : null;
    if (measure.model.beats !== Number.parseInt(measure.bar.time_signature || state.chart.time_signature || '4/4', 10))
      g.append(numberedChartSvg('text', { x: start + barWidth - 8, y: 14, 'text-anchor': 'end', class: 'numbered-chart-bar-number' }, 'Pickup'));
    else if (index === 0 || (measure.bar.time_signature || state.chart.time_signature) !== (prior?.bar.time_signature || state.chart.time_signature))
      g.append(numberedChartSvg('text', { x: start + barWidth - 8, y: 14, 'text-anchor': 'end', class: 'numbered-chart-bar-number' }, measure.bar.time_signature || state.chart.time_signature || '4/4'));
    const triplets = [];
    let activeTriplet = null;
    measure.model.events.forEach((event, eventIndex, events) => {
      const px = x(event.offset), isRest = event.sourceIndex === null;
      const pitch = isRest ? { number: '0', accidental: '', octave: 0 } : numberedChartPitch(event.midi, key);
      const transform = `translate(${px} ${baseline}) scale(${glyphScale}) translate(${-px} ${-baseline})`;
      const note = numberedChartSvg('g', { class: 'numbered-chart-note', transform });
      note.append(numberedChartSvg('title', {}, isRest ? `Rest · ${event.units / 24} quarter-note beats` : `MIDI ${event.midi} · ${event.units / 24} quarter-note beats${event.tieFromPrevious ? ' · tied from previous measure' : ''}`));
      note.append(numberedChartSvg('text', { x: px, y: baseline, 'text-anchor': 'middle', class: 'numbered-chart-digit' }, pitch.number));
      if (pitch.accidental) note.append(numberedChartSvg('text', { x: px - 10, y: baseline - 9, 'text-anchor': 'end', class: 'numbered-chart-accidental' }, pitch.accidental));
      const underlines = Math.max(0, Math.log2(Number(event.duration) / 4));
      for (let dot = 0; dot < Math.abs(pitch.octave); dot++)
        note.append(numberedChartSvg('circle', { cx: px, cy: pitch.octave > 0 ? baseline - 26 - dot * 5 : baseline + 9 + underlines * 5 + dot * 5, r: 1.7, fill: '#171717' }));
      if (event.dots && Number(event.duration) >= 4) note.append(numberedChartSvg('circle', { cx: px + 12, cy: baseline - 4, r: 1.6, fill: '#171717' }));
      g.append(note);
      for (let level = 0; level < underlines; level++) {
        const next = events[eventIndex + 1], pulse = measure.model.unitDenominator / measure.model.beatValue;
        const join = next && Math.log2(Number(next.duration) / 4) > level && Math.floor(event.offset / pulse) === Math.floor(next.offset / pulse);
        line(px - 7 * glyphScale, baseline + (5 + level * 5) * glyphScale, join ? x(next.offset) + 7 * glyphScale : px + 7 * glyphScale, baseline + (5 + level * 5) * glyphScale);
      }
      if (Number(event.duration) < 4)
        for (let unit = event.triplet ? 16 : 24; unit < event.units; unit += event.triplet ? 16 : 24)
          g.append(numberedChartSvg('text', { x: x(event.offset + unit), y: baseline, 'text-anchor': 'middle', class: 'numbered-chart-digit', 'font-size': 25 * glyphScale, style: `font-size:${25 * glyphScale}px` }, '–'));
      const tieY = baseline - 33 - upperDots * 5;
      const arc = (left, right) => g.append(numberedChartSvg('path', { d: `M ${left} ${tieY} Q ${(left + right) / 2} ${tieY - 12} ${right} ${tieY}`, fill: 'none', stroke: '#252525', 'stroke-width': 1.2 }));
      if (event.tieToNext && events[eventIndex + 1]) arc(px + 2, x(events[eventIndex + 1].offset) - 2);
      if (event.tieFromPrevious) arc(start + 2, px - 2);
      if (event.tieToFollowingBar) arc(px + 2, start + barWidth - 2);
      if (event.triplet) {
        const region = measure.model.tuplets.find(item => event.offset >= item.start && event.offset < item.end);
        if (!activeTriplet || activeTriplet.region !== region || activeTriplet.last !== event.offset) {
          activeTriplet = { first: event.offset, last: event.offset, region };triplets.push(activeTriplet);
        }
        activeTriplet.last = event.offset + event.units;
      } else activeTriplet = null;
    });
    triplets.forEach(({ first, last }) => {
      const left = x(first) - 6, right = x(last) - 9, y = baseline - 50 - upperDots * 5;
      line(left, y + 4, left, y);line(left, y, right, y);line(right, y, right, y + 4);
      const label = numberedChartSvg('text', { x: (left + right) / 2, y: y - 3, 'text-anchor': 'middle', class: 'numbered-chart-tuplet' }, '3');g.append(label);
    });
    svg.append(g);
  });
  chords.forEach(chord => {
    const top = 30 + chord.lane * 25;
    const label = numberedChartSvg('g', { class: 'numbered-chart-chord', role: 'button', tabindex: 0, 'aria-label': `Bar ${measures[chord.index].number}, ${chord.label}` });
    label.append(numberedChartSvg('title', {}, chord.originalChords?.join(' → ') || chord.chord));
    label.append(numberedChartSvg('rect', { x: chord.left, y: top, width: chord.size, height: 21, rx: 5, fill: '#fff', stroke: '#666', 'stroke-width': 1 }));
    const text = numberedChartSvg('text', { x: chord.left + chord.size / 2, y: top + 16, 'text-anchor': 'middle', class: 'numbered-chart-chord-text' }, chord.label);
    if (chord.label.length * 8 + 14 > chord.size) { text.setAttribute('textLength', String(chord.size - 12));text.setAttribute('lengthAdjust', 'spacingAndGlyphs'); }
    label.append(text);
    const seek = () => { const events = chordEventsForBar(chord.index);selectBar(chord.index, true, Math.max(0, events.findIndex(event => chord.start >= event.start && chord.start < event.end))); };
    label.addEventListener('click', seek);label.addEventListener('keydown', event => { if (event.key === 'Enter') {event.preventDefault();seek();} });
    svg.append(label);
  });
  return svg;
}

function renderNumberedChart(container) {
  const chart = state.chart, sheet = document.createElement('section');sheet.className = 'numbered-chart';container.append(sheet);
  const text = (tag, value, className = '') => { const node = document.createElement(tag);node.textContent = value;node.className = className;return node; };
  const header = text('div', '', 'numbered-chart-header');
  header.append(text('h2', chartDisplayTitle(chart, state.audio || {})));
  const key = numberedChartKey(chart);
  const keyLabel = key ? `1 = ${key.name.replace('#', '♯').replace('b', '♭')}${key.minor ? ' (relative major; minor tonic = 6)' : ''} · undotted 1 = ${key.name}4` : 'Set the song key to show numbered pitches';
  header.append(text('p', `台湾谱 / 简谱 · ${keyLabel} · ${chart.time_signature || '4/4'} · ${chart.tempo || '?'} BPM`));
  header.append(text('p', transcriptionSheetStatus(chart, 'melody'), 'transcription-sheet-status'));
  melodyControls(header);sheet.append(header);
  sheet.append(text('p', 'Dots above/below = octave · underlines = shorter notes · 0 = rest · – = sustain · boxed symbols = chords. Uses the same estimated vocal melody as Lead Sheet.', 'numbered-chart-legend'));
  if (!chart.melody?.ok) { sheet.append(text('p', 'Select Analyse Melody to create the numbered lead sheet.'));return; }
  if (!key) { sheet.append(text('p', 'A valid song key is required so the number pitches are unambiguous. Select a key in Song settings.', 'numbered-chart-warning'));return; }
  try {
    const fixture = AlphaTabScore.buildFixture('melody'), issues = [];
    fixture.measures.forEach(measure => {
      issues.push(...measure.reviewIssues.map(issue => `Bar ${measure.number}: ${issue}`));
      issues.push(...measure.model.diagnostics.map(item => `Bar ${measure.number}, MIDI ${item.midi}, ${item.start.toFixed(3)}s: ${item.reason}`));
    });
    issues.push(...melodyCoverageDiagnostics(chart, fixture.measures[0].start, fixture.measures.at(-1).end));
    if (chart.melody.stale) issues.unshift('The vocal source has changed. Reanalyse Melody to refresh this estimate.');
    issues.push(...(chart.melody.diagnostics || []).map(item => item.reason || String(item)));
    if(chart.timing_diagnostics?.length){const timing=document.createElement('div');timing.className='numbered-chart-warning numbered-chart-timing';
      const heading=document.createElement('strong');heading.textContent='Beat / bar alignment needs review';timing.append(heading);
      chart.timing_diagnostics.forEach(message=>{const line=document.createElement('p');line.textContent=message;timing.append(line);});sheet.append(timing);}
    if (issues.length) { const details = text('details', '', 'numbered-chart-warning');details.append(text('summary', `Melody review notes (${issues.length})`));const list = text('ul', '');issues.forEach(issue => list.append(text('li', issue)));details.append(list);sheet.append(details); }
    const width = Math.max(700, Math.round(container.clientWidth - 48)), rows = chartRows();
    let lastSection = '';
    rows.forEach(group => {
      const system = text('div', '', 'numbered-chart-row'), section = group.find(item => item.section)?.section || lastSection;
      if (section && section !== lastSection) system.append(text('h3', section));
      system.append(numberedChartSystem(group, fixture.measures, key, width));
      const lyrics = text('div', '', 'numbered-chart-lyrics');
      lyrics.style.gridTemplateColumns = `repeat(${chartBarsPerLine()}, minmax(0, 1fr))`;
      group.forEach(({ bar, index }) => {
        const words = barLyricText(bar) || lyricReferenceLinesForBar(index)
          .filter(line => Number(line.start) >= bar.start && Number(line.start) < barEndTime(index))
          .map(line => line.text).join(' ');
        const line = text('span', words);line.title = 'Lyrics by bar; syllable-to-note alignment is not estimated.';lyrics.append(line);
      });
      if (lyrics.textContent.trim()) system.append(lyrics);
      sheet.append(system);lastSection = section;
    });
  } catch (error) {
    sheet.append(text('p', `Could not prepare the numbered melody: ${error.message}. The original notes are retained; review the Lead Sheet and melody evidence.`, 'numbered-chart-warning'));
  }
}
