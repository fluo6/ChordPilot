const test = require("node:test");
const assert = require("node:assert/strict");
const { loadScript } = require("./helpers/load-script");

test('chord spectrum averages linear power with duration and source level, not dB values', () => {
  const { averageSpectrumFrames } = loadScript('src/renderer/study-spectrum.js', ['averageSpectrumFrames']);
  const frame = (start, end, db, reference) => ({ start, end, evidence: { source: 'other', spectrum: {
    frequencies_hz: [100, 200], magnitudes_db: db, reference_power: reference,
    peaks: [{ midi: 48, note: 'C3', frequency_hz: 130.8, level_db: db[0] }]
  } } });
  const averaged = averageSpectrumFrames([frame(0, 1, [0, -20], 1), frame(1, 2, [-20, 0], .01)]);
  assert.ok(Math.abs(averaged.magnitudes_db[1] - 10 * Math.log10(.02 / 1.0001)) < .01);
  assert.ok(averaged.peaks[0].level_db <= 0);
  const durationWeighted = averageSpectrumFrames([frame(0, 3, [0, -20], 1), frame(3, 4, [-20, 0], 1)]);
  assert.ok(Math.abs(durationWeighted.magnitudes_db[1] - 10 * Math.log10(1.03 / 3.01)) < .01);
  const silent = frame(0, 1, [-80, -80], 0); silent.evidence.spectrum.peaks = [];
  assert.deepEqual([...averageSpectrumFrames([silent]).magnitudes_db], [-80, -80]);
  assert.deepEqual(averageSpectrumFrames([]), null);
});

function node(tag) {
  return { tag, attributes: {}, children: [], listeners: {},
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return this.attributes[name]; },
    querySelectorAll(selector) { const attribute = selector.match(/^\[([\w-]+)="([^"]+)"\]$/);
      return all(this).filter((item) => attribute ? item.attributes[attribute[1]] === attribute[2] : selector.startsWith('.')
        ? (item.className || item.attributes.class || '').split(' ').includes(selector.slice(1)) : item.tag === selector); },
    querySelector(selector) { return this.querySelectorAll(selector)[0]; },
    beginElement() { this.started = true; },
    append(...items) { this.children.push(...items); },
    replaceChildren(...items) { this.children = items; },
    addEventListener(name, handler) { this.listeners[name] = handler; }
  };
}
const spectrum = { frequencies_hz: [20, 130.8, 523.3, 4500], magnitudes_db: [-80, 0, -6, -80],
  peaks: [{ frequency_hz: 130.8, midi: 48, note: "C3", level_db: 0 }, { frequency_hz: 523.3, midi: 72, note: "C5", level_db: -6 }] };
const document = { createElement: node, createElementNS: (_namespace, tag) => node(tag) };
const all = (root) => [root, ...root.children.filter((item) => typeof item === "object").flatMap(all)];

test('spectrum font cap follows resizing and replacement plots without accumulating observers', () => {
  let callback, observed=0, disconnected=false;
  const values={};
  const observer = class {
    constructor(handler){callback=handler;}
    observe(){observed++;}
    disconnect(){disconnected=true;}
  };
  const container=node('section'); container.isConnected=true;
  const makePlot=(width,viewBoxWidth)=>{
    const svg=node('svg'); svg.setAttribute('viewBox',`0 0 ${viewBoxWidth} 240`);
    svg.style={setProperty(name,value){values[name]=value;}};
    svg.getBoundingClientRect=()=>({width});
    return svg;
  };
  container.append(makePlot(720,360));
  const {fitSpectrumText}=loadScript('src/renderer/study-spectrum.js',['fitSpectrumText'],{ResizeObserver:observer});
  fitSpectrumText(container);
  assert.equal(Number(values['--spectrum-text-scale']),.5);
  container.replaceChildren(makePlot(1520,760));
  fitSpectrumText(container);
  assert.equal(Number(values['--spectrum-text-scale']),.5);
  assert.equal(observed,1);
  container.replaceChildren(makePlot(300,760)); callback();
  assert.equal(Number(values['--spectrum-text-scale']),1);
  container.isConnected=false; callback();
  assert.equal(disconnected,true);
});

test('legend toggles curves while global note annotations stay visible during playback', () => {
  const container = node('section');
  const { renderDetailSpectrum } = loadScript('src/renderer/study-spectrum.js', ['renderDetailSpectrum'], {
    document, elements: { detailSpectrum: container }, window: { matchMedia: () => ({ matches: true }) }
  });
  const frame = { start: 0, end: .5, evidence: { source: 'other', spectrum,
    tail_reduced_spectrum: spectrum, overtone_weighted_spectrum: spectrum } };
  const saved = JSON.stringify(frame);
  renderDetailSpectrum(frame, frame);
  let buttons = container.querySelectorAll('button');
  assert.deepEqual(buttons.map(button => button.textContent), ['Current cell', 'Tail reduced', 'Overtone weighted', 'Chord average']);
  buttons[1].listeners.click();
  assert.equal(buttons[1].getAttribute('aria-pressed'), 'false');
  assert.equal(container.querySelector('.spectrum-tail-reduced').getAttribute('visibility'), 'hidden');
  assert.equal(container.querySelector('.spectrum-current').getAttribute('visibility'), 'visible');
  renderDetailSpectrum({ ...frame, start: .5, end: 1 }, frame);
  buttons = container.querySelectorAll('button');
  assert.equal(buttons[1].getAttribute('aria-pressed'), 'false');
  assert.equal(container.querySelector('.spectrum-tail-reduced').getAttribute('visibility'), 'hidden');
  buttons[1].listeners.click();
  assert.equal(container.querySelector('.spectrum-tail-reduced').getAttribute('visibility'), 'visible');
  buttons[3].listeners.click();
  assert.equal(container.querySelector('.spectrum-stabilized').getAttribute('visibility'), 'hidden');
  buttons[0].listeners.click();
  buttons[1].listeners.click();
  buttons[2].listeners.click();
  assert.equal(container.querySelector('.spectrum-annotations').getAttribute('visibility'), 'visible');
  assert.deepEqual(container.querySelectorAll('.spectrum-note').map(label => label.textContent), ['C3', 'C5']);
  renderDetailSpectrum({ ...frame, start: 1, end: 1.5 }, frame);
  assert.equal(container.querySelector('.spectrum-stabilized').getAttribute('visibility'), 'hidden');
  assert.equal(container.querySelector('.spectrum-annotations').getAttribute('visibility'), 'visible');
  assert.equal(JSON.stringify(frame), saved);
});

test('Local Study legend visibility survives source changes without affecting another chart', () => {
  const { createStudySpectrum } = loadScript('src/renderer/study-spectrum.js', ['createStudySpectrum'], { document });
  const evidence = { spectrum, tail_reduced_spectrum: spectrum, overtone_weighted_spectrum: spectrum };
  const run = { range: [0, 1], source_evidence: { other: evidence, bass: evidence } };
  const section = createStudySpectrum(run);
  const buttons = section.querySelectorAll('button');
  assert.equal(buttons.length, 3);
  buttons[0].listeners.click();
  buttons[2].listeners.click();
  assert.equal(section.querySelector('.spectrum-annotations').getAttribute('visibility'), 'visible');
  const select = section.querySelector('select');
  select.value = 'bass'; select.listeners.change();
  assert.equal(section.querySelectorAll('button')[0].getAttribute('aria-pressed'), 'false');
  assert.equal(section.querySelector('.spectrum-current').getAttribute('visibility'), 'hidden');
  assert.equal(section.querySelector('.spectrum-overtone-weighted').getAttribute('visibility'), 'hidden');
  assert.equal(section.querySelector('.spectrum-annotations').getAttribute('visibility'), 'visible');
  assert.equal(createStudySpectrum(run).querySelectorAll('button')[0].getAttribute('aria-pressed'), 'true');
});

test('scored pitch-class chart keeps bass contribution distinct from source spectra', () => {
  const { createStudySpectrum } = loadScript('src/renderer/study-spectrum.js', ['createStudySpectrum'], { document });
  const scoring = Array.from({ length: 12 }, (_, index) => ({
    note: ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'][index],
    accompaniment: index === 0 ? .4 : .6 / 11,
    scored: index === 4 ? .3 : index === 0 ? .28 : .42 / 10
  }));
  const run = { range: [0, 1], source_evidence: { other: { spectrum }, bass: { spectrum } },
    evidence: { scoring_pitch_classes: scoring, scoring_bass_weight: .3, scoring_source: 'full_mix' } };
  const section = createStudySpectrum(run);
  const chart = section.querySelector('.study-scoring-evidence');
  assert.ok(chart);
  assert.match(chart.querySelector('svg').getAttribute('aria-label'), /bass.*30%/i);
  assert.equal(chart.querySelectorAll('.scoring-accompaniment').length, 12);
  assert.equal(chart.querySelectorAll('.scoring-final').length, 12);
  assert.ok(all(section).some(item => item.textContent?.includes('Pitch-class input')));
  assert.ok(all(section).some(item => item.textContent?.includes('full mix (teal)')));
  const source = section.querySelector('select'); source.value = 'bass'; source.listeners.change();
  assert.equal(section.querySelectorAll('.study-scoring-evidence').length, 1);
});

test('weighted overtone spectrum is labelled separately from raw and tail curves', () => {
  const container = node('section');
  const { renderDetailSpectrum, createStudySpectrum } = loadScript('src/renderer/study-spectrum.js', ['renderDetailSpectrum', 'createStudySpectrum'], {
    document, elements: { detailSpectrum: container }, window: { matchMedia: () => ({ matches: true }) }
  });
  const evidence = { spectrum, tail_reduced_spectrum: spectrum,
    overtone_weighted_spectrum: { ...spectrum, magnitudes_db: [-80, 0, -12, -80] },
    overtone_weighting: { applied: true, removed_fraction: .15 } };
  renderDetailSpectrum({ start: 0, end: .5, evidence });
  assert.ok(container.querySelector('.spectrum-overtone-weighted'));
  assert.ok(all(container).some(item => item.textContent?.includes('Overtone weighted')));
  const section = createStudySpectrum({ range: [0, .5], source_evidence: { other: evidence } });
  assert.ok(section.querySelector('.spectrum-overtone-weighted'));
  assert.ok(all(section).some(item => item.textContent?.includes('15%')));
});

test("spectrum plot labels measured peaks and positions them by frequency", () => {
  const { createSpectrumPlot } = loadScript("src/renderer/study-spectrum.js", ["createSpectrumPlot"], { document });
  const plot = createSpectrumPlot(spectrum, "other", [1, 2]);
  const nodes = all(plot);
  assert.ok(nodes.some((item) => item.tag === "text" && item.textContent === "C3"));
  assert.ok(nodes.some((item) => item.tag === "text" && item.textContent === "C5"));
  assert.ok(nodes.some((item) => item.tag === "title" && item.textContent.includes("130.8 Hz")));
  const circles = nodes.filter((item) => item.tag === "circle");
  assert.ok(Number(circles[0].attributes.cx) < Number(circles[1].attributes.cx));
  assert.ok(Number(circles[0].attributes.cy) < Number(circles[1].attributes.cy));
  assert.match(plot.attributes["aria-label"], /other.*1.*2/);
});

test("source selection redraws saved evidence and legacy runs request reanalysis", () => {
  const { createStudySpectrum } = loadScript("src/renderer/study-spectrum.js", ["createStudySpectrum"], { document });
  const run = { range: [1, 2], source_evidence: { bass: { spectrum: { ...spectrum, peaks: [{ frequency_hz: 82.4, midi: 40, note: "E2", level_db: 0 }] } }, other: { spectrum } } };
  const section = createStudySpectrum(run);
  const select = all(section).find((item) => item.tag === "select");
  assert.equal(select.value, "other");
  select.value = "bass"; select.listeners.change();
  assert.ok(all(section).some((item) => item.tag === "text" && item.textContent === "E2"));
  assert.ok(all(createStudySpectrum({})).some((item) => item.textContent?.includes("Reanalyze")));
});

test("Beat Detail morphs the spectrum on a new frame and respects reduced motion", () => {
  const container = node('section');
  let reduceMotion = false;
  const { renderDetailSpectrum } = loadScript('src/renderer/study-spectrum.js', ['renderDetailSpectrum'], {
    document, elements: { detailSpectrum: container }, window: { matchMedia: () => ({ matches: reduceMotion }) }
  });
  renderDetailSpectrum({ start: 0, end: .5, evidence: { source: 'other', spectrum } });
  assert.equal(container.querySelector('animate'), undefined);
  const changed = { ...spectrum, magnitudes_db: [-80, -12, 0, -80] };
  renderDetailSpectrum({ start: .5, end: 1, evidence: { source: 'other', spectrum: changed } });
  const animation = container.querySelector('animate');
  assert.notEqual(animation.attributes.from, animation.attributes.to);
  assert.equal(animation.started, true);
  assert.match(container.querySelector('svg').attributes.viewBox, /^0 0 360 /);
  reduceMotion = true;
  renderDetailSpectrum({ start: 1, end: 1.5, evidence: { source: 'other', spectrum } });
  assert.equal(container.querySelector('animate'), undefined);
});

test('Beat Detail displays separately labelled current and stabilized spectra', () => {
  const container = node('section');
  const { renderDetailSpectrum } = loadScript('src/renderer/study-spectrum.js', ['renderDetailSpectrum'], {
    document, elements: { detailSpectrum: container }, window: { matchMedia: () => ({ matches: true }) }
  });
  const frame = { start: 0, end: .5, evidence: { source: 'other', spectrum } };
  renderDetailSpectrum(frame, { ...frame, end: 2, evidence: { ...frame.evidence, spectrum: { ...spectrum, magnitudes_db: [-80, -12, 0, -80] } } });
  assert.ok(container.querySelector('.spectrum-current'));
  assert.ok(container.querySelector('.spectrum-stabilized'));
  assert.ok(all(container).some(item => item.textContent?.includes('Current cell')));
  assert.ok(all(container).some(item => item.textContent?.includes('Chord average')));
});

test('tail reduction adds a third curve to Beat Detail and both spectra to Local Study', () => {
  const container = node('section');
  const { renderDetailSpectrum, createStudySpectrum } = loadScript('src/renderer/study-spectrum.js', ['renderDetailSpectrum', 'createStudySpectrum'], {
    document, elements: { detailSpectrum: container }, window: { matchMedia: () => ({ matches: true }) }
  });
  const evidence = { source: 'other', spectrum, tail_reduced_spectrum: { ...spectrum, magnitudes_db: [-80, -20, -6, -80] },
    tail_reduction: { applied: true, removed_fraction: .4 } };
  renderDetailSpectrum({ start: 0, end: .5, evidence });
  assert.ok(container.querySelector('.spectrum-tail-reduced'));
  const studyPlot = createStudySpectrum({ range: [1, 2], source_evidence: { other: evidence } });
  assert.ok(studyPlot.querySelector('.spectrum-tail-reduced'));
  assert.ok(all(container).some(item => item.textContent?.includes('Tail reduced')));
});
