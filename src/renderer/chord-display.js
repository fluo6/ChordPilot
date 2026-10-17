function normalizeChordDisplayPreferences(value = {}) {
  return { style: value?.style === 'jazz' ? 'jazz' : 'text',
    roots: ['tonic', 'relative'].includes(value?.roots) ? value.roots : 'letters' };
}

function chordDisplayParts(symbol) {
  const text = String(symbol || 'N.C.').trim();
  // Only a final note name (or displayed degree) is a bass; 6/9 belongs to the quality.
  const slash = /\/([A-G][#b]?|[♭♯]?[1-7])$/.exec(text);
  const main = slash ? text.slice(0, slash.index) : text;
  const match = /^([A-G][#b]?|[♭♯]?[1-7])(.*)$/.exec(main);
  return match ? {root:match[1], quality:match[2], bass:slash?.[1] || ''} : {root:text, quality:'', bass:''};
}

function chordDisplayPitch(note) {
  const match = /^([A-G])([#b]?)$/.exec(String(note).replaceAll('♯','#').replaceAll('♭','b'));
  if (!match) return null;
  return ({C:0,D:2,E:4,F:5,G:7,A:9,B:11}[match[1]] + (match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0) + 12) % 12;
}

function formatChordDisplayParts(symbol, key = state.chart?.key || state.chart?.detected_key || state.chart?.native_key || '', preferences = state.chordDisplayPreferences) {
  const settings = normalizeChordDisplayPreferences(preferences);
  const parts = chordDisplayParts(symbol);
  parts.quality = parts.quality.replace(/^(m?)6(?:9|add9)$/, '$16/9');
  if (parts.root === 'N.C.') return parts;
  const keyMatch = /^([A-Ga-g][#b]?)(?:\s*(m|minor|major))?$/.exec(String(key).trim().replaceAll('♯','#').replaceAll('♭','b'));
  let tonic = keyMatch ? chordDisplayPitch(keyMatch[1][0].toUpperCase() + keyMatch[1].slice(1)) : null;
  if (tonic !== null && settings.roots === 'relative' && ['m','minor'].includes(keyMatch[2])) tonic = (tonic + 3) % 12;
  const number = note => {
    const pitch = chordDisplayPitch(note);
    return tonic === null || pitch === null ? note : ['1','♭2','2','♭3','3','4','♯4','5','♭6','6','♭7','7'][(pitch-tonic+12)%12];
  };
  if (settings.roots !== 'letters') {
    parts.root = number(parts.root);
    if (parts.bass) parts.bass = number(parts.bass);
  }
  if (settings.style === 'jazz') {
    parts.quality = parts.quality.replace(/^m(?:\(maj([79])\)|maj([79])|M([79]))/, (_match, a, b, c) => `−Δ${a || b || c}`)
      .replace(/^m7b5$/, 'ø7').replace(/^dim/, '°').replace(/^aug/, '+')
      .replace(/^(?:maj|M)(?=\d)/, 'Δ').replace(/^min/, '−').replace(/^m(?!aj)/, '−');
  }
  return parts;
}

function formatChordDisplay(symbol, key, preferences) {
  const {root, quality, bass} = formatChordDisplayParts(symbol, key, preferences);
  // Separate a numeric degree from a numeric extension in plain-text surfaces.
  const space = /^[♭♯]?[1-7]$/.test(root) && /^\d/.test(quality) ? ' ' : '';
  return `${root}${space}${quality}${bass ? `/${bass}` : ''}`;
}

function updateChordDisplayControls() {
  const settings = normalizeChordDisplayPreferences(state.chordDisplayPreferences);
  if (elements.chordNotationStyleInput) elements.chordNotationStyleInput.value = settings.style;
  if (elements.chordRootStyleInput) elements.chordRootStyleInput.value = settings.roots;
  if (elements.chordDisplayPreview) {
    const example = formatChordDisplay('Dm11', 'C');
    elements.chordDisplayPreview.textContent = `Example in C: ${example} · display only · saved on this device`;
  }
}

function initializeChordDisplay() {
  try { state.chordDisplayPreferences = normalizeChordDisplayPreferences(JSON.parse(localStorage.getItem('chordpilot.chordDisplay') || '{}')); }
  catch (_) { state.chordDisplayPreferences = normalizeChordDisplayPreferences(); }
  const change = () => {
    state.chordDisplayPreferences = normalizeChordDisplayPreferences({
      style: elements.chordNotationStyleInput?.value, roots: elements.chordRootStyleInput?.value
    });
    try { localStorage.setItem('chordpilot.chordDisplay', JSON.stringify(state.chordDisplayPreferences)); } catch (_) {}
    updateChordDisplayControls();
    renderBars();
    if (typeof renderStudyResult === 'function') renderStudyResult();
  };
  elements.chordNotationStyleInput?.addEventListener('change', change);
  elements.chordRootStyleInput?.addEventListener('change', change);
  updateChordDisplayControls();
}
