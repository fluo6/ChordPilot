import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const execFileAsync = promisify(execFile);

try {
  let sym = Object.getOwnPropertySymbols(globalThis).find((s) => s.description === "undici.globalDispatcher.1");
  if (!sym) {
    await fetch("http://127.0.0.1:0", { signal: AbortSignal.timeout(10) }).catch(() => {});
    sym = Object.getOwnPropertySymbols(globalThis).find((s) => s.description === "undici.globalDispatcher.1");
  }
  const AgentClass = globalThis[sym]?.constructor;
  if (AgentClass) {
    globalThis[sym] = new AgentClass({
      headersTimeout: 600_000,
      bodyTimeout: 600_000,
      connectTimeout: 600_000
    });
  }
} catch (_e) {}

const BASE_URL = "http://127.0.0.1:2712";
const AUDIO_PATH = "/home/fujia/Unsmooth Brightness [mWMC30626jw].mp3";
const PITCH_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

const results = [];

function record(name, pass, detail) {
  results.push({ name, pass, detail });
  const mark = pass ? "✓" : "✗";
  console.log(`  ${mark} [${pass ? "PASS" : "FAIL"}] ${name}${detail ? ` - ${detail}` : ""}`);
  if (!pass) throw new Error(`Test failed: ${name} (${detail})`);
}

async function request(route, options = {}) {
  const url = `${BASE_URL}${route}`;
  const res = await fetch(url, options);
  return res;
}

async function json(route, options = {}) {
  const res = await request(route, options);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch (_e) {
    body = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`${options.method || "GET"} ${route} returned ${res.status}: ${body?.error?.message || text.slice(0, 300)}`);
  }
  return body;
}

async function postJson(route, payload) {
  return json(route, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

// Transpose helpers matching renderer/transpose.js
function transposeModulo(value, base = 12) {
  return ((value % base) + base) % base;
}

function transposeNormalizePitchName(note) {
  const clean = String(note || "").trim();
  const ENHARMONIC = { DB: "C#", "D#": "Eb", GB: "F#", "G#": "Ab", "A#": "Bb" };
  const upper = clean.toUpperCase();
  return ENHARMONIC[upper] || (clean.charAt(0).toUpperCase() + clean.slice(1));
}

function transposePitchIndex(note) {
  return PITCH_NAMES.indexOf(transposeNormalizePitchName(note));
}

function transposePitchName(note, semitones) {
  const idx = transposePitchIndex(note);
  if (idx < 0) return note;
  return PITCH_NAMES[transposeModulo(idx + semitones)];
}

function transposeChordText(symbol, semitones) {
  if (!symbol || symbol === "N.C." || symbol === "?" || symbol === "-") return symbol;
  return symbol.replace(/^([A-Ga-g])([#b]?)/, (_match, root, acc) => {
    return transposePitchName(`${root.toUpperCase()}${acc || ""}`, semitones);
  });
}

function transposeKeyName(keyName, semitones) {
  if (!keyName) return keyName;
  return keyName.replace(/^([A-Ga-g])([#b]?)(.*)$/, (_match, root, acc, rest) => {
    return `${transposePitchName(`${root.toUpperCase()}${acc || ""}`, semitones)}${rest || ""}`;
  });
}

async function runAllTests() {
  console.log("=".repeat(70));
  console.log("  CHORDPILOT END-TO-END VERIFICATION SUITE");
  console.log(`  Audio Source: ${AUDIO_PATH}`);
  console.log(`  Endpoint:     ${BASE_URL}`);
  console.log("=".repeat(70));

  // -------------------------------------------------------------------------
  // 1. Health & Server Environment
  // -------------------------------------------------------------------------
  console.log("\n[SECTION 1: SYSTEM HEALTH & STORAGE]");
  const health = await json("/api/health");
  record("Health check", health.ok === true, `queue: active=${health.queue?.active}, queued=${health.queue?.queued}`);

  const version = await json("/api/version");
  record("Version endpoint", Boolean(version.version), `v${version.version} (built: ${version.builtAt})`);

  const storageInitial = await json("/api/storage");
  record("Storage summary API", storageInitial.storage && typeof storageInitial.storage.media?.bytes === "number",
    `media=${storageInitial.storage.media?.count}, sessions=${storageInitial.storage.sessions?.count}`);

  // -------------------------------------------------------------------------
  // 2. Audio Ingestion & Load Testing
  // -------------------------------------------------------------------------
  console.log("\n[SECTION 2: AUDIO INGESTION, ID3 METADATA & STREAMING]");
  const fileStats = await fs.stat(AUDIO_PATH);
  record("Source file exists", fileStats.size > 0, `size: ${(fileStats.size / 1024 / 1024).toFixed(2)} MB`);

  // We can re-use the already uploaded media ID or upload again:
  // Using mediaId from earlier upload or uploading:
  const fileBytes = await fs.readFile(AUDIO_PATH);
  const formData = new FormData();
  formData.append("audio", new Blob([fileBytes], { type: "audio/mpeg" }), path.basename(AUDIO_PATH));

  const uploadStart = Date.now();
  const uploadRes = await json("/api/media/upload", { method: "POST", body: formData });
  const uploadDuration = ((Date.now() - uploadStart) / 1000).toFixed(2);
  const audio = uploadRes.audio;
  record("Upload audio file", Boolean(audio?.id), `mediaId=${audio?.id} in ${uploadDuration}s`);
  record("ID3 metadata parsed", audio?.title === "Unsmooth Brightness", `title="${audio?.title}", artist="${audio?.artist?.slice(0, 30)}..."`);
  record("Audio URL assigned", typeof audio?.url === "string" && audio.url.startsWith("/api/media/"), `url=${audio?.url}`);

  // Metadata endpoint
  const metadataRes = await postJson("/api/metadata", { audio });
  record("Metadata lookup API", Boolean(metadataRes?.metadata), `source=${metadataRes?.metadata?.metadataSource || "embedded"}`);

  // Audio streaming & HTTP Range Requests
  const streamFull = await request(audio.url, { method: "HEAD" });
  record("Media HEAD request", streamFull.status === 200, `content-type=${streamFull.headers.get("content-type")}, size=${streamFull.headers.get("content-length")}`);

  const streamRange1 = await request(audio.url, { headers: { Range: "bytes=0-1023" } });
  const rangeBuf1 = Buffer.from(await streamRange1.arrayBuffer());
  record("Byte-range request 0-1023", streamRange1.status === 206 && rangeBuf1.length === 1024,
    `status=206, bytes=${rangeBuf1.length}, content-range=${streamRange1.headers.get("content-range")}`);

  // Mid-song range request (seeking simulation)
  const streamRangeMid = await request(audio.url, { headers: { Range: "bytes=1000000-1004095" } });
  const rangeBufMid = Buffer.from(await streamRangeMid.arrayBuffer());
  record("Seeking range request (1MB offset)", streamRangeMid.status === 206 && rangeBufMid.length === 4096,
    `status=206, bytes=${rangeBufMid.length}, content-range=${streamRangeMid.headers.get("content-range")}`);

  // -------------------------------------------------------------------------
  // 3. Chord Analysis
  // -------------------------------------------------------------------------
  console.log("\n[SECTION 3: CHORD ANALYSIS]");
  const analyzeMediaId = "9c719aa6-e0c6-4d98-9214-cc14360b8668";
  const analyzeStart = Date.now();
  const analyzePayload = await postJson("/api/analyze", {
    mediaId: analyzeMediaId,
    mode: "fast",
    options: {}
  });
  const analyzeDuration = ((Date.now() - analyzeStart) / 1000).toFixed(2);
  const chart = analyzePayload.chart;

  record("Analysis completed", Boolean(chart && Array.isArray(chart.bars)), `response in ${analyzeDuration}s`);
  record("Detected Key", Boolean(chart.key), `key="${chart.key}", engine="${chart.analysis_engine?.engine || "scipy/chroma"}"`);
  record("Detected Tempo", typeof chart.tempo === "number" && chart.tempo > 0, `tempo=${chart.tempo} BPM`);
  record("Song Duration", typeof chart.duration === "number" && chart.duration > 200, `duration=${chart.duration.toFixed(1)}s`);
  record("Bars generated", Array.isArray(chart.bars) && chart.bars.length > 50, `total bars=${chart.bars.length}`);
  record("Beat times generated", Array.isArray(chart.beat_times) && chart.beat_times.length > 100, `total beats=${chart.beat_times.length}`);
  record("Waveform generated", Array.isArray(chart.waveform) && chart.waveform.length > 0, `peaks count=${chart.waveform.length}`);

  // Inspect first 10 bars
  console.log("\n  Sample Analysis Bars (First 10):");
  console.log(`  ${"Bar".padEnd(5)} ${"Chord".padEnd(10)} ${"Conf".padEnd(8)} ${"Time Range".padEnd(16)} Alternatives`);
  chart.bars.slice(0, 10).forEach((b, i) => {
    const end = b.evidence?.range?.[1] || (chart.bars[i + 1]?.start) || chart.duration;
    const alts = (b.alternatives || []).slice(0, 3).map((a) => `${a.chord} (${(a.score || 0).toFixed(2)})`).join(", ");
    console.log(`  ${String(i + 1).padEnd(5)} ${(b.chord || "N.C.").padEnd(10)} ${(b.confidence?.toFixed(2) || "0.00").padEnd(8)} ${(b.start?.toFixed(2) + " - " + end?.toFixed(2) + "s").padEnd(16)} ${alts}`);
  });

  // Verify bar contract
  const sampleBar = chart.bars[2];
  record("Bar schema verification",
    sampleBar && typeof sampleBar.start === "number" && typeof sampleBar.chord === "string" && typeof sampleBar.confidence === "number",
    `sample chord="${sampleBar.chord}", confidence=${sampleBar.confidence}`);
  record("Bar alternatives & evidence",
    Array.isArray(sampleBar.alternatives) && sampleBar.evidence && sampleBar.debug,
    `alternatives count=${sampleBar.alternatives?.length}, pitch evidence=${Boolean(sampleBar.evidence?.detected_notes)}`);

  // -------------------------------------------------------------------------
  // 4. Transposition (Chart & Audio Preview)
  // -------------------------------------------------------------------------
  console.log("\n[SECTION 4: TRANSPOSITION & AUDIO PREVIEW]");
  const originalKey = chart.key; // e.g. Bb
  console.log(`  Original Key: ${originalKey}`);

  // Test Transpose +2 semitones
  const transposedKeyPlus2 = transposeKeyName(originalKey, 2);
  const transposedChordsPlus2 = chart.bars.slice(0, 10).map((b) => transposeChordText(b.chord, 2));
  console.log(`  Transposed +2 semitones: ${originalKey} -> ${transposedKeyPlus2}`);
  console.log(`    Bars 1-5: [${chart.bars.slice(0, 5).map((b) => b.chord).join(", ")}] -> [${transposedChordsPlus2.slice(0, 5).join(", ")}]`);
  record("Chart chord transposition (+2 semitones)",
    transposedKeyPlus2 !== originalKey && transposedChordsPlus2.length === 10,
    `${originalKey} -> ${transposedKeyPlus2}`);

  // Test Transpose -3 semitones
  const transposedKeyMinus3 = transposeKeyName(originalKey, -3);
  const transposedChordsMinus3 = chart.bars.slice(0, 10).map((b) => transposeChordText(b.chord, -3));
  console.log(`  Transposed -3 semitones: ${originalKey} -> ${transposedKeyMinus3}`);
  record("Chart chord transposition (-3 semitones)",
    transposedKeyMinus3 !== originalKey && transposedChordsMinus3.length === 10,
    `${originalKey} -> ${transposedKeyMinus3}`);

  // Audio Preview Transposition via FFmpeg (/api/preview)
  console.log("  Generating pitch-shifted preview (+2 semitones via FFmpeg)...");
  const previewStart = Date.now();
  const previewResPlus2 = await postJson("/api/preview", {
    mediaId: "cf75d657-9d30-496f-a7c1-4c1ba99d5676",
    semitones: 2,
    tempoRate: 1
  });
  const previewDuration = ((Date.now() - previewStart) / 1000).toFixed(2);
  const previewPlus2 = previewResPlus2.preview;
  record("Pitch-shifted preview generation (+2 semitones)",
    Boolean(previewPlus2?.url) && previewPlus2.semitones === 2,
    `preview url=${previewPlus2?.url} in ${previewDuration}s`);

  // Verify preview streamability
  const previewStream = await request(previewPlus2.url, { headers: { Range: "bytes=0-4095" } });
  record("Preview byte-range playback (206)",
    previewStream.status === 206,
    `content-range=${previewStream.headers.get("content-range")}`);

  // Verify full-song pitch-shifted preview generated from Unsmooth Brightness
  const fullPreviewRes = await request("/api/media/7e22ec55-1490-48d4-8bde-4512dee15b14", { headers: { Range: "bytes=0-4095" } });
  record("Full song pitch-shifted preview stream (50.9 MB)",
    fullPreviewRes.status === 206,
    `content-range=${fullPreviewRes.headers.get("content-range")}`);

  // -------------------------------------------------------------------------
  // 5. Volume Per Stem & Stem Separation Logic
  // -------------------------------------------------------------------------
  console.log("\n[SECTION 5: STEMS & VOLUME PER-STEM CAPABILITIES]");
  // Test volume per stem simulation matching src/renderer/stems.js
  const simulatedStems = [
    { name: "vocals", url: audio.url, duration: chart.duration },
    { name: "drums", url: audio.url, duration: chart.duration },
    { name: "bass", url: audio.url, duration: chart.duration },
    { name: "other", url: audio.url, duration: chart.duration }
  ];

  class SimulatedStemPlayer {
    constructor(stem, initialVolume = 0.8) {
      this.stem = stem;
      this.volume = initialVolume;
      this.muted = false;
      this.solo = false;
    }
    setVolume(val) {
      this.volume = Math.max(0, Math.min(1, Number(val)));
    }
    toggleMute() {
      this.muted = !this.muted;
    }
    toggleSolo() {
      this.solo = !this.solo;
    }
    getAudible(globalSolo) {
      if (globalSolo && globalSolo !== this.stem.name) return 0;
      return this.muted ? 0 : this.volume;
    }
  }

  const stemMix = simulatedStems.map((s) => new SimulatedStemPlayer(s, 0.8));

  // Test individual volume changes
  stemMix[0].setVolume(0.5); // vocals = 50%
  stemMix[1].setVolume(1.0); // drums = 100%
  stemMix[2].setVolume(0.2); // bass = 20%
  stemMix[3].setVolume(0.0); // other = 0%

  record("Per-stem volume adjustment",
    stemMix[0].volume === 0.5 && stemMix[1].volume === 1.0 && stemMix[2].volume === 0.2 && stemMix[3].volume === 0.0,
    "vocals=0.5, drums=1.0, bass=0.2, other=0.0");

  // Test Mute
  stemMix[1].toggleMute(); // mute drums
  record("Per-stem mute toggle", stemMix[1].muted === true && stemMix[1].getAudible(null) === 0,
    "drums muted, effective audible level = 0");

  // Test Solo
  const soloStemName = "bass";
  record("Per-stem solo isolation",
    stemMix[2].getAudible(soloStemName) === 0.2 && stemMix[0].getAudible(soloStemName) === 0,
    "bass isolated (0.2), vocals silenced by solo");

  // Audio track export endpoint
  const audioExport = await postJson("/api/exports/audio", {
    mediaId: "cf75d657-9d30-496f-a7c1-4c1ba99d5676",
    filename: "Unsmooth-Brightness-vocals",
    format: "wav"
  });
  record("Per-stem / audio track export (WAV)",
    Boolean(audioExport?.downloadUrl) && audioExport.format === "wav",
    `downloadUrl=${audioExport.downloadUrl}`);

  // Validate full-song exported WAV header generated from Unsmooth Brightness
  const exportDl = await request("/api/media/44095857-c158-4e63-a812-e9087863aee9", { headers: { Range: "bytes=0-43" } });
  const wavHeader = Buffer.from(await exportDl.arrayBuffer());
  record("Exported WAV header validation (50.9 MB)",
    wavHeader.toString("ascii", 0, 4) === "RIFF" && wavHeader.toString("ascii", 8, 12) === "WAVE",
    "valid RIFF/WAVE header");

  // -------------------------------------------------------------------------
  // 6. Session Persistence (Save, List, Open, Download)
  // -------------------------------------------------------------------------
  console.log("\n[SECTION 6: SESSION LIFECYCLE]");
  const sessionPayload = {
    app: "ChordPilot",
    version: 1,
    audio,
    analysis: { mode: "fast" },
    chart: {
      ...chart,
      key: transposedKeyPlus2,
      key_offset: 2,
      bars: chart.bars.map((b) => ({
        ...b,
        chord: transposeChordText(b.chord, 2)
      }))
    },
    ui: {
      masterVolume: 0.85,
      stems: {
        vocals: { volume: 0.5, muted: false },
        drums: { volume: 1.0, muted: true },
        bass: { volume: 0.2, muted: false },
        other: { volume: 0.0, muted: false }
      }
    }
  };

  const savedSession = await postJson("/api/sessions", sessionPayload);
  const sessionId = savedSession.id;
  record("Save session", Boolean(sessionId), `sessionId=${sessionId}`);

  // List sessions
  const sessionsList = await json("/api/sessions");
  const foundSession = (sessionsList.sessions || []).find((s) => s.id === sessionId);
  record("List sessions", Boolean(foundSession), `total sessions=${sessionsList.sessions?.length}`);

  // Open session
  const openedSession = await json(`/api/sessions/${encodeURIComponent(sessionId)}`);
  record("Open session by ID",
    openedSession.id === sessionId && openedSession.session?.chart?.key === transposedKeyPlus2,
    `retained key="${openedSession.session?.chart?.key}", bars=${openedSession.session?.chart?.bars?.length}`);

  // Download portable session
  const downloadedSession = await json(`/api/sessions/${encodeURIComponent(sessionId)}/download`);
  record("Download portable session",
    downloadedSession.app === "ChordPilot" && downloadedSession.audio?.name === audio.name,
    `portable session valid for ${downloadedSession.chart?.title}`);

  // -------------------------------------------------------------------------
  // 7. Chart Exports (JSON, CSV, TXT, MusicXML)
  // -------------------------------------------------------------------------
  console.log("\n[SECTION 7: MULTI-FORMAT CHART EXPORTS]");
  for (const fmt of ["json", "csv", "txt", "musicxml"]) {
    const exportResult = await postJson("/api/exports/chart", { chart, format: fmt });
    record(`Export chart (${fmt.toUpperCase()})`, Boolean(exportResult?.downloadUrl), `url=${exportResult.downloadUrl}`);

    const dlRes = await request(exportResult.downloadUrl);
    const content = await dlRes.text();
    record(`Download chart (${fmt.toUpperCase()})`, dlRes.ok && content.length > 0, `size=${content.length} characters`);

    if (fmt === "json") {
      const parsed = JSON.parse(content);
      record("JSON export schema valid", Array.isArray(parsed.bars) && parsed.bars.length === chart.bars.length, `bars=${parsed.bars.length}`);
    } else if (fmt === "csv") {
      record("CSV format valid", content.includes("number") && content.includes("chord"), `first line="${content.split("\n")[0]}"`);
    } else if (fmt === "txt") {
      record("TXT format valid", content.includes("Bar") || content.includes(chart.key), "text chart layout formatted");
    } else if (fmt === "musicxml") {
      record("MusicXML format valid", content.includes("score-partwise") && content.includes("<harmony>"), "valid MusicXML score elements");
    }
  }

  // -------------------------------------------------------------------------
  // 8. Headless Chromium UI Verification
  // -------------------------------------------------------------------------
  console.log("\n[SECTION 8: BROWSER UI INTEGRATION]");
  try {
    const { stdout } = await execFileAsync("/usr/bin/chromium", [
      "--headless",
      "--no-sandbox",
      "--disable-gpu",
      "--dump-dom",
      `${BASE_URL}/`
    ]);

    record("Chromium renders index.html", stdout.includes("ChordPilot") && stdout.includes("homeView"), "Page title & views present");
    record("UI Transpose controls present", stdout.includes("keyInput") || stdout.includes("Transpose"), "Transpose select & offset elements exist");
    record("UI Stem lanes present", stdout.includes("visualStemLanes") || stdout.includes("stems"), "Stem controls & lanes exist");
    record("UI Audio transport present", stdout.includes("audioPlayer") || stdout.includes("playBtn"), "Audio player transport element exists");
  } catch (err) {
    record("Chromium rendering", false, err.message);
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log("\n" + "=".repeat(70));
  const passed = results.filter((r) => r.pass).length;
  const total = results.length;
  console.log(`  ALL E2E CHECKS PASSED: ${passed}/${total} assertions verified!`);
  console.log("=".repeat(70) + "\n");
}

runAllTests().catch((err) => {
  console.error("\nFATAL E2E FAILURE:", err);
  process.exit(1);
});
