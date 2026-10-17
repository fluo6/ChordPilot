const DETAIL_SECTION_KEYS = ['chord', 'keyboard', 'bass', 'guitar', 'spectrum', 'bar', 'lyrics', 'notes'];

function normalizeDetailSectionLayout(layout = {}) {
  const valid = values => Array.isArray(values) ? [...new Set(values.filter(key => DETAIL_SECTION_KEYS.includes(key)))] : [];
  return {order: [...new Set([...valid(layout?.order), ...DETAIL_SECTION_KEYS])], collapsed: valid(layout?.collapsed)};
}

function moveDetailSection(layout, key, target, after = false) {
  const next = normalizeDetailSectionLayout(layout);
  if (key === target || !DETAIL_SECTION_KEYS.includes(key) || !DETAIL_SECTION_KEYS.includes(target)) return next;
  next.order = next.order.filter(item => item !== key);
  next.order.splice(next.order.indexOf(target) + (after ? 1 : 0), 0, key);
  return next;
}

function applyDetailSectionLayout() {
  const container = document.querySelector('.detail-content');
  if (!container) return;
  state.detailSectionLayout = normalizeDetailSectionLayout(state.detailSectionLayout);
  const sections = new Map([...container.querySelectorAll('.detail-section')].map(section => [section.dataset.section, section]));
  for (const key of state.detailSectionLayout.order) {
    const section = sections.get(key);
    if (!section) continue;
    section.open = !state.detailSectionLayout.collapsed.includes(key);
    container.append(section);
  }
}

function setupDetailSections() {
  const container = document.querySelector('.detail-content');
  if (!container || container.querySelector('.detail-section')) return;
  const label = input => input?.closest('label');
  const definitions = [
    ['chord', 'Chord', [container.querySelector('.detail-chord-field'), elements.detailAlternatives]],
    ['keyboard', 'Piano', [elements.detailKeyboard]],
    ['bass', 'Bass Notes', [elements.detailBass]],
    ['guitar', 'Guitar Notes', [elements.detailGuitar]],
    ['spectrum', 'Frequency Spectrum', [elements.detailSpectrum]],
    ['bar', 'Bar Settings', [elements.detailSectionInput, elements.detailStartInput,
      elements.detailRepeatStartInput, elements.detailRepeatEndInput].map(label)],
    ['lyrics', 'Lyrics', [label(elements.detailLyricsInput), elements.detailLyricsReference]],
    ['notes', 'Notes', [label(elements.detailNotesInput)]]
  ];
  let dragged = null;
  const clearDrop = () => container.querySelectorAll('.detail-section').forEach(section => {
    section.classList.remove('drop-before', 'drop-after', 'detail-dragging');
  });
  for (const [key, title, nodes] of definitions) {
    const section = document.createElement('details');
    section.className = 'detail-section'; section.dataset.section = key;
    const summary = document.createElement('summary');
    // Preserve native summary/button activation without the global playback shortcut.
    summary.addEventListener('keydown', event => {
      if (event.code === 'Space' || event.key === 'Enter') event.stopPropagation();
    });
    const heading = document.createElement('strong'); heading.textContent = title;
    const handle = document.createElement('button');
    handle.type = 'button'; handle.className = 'detail-drag-handle'; handle.draggable = true;
    handle.textContent = '⠿'; handle.title = 'Drag to reorder · Alt + ↑ / ↓';
    handle.setAttribute('aria-label', `Reorder ${title}`);
    handle.addEventListener('click', event => {event.preventDefault(); event.stopPropagation();});
    handle.addEventListener('keydown', event => {
      if (!event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const order = normalizeDetailSectionLayout(state.detailSectionLayout).order;
      const target = order[order.indexOf(key) + (event.key === 'ArrowUp' ? -1 : 1)];
      if (!target) return;
      state.detailSectionLayout = moveDetailSection(state.detailSectionLayout, key, target, event.key === 'ArrowDown');
      applyDetailSectionLayout(); handle.focus();
    });
    handle.addEventListener('dragstart', event => {
      dragged = key;
      event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', key);
      section.classList.add('detail-dragging');
    });
    handle.addEventListener('dragend', () => {dragged = null; clearDrop();});
    section.addEventListener('dragover', event => {
      if (!dragged || dragged === key) return;
      event.preventDefault(); event.dataTransfer.dropEffect = 'move';
      clearDrop();
      const bounds = section.getBoundingClientRect();
      section.classList.add(event.clientY > bounds.top + bounds.height / 2 ? 'drop-after' : 'drop-before');
    });
    section.addEventListener('drop', event => {
      if (!dragged) return;
      event.preventDefault(); event.stopPropagation();
      const bounds = section.getBoundingClientRect();
      state.detailSectionLayout = moveDetailSection(state.detailSectionLayout, dragged, key,
        event.clientY > bounds.top + bounds.height / 2);
      dragged = null; clearDrop(); applyDetailSectionLayout();
    });
    summary.append(heading, handle);
    const content = document.createElement('div'); content.className = 'detail-section-content';
    content.append(...nodes.filter(Boolean));
    section.append(summary, content);
    section.addEventListener('toggle', () => {
      const next = normalizeDetailSectionLayout(state.detailSectionLayout);
      next.collapsed = next.collapsed.filter(item => item !== key);
      if (!section.open) next.collapsed.push(key);
      state.detailSectionLayout = next;
    });
    container.append(section);
  }
  applyDetailSectionLayout();
}
