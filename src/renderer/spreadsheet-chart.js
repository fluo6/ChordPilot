// A rectangular cell grid shared by the preview, HTML clipboard and TSV copy.
function spreadsheetChartSettings(value = {}) {
  const bars = Number(value?.barsPerLine), beats = Number(value?.beatsPerCell);
  return {
    barsPerLine: [1, 2, 4, 6, 8].includes(bars) ? bars : 8,
    beatsPerCell: [.5, 1, 2, 3, 4, 6, 8].includes(beats) ? beats : 2,
    roots: value?.roots === 'tonic' ? 'tonic' : 'letters',
    symbols: value?.symbols === 'jazz' ? 'jazz' : 'text',
    colours: value?.colours !== false
  };
}

function updateSpreadsheetChartControls() {
  const active = state.chartRenderer === 'spreadsheet', settings = spreadsheetChartSettings(state.spreadsheetChart);
  const controls = elements.spreadsheetChartControls;
  if (!controls) return;
  controls.hidden = !active;
  const bars = elements.barsPerLineInput, choices = active ? [1, 2, 4, 6, 8] : [2, 4];
  if (bars && [...bars.options].map(option => option.value).join() !== choices.join()) {
    bars.replaceChildren(...choices.map(value => new Option(String(value), String(value))));
  }
  if (bars) bars.value = String(active ? settings.barsPerLine : state.barsPerLine);
  elements.spreadsheetBeatsInput.value = String(settings.beatsPerCell);
  elements.spreadsheetRootsInput.value = settings.roots;
  elements.spreadsheetSymbolsInput.value = settings.symbols;
  elements.spreadsheetColoursInput.value = settings.colours ? 'sections' : 'plain';
  controls.querySelectorAll('button').forEach(button => { button.disabled = !hasChart(); });
}

function spreadsheetSectionColour(section, index) {
  if (/intro|outro|前奏|尾奏/i.test(section)) return '#cfe2f3';
  if (/verse|主歌/i.test(section)) return '#d9ead3';
  if (/chorus|副歌/i.test(section)) return '#fce5cd';
  if (/bridge|桥|橋/i.test(section)) return '#ead1dc';
  return ['#cfe2f3', '#d9ead3', '#fce5cd', '#ead1dc'][index % 4];
}

function spreadsheetChartModel() {
  const settings = spreadsheetChartSettings(state.spreadsheetChart), chart = state.chart;
  const clean = value => String(value ?? '').replace(/[\t\r\n\0]+/g, ' ');
  const measures = chart.bars.map((bar, index) => {
    const signature = bar.time_signature || chart.time_signature || '4/4';
    const fullBeats = Math.max(1, Math.min(32, parseInt(signature, 10) || 4));
    const model = chordBeatLayout(bar, barEndTime(index), { ...chart, time_signature: signature }, chordEventsForBar(index));
    const leading = fullBeats - model.beats;
    const cells = Array.from({ length: Math.ceil(fullBeats / settings.beatsPerCell) }, (_, cell) => {
      const offset = cell * settings.beatsPerCell, end = Math.min(fullBeats, offset + settings.beatsPerCell);
      const changes = model.events.filter(event => event.offset + leading >= offset - 1e-6 && event.offset + leading < end - 1e-6);
      const active = model.events.find(event => event.offset + leading <= offset + 1e-6 && event.offset + leading + event.duration > offset + 1e-6);
      const text = changes.map(({ event }) => clean(formatChordDisplay(event.chord, chart.key || chart.detected_key || chart.native_key,
        { style: settings.symbols, roots: settings.roots }))).join(' → ');
      return { text, index, eventIndex: changes[0]?.eventIndex ?? active?.eventIndex ?? 0, beat: offset + 1, barStart: cell === 0 };
    });
    return cells;
  });
  const slots = Math.max(1, ...measures.map(cells => cells.length)), columns = 1 + settings.barsPerLine * slots;
  const rows = [], colours = new Map();
  let section = '', lastSection = null;
  chartRows(settings.barsPerLine).forEach(group => {
    section = clean(group.find(item => item.section)?.section || section);
    const changed = section !== lastSection;
    if (changed && rows.length) rows.push({ spacer: true, cells: Array.from({ length: columns }, () => ({ text: '' })) });
    if (!colours.has(section)) colours.set(section, spreadsheetSectionColour(section, colours.size));
    const cells = [{ text: changed ? section : '', section: true }];
    for (let bar = 0; bar < settings.barsPerLine; bar++) {
      const entry = group[bar];
      for (let slot = 0; slot < slots; slot++) {
        cells.push(entry && measures[entry.index][slot] || { text: '', barStart: slot === 0 });
      }
    }
    rows.push({ cells, colour: settings.colours ? colours.get(section) : '#ffffff' });
    lastSection = section;
  });
  return { rows, columns, settings };
}

function spreadsheetChartTable(model, interactive = false) {
  const table = document.createElement('table');
  table.className = 'spreadsheet-chart-table';
  table.setAttribute('aria-label', 'Spreadsheet chord chart');
  table.style.cssText = 'border-collapse:collapse;table-layout:fixed;width:100%;font-family:Arial,sans-serif;font-size:12pt;color:#171717;background:#ffffff;';
  if (!interactive) table.style.width = `${90 + 64 * (model.columns - 1)}px`;
  const columns = document.createElement('colgroup');
  for (let i = 0; i < model.columns; i++) {
    const column = document.createElement('col');
    if (i === 0 || !interactive) column.style.width = i === 0 ? '90px' : '64px';
    columns.append(column);
  }
  table.append(columns);
  const body = document.createElement('tbody');
  model.rows.forEach(row => {
    const line = document.createElement('tr');line.className = 'spreadsheet-row';
    row.cells.forEach(cell => {
      const td = document.createElement('td');td.textContent = interactive ? cell.text : spreadsheetCellText(cell.text);
      const colour = row.spacer || cell.section ? '#ffffff' : row.colour;
      td.style.cssText = `background-color:${colour};color:#171717;font-family:Arial,sans-serif;font-size:12pt;vertical-align:middle;text-align:left;white-space:normal;overflow-wrap:anywhere;`;
      if (row.spacer) td.style.cssText += 'height:12px;padding:0;border:0;';
      else {
        td.style.cssText += `height:28px;padding:6px;border:0;${cell.section ? 'font-size:10pt;' : `border-bottom:1px solid #d5dce2;border-left:${cell.barStart ? '2px solid #607580' : '1px solid #d5dce2'};`}`;
      }
      if (Number.isInteger(cell.index)) {
        const bar = state.chart.bars[cell.index];
        td.title = `Bar ${bar.number || cell.index + 1} · beat ${cell.beat} · ${cell.text || 'held chord / no new change'}`;
        if (interactive) {
          td.className = 'spreadsheet-measure';td.dataset.index = String(cell.index);td.tabIndex = 0;
          td.setAttribute('aria-label', td.title);
          td.addEventListener('click', () => selectBar(cell.index, true, cell.eventIndex));
          td.addEventListener('keydown', event => {
            if (event.key === 'Enter') { event.preventDefault();selectBar(cell.index, true, cell.eventIndex); }
          });
        }
      }
      if (!interactive) {
        td.setAttribute('x:str', '');
        // Keep Office's text format in the raw attribute: CSSOM discards it.
        td.setAttribute('style', `${td.getAttribute('style')};mso-number-format:"\\@";`);
      }
      line.append(td);
    });
    body.append(line);
  });
  table.append(body);
  return table;
}

function renderSpreadsheetChart(container) {
  if (elements.spreadsheetCopyStatus) elements.spreadsheetCopyStatus.textContent = '';
  const sheet = document.createElement('section');sheet.className = 'spreadsheet-chart';
  const title = document.createElement('h2');title.textContent = chartDisplayTitle(state.chart, state.audio || {});
  const meta = document.createElement('p'), settings = spreadsheetChartSettings(state.spreadsheetChart);
  const key = state.chart.key || state.chart.detected_key || state.chart.native_key || '';
  meta.textContent = `${key || 'Key unknown'} · ${state.chart.time_signature || '4/4'} · ${state.chart.tempo || '?'} BPM · ${settings.beatsPerCell} beat(s) per cell`;
  if (settings.roots === 'tonic' && !/^([A-Ga-g][#b♯♭]?)(?:\s*(m|minor|major))?$/.test(String(key).trim()))
    meta.textContent += ' · Set a valid song key to display number roots; letter roots are preserved meanwhile.';
  sheet.append(title, meta, spreadsheetChartTable(spreadsheetChartModel(), true));
  container.append(sheet);
}

function spreadsheetCellText(value) {
  return /^[=+\-@]/.test(value.trimStart()) ? "'" + value : value;
}

async function copySpreadsheetChart(styled = true) {
  if (!hasChart()) return;
  const status = elements.spreadsheetCopyStatus;
  try {
    const model = spreadsheetChartModel();
    // Keep source text from being interpreted as a spreadsheet formula.
    const text = model.rows.map(row => row.cells.map(cell => {
      const value = spreadsheetCellText(cell.text);
      return value.includes('"') ? '"' + value.replaceAll('"', '""') + '"' : value;
    }).join('\t')).join('\r\n');
    const html = styled ? `<!DOCTYPE html><html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body>${spreadsheetChartTable(model).outerHTML}</body></html>` : '';
    if (window.chordPilot?.copySpreadsheetChart) await window.chordPilot.copySpreadsheetChart({ text, html });
    else if (styled && navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
    } else if (!styled && navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
    else {
      const input = document.createElement('textarea'), focus = document.activeElement;
      input.value = text;input.style.cssText = 'position:fixed;left:-10000px;top:0;';document.body.append(input);input.select();
      const copy = event => {event.preventDefault();event.clipboardData.setData('text/plain', text);if (styled) event.clipboardData.setData('text/html', html);};
      document.addEventListener('copy', copy);
      try { if (!document.execCommand('copy')) throw Error('Clipboard access was denied.'); }
      finally { document.removeEventListener('copy', copy);input.remove();focus?.focus(); }
    }
    const message = `Copied ${styled ? 'styled cells' : 'values'} — paste into Excel or Google Sheets.`;
    if (status) status.textContent = message;setStatus(message);
  } catch (error) {
    const message = `Could not copy: ${error.message || error}. You can select the chart cells and copy manually.`;
    if (status) status.textContent = message;setStatus(message);
  }
}

function initializeSpreadsheetChart() {
  const change = () => {
    state.spreadsheetChart = spreadsheetChartSettings({ ...state.spreadsheetChart,
      beatsPerCell: elements.spreadsheetBeatsInput.value, roots: elements.spreadsheetRootsInput.value,
      symbols: elements.spreadsheetSymbolsInput.value, colours: elements.spreadsheetColoursInput.value === 'sections' });
    elements.spreadsheetCopyStatus.textContent = '';renderChartPreview();
  };
  [elements.spreadsheetBeatsInput, elements.spreadsheetRootsInput, elements.spreadsheetSymbolsInput, elements.spreadsheetColoursInput]
    .forEach(input => input.addEventListener('change', change));
  elements.copySpreadsheetBtn.addEventListener('click', () => copySpreadsheetChart(true));
  elements.copySpreadsheetValuesBtn.addEventListener('click', () => copySpreadsheetChart(false));
}
