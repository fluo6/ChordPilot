// Layout preferences only. Musical data, audio and saved sessions stay in their existing flows.
const compactWorkspace = {
  mode: 'review', chartInspector: true, detailInspector: true, chartWidth: 288
};

function saveCompactWorkspace() {
  try {
    localStorage.setItem('chordpilot.compactWorkspace', JSON.stringify({
      ...compactWorkspace,
      railCollapsed: elements.leftPane.classList.contains('collapsed-rail')
    }));
  } catch (_) { /* Layout still works when browser storage is unavailable. */ }
}

function resizeCompactWorkspace() {
  requestAnimationFrame(() => {
    if (['analysis', 'arrange'].includes(state.editorPanel)) applyTimelineZoom({render: true});
    if (state.editorPanel === 'table' && typeof refreshChartFollow === 'function') refreshChartFollow();
  });
}

function applyCompactInspectorWidth() {
  const table = document.querySelector('.table-workspace');
  const maxWidth = Math.max(220, Math.min(480, (table?.clientWidth || 1100) - 380));
  compactWorkspace.chartWidth = Math.max(220, Math.min(480, compactWorkspace.chartWidth));
  const actualWidth = Math.min(maxWidth, compactWorkspace.chartWidth);
  elements.editorView.style.setProperty('--chart-inspector-width', `${actualWidth}px`);
  const divider = document.getElementById('chartInspectorResize');
  divider?.setAttribute('aria-valuenow', String(Math.round(actualWidth)));
  divider?.setAttribute('aria-valuemin', '220');
  divider?.setAttribute('aria-valuemax', String(Math.round(maxWidth)));
}

function syncCompactWorkspace() {
  const byId = id => document.getElementById(id);
  const reading = compactWorkspace.mode === 'read';
  elements.editorView.dataset.chartMode = compactWorkspace.mode;
  elements.editorView.dataset.chartInspector = String(compactWorkspace.chartInspector && !reading);
  elements.editorView.dataset.detailInspector = String(compactWorkspace.detailInspector);
  applyCompactInspectorWidth();
  document.querySelectorAll('[data-chart-mode]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.chartMode === compactWorkspace.mode));
  });
  byId('chartInspectorToggle')?.setAttribute('aria-expanded', String(compactWorkspace.chartInspector && !reading));
  byId('detailInspectorToggle')?.setAttribute('aria-expanded', String(compactWorkspace.detailInspector));
  byId('barDetailInspector')?.setAttribute('aria-hidden', String(!compactWorkspace.detailInspector));
  byId('chartInspector')?.setAttribute('aria-hidden', String(reading || !compactWorkspace.chartInspector));
  elements.arrangementResizeHandle?.setAttribute('aria-valuenow', String(Math.round(Number.parseFloat(elements.editorView.style.getPropertyValue('--detail-pane-width')) || state.detailPaneWidth)));
  const nav = byId('chartSectionNav');
  if (nav) {
    const sections = [];
    let previous = '';
    (state.chart?.bars || []).forEach((bar, index) => {
      const section = String(bar.section || '').trim();
      if (section && section !== previous) sections.push({section, index, number: bar.number || index + 1});
      previous = section;
    });
    const signature = JSON.stringify(sections);
    if (nav.dataset.sections !== signature) {
      nav.replaceChildren();
      for (const {section, index, number} of sections) {
        const button = document.createElement('button');
        button.type = 'button'; button.textContent = `${section} · ${number}`;
        button.dataset.index=String(index);
        button.dataset.endIndex=String(sections.find(next=>next.index>index)?.index ?? state.chart.bars.length);
        button.addEventListener('click', () => {
          selectBar(index, true);
          const target = elements.chartPreview.querySelector(`[data-index="${index}"]`)
            || elements.barsBody.querySelector(`[data-index="${index}"]`);
          target?.scrollIntoView({block: 'nearest', inline: 'nearest'});
        });
        nav.append(button);
      }
      nav.dataset.sections = signature;
    }
    nav.hidden = !sections.length;
  }
  elements.navItems.forEach(item => {
    if (item.classList.contains('active')) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });
  const lyrics = document.getElementById('lyricLane');
  if (lyrics && state.chart) lyrics.hidden = !(typeof lyricEntries === 'function' && lyricEntries().length);
  if (typeof syncPrototypeResponsiveButtons === 'function') syncPrototypeResponsiveButtons();
}

(function initializeCompactWorkspace() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('chordpilot.compactWorkspace') || '{}') || {}; } catch (_) {}
  for (const key of ['chartInspector', 'detailInspector']) {
    if (typeof saved[key] === 'boolean') compactWorkspace[key] = saved[key];
  }
  if (Number.isFinite(saved.chartWidth)) compactWorkspace.chartWidth = saved.chartWidth;
  // Always open in Review; Read mode should not unexpectedly hide evidence next time.
  if (saved.railCollapsed === false) toggleLeftPane();
  elements.leftPaneToggle.addEventListener('click', saveCompactWorkspace);
  document.querySelectorAll('[data-chart-mode]').forEach(button => button.addEventListener('click', () => {
    compactWorkspace.mode = button.dataset.chartMode;
    syncCompactWorkspace(); resizeCompactWorkspace();
  }));
  document.getElementById('chartInspectorToggle').addEventListener('click', () => {
    if (compactWorkspace.mode === 'read') {
      compactWorkspace.mode = 'review';
      compactWorkspace.chartInspector = true;
    } else compactWorkspace.chartInspector = !compactWorkspace.chartInspector;
    syncCompactWorkspace(); saveCompactWorkspace(); resizeCompactWorkspace();
  });
  document.getElementById('detailInspectorToggle').addEventListener('click', () => {
    compactWorkspace.detailInspector = !compactWorkspace.detailInspector;
    syncCompactWorkspace(); saveCompactWorkspace(); resizeCompactWorkspace();
  });
  const handle = document.getElementById('chartInspectorResize');
  handle.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault(); handle.setPointerCapture(event.pointerId);
    const startX = event.clientX, startWidth = compactWorkspace.chartWidth;
    document.body.classList.add('resizing-detail-pane');
    const move = e => {
      compactWorkspace.chartWidth = startWidth - (e.clientX - startX);
      applyCompactInspectorWidth();
    };
    const finish = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', finish);
      handle.removeEventListener('pointercancel', finish);
      handle.removeEventListener('lostpointercapture', finish);
      document.body.classList.remove('resizing-detail-pane');
      saveCompactWorkspace(); resizeCompactWorkspace();
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', finish);
    handle.addEventListener('lostpointercapture', finish);
  });
  for (const divider of [handle, elements.arrangementResizeHandle]) {
    divider.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const delta = event.key === 'ArrowLeft' ? 16 : -16;
      if (divider === handle) {
        compactWorkspace.chartWidth = event.key === 'Home' ? 220 : event.key === 'End' ? 480 : compactWorkspace.chartWidth + delta;
      } else {
        state.detailPaneWidth = event.key === 'Home' ? 190 : event.key === 'End' ? 520 : (Number.parseFloat(elements.editorView.style.getPropertyValue('--detail-pane-width')) || state.detailPaneWidth) + delta;
        applyDetailPaneWidth();
      }
      syncCompactWorkspace(); saveCompactWorkspace(); resizeCompactWorkspace();
    });
  }
  window.addEventListener('resize', applyCompactInspectorWidth);
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && compactWorkspace.mode === 'read' && !isTypingTarget(event.target)) {
      compactWorkspace.mode = 'review'; syncCompactWorkspace(); resizeCompactWorkspace();
    }
  });
  document.querySelectorAll('.collapse-toggle').forEach(button => {
    const section = button.closest('.editor-section, .collapsible, .timeline-panel');
    const expanded = !section?.classList.contains('collapsed');
    button.textContent = expanded ? 'v' : '>';
    button.setAttribute('aria-expanded', String(expanded));
    button.title = expanded ? 'Collapse section' : 'Expand section';
  });
  syncCompactWorkspace();
})();
