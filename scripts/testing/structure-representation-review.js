(function (root) {
  'use strict';
  const validModes = ['roles', 'groups', 'mixed'];
  const key = song => 'chordpilot.structure.review.naming.' + song;
  function loadNaming(storage, song) {
    try { const mode = storage.getItem(key(song)); return validModes.includes(mode) ? mode : 'roles'; }
    catch { return 'roles'; }
  }
  function saveNaming(storage, song, mode) {
    if (validModes.includes(mode)) { try { storage.setItem(key(song), mode); } catch {} }
  }
  function clip(row) {
    if (!Number.isFinite(row.start) || !Number.isFinite(row.end) || row.start < 0 || row.end <= row.start) {
      throw new Error('Invalid audio interval');
    }
    return {start: row.start, end: row.end};
  }
  function filterPairs(data, filter) {
    if (filter === 'all') return data.pairs;
    if (filter === 'role-question') return data.pairs.filter(p => p.baseline_same_group && p.different_accepted_roles);
    const accepted = new Set((data.unanimous[filter] || []).map(p => p.join(':')));
    return data.pairs.filter(p => accepted.has(p.i + ':' + p.j));
  }
  function mount(container, play) {
    const doc = container.ownerDocument;
    let current, pairs = [];
    const element = (tag, text) => { const node = doc.createElement(tag); if (text) node.textContent = text; return node; };
    const fmt = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
    container.append(element('summary', 'Experimental audio matches · listen and compare'));
    container.append(element('p', 'Research evidence only. No improved grouping has been verified or imported. Passage numbers refer to frozen fine intervals, not new song sections.'));
    const filter = element('select'); filter.id = 'evidence-filter';
    for (const [value, title] of [['centered','Matches across four centered streams'], ['raw','Matches across four raw streams'],
      ['role-question','Same baseline group, different retained roles'], ['all','All passage pairs']]) {
      const option = element('option', title); option.value = value; filter.append(option);
    }
    const filterLabel = element('label', 'Evidence to inspect '); filterLabel.htmlFor = filter.id;
    const filterRow = element('div'); filterRow.className = 'method'; filterRow.append(filterLabel, filter); container.append(filterRow);
    const pairSelect = element('select'); pairSelect.id = 'evidence-pair';
    const pairLabel = element('label', 'Passage pair '); pairLabel.htmlFor = pairSelect.id;
    const pairRow = element('div'); pairRow.className = 'method'; pairRow.append(pairLabel, pairSelect); container.append(pairRow);
    const status = element('p'); status.id = 'evidence-status'; status.setAttribute('role', 'status'); container.append(status);
    const buttons = element('div'); buttons.className = 'method'; container.append(buttons);
    const scroll = element('div'); scroll.className = 'scroll';
    const table = element('table'), head = element('thead'), headers = element('tr'), body = element('tbody');
    for (const title of ['Audio features', 'Distance', 'Rank from first', 'Rank from second']) headers.append(element('th', title));
    head.append(headers); table.append(head, body); scroll.append(table); container.append(scroll);
    container.append(element('p', 'Lower distance means closer features within that view. Distances across views are not calibrated. A nearest match can still be a unique passage, silence or an adjacent fragment. Different roles do not prove different musical content.'));
    const rawLink = element('a', 'Full evidence and provenance'); container.append(rawLink);
    function renderPair() {
      buttons.replaceChildren(); body.replaceChildren();
      const pair = pairs[Number(pairSelect.value)];
      if (!pair) { status.textContent = 'No pairs meet this filter. This does not mean no repetition exists.'; return; }
      const left = current.occurrences[pair.i], right = current.occurrences[pair.j];
      status.textContent = `First: ${fmt(left.start)}–${fmt(left.end)}. Second: ${fmt(right.start)}–${fmt(right.end)}. Playback stops at each passage end.`;
      for (const [row, label] of [[left,'Listen to first passage'], [right,'Listen to second passage']]) {
        const button = element('button', label); button.type = 'button';
        button.addEventListener('click', () => play(clip(row))); buttons.append(button);
      }
      for (const [view, distance] of Object.entries(pair.distances)) {
        const row = element('tr');
        for (const text of [view.replaceAll('_', ' '), distance.toFixed(4), ...pair.ranks[view]]) row.append(element('td', String(text)));
        body.append(row);
      }
    }
    function renderFilter() {
      pairs = filterPairs(current, filter.value); pairSelect.replaceChildren();
      pairs.forEach((pair, i) => {
        const a = current.occurrences[pair.i], b = current.occurrences[pair.j];
        const option = element('option', `Passages ${pair.i + 1} / ${pair.j + 1} · ${fmt(a.start)} / ${fmt(b.start)}`);
        option.value = String(i); pairSelect.append(option);
      });
      pairSelect.disabled = pairs.length === 0; renderPair();
    }
    filter.addEventListener('change', renderFilter); pairSelect.addEventListener('change', renderPair);
    return {show(data) {
      container.hidden = !data;
      if (!data || current === data) return;
      current = data; filter.value = 'centered'; rawLink.href = data.raw; renderFilter();
    }};
  }
  const api = {filterPairs, loadNaming, saveNaming, clip, mount};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CPRepresentationReview = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
