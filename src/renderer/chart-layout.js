// Layout preferences and playback follow share the existing chart/audio clock.
function chartBarsPerLine() {
  return Number(state.barsPerLine) === 2 ? 2 : 4;
}

function chartBeatAtTime(time, model) {
  const {anchors, beats} = model;
  if (time <= anchors[0]) return 0;
  if (time >= anchors.at(-1)) return beats;
  const i = anchors.findIndex((end, index) => index > 0 && time < end) - 1;
  return Math.round((i + (time - anchors[i]) / (anchors[i + 1] - anchors[i])) * 1e6) / 1e6;
}

function chordBeatLayout(bar, end, chart = {}, events = []) {
  const start = Number(bar.start);
  const fullBeats = Math.max(1, Math.min(32, parseInt(chart.time_signature, 10) || 4));
  const beats = Number.isInteger(bar.pickup_beats) && bar.pickup_beats > 0 && bar.pickup_beats < fullBeats ? bar.pickup_beats : fullBeats;
  const measured = [...new Set((chart.beat_times || []).filter(Number.isFinite))]
    .filter(time => time > start + .04 && time < end - .04).sort((a,b) => a-b);
  const anchors = measured.length === beats - 1 ? [start, ...measured, end]
    : Array.from({length:beats+1}, (_,i) => start + (end-start)*i/beats);
  const model = {beats, anchors, labels:Array.from({length:beats}, (_,i) => fullBeats-beats+i+1), events:[]};
  if (!(end > start)) return model;
  model.events = events.flatMap((event, eventIndex) => {
    const offset = chartBeatAtTime(Math.max(start, event.start), model);
    const finish = chartBeatAtTime(Math.min(end, event.end), model);
    return finish > offset ? [{event, eventIndex, offset, duration:Math.round((finish-offset)*1e6)/1e6}] : [];
  });
  return model;
}

function packChordLabels(labels,minimum,maximum,gap=8) {
  if(labels.reduce((sum,label)=>sum+label.width,0)+Math.max(0,labels.length-1)*gap>maximum-minimum) return null;
  const positions=[];
  labels.forEach((label,i)=>positions.push(Math.max(minimum,label.onset,i ? positions[i-1]+labels[i-1].width+gap : minimum)));
  for(let i=labels.length-1;i>=0;i--) {
    positions[i]=Math.min(positions[i],(i<labels.length-1 ? positions[i+1]-gap : maximum)-labels[i].width);
  }
  return positions;
}

function fitChordBeatTracks(preview) {
  const tracks = [...preview.querySelectorAll('.chord-beat-track')];
  if (!tracks.length) return;
  // Fit labels into the available bar, using vertical lanes for nearby changes.
  // A short event must never force the entire sheet beyond its parent panel.
  tracks.forEach(track => {
    const width = track.getBoundingClientRect().width;
    const lanes = [];
    const ireal = Boolean(track.closest('.ireal-chart'));
    const bass = track.classList.contains('bass-chart-chords');
    const step = bass ? 28 : ireal ? 44 : 28;
    const entries=[...track.querySelectorAll('.chord-beat-event')].map(event => {
      const label = event.querySelector('.chord-beat-symbol');
      label.style.position = 'absolute';
      label.style.width = 'max-content';
      label.style.fontSize = '';
      const minimum=bass ? Number(event.dataset.minLeft)*width/100 : 0;
      const maximum=bass ? Number(event.dataset.maxRight)*width/100-4 : width;
      const available=Math.max(1,maximum-minimum);
      const naturalWidth = label.getBoundingClientRect().width;
      if (naturalWidth > available && width > 0) {
        label.style.fontSize = `${parseFloat(getComputedStyle(label).fontSize)*available/naturalWidth}px`;
      }
      const labelWidth = label.getBoundingClientRect().width;
      const onset = parseFloat(event.style.left)*width/100;
      return {event,label,minimum,maximum,width:labelWidth,onset};
    });
    const packed=new Map();
    if(bass) {
      const measures=new Map();
      entries.forEach(entry=>{
        const key=`${entry.minimum}:${entry.maximum}`;
        if(!measures.has(key))measures.set(key,[]);
        measures.get(key).push(entry);
      });
      measures.forEach(labels=>{
        const positions=packChordLabels(labels,labels[0].minimum,labels[0].maximum);
        positions?.forEach((left,i)=>packed.set(labels[i],left));
      });
    }
    entries.forEach(entry=>{
      const {event,label,minimum,maximum,onset}=entry,labelWidth=entry.width;
      const left = packed.get(entry) ?? Math.max(minimum, Math.min(onset, maximum-labelWidth));
      let lane = packed.has(entry) ? 0 : lanes.findIndex(right => right+8 <= left);
      if (lane < 0) lane = lanes.length;
      lanes[lane] = left+labelWidth;
      label.style.left = `${left-onset}px`; label.style.top = `${lane*step}px`;
      event.classList.toggle('offset-label', lane>0 || Math.abs(left-onset)>.5);
      event.style.setProperty('--chord-label-bottom', `${lane*step+(bass ? 26 : ireal ? 34 : 22)}px`);
      event.style.setProperty('--chord-leader-left',`${Math.min(0,left-onset)}px`);
      event.style.setProperty('--chord-leader-width',`${Math.abs(left-onset)}px`);
    });
    track.style.height = `${(bass ? 30 : ireal ? 70 : 54)+Math.max(0,lanes.length-1)*step}px`;
  });
}

function chartNotationAvailableWidth(container) {
  const sheet=container.querySelector('.bass-chart');
  const padding=node=>{
    if(!node || typeof getComputedStyle!=='function') return 0;
    const style=getComputedStyle(node);
    return ['paddingLeft','paddingRight','borderLeftWidth','borderRightWidth'].reduce((total,key)=>total+(parseFloat(style[key])||0),0);
  };
  return Math.max(280,(container.clientWidth || 0)-padding(container)-padding(sheet));
}

function chartNotationWidth(systems,container) {
  // Expand the music to the shared reading width, never its glyphs.
  return Math.max(chartNotationAvailableWidth(container)/.65,...systems.filter(Boolean).map(system=>system.width));
}

let chartPlaybackNodes = new Map();
let chartPlaybackIndex = -1;
let chartSelectedIndex = -1;
let chartPlaybackTime = 0;
let chartFollowSuspendedUntil = 0;
let chartFollowSystem = null;

function suspendChartFollow() {
  if (!state.chartAutoFollow) return;
  chartFollowSuspendedUntil = performance.now() + 8000;
  chartFollowSystem = null;
  if (elements.chartResumeFollowBtn) elements.chartResumeFollowBtn.hidden = false;
}

function resumeChartFollow() {
  chartFollowSuspendedUntil = 0;
  chartFollowSystem = null;
  if (elements.chartResumeFollowBtn) elements.chartResumeFollowBtn.hidden = true;
  updateChartPlayback(chartPlaybackTime, chartPlaybackIndex);
}

function refreshChartFollow() {
  if(['drums','bass'].includes(state.chartRenderer) && elements.chartPreview?.clientWidth>0) renderChartPreview();
  else if(['ireal','grid'].includes(state.chartRenderer) && elements.chartPreview?.clientWidth>0) finishChartLayout();
  chartFollowSystem=null;
  updateChartPlayback(chartPlaybackTime,chartPlaybackIndex);
}

function registerChartPlayback() {
  const preview = state.chartRenderer === 'table' ? elements.barsTable : elements.chartPreview;
  if (!preview) return;
  chartPlaybackNodes = new Map();
  preview.querySelectorAll('.ireal-measure, .measure-cell, .bass-chart-measure, .drum-measure, .alpha-chart-measure, .bass-chart-bar-select, .chordpro-measure, tbody tr').forEach(node => {
    const index = Number(node.dataset.index);
    if (!Number.isInteger(index)) return;
    if (!chartPlaybackNodes.has(index)) chartPlaybackNodes.set(index, []);
    chartPlaybackNodes.get(index).push(node);
  });
  chartPlaybackIndex = -1;
  chartSelectedIndex = -1;
  chartFollowSystem = null;
  const interactionHost=preview.closest?.('.bars-panel') || preview;
  if (!interactionHost._chartFollowEvents) {
    interactionHost._chartFollowEvents = true;
    interactionHost.addEventListener('wheel', suspendChartFollow, { passive: true });
    interactionHost.addEventListener('touchmove', suspendChartFollow, { passive: true });
    interactionHost.addEventListener('pointerdown', event => {
      // Dragging a scrollbar suspends follow; clicking a measure still seeks.
      if (event.target === preview || event.target === interactionHost) suspendChartFollow();
    });
    interactionHost.addEventListener('keydown', event => {
      if (['PageUp','PageDown','Home','End','ArrowUp','ArrowDown',' '].includes(event.key)) suspendChartFollow();
    });
    window.addEventListener?.('resize',refreshChartFollow);
  }
  if (typeof ResizeObserver !== 'undefined' && !elements.chartPreview._chartResizeObserver) {
    let previousWidth = 0;
    elements.chartPreview._chartResizeObserver = new ResizeObserver(entries => {
      const width = Math.round(entries[0].contentRect.width);
      if (width <= 0 || width === previousWidth) return;
      previousWidth = width;
      requestAnimationFrame(refreshChartFollow);
    });
    elements.chartPreview._chartResizeObserver.observe(elements.chartPreview);
    document.fonts.ready.then(refreshChartFollow);
  }
  updateChartPlayback(Number(elements.audioPlayer?.currentTime || 0) * (Number(state.audioPreview?.tempoRate) || 1), state.activeIndex);
}

function updateChartPlayback(time, index) {
  if (!elements.chartPreview) return;
  if(state.selectedIndex!==chartSelectedIndex) {
    for(const node of chartPlaybackNodes.get(chartSelectedIndex) || []) node.classList.toggle('selected',false);
    for(const node of chartPlaybackNodes.get(state.selectedIndex) || []) node.classList.toggle('selected',true);
    chartSelectedIndex=state.selectedIndex;
  }
  if (index !== chartPlaybackIndex) {
    for (const node of chartPlaybackNodes.get(chartPlaybackIndex) || []) {
      node.classList.toggle('active', false); node.removeAttribute('aria-current');
      node.querySelectorAll?.('.chord-beat-event.playing, .chordpro-event.playing').forEach(event => event.classList.toggle('playing', false));
    }
    for (const node of chartPlaybackNodes.get(index) || []) {
      node.classList.toggle('active', true); node.setAttribute('aria-current', 'true');
    }
  }
  chartPlaybackIndex = index;
  chartPlaybackTime = time;
  const nodes = chartPlaybackNodes.get(index) || [];
  const start = Number(state.chart?.bars?.[index]?.start);
  const end = Number(state.chart?.bars?.[index+1]?.start ?? state.chart?.duration);
  const model = chordBeatLayout(state.chart?.bars?.[index] || {start:0}, end, state.chart || {});
  const progress = end > start ? chartBeatAtTime(time, model)/model.beats : 0;
  nodes.forEach(node => {
    node.style.setProperty('--playback-progress', `${progress*100}%`);
    node.querySelectorAll?.('.chord-beat-event, .chordpro-event').forEach(event => {
      event.classList.toggle('playing', time >= Number(event.dataset.start) && time < Number(event.dataset.end));
    });
  });
  if(state.chartRenderer==='bass' && typeof highlightBassChartNotes==='function')highlightBassChartNotes(elements.chartPreview,time,index);
  if(state.chartRenderer==='drums' && typeof highlightDrumHits==='function')highlightDrumHits(elements.chartPreview,time);
  if(['alphatab','compare'].includes(state.notationRenderer) && typeof updateAlphaTabChartPlayback==='function')updateAlphaTabChartPlayback(time,index);
  if (!state.chartAutoFollow || elements.audioPlayer?.paused || performance.now() < chartFollowSuspendedUntil) return;
  if (elements.chartResumeFollowBtn) elements.chartResumeFollowBtn.hidden = true;
  const node = nodes[0];
  const system = node?._alphaSystem || node?.closest('.alpha-chart-system, .bass-chart-system, .ireal-row, .measure-grid-row, .chordpro-system') || node;
  if (!system || system === chartFollowSystem) return;
  const bounds = system.getBoundingClientRect();
  const host = state.chartRenderer === 'table' ? elements.barsTable : elements.chartPreview;
  const viewport = host.getBoundingClientRect();
  if(viewport.width===0 || viewport.height===0) return;
  let top = Math.max(0, viewport.top) + 30;
  let bottom = Math.min(window.innerHeight, viewport.bottom) - 45;
  for(let parent=host.parentElement;parent;parent=parent.parentElement) {
    if(typeof getComputedStyle !== 'function' || !/(auto|scroll|hidden)/.test(getComputedStyle(parent).overflowY)) continue;
    const clip=parent.getBoundingClientRect();top=Math.max(top,clip.top+24);bottom=Math.min(bottom,clip.bottom-30);
  }
  if (bounds.top < top || bounds.bottom > bottom) system.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  chartFollowSystem = system;
}

function finishChartLayout(preview=elements.chartPreview,registerPlayback=true) {
  if (!preview) return;
  preview.style.setProperty('--bars-per-line', chartBarsPerLine());
  // Native SVG units use one physical scale for every system, including PDF.
  let width = 700;
  preview.querySelectorAll('.bass-chart-flow').forEach(flow => {
    const svg = flow.querySelector('svg');
    if (!svg) return;
    const units = Number(svg.getAttribute('viewBox')?.split(/\s+/)[2]);
    if (!(units > 0)) return;
    flow.style.width = `${units * .65}px`;
    flow.style.minWidth = '0';
    svg.style.width = `${units * .65}px`;
    width = Math.max(width, units * .65);
  });
  fitChordBeatTracks(preview);
  const sheet=preview.querySelector('.alpha-chart, .bass-chart, .ireal-chart, .measure-grid-chart, .chordpro-chart');
  if(sheet) width=Math.max(width,sheet.getBoundingClientRect().width);
  preview.style.setProperty('--chart-paper-width', `${width}px`);
  if(registerPlayback)registerChartPlayback();
}

async function prepareChartPrint() {
  if (!hasChart()) return;
  renderChartPreview();
  const alphaWidth=typeof prepareAlphaTabPrint==='function'?await prepareAlphaTabPrint():null;
  await document.fonts.ready;
  finishChartLayout();
  // Preserve glyph scale on unusually dense scores by widening the page.
  const preview = elements.chartPreview;
  if(Number.isFinite(alphaWidth))preview.style.setProperty('--chart-paper-width',`${alphaWidth*(state.notationRenderer==='compare'?2:1)}px`);
  const width = Math.max(700, parseFloat(preview.style.getPropertyValue('--chart-paper-width')) || 700);
  let style = document.getElementById('chartPageSize');
  if (!style) { style = document.createElement('style'); style.id = 'chartPageSize'; document.head.append(style); }
  const required=Math.ceil(width*25.4/96+24);
  const paper=required<=210 ? [210,297] : required<=297 ? [297,210] : required<=420 ? [420,297] : [required,297];
  style.textContent = `@page { size: ${paper[0]}mm ${paper[1]}mm; margin: 12mm; }`;
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}
