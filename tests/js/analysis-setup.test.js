const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const renderer = process.env.SETUP_BASELINE_DIR || path.join(root, 'src/renderer');
const read = name => fs.readFileSync(path.join(renderer, name), 'utf8');

function environment(targets = ['chords'], fresh = false) {
  const nodes = new Map();
  let active;
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {
      hidden: id === 'analysisSettingsDock', attrs: {}, value: '', checked: false,
      classList: {toggle() {}}, isConnected: true, getClientRects: () => [1],
      setAttribute(key, value) {this.attrs[key] = value;},
      focus() {active = this;}
    });
    return nodes.get(id);
  };
  const state = {audio: {path: 'original.wav', name: 'Original', exists: true},
    chart: fresh ? null : {bars: [{chord: 'C'}], stems: {ok: true, stems: [
      {name: 'drums', path: 'drums.wav'}, {name: 'vocals', path: 'vocals.wav'}]}},
    jobs: [], currentView: 'song', editorPanel: 'analysis', selectedIndex: 0};
  const calls = [], panels = [], errors = [];
  const stop = name => async (...args) => {calls.push({name, args});throw Error('QA stop before processing');};
  const elements = {analysisModeInput: {value: 'fast'}, lyricsEnabledInput: {checked: targets.includes('lyrics')},
    loadingText: {}, analyzeBtn: node('analyzeBtn')};
  const context = vm.createContext({console, state, elements,
    document: {getElementById: node, get activeElement() {return active;},
      querySelectorAll: () => targets.map(value => ({value}))},
    window: {chordPilot: {analyze: stop('analyze'), prepareStems: stop('prepareStems'),
      analyzeDrums: stop('analyzeDrums'), analyzeMelody: stop('analyzeMelody')}},
    hasChart: () => Boolean(state.chart && Array.isArray(state.chart.bars)), hasProject: () => true,
    openEditorPanel(name) {state.editorPanel = name; panels.push(name);},
    setStatus() {}, clearLog() {}, appendLog() {}, renderBars() {}, renderStems() {}, renderHome() {},
    syncMetaToState() {}, updateButtons() {},
    setAnalysisActive(value) {state.isAnalyzing = value;},
    showErrorDialog(...args) {errors.push(args);},
    addJob(message, status) {state.jobs.unshift({message, status});},
    collectAnalysisOptions: () => ({lyrics_enabled: elements.lyricsEnabledInput.checked})
  });
  for (const file of ['actions.js','drum-actions.js','melody-actions.js','analysis-workspace.js','prototype-workspace.js']) {
    const source = read(file).split('(function initializeAnalysisWorkspace(){')[0].split('(function initializePrototypeWorkspace(){')[0];
    vm.runInContext(source, context, {filename: file});
  }
  vm.runInContext('syncPrototypeWorkspace=()=>{};', context);
  return {context, node, state, calls, panels, errors, elements, active: () => active,
    run: () => vm.runInContext('runPrototypeTargets()', context),
    open: trigger => context.openAnalysisSetup({currentTarget: trigger}),
    hide: () => context.setAnalysisSetupOpen(false)};
}

test('one setup state supports repeated open/hide and retains controls and return focus', () => {
  const env = environment(), trigger = env.node('analysisSettingsToggle');
  const field = env.node('minBpmInput');field.value = '73';field.checked = true;
  for (let i = 0; i < 3; i++) {
    env.open(trigger);
    assert.equal(env.node('analysisSettingsDock').hidden, false);
    assert.equal(env.active(), env.node('analysisSetupHide'));
    for (const id of ['analysisSettingsToggle','analysisOpenSetupBtn','analyzeBtn']) assert.equal(env.node(id).attrs['aria-expanded'], 'true');
    env.hide();assert.equal(env.node('analysisSettingsDock').hidden, true);
    assert.equal(env.active(), trigger);assert.equal(field.value, '73');assert.equal(field.checked, true);
  }
  assert.equal(env.calls.length, 0, 'opening setup never starts processing');
});

for (const [target, expected] of [['chords','analyze'], ['lyrics','analyze'], ['drums','analyzeDrums'], ['melody','analyzeMelody'], ['stems','prepareStems']]) {
  test(`Run Selected ${target} reaches existing backend operation and stops on failure`, async () => {
    const env = environment([target]);await env.run();
    assert.equal(env.calls.length, 1);assert.equal(env.calls[0].name, expected);
    assert.equal(env.node('analysisSettingsDock').hidden, true);
    assert.ok(env.panels.includes('log'));assert.equal(env.state.jobs[0].status, 'error');
    if (target === 'chords' || target === 'lyrics') assert.equal(env.calls[0].args[2].lyrics_enabled, target === 'lyrics');
  });
}

test('fresh audio permits initial Chords with Lyrics and required stem preparation in one existing operation', async () => {
  const env = environment(['chords','lyrics','drums','melody','stems'], true);await env.run();
  assert.equal(env.calls.length, 1);assert.equal(env.calls[0].name, 'analyze');
  assert.equal(env.calls[0].args[1], 'high-quality');
  assert.equal(env.calls[0].args[2].lyrics_enabled, true);assert.equal(env.calls[0].args[2].require_stems, true);
});

test('missing stem prepares the dependency; a preparation error prevents transcription', async () => {
  const env = environment(['drums']);env.state.chart.stems = null;await env.run();
  assert.deepEqual(env.calls.map(call => call.name), ['prepareStems']);
});

test('busy, absent source and fresh audio without Chords cannot dispatch processing', async () => {
  for (const condition of ['busy','missing','fresh']) {
    const env = environment(['drums'], condition === 'fresh');
    if (condition === 'busy') env.state.isAnalyzing = true;
    if (condition === 'missing') env.state.audio.exists = false;
    await env.run();assert.equal(env.calls.length, 0);
  }
});

test('source wiring keeps routes, advanced controls, keyboard Hide and one visible Run workflow', () => {
  const html = read('index.html'), setup = read('analysis-workspace.js'), prototype = read('prototype-workspace.js');
  assert.match(html, /data-editor-view="analysis" title="Timeline"/);
  assert.match(html, /data-editor-view="study" title="Passage Lab"/);
  assert.match(html, /nav-label">Lab</);
  assert.match(read('renderer.js'), /analyzeBtn.addEventListener\("click", event => openAnalysisSetup\(event\)\)/);
  assert.match(setup, /analysisSettingsToggle'\).addEventListener\('click',openAnalysisSetup\)/);
  assert.match(setup, /analyze.addEventListener\('click',openAnalysisSetup\)/);
  assert.match(setup, /event.key==='Escape'/);assert.match(setup, /setAnalysisSetupOpen\(false, false\)/);
  assert.doesNotMatch(prototype, /mobileSettings/);assert.match(prototype, /legacy.hidden=true/);
  for (const id of ['analysisPresetInput','chordTimingInput','chordGridInput','chordStabilityInput','tailReductionInput','tailHalfLifeInput','overtoneWeightingInput','lyricsEnabledInput','lyricsSourceInput','rhythmEngineInput','onsetHopInput']) {
    assert.equal(html.split(`id="${id}"`).length - 1, 1, `${id} retained once`);
  }
});

test('setup keyboard events preserve native checkbox Space and Escape returns focus', () => {
  const env = environment(), trigger = env.node('analysisSettingsToggle');env.open(trigger);
  let prevented = false, stopped = false;
  const event = {code: 'Space', key: ' ', target: {closest: () => ({})},
    preventDefault() {prevented = true;}, stopPropagation() {stopped = true;}};
  env.context.handleAnalysisSetupKeydown(event);
  assert.equal(stopped, true);assert.equal(prevented, false, 'native checkbox activation is retained');
  env.context.handleAnalysisSetupKeydown({...event, key: 'Escape'});
  assert.equal(env.node('analysisSettingsDock').hidden, true);assert.equal(env.active(), trigger);
});

test('obsolete settings heading collapse handler is removed', () => {
  assert.doesNotMatch(read('compact-workspace.js'), /querySelector\('\.analysis-options \.section-title strong'\)\.addEventListener/);
});
