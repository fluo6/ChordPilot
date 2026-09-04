import fs from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);

const DEFAULT_WEB_URL = "http://127.0.0.1:2712";
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

function parseArguments(argv) {
  const options = { verifyExistingSession: null, stateFile: process.env.CHORDPILOT_SMOKE_STATE_FILE || null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--verify-existing-session" || argument === "--state-file") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${argument} requires a session ID or file path.`);
      }
      if (argument === "--verify-existing-session") options.verifyExistingSession = value;
      else options.stateFile = value;
      index += 1;
      continue;
    }
    if (argument === "--help") {
      console.log([
        "Usage: node scripts/testing/web-smoke.mjs [options]",
        "",
        "  --state-file <path>                  Record the created session ID for a restart check.",
        "  --verify-existing-session <id|path> Verify a saved session ID, or read it from a state file."
      ].join("\n"));
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function positiveInteger(value, fallback, name) {
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function webBaseUrl(value) {
  let parsed;
  try {
    parsed = new URL(value || DEFAULT_WEB_URL);
  } catch (_error) {
    throw new Error(`CHORDPILOT_WEB_URL is not a valid URL: ${value}`);
  }
  if (!new Set(["http:", "https:"]).has(parsed.protocol)) {
    throw new Error("CHORDPILOT_WEB_URL must use http:// or https://.");
  }
  return parsed.toString().replace(/\/$/, "");
}

function createWav() {
  const sampleRate = 44_100;
  const sampleCount = sampleRate;
  const channelCount = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const dataSize = sampleCount * channelCount * bytesPerSample;
  const wav = Buffer.alloc(44 + dataSize);

  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write("WAVE", 8, "ascii");
  wav.write("fmt ", 12, "ascii");
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(channelCount, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * channelCount * bytesPerSample, 28);
  wav.writeUInt16LE(channelCount * bytesPerSample, 32);
  wav.writeUInt16LE(bitsPerSample, 34);
  wav.write("data", 36, "ascii");
  wav.writeUInt32LE(dataSize, 40);

  for (let index = 0; index < sampleCount; index += 1) {
    const sample = Math.round(Math.sin((2 * Math.PI * 220 * index) / sampleRate) * 4_096);
    wav.writeInt16LE(sample, 44 + (index * bytesPerSample));
  }
  return wav;
}

function diagnosticBody(text) {
  if (!text) return "empty response body";
  try {
    const parsed = JSON.parse(text);
    if (parsed?.error?.code || parsed?.error?.message) {
      return [parsed.error.code, parsed.error.message].filter(Boolean).join(": ");
    }
    return JSON.stringify(parsed).slice(0, 500);
  } catch (_error) {
    return text.replace(/\s+/g, " ").trim().slice(0, 500);
  }
}

function createClient(baseUrl, timeoutMs) {
  try {
    const { Agent, setGlobalDispatcher } = require("undici");
    setGlobalDispatcher(new Agent({ headersTimeout: timeoutMs, bodyTimeout: timeoutMs, connectTimeout: timeoutMs }));
  } catch (_error) {
    // If undici is not available, default fetch behavior is retained.
  }

  async function request(route, { expectedStatuses = [200], ...options } = {}) {
    const url = new URL(route, `${baseUrl}/`).toString();
    const method = options.method || "GET";
    let response;
    try {
      response = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      const cause = error?.cause?.message ? ` (${error.cause.message})` : "";
      throw new Error(`${method} ${url} could not connect: ${error.message}${cause}`, { cause: error });
    }
    if (!expectedStatuses.includes(response.status)) {
      const body = await response.text();
      throw new Error(`${method} ${url} returned HTTP ${response.status}: ${diagnosticBody(body)}`);
    }
    return response;
  }

  async function json(route, options = {}) {
    const response = await request(route, options);
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch (_error) {
      throw new Error(`${options.method || "GET"} ${new URL(route, `${baseUrl}/`)} returned invalid JSON: ${diagnosticBody(text)}`);
    }
  }

  async function postJson(route, body) {
    return json(route, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  }

  return { request, json, postJson };
}

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

async function readSessionReference(reference) {
  if (UUID_PATTERN.test(reference)) return reference;
  const statePath = path.resolve(reference);
  let contents;
  try {
    contents = await fs.readFile(statePath, "utf8");
  } catch (error) {
    throw new Error(`Could not read smoke state file ${statePath}: ${error.message}`, { cause: error });
  }
  try {
    const state = JSON.parse(contents);
    requireValue(UUID_PATTERN.test(state?.sessionId), `Smoke state file ${statePath} does not contain a valid sessionId.`);
    return state.sessionId;
  } catch (error) {
    if (UUID_PATTERN.test(contents.trim())) return contents.trim();
    if (error.message.includes("does not contain")) throw error;
    throw new Error(`Smoke state file ${statePath} is not valid JSON or a session ID.`, { cause: error });
  }
}

async function writeStateFile(filename, sessionId, baseUrl) {
  const statePath = path.resolve(filename);
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(statePath, `${JSON.stringify({ sessionId, baseUrl }, null, 2)}\n`, { mode: 0o600 });
  return statePath;
}

async function verifyExistingSession(client, reference) {
  const sessionId = await readSessionReference(reference);
  const opened = await client.json(`/api/sessions/${encodeURIComponent(sessionId)}`);
  requireValue(opened?.id === sessionId, `Existing session response did not contain the requested session ID ${sessionId}.`);
  requireValue(opened?.session?.app === "ChordPilot" && opened.session.version === 1, "Existing session response has an incompatible schema.");
  console.log(`ChordPilot existing session verified: ${sessionId}`);
}

async function runSmoke(client, wavPath, options, baseUrl) {
  const health = await client.json("/api/health");
  requireValue(health?.ok === true, "Health response did not contain { ok: true }.");
  console.log("[smoke] health ok");

  const form = new FormData();
  form.append("audio", new Blob([await fs.readFile(wavPath)], { type: "audio/wav" }), "smoke.wav");
  const uploaded = await client.json("/api/media/upload", { method: "POST", body: form });
  const audio = uploaded?.audio;
  requireValue(UUID_PATTERN.test(audio?.id || ""), "Upload response did not contain a valid opaque audio ID.");
  requireValue(typeof audio?.url === "string" && audio.url.startsWith("/api/media/"), "Upload response did not contain a media URL.");
  console.log(`[smoke] upload ok (${audio.id})`);

  const analyzed = await client.postJson("/api/analyze", { mediaId: audio.id, mode: "fast", options: {} });
  const chart = analyzed?.chart;
  requireValue(Array.isArray(chart?.bars) && chart.bars.length > 0, "Fast analysis did not return a non-empty bars array.");
  console.log(`[smoke] fast analysis ok (${chart.bars.length} bars)`);

  const saved = await client.postJson("/api/sessions", {
    app: "ChordPilot",
    version: 1,
    audio,
    analysis: { mode: "fast" },
    chart,
    ui: {}
  });
  requireValue(UUID_PATTERN.test(saved?.id || ""), "Session save response did not contain a valid session ID.");
  const opened = await client.json(`/api/sessions/${encodeURIComponent(saved.id)}`);
  requireValue(opened?.id === saved.id, "Opening the saved session returned a different session ID.");
  requireValue(opened?.session?.audio?.id === audio.id, "Opened session did not retain the uploaded audio ID.");
  console.log(`[smoke] session save/open ok (${saved.id})`);

  const exported = await client.postJson("/api/exports/chart", { chart, format: "json" });
  requireValue(typeof exported?.downloadUrl === "string", "Chart export response did not contain a download URL.");
  const exportResponse = await client.request(exported.downloadUrl);
  const exportBytes = Buffer.from(await exportResponse.arrayBuffer());
  requireValue(exportBytes.length > 0, "Downloaded JSON chart export was empty.");
  try {
    JSON.parse(exportBytes.toString("utf8"));
  } catch (error) {
    throw new Error(`Downloaded chart export was not valid JSON: ${error.message}`, { cause: error });
  }
  console.log(`[smoke] JSON chart export/download ok (${exportBytes.length} bytes)`);

  const rangeResponse = await client.request(audio.url, {
    headers: { Range: "bytes=0-15" },
    expectedStatuses: [206]
  });
  const rangeBytes = Buffer.from(await rangeResponse.arrayBuffer());
  requireValue(rangeBytes.length === 16, `Media byte-range returned ${rangeBytes.length} bytes instead of 16.`);
  requireValue(/^bytes 0-15\//.test(rangeResponse.headers.get("content-range") || ""), "Media byte-range response had an invalid Content-Range header.");
  console.log("[smoke] media byte-range ok (16 bytes)");

  if (options.stateFile) {
    const statePath = await writeStateFile(options.stateFile, saved.id, baseUrl);
    console.log(`[smoke] persistence state written to ${statePath}`);
  }
  console.log(`ChordPilot smoke session: ${saved.id}`);
  console.log("ChordPilot web smoke passed");
}

async function cleanupTemporaryFiles(wavPath, temporaryDirectory) {
  const failures = [];
  for (const [label, target, options] of [
    ["WAV file", wavPath, { force: true }],
    ["temporary directory", temporaryDirectory, { recursive: true, force: true }]
  ]) {
    if (!target) continue;
    try {
      await fs.rm(target, options);
    } catch (error) {
      failures.push(`${label}: ${error.message}`);
    }
  }
  if (failures.length) {
    console.warn(`ChordPilot web smoke cleanup warning: ${failures.join("; ")}`);
  }
}

async function main() {
  let temporaryDirectory;
  let wavPath;
  try {
    const options = parseArguments(process.argv.slice(2));
    const baseUrl = webBaseUrl(process.env.CHORDPILOT_WEB_URL || DEFAULT_WEB_URL);
    const timeoutMs = positiveInteger(process.env.CHORDPILOT_SMOKE_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, "CHORDPILOT_SMOKE_TIMEOUT_MS");
    const client = createClient(baseUrl, timeoutMs);

    if (options.verifyExistingSession) {
      await verifyExistingSession(client, options.verifyExistingSession);
    } else {
      temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "chordpilot-web-smoke-"));
      wavPath = path.join(temporaryDirectory, "smoke.wav");
      await fs.writeFile(wavPath, createWav());
      await runSmoke(client, wavPath, options, baseUrl);
    }
  } finally {
    await cleanupTemporaryFiles(wavPath, temporaryDirectory);
  }
}

main().catch((error) => {
  console.error(`ChordPilot web smoke failed: ${error.message}`);
  process.exitCode = 1;
});
