function normalizeWaveformView(value = {}) {
  const gain = Number(value?.gain), heightZoom = Number(value?.heightZoom);
  const source = value?.trackHeights;
  const trackHeights = Object.fromEntries(Object.entries(source && typeof source === 'object' && !Array.isArray(source) ? source : {})
    .filter(([, height]) => Number.isFinite(Number(height)) && Number(height) > 0)
    .map(([name, height]) => [name, Math.max(14, Math.min(960, Number(height)))]));
  return {gain: [.25, .5, 1, 2, 4, 8].includes(gain) ? gain : 1,
    heightZoom: [.75, 1, 1.5, 2, 3, 4].includes(heightZoom) ? heightZoom : 1, trackHeights};
}

function waveformTrackHeight(view, name) {
  const base = Object.hasOwn(view.trackHeights, name) ? view.trackHeights[name] : 72;
  return Math.round(Math.max(64, Math.min(720, base * view.heightZoom)));
}

function resizeArrangementWaveform(lane) {
  const view = state.waveformView;
  const height = waveformTrackHeight(view, lane.dataset.trackName);
  lane.style.setProperty('--waveform-track-height', `${height}px`);
  const canvas = lane.querySelector('canvas');
  // Reserve six pixels for the resize grip and two for the waveform border.
  canvas.height = height - 8;
  drawWaveform(canvas, canvas._waveformPeaks || [], 'waveform', view.gain);
  lane.querySelector('.waveform-height-handle')?.setAttribute('aria-valuenow', String(height));
}

function setWaveformTrackHeight(lane, pixels) {
  const view = normalizeWaveformView(state.waveformView);
  const height = Math.max(64, Math.min(720, Number(pixels) || 72));
  state.waveformView = {...view, trackHeights: {...view.trackHeights, [lane.dataset.trackName]: height / view.heightZoom}};
  resizeArrangementWaveform(lane);
}

function syncWaveformViewControls() {
  state.waveformView = normalizeWaveformView(state.waveformView);
  if (elements.waveformGainInput) elements.waveformGainInput.value = String(state.waveformView.gain);
  if (elements.trackHeightZoomInput) elements.trackHeightZoomInput.value = String(state.waveformView.heightZoom);
}

function setWaveformView(field, value) {
  state.waveformView = normalizeWaveformView({...state.waveformView, [field]: value});
  syncWaveformViewControls();
  // Update canvases in place so playback, selection and horizontal pan stay intact.
  elements.visualStemLanes.querySelectorAll('.waveform-lane').forEach(resizeArrangementWaveform);
}

function initializeWaveformLane(lane, options) {
  lane.dataset.trackName = options.name;
  lane.querySelector('canvas')._waveformPeaks = options.waveform || [];
  const handle = document.createElement('div');
  handle.className = 'waveform-height-handle'; handle.tabIndex = 0;
  handle.setAttribute('role', 'separator'); handle.setAttribute('aria-orientation', 'horizontal');
  handle.setAttribute('aria-label', `Resize ${options.name} track height`);
  handle.setAttribute('aria-valuemin', '64'); handle.setAttribute('aria-valuemax', '720');
  handle.title = `Drag to resize ${options.name} · double-click to reset · ↑ / ↓ to adjust`;
  let drag = null;
  handle.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    drag = {id: event.pointerId, y: event.clientY, height: waveformTrackHeight(state.waveformView, options.name),
      chart: state.chart, audio: state.audio, view: state.currentView, panel: state.editorPanel};
    handle.setPointerCapture(event.pointerId); handle.focus({preventScroll: true});
    lane.classList.add('resizing-waveform-track');
  });
  const finish = () => {drag = null; lane.classList.remove('resizing-waveform-track');};
  handle.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    if (drag.chart !== state.chart || drag.audio !== state.audio || drag.view !== state.currentView
      || drag.panel !== state.editorPanel || !lane.isConnected) {finish(); return;}
    event.preventDefault(); event.stopPropagation();
    setWaveformTrackHeight(lane, drag.height + event.clientY - drag.y);
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(name => handle.addEventListener(name, finish));
  handle.addEventListener('click', event => {event.preventDefault(); event.stopPropagation();});
  const reset = () => setWaveformTrackHeight(lane, 72 * state.waveformView.heightZoom);
  handle.addEventListener('dblclick', event => {event.preventDefault(); event.stopPropagation(); reset();});
  handle.addEventListener('keydown', event => {
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End', ' ', 'Enter'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    if (event.key === 'Home' || event.key === 'Enter') reset();
    else if (event.key === 'End') setWaveformTrackHeight(lane, 720);
    else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      setWaveformTrackHeight(lane, waveformTrackHeight(state.waveformView, options.name) + (event.key === 'ArrowDown' ? 12 : -12));
    }
  });
  lane.append(handle);
  resizeArrangementWaveform(lane);
}
