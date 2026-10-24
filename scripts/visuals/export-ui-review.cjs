// Run: node scripts/visuals/export-ui-review.cjs
// Packages the working-tree UI; never reads local sessions, caches, or audio.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const renderer = path.join(root, 'src/renderer');
const read = name => fs.readFileSync(path.join(renderer, name), 'utf8');
const asset = (name, mime) => `data:${mime};base64,${fs.readFileSync(path.join(renderer, name)).toString('base64')}`;
const json = value => JSON.stringify(value).replace(/</g, '\\u003c');
const script = (source, name) => `<script data-source="${name}">\n${source.replace(/<\/script/gi, '<\\/script')}\n</script>`;
let html = read('index.html');
const sourceHtml = html;
const css = read('styles.css');
const sources = [...html.matchAll(/<script src="\.\/(.*?)"><\/script>/g)].map(match => match[1]);
const manifest = {
  snapshot: '2026-10-24', description: 'Consolidated Timeline with Song Details, preserving the native piano, fretboards and chord-name font. Synthetic data only; no backend or real song audio.',
  html: 'src/renderer/index.html', css: 'src/renderer/styles.css', scripts: sources.map(name => `src/renderer/${name}`),
  ids: Object.fromEntries([...sourceHtml.matchAll(/\bid="([^"]+)"/g)].map(match => [match[1], sourceHtml.slice(0, match.index).split('\n').length])),
  classes: Object.fromEntries([...css.matchAll(/\.([a-zA-Z_][\w-]*)/g)].reverse().map(match => [match[1], css.slice(0, match.index).split('\n').length]))
};
const progression = ['Cmaj7', 'Am7', 'Dm7', 'G7', 'Em7', 'Am7', 'Dm7', 'G7', 'Fmaj7', 'Em7', 'Dm7', 'G7', 'Cmaj7', 'Am7', 'Dm7', 'G7'];
const roots = [48, 45, 38, 43, 40, 45, 38, 43, 41, 40, 38, 43, 48, 45, 38, 43];
const waveform = seed => Array.from({length: 1024}, (_, i) => +(.05 + .45 * Math.abs(Math.sin(i * .071 + seed)) * (.3 + .7 * Math.abs(Math.sin(i * .319 + seed)))).toFixed(3));
const bars = progression.map((chord, i) => ({
  number: i + 1, start: i * 2, end: i * 2 + 2, section: ['Intro', 'Verse', 'Chorus', 'Outro'][Math.floor(i / 4)],
  chord, confidence: .87, chord_confidence: .87, pitch_confidence: .92,
  chord_events: [{chord, start: i * 2, end: i * 2 + 2, confidence: .87}],
  bass_events: [0, 1].map(offset => ({start: i * 2 + offset, end: i * 2 + offset + .8, attack_start: i * 2 + offset, midi: roots[i], confidence: .9})),
  lyrics: i % 2 === 0 ? ['Morning light across the water', 'Take a breath and start again', 'Every road can lead us closer', 'Let the music find its way'][Math.floor(i / 4)] : '',
  notes: i === 4 ? 'Synthetic demo: review the chord change here.' : '',
  alternatives: [{chord, score: .87}, {chord: 'C6', score: .64}, {chord:'Em9',score:.42},{chord:'Gmaj7',score:.28}]
}));
// Illustrative evidence populates the existing piano, fretboards and spectrum.
// These are synthetic UI fixtures, never recognizer results from a real song.
const pitchNames = ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
for (const [index, bar] of bars.entries()) {
  const intervals = bar.chord.includes('maj7') ? [0,4,7,11] : bar.chord.includes('m7') ? [0,3,7,10] : [0,4,7,10];
  const midis = intervals.map(interval => roots[index] + 12 + interval);
  const pitches = midis.map((midi,i) => ({midi, note:pitchNames[midi % 12], strength:1-i*.15}));
  const peaks = pitches.map((pitch,i)=>({frequency_hz:440*2**((pitch.midi-69)/12),level_db:-i*3,note:`${pitch.note}${Math.floor(pitch.midi/12)-1}`}));
  const frequencies = Array.from({length:180},(_,i)=>30*(4000/30)**(i/179));
  const magnitudes = frequencies.map(frequency=>Math.max(-75,...peaks.map(peak=>peak.level_db-1600*Math.log2(frequency/peak.frequency_hz)**2)));
  const evidence = {source:'other', detected_pitches:pitches,
    detected_notes:pitches.map(({note,strength})=>({note,strength})),
    voicing_frames:[{start:bar.start,end:bar.end,midis}],
    spectrum:{frequencies_hz:frequencies,magnitudes_db:magnitudes,peaks,reference_power:1}};
  bar.evidence=evidence;
  bar.chord_events[0].evidence=evidence;
  bar.chord_events[0].alternatives=bar.alternatives;
  bar.bass_reference={note:pitchNames[roots[index]%12],detected_pitches:[{midi:roots[index],strength:1}]};
  bar.chord_events[0].bass_reference=bar.bass_reference;
}
const demo = {
  audio: {name: 'Morning Light — UI Demo.wav', title: 'Morning Light', artist: 'ChordPilot demo', album: 'Synthetic review project', path: 'demo/morning-light.wav', exists: true, duration: 32},
  chart: {title: 'Morning Light', key: 'C', detected_key: 'C', key_offset: 0, tempo: 120, time_signature: '4/4', duration: 32,
    beat_times: Array.from({length: 65}, (_, i) => i * .5), bars, waveform: waveform(0),
    stems: {ok: true, model: 'Synthetic UI fixture', stems: ['vocals', 'drums', 'bass', 'other'].map((name, i) => ({name, path: `demo/${name}.wav`, waveform: waveform(i + 1)}))},
    drums: {ok: true, model: 'Synthetic UI fixture', events: bars.flatMap(bar => [0, .5, 1, 1.5].flatMap((offset, i) => [{time: bar.start + offset, instrument: 'hihat', score: .9}, {time: bar.start + offset, instrument: i % 2 ? 'snare' : 'kick', score: .9}]))},
    melody: {ok: true, model: 'Synthetic UI fixture', events: bars.flatMap(bar => [72, 71, 67, 69].map((midi, i) => ({start: bar.start + i * .5, end: bar.start + i * .5 + .45, midi, confidence: .9})))},
    analysis_engine: {mode: 'fast', options: {}}},
  ui: {selectedIndex: 4, activeIndex: 4, editorPanel: 'analysis', chartRenderer: 'ireal', currentTime: 8}
};
html = html.replace('<title>ChordPilot</title>', '<title>ChordPilot · Timeline and Song Details · 24 October 2026</title>');
html = html.replace('<link rel="stylesheet" href="./styles.css" />', `<style id="chordpilot-styles" data-source="src/renderer/styles.css">\n${css.replace('./fonts/MuseJazzText.otf', asset('fonts/MuseJazzText.otf', 'font/otf'))}\n</style>`);
html = html.replace('<link rel="stylesheet" href="./prototype-workspace.css" />', `<style data-source="src/renderer/prototype-workspace.css">${read('prototype-workspace.css').replace('./assets/workspace-dawn.png',asset('assets/workspace-dawn.png','image/png'))}</style>`);
html = html.replace('<link rel="stylesheet" href="./song-details.css" />', `<style data-source="src/renderer/song-details.css">${read('song-details.css')}</style>`);
// Help-page logos become offline monograms. Links still identify each library.
html = html.replace(/<img src="https:[^"]+" alt="" \/>/g, '<span aria-hidden="true" style="font-size:16px">◈</span>');
const assets = {bravura: asset('vendor/alphatab/font/Bravura.woff2', 'font/woff2')};
const bootstrap = `window.__reviewAssets=${json(assets)};window.__reviewDemo=${json(demo)};
window.chordPilot={onBackendLog:()=>()=>{},showMessage:async value=>{window.__reviewNotice?.(value.message);}};`;
html = html.replace(/<script src=/, `${script(bootstrap, 'review/bootstrap')}\n<script src=`);
html = html.replace(/<script src="\.\/(.*?)"><\/script>/g, (_, name) => {
  if (['web-bridge.js', 'web-session-dialog.js'].includes(name)) return `<!-- ${name}: backend bridge omitted in offline review -->`;
  let source = read(name);
  if (name === 'renderer.js') source = source.replace(/^loadBuildInfo\(\);/m, '').replace(/^checkInitialQueueState\(\);/m, '');
  if (name === 'shell.js') source = source.replaceAll('chordpilot.recentSessions', 'chordpilot.uiReview.recentSessions');
  if (name === 'compact-workspace.js') source = source.replaceAll('chordpilot.compactWorkspace', 'chordpilot.uiReview.compactWorkspace');
  if (name === 'chart-workspace.js') source = source.replaceAll('chordpilot.chartWorkspace', 'chordpilot.uiReview.chartWorkspace');
  if (name === 'analysis-workspace.js') source = source.replaceAll('chordpilot.analysisWorkspace', 'chordpilot.uiReview.analysisWorkspace');
  if (name === 'prototype-workspace.js') source=source.replaceAll('chordpilot.prototypePins','chordpilot.uiReview.prototypePins');
  if (name === 'chord-display.js') source = source.replaceAll('chordpilot.chordDisplay', 'chordpilot.uiReview.chordDisplay');
  if (name === 'bass-view.js') source = source.replace('./assets/bass-rosewood.png', asset('assets/bass-rosewood.png', 'image/png'));
  if (name === 'alphatab-renderer.js') source = source
    .replace("const fontDirectory=new URL('./vendor/alphatab/font/',document.baseURI).href;", "const fontDirectory='';")
    .replace('document.head.append(css);', "css.dataset.reviewRuntime='true';document.head.append(css);")
    .replace("s.core.useWorkers=true;s.core.scriptFile=new URL('./vendor/alphatab/alphaTab.min.js',document.baseURI).href;", 's.core.useWorkers=false;s.core.smuflFontSources=new Map([[2,window.__reviewAssets.bravura]]);');
  return `<!-- Original source: src/renderer/${name} -->\n${script(source, `src/renderer/${name}`)}`;
});
const licenses = Object.fromEntries(['fonts/MuseJazzText-OFL.txt', 'vendor/lucide/LICENSE.txt', 'vendor/alphatab/LICENSE.txt', 'vendor/alphatab/font/Bravura-OFL.txt', 'vendor/VexFlow-LICENSE.txt'].map(name => [name, read(name)]));
html=html.replace('</head>', `<style>.placeholder-cover{background-image:url('${asset('assets/workspace-dawn.png','image/png')}');background-size:cover;background-position:72% center}.placeholder-cover>svg{opacity:.15}</style></head>`);
const data = `<script type="application/json" id="review-manifest">${json(manifest)}</script>\n<script type="application/json" id="review-licenses">${json(licenses)}</script>\n<script type="application/json" id="review-data">${json({notes: [], screen: 'analysis', chartRenderer: 'ireal'})}</script>`;
// Vendor JavaScript contains literal </body> strings; only replace the document tail.
html = html.replace(/<\/body>\s*<\/html>\s*$/, () => `${data}\n${fs.readFileSync(path.join(__dirname, 'ui-review-tools.html'), 'utf8')}\n</body>\n</html>`);
const destination = path.join(root, 'outputs/uiux/ChordPilot-Timeline-Song-Details-2026-10-24.html');
fs.mkdirSync(path.dirname(destination), {recursive: true});
fs.writeFileSync(destination, html);
console.log(JSON.stringify({file: destination, bytes: Buffer.byteLength(html), originalScripts: sources.length, originalIds: Object.keys(manifest.ids).length}));
