const http = require("node:http");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { EventEmitter } = require("node:events");

const { createWebApp } = require("../../src/web/app");
const { createWebRuntime, parseWebEnvironment } = require("../../src/web/server");
const { createStorage } = require("../../src/web/storage");
const { createLogBroker, createSerialQueue } = require("../../src/web/work-queue");

async function startTestServer(t, overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "chordpilot-web-app-"));
  const rendererRoot = path.join(root, "renderer");
  fs.mkdirSync(rendererRoot);
  fs.writeFileSync(path.join(rendererRoot, "index.html"), "<!doctype html><title>ChordPilot test runtime</title>");
  fs.writeFileSync(path.join(rendererRoot, "styles.css"), "body { color: rebeccapurple; }");

  const storage = overrides.storage || createStorage({ root: path.join(root, "data") });
  await storage.initialize();
  const queue = overrides.queue || createSerialQueue();
  const logBroker = overrides.logBroker || createLogBroker();
  const app = createWebApp({
    rendererRoot,
    storage,
    services: overrides.services || {},
    queue,
    logBroker,
    uploadLimitBytes: overrides.uploadLimitBytes || 1024 * 1024
  });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  t.after(async () => {
    logBroker.close();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  });

  return { root, url: `http://127.0.0.1:${port}`, storage, queue, logBroker };
}

async function postJson(runtime, route, payload) {
  const response = await fetch(`${runtime.url}${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return { status: response.status, body: await response.json() };
}

async function uploadFixture(runtime, name = "song.wav", contents = "RIFF") {
  const form = new FormData();
  form.append("audio", new Blob([contents], { type: "audio/wav" }), name);
  const response = await fetch(`${runtime.url}/api/media/upload`, { method: "POST", body: form });
  assert.equal(response.status, 200);
  return (await response.json()).audio;
}

function completedChild(stdout = "{}") {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = { write() {}, end() {} };
  child.kill = () => true;
  queueMicrotask(() => {
    child.stdout.emit("data", Buffer.from(stdout));
    child.emit("close", 0);
  });
  return child;
}

async function unusedTcpPort() {
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

function openSse(url) {
  let resolveConnected;
  let rejectConnected;
  const connected = new Promise((resolve, reject) => {
    resolveConnected = resolve;
    rejectConnected = reject;
  });
  let resolveEvent;
  let rejectEvent;
  const event = new Promise((resolve, reject) => {
    resolveEvent = resolve;
    rejectEvent = reject;
  });
  event.catch(() => {});
  let resolveClosed;
  const closed = new Promise((resolve) => {
    resolveClosed = resolve;
  });
  const request = http.get(url, { headers: { Accept: "text/event-stream" } });
  request.once("error", (error) => {
    rejectConnected(error);
    rejectEvent(error);
    resolveClosed();
  });
  request.once("response", (response) => {
    response.setEncoding("utf8");
    resolveConnected();
    response.once("close", resolveClosed);
    response.once("data", (chunk) => {
      request.destroy();
      resolveEvent({ headers: response.headers, chunk });
    });
    response.once("error", rejectEvent);
  });
  return { connected, event, closed, close: () => request.destroy() };
}

test("health reports queue and storage readiness", async (t) => {
  const runtime = await startTestServer(t);
  const response = await fetch(`${runtime.url}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, queue: { active: 0, queued: 0, closing: false } });
});

test("unknown API routes return stable JSON errors", async (t) => {
  const runtime = await startTestServer(t);
  const response = await fetch(`${runtime.url}/api/not-real`);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: { code: "NOT_FOUND", message: "API route not found." } });
});

test("malformed API JSON returns a stable JSON error", async (t) => {
  const runtime = await startTestServer(t);
  const response = await fetch(`${runtime.url}/api/not-real`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{"
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: { code: "INVALID_JSON", message: "Request body must be valid JSON." }
  });
});

test("API JSON over 10 MiB returns a stable JSON error", async (t) => {
  const runtime = await startTestServer(t);
  const response = await fetch(`${runtime.url}/api/not-real`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: `{"payload":"${"x".repeat((10 * 1024 * 1024) + 1)}"}`
  });

  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), {
    error: { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large." }
  });
});

test("static renderer assets serve index HTML and CSS with its MIME type", async (t) => {
  const runtime = await startTestServer(t);
  const index = await fetch(`${runtime.url}/`);
  const styles = await fetch(`${runtime.url}/styles.css`);
  const fallback = await fetch(`${runtime.url}/history-route`);

  assert.equal(index.status, 200);
  assert.match(await index.text(), /ChordPilot test runtime/);
  assert.equal(styles.status, 200);
  assert.match(styles.headers.get("content-type"), /^text\/css/);
  assert.match(await styles.text(), /rebeccapurple/);
  assert.match(await fallback.text(), /ChordPilot test runtime/);
});

test("media resolves opaque IDs and supports byte ranges", async (t) => {
  const runtime = await startTestServer(t);
  const tempPath = runtime.storage.createTempPath(".wav.part");
  fs.writeFileSync(tempPath, "RIFF");
  const media = await runtime.storage.commitMedia({ tempPath, originalName: "song.wav", kind: "source" });

  const response = await fetch(`${runtime.url}/api/media/${media.id}`, { headers: { Range: "bytes=1-2" } });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get("content-range"), "bytes 1-2/4");
  assert.equal(response.headers.get("content-disposition"), "inline; filename=\"song.wav\"");
  assert.equal(await response.text(), "IF");
});

test("media with a Unicode filename uses an ASCII-safe inline disposition", async (t) => {
  const runtime = await startTestServer(t);
  const tempPath = runtime.storage.createTempPath(".wav.part");
  fs.writeFileSync(tempPath, "RIFF");
  const media = await runtime.storage.commitMedia({
    tempPath,
    originalName: "song-🎸.wav",
    kind: "source"
  });

  const response = await fetch(`${runtime.url}/api/media/${media.id}`, { signal: AbortSignal.timeout(1_000) });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-disposition"), "inline; filename=\"song--.wav\"");
  assert.equal(await response.text(), "RIFF");
});

test("invalid media IDs use the stable JSON error shape", async (t) => {
  const runtime = await startTestServer(t);
  const response = await fetch(`${runtime.url}/api/media/not-an-id`);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: { code: "INVALID_MEDIA_ID", message: "Invalid media ID." } });
});

test("events stream log messages as server-sent events", async (t) => {
  const runtime = await startTestServer(t);
  const connection = openSse(`${runtime.url}/api/events`);
  await connection.connected;
  runtime.logBroker.publish({ level: "info", message: "ready" });

  const received = await connection.event;
  assert.match(received.headers["content-type"], /^text\/event-stream/);
  assert.equal(received.chunk, "event: log\ndata: {\"level\":\"info\",\"message\":\"ready\"}\n\n");
});

test("events unsubscribe the log listener when the client disconnects", async (t) => {
  const listeners = new Set();
  const logBroker = {
    publish(message) {
      for (const listener of listeners) listener(message);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close() {
      listeners.clear();
    }
  };
  const runtime = await startTestServer(t, { logBroker });
  const connection = openSse(`${runtime.url}/api/events`);
  await connection.connected;
  assert.equal(listeners.size, 1);

  connection.close();
  await connection.closed;
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(listeners.size, 0);
});

test("upload rejects unsupported audio extensions and files over the configured limit", async (t) => {
  const runtime = await startTestServer(t, { uploadLimitBytes: 4 });
  const unsupported = new FormData();
  unsupported.append("audio", new Blob(["RIFF"]), "song.txt");
  const unsupportedResponse = await fetch(`${runtime.url}/api/media/upload`, { method: "POST", body: unsupported });
  assert.equal(unsupportedResponse.status, 400);
  assert.deepEqual(await unsupportedResponse.json(), {
    error: { code: "UNSUPPORTED_AUDIO_FORMAT", message: "Upload an MP3, WAV, FLAC, M4A, AAC, or OGG audio file." }
  });

  const oversized = new FormData();
  oversized.append("audio", new Blob(["RIFF!"]), "song.wav");
  const oversizedResponse = await fetch(`${runtime.url}/api/media/upload`, { method: "POST", body: oversized });
  assert.equal(oversizedResponse.status, 413);
  assert.deepEqual(await oversizedResponse.json(), {
    error: { code: "FILE_TOO_LARGE", message: "Uploaded file is too large." }
  });
  assert.deepEqual(fs.readdirSync(path.join(runtime.root, "data", "tmp")), []);
});

test("upload commits audio before building a public audio response", async (t) => {
  const calls = [];
  const runtime = await startTestServer(t, {
    services: {
      buildAudioPayload: async (audioPath) => {
        calls.push(audioPath);
        return { path: audioPath, title: "Uploaded Song" };
      }
    }
  });

  const audio = await uploadFixture(runtime, "song.wav");
  assert.equal(calls[0], runtime.storage.resolveMedia(audio.id).path);
  assert.equal(audio.title, "Uploaded Song");
  assert.equal(audio.path, undefined);
  assert.match(audio.url, /^\/api\/media\//);
});

test("metadata resolves an audio ID to a private service record", async (t) => {
  const calls = [];
  const runtime = await startTestServer(t, {
    services: {
      lookupAudioMetadata: async (audio) => {
        calls.push(audio);
        return { title: "Found Song", path: "/not-for-the-browser" };
      }
    }
  });
  const audio = await uploadFixture(runtime);

  const response = await postJson(runtime, "/api/metadata", { audio: { id: audio.id, title: "Client title" } });
  assert.equal(response.status, 200);
  assert.equal(calls[0].path, runtime.storage.resolveMedia(audio.id).path);
  assert.equal(response.body.metadata.title, "Found Song");
  assert.equal(response.body.metadata.path, undefined);
});

test("internal API errors use a stable envelope without filesystem paths", async (t) => {
  const runtime = await startTestServer(t, {
    services: {
      lookupAudioMetadata: async () => {
        throw new Error("Could not read /data/chordpilot/media/private-song.wav");
      }
    }
  });
  const audio = await uploadFixture(runtime);

  const response = await postJson(runtime, "/api/metadata", { audio: { id: audio.id } });
  assert.equal(response.status, 500);
  assert.deepEqual(response.body, {
    error: { code: "INTERNAL_ERROR", message: "An unexpected server error occurred." }
  });
  assert.equal(JSON.stringify(response.body).includes("/data/chordpilot"), false);
});

test("YouTube import queues the service result and registers cover media", async (t) => {
  const runtime = await startTestServer(t, {
    services: {
      downloadYoutubeAudio: async () => {
        const audioPath = path.join(runtime.root, "download.mp3");
        const coverPath = path.join(runtime.root, "cover.jpg");
        fs.writeFileSync(audioPath, "ID3");
        fs.writeFileSync(coverPath, "JPEG");
        return { path: audioPath, name: "download.mp3", title: "Downloaded", coverPath };
      }
    }
  });

  const response = await postJson(runtime, "/api/youtube", { url: "https://www.youtube.com/watch?v=abc" });
  assert.equal(response.status, 200);
  assert.equal(response.body.audio.title, "Downloaded");
  assert.equal(response.body.audio.path, undefined);
  assert.equal(response.body.audio.cover.path, undefined);
  assert.match(response.body.audio.cover.url, /^\/api\/media\//);
});

test("preview resolves its input media and registers the generated result", async (t) => {
  const calls = [];
  const runtime = await startTestServer(t, {
    services: {
      processAudioPreview: async (payload) => {
        calls.push(payload);
        const previewPath = path.join(runtime.root, "preview.wav");
        fs.writeFileSync(previewPath, "RIFF");
        return { path: previewPath, semitones: 3, tempoRate: 1.2 };
      }
    }
  });
  const audio = await uploadFixture(runtime);

  const response = await postJson(runtime, "/api/preview", { mediaId: audio.id, semitones: 3, tempoRate: 1.2 });
  assert.equal(response.status, 200);
  assert.equal(calls[0].audioPath, runtime.storage.resolveMedia(audio.id).path);
  assert.equal(response.body.preview.path, undefined);
  assert.equal(response.body.preview.semitones, 3);
  assert.equal(response.body.preview.tempoRate, 1.2);
  assert.match(response.body.preview.url, /^\/api\/media\//);
});

test("analysis serializes jobs and hides registered stem paths", async (t) => {
  const started = [];
  let releaseFirst;
  let markFirstStarted;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
  const firstStarted = new Promise((resolve) => { markFirstStarted = resolve; });
  const runtime = await startTestServer(t, {
    services: {
      analyze: async (payload) => {
        started.push(payload);
        if (started.length === 1) {
          markFirstStarted();
          await firstGate;
        }
        const stemPath = path.join(runtime.root, `stem-${started.length}.wav`);
        fs.writeFileSync(stemPath, "RIFF");
        return {
          title: "Song",
          bars: [],
          path: "/never-public",
          stems: {
            ok: true,
            directory: path.join(runtime.root, "analysis-cache"),
            stems: [{ name: "bass", path: stemPath }]
          }
        };
      }
    }
  });
  const audio = await uploadFixture(runtime);
  const first = postJson(runtime, "/api/analyze", { mediaId: audio.id, mode: "fast", options: {} });
  await firstStarted;
  const second = postJson(runtime, "/api/analyze", { mediaId: audio.id, mode: "fast", options: {} });
  while (runtime.queue.state().queued !== 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(started.length, 1);
  releaseFirst();

  const [firstResponse, secondResponse] = await Promise.all([first, second]);
  assert.equal(started[0].audioPath, runtime.storage.resolveMedia(audio.id).path);
  assert.equal(started.length, 2);
  for (const response of [firstResponse, secondResponse]) {
    assert.equal(response.status, 200);
    assert.equal(response.body.chart.path, undefined);
    assert.equal(response.body.chart.stems.directory, undefined);
    assert.equal(JSON.stringify(response.body).includes(path.join(runtime.root, "analysis-cache")), false);
    assert.equal(response.body.chart.stems.stems[0].path, undefined);
    assert.match(response.body.chart.stems.stems[0].url, /^\/api\/media\//);
  }
});

async function importSessionFixture(runtime, session, name = "session.chordpilot-session.json") {
  const form = new FormData();
  form.append("session", new Blob([JSON.stringify(session)], { type: "application/json" }), name);
  return fetch(`${runtime.url}/api/sessions/import`, { method: "POST", body: form });
}

test("session save rejects an incompatible portable session schema", async (t) => {
  const runtime = await startTestServer(t);

  for (const session of [
    { app: "Not ChordPilot", version: 1 },
    { app: "ChordPilot", version: 2 },
    { app: "ChordPilot", version: 1, chart: [] },
    { app: "ChordPilot", version: 1, audio: [] },
    { app: "ChordPilot", version: 1, analysis: [] },
    { app: "ChordPilot", version: 1, ui: [] }
  ]) {
    const response = await postJson(runtime, "/api/sessions", session);
    assert.equal(response.status, 400);
    assert.deepEqual(response.body, {
      error: { code: "INVALID_SESSION", message: "Session data is invalid." }
    });
  }
});

test("session save returns an opaque recent-session path and portable download", async (t) => {
  const runtime = await startTestServer(t);
  const response = await postJson(runtime, "/api/sessions", {
    app: "ChordPilot",
    version: 1,
    audio: null,
    chart: { title: "LAN Song", bars: [], path: "/private/chart.json" }
  });

  assert.equal(response.status, 200);
  const saved = response.body;
  assert.match(saved.path, /^[a-f0-9-]{36}$/);
  assert.equal(saved.path, saved.id);
  assert.match(saved.downloadUrl, new RegExp(`/api/sessions/${saved.id}/download$`));
  assert.equal(JSON.stringify(saved).includes("/private/chart.json"), false);

  const download = await fetch(`${runtime.url}${saved.downloadUrl}`);
  assert.equal(download.status, 200);
  assert.equal(download.headers.get("content-disposition"), "attachment; filename=\"LAN Song.chordpilot-session.json\"");
  assert.equal((await download.json()).chart.path, undefined);
});

test("stored sessions list newest first and opening hydrates a missing source safely", async (t) => {
  let tick = 0;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "chordpilot-web-session-order-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const storage = createStorage({
    root: path.join(root, "data"),
    now: () => `2026-09-01T00:00:0${++tick}.000Z`
  });
  const runtime = await startTestServer(t, { storage });
  const missingId = "11111111-1111-4111-8111-111111111111";
  const first = await postJson(runtime, "/api/sessions", {
    app: "ChordPilot", version: 1, chart: { title: "First", bars: [] }
  });
  const second = await postJson(runtime, "/api/sessions", {
    app: "ChordPilot", version: 1,
    audio: { id: missingId, name: "gone.wav", extension: "wav", kind: "source" },
    chart: { title: "Second", bars: [] }
  });

  const list = await fetch(`${runtime.url}/api/sessions`);
  assert.equal(list.status, 200);
  assert.deepEqual((await list.json()).sessions.map((item) => item.title), ["Second", "First"]);

  const opened = await fetch(`${runtime.url}/api/sessions/${second.body.id}`);
  assert.equal(opened.status, 200);
  const payload = await opened.json();
  assert.equal(payload.path, second.body.id);
  assert.equal(payload.session.audio.exists, false);
  assert.equal(payload.session.audio.path, undefined);
  assert.equal(JSON.stringify(payload).includes(path.join(root, "data")), false);
  assert.equal(first.status, 200);
});

test("session import validates portable JSON before saving and removes the temporary upload", async (t) => {
  const runtime = await startTestServer(t);
  const importedResponse = await importSessionFixture(runtime, {
    app: "ChordPilot", version: 1, chart: { title: "Imported", bars: [] }
  });
  assert.equal(importedResponse.status, 200);
  const imported = await importedResponse.json();
  assert.equal(imported.session.chart.title, "Imported");
  assert.deepEqual(fs.readdirSync(path.join(runtime.root, "data", "tmp")), []);

  const malformed = new FormData();
  malformed.append("session", new Blob(["{"], { type: "application/json" }), "broken.json");
  const malformedResponse = await fetch(`${runtime.url}/api/sessions/import`, { method: "POST", body: malformed });
  assert.equal(malformedResponse.status, 400);
  assert.deepEqual(await malformedResponse.json(), {
    error: { code: "INVALID_SESSION", message: "Session data is invalid." }
  });
  assert.deepEqual(fs.readdirSync(path.join(runtime.root, "data", "tmp")), []);
});

test("session save strips client filesystem paths while retaining opaque media references", async (t) => {
  const runtime = await startTestServer(t);
  const known = await uploadFixture(runtime, "known.wav", "KNOWN");
  const outsidePath = path.join(runtime.root, "outside.wav");
  const relativePath = path.relative(process.cwd(), outsidePath);
  const fileUri = `file://${outsidePath}`;
  const driveRelativeSource = "C:private";
  const driveRelativeFile = "D:secret";
  const unknownId = "11111111-1111-4111-8111-111111111111";
  const unknownCoverId = "22222222-2222-4222-8222-222222222222";
  fs.writeFileSync(outsidePath, "PRIVATE");

  const response = await postJson(runtime, "/api/sessions", {
    app: "ChordPilot",
    version: 1,
    audio: {
      id: known.id,
      path: outsidePath,
      source_path: relativePath,
      cover: { id: unknownCoverId, path: outsidePath, source_path: relativePath },
      coverPath: outsidePath
    },
    audioPreview: {
      id: unknownId,
      path: outsidePath,
      stems: { stems: [{ id: unknownId, path: outsidePath, source_path: outsidePath }] }
    },
    analysis: { source: driveRelativeSource },
    ui: { file: driveRelativeFile },
    chart: {
      bars: [{ evidence: { source: "confidence-model" } }],
      lyrics: { source: "manual transcription" },
      source: fileUri,
      file: relativePath,
      previewSourceUri: fileUri,
      src: relativePath,
      pathToAudio: outsidePath,
      fileLocation: relativePath,
      stems: { stems: [{ id: unknownId, path: outsidePath, source_path: outsidePath }] }
    }
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.session.audio.id, known.id);
  assert.equal(response.body.session.audio.url, `/api/media/${known.id}`);
  assert.equal(response.body.session.audio.cover.id, unknownCoverId);
  assert.equal(response.body.session.audio.cover.exists, false);
  assert.equal(response.body.session.audioPreview.id, unknownId);
  assert.equal(response.body.session.audioPreview.exists, false);
  assert.equal(response.body.session.chart.stems.stems[0].exists, false);
  assert.equal(response.body.session.chart.lyrics.source, "manual transcription");
  assert.equal(response.body.session.chart.bars[0].evidence.source, "confidence-model");
  assert.equal(response.body.session.chart.source, undefined);
  assert.equal(response.body.session.chart.file, undefined);
  assert.equal(response.body.session.chart.previewSourceUri, undefined);
  assert.equal(response.body.session.chart.src, undefined);
  assert.equal(response.body.session.chart.pathToAudio, undefined);
  assert.equal(response.body.session.chart.fileLocation, undefined);
  assert.equal(JSON.stringify(response.body).includes(outsidePath), false);
  assert.equal(JSON.stringify(response.body).includes(relativePath), false);
  assert.equal(JSON.stringify(response.body).includes(fileUri), false);
  assert.equal(JSON.stringify(response.body).includes(driveRelativeSource), false);
  assert.equal(JSON.stringify(response.body).includes(driveRelativeFile), false);
  assert.deepEqual(fs.readdirSync(path.join(runtime.root, "data", "generated")), []);
  assert.equal((await fetch(`${runtime.url}/api/media/${known.id}`)).status, 200);
  assert.equal(await (await fetch(`${runtime.url}/api/media/${known.id}`)).text(), "KNOWN");
  const list = await fetch(`${runtime.url}/api/sessions`);
  const opened = await fetch(`${runtime.url}/api/sessions/${response.body.id}`);
  const downloaded = await fetch(`${runtime.url}${response.body.downloadUrl}`);
  const listBody = await list.json();
  const openedBody = await opened.json();
  const downloadedBody = await downloaded.json();
  for (const payload of [listBody, openedBody, downloadedBody]) {
    assert.equal(JSON.stringify(payload).includes(outsidePath), false);
    assert.equal(JSON.stringify(payload).includes(relativePath), false);
    assert.equal(JSON.stringify(payload).includes(fileUri), false);
    assert.equal(JSON.stringify(payload).includes(driveRelativeSource), false);
    assert.equal(JSON.stringify(payload).includes(driveRelativeFile), false);
  }
  for (const session of [openedBody.session, downloadedBody]) {
    assert.equal(session.chart.lyrics.source, "manual transcription");
    assert.equal(session.chart.bars[0].evidence.source, "confidence-model");
  }
});

test("session import strips relative filesystem paths without importing their contents", async (t) => {
  const runtime = await startTestServer(t);
  const outsidePath = path.join(runtime.root, "outside.wav");
  const relativePath = path.relative(process.cwd(), outsidePath);
  const fileUri = `file://${outsidePath}`;
  const driveRelativeSource = "C:private";
  const driveRelativeFile = "D:secret";
  fs.writeFileSync(outsidePath, "PRIVATE");

  const response = await importSessionFixture(runtime, {
    app: "ChordPilot",
    version: 1,
    audio: { path: outsidePath, source_path: relativePath, coverPath: outsidePath },
    audioPreview: { path: outsidePath, source_path: relativePath, stems: { stems: [{ path: outsidePath, source_path: relativePath }] } },
    analysis: { source: driveRelativeSource },
    ui: { file: driveRelativeFile },
    chart: {
      bars: [{ evidence: { source: "confidence-model" } }],
      lyrics: { source: "manual transcription" },
      path: outsidePath,
      source: fileUri,
      file: relativePath,
      previewSourceUri: fileUri,
      src: relativePath,
      pathToAudio: outsidePath,
      fileLocation: relativePath,
      stems: { stems: [{ path: outsidePath, source_path: relativePath }] }
    }
  });

  assert.equal(response.status, 200);
  const imported = await response.json();
  assert.equal(imported.session.audio, null);
  assert.equal(imported.session.audioPreview.id, undefined);
  assert.equal(imported.session.chart.stems.stems[0].path, undefined);
  assert.equal(imported.session.chart.lyrics.source, "manual transcription");
  assert.equal(imported.session.chart.bars[0].evidence.source, "confidence-model");
  assert.equal(imported.session.chart.source, undefined);
  assert.equal(imported.session.chart.file, undefined);
  assert.equal(imported.session.chart.previewSourceUri, undefined);
  assert.equal(imported.session.chart.src, undefined);
  assert.equal(imported.session.chart.pathToAudio, undefined);
  assert.equal(imported.session.chart.fileLocation, undefined);
  assert.equal(JSON.stringify(imported).includes(relativePath), false);
  assert.equal(JSON.stringify(imported).includes(outsidePath), false);
  assert.equal(JSON.stringify(imported).includes(driveRelativeSource), false);
  assert.equal(JSON.stringify(imported).includes(driveRelativeFile), false);
  assert.deepEqual(fs.readdirSync(path.join(runtime.root, "data", "media")), []);
  assert.deepEqual(fs.readdirSync(path.join(runtime.root, "data", "generated")), []);
  const list = await fetch(`${runtime.url}/api/sessions`);
  const opened = await fetch(`${runtime.url}/api/sessions/${imported.id}`);
  const downloaded = await fetch(`${runtime.url}${imported.downloadUrl}`);
  const listBody = await list.json();
  const openedBody = await opened.json();
  const downloadedBody = await downloaded.json();
  for (const payload of [listBody, openedBody, downloadedBody]) {
    assert.equal(JSON.stringify(payload).includes(outsidePath), false);
    assert.equal(JSON.stringify(payload).includes(relativePath), false);
    assert.equal(JSON.stringify(payload).includes(fileUri), false);
    assert.equal(JSON.stringify(payload).includes(driveRelativeSource), false);
    assert.equal(JSON.stringify(payload).includes(driveRelativeFile), false);
  }
  for (const session of [openedBody.session, downloadedBody]) {
    assert.equal(session.chart.lyrics.source, "manual transcription");
    assert.equal(session.chart.bars[0].evidence.source, "confidence-model");
  }
});

test("session import rejects extra multipart fields with a stable session-upload error", async (t) => {
  const runtime = await startTestServer(t);
  const form = new FormData();
  form.append("session", new Blob([JSON.stringify({ app: "ChordPilot", version: 1 })]), "session.json");
  form.append("extra", "x".repeat(1024 * 1024));

  const response = await fetch(`${runtime.url}/api/sessions/import`, { method: "POST", body: form });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: { code: "INVALID_SESSION_UPLOAD", message: "Upload exactly one session file in the session field." }
  });
  assert.deepEqual(fs.readdirSync(path.join(runtime.root, "data", "tmp")), []);
});

test("chart export permits supported formats, queues generation, and returns an opaque download", async (t) => {
  const calls = [];
  const runtime = await startTestServer(t, {
    services: {
      exportChart: async ({ chart, format, outputPath }) => {
        calls.push({ chart, format, outputPath });
        fs.writeFileSync(outputPath, `chart:${format}`);
        return { path: outputPath, format };
      }
    }
  });

  for (const format of ["txt", "csv", "json", "musicxml"]) {
    const response = await postJson(runtime, "/api/exports/chart", {
      chart: { title: "Export Song", bars: [], path: "/private/chart.json" }, format
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.format, format);
    assert.match(response.body.downloadUrl, /^\/api\/media\/[a-f0-9-]{36}$/);
    assert.match(response.body.filename, new RegExp(`\\.${format}$`));
    assert.equal(JSON.stringify(response.body).includes("/private/chart.json"), false);
  }
  assert.equal(calls.length, 4);
  assert.equal(calls.every((call) => call.outputPath.startsWith(path.join(runtime.root, "data", "generated"))), true);
  assert.equal(calls.every((call) => call.outputPath.includes(".part.") && call.outputPath.endsWith(`.${call.format}`)), true);

  const unsupported = await postJson(runtime, "/api/exports/chart", { chart: { bars: [] }, format: "pdf" });
  assert.equal(unsupported.status, 400);
  assert.deepEqual(unsupported.body, {
    error: { code: "UNSUPPORTED_CHART_FORMAT", message: "Unsupported chart export format." }
  });
});

test("audio export resolves opaque sources and rejects unsupported formats without exposing paths", async (t) => {
  const calls = [];
  const runtime = await startTestServer(t, {
    services: {
      exportAudioTrack: async ({ sourcePath, outputPath, format }) => {
        calls.push({ sourcePath, outputPath, format });
        fs.writeFileSync(outputPath, `audio:${format}`);
        return { path: outputPath, format };
      }
    }
  });
  const audio = await uploadFixture(runtime, "source.wav");

  for (const format of ["wav", "mp3", "flac", "m4a"]) {
    const response = await postJson(runtime, "/api/exports/audio", { mediaId: audio.id, format });
    assert.equal(response.status, 200);
    assert.equal(response.body.format, format);
    assert.match(response.body.downloadUrl, /^\/api\/media\/[a-f0-9-]{36}$/);
    assert.match(response.body.filename, new RegExp(`\\.${format}$`));
    assert.equal(JSON.stringify(response.body).includes(runtime.root), false);
  }
  assert.equal(calls.length, 4);
  assert.equal(calls.every((call) => call.sourcePath === runtime.storage.resolveMedia(audio.id).path), true);
  assert.equal(calls.every((call) => call.outputPath.startsWith(path.join(runtime.root, "data", "generated"))), true);
  assert.equal(calls.every((call) => call.outputPath.includes(".part.") && call.outputPath.endsWith(`.${call.format}`)), true);

  const unsupported = await postJson(runtime, "/api/exports/audio", { mediaId: audio.id, format: "ogg" });
  assert.equal(unsupported.status, 400);
  assert.deepEqual(unsupported.body, {
    error: { code: "UNSUPPORTED_AUDIO_FORMAT", message: "Unsupported audio export format." }
  });
});

test("audio export removes a failed generated part file and redacts its service error", async (t) => {
  const runtime = await startTestServer(t, {
    services: {
      exportAudioTrack: async ({ outputPath }) => {
        fs.writeFileSync(outputPath, "partial audio");
        throw new Error(`ffmpeg could not write ${outputPath}`);
      }
    }
  });
  const audio = await uploadFixture(runtime, "source.wav");

  const response = await postJson(runtime, "/api/exports/audio", { mediaId: audio.id, format: "wav" });
  assert.equal(response.status, 500);
  assert.deepEqual(response.body, {
    error: { code: "INTERNAL_ERROR", message: "An unexpected server error occurred." }
  });
  assert.equal(JSON.stringify(response.body).includes(runtime.root), false);
  assert.deepEqual(fs.readdirSync(path.join(runtime.root, "data", "generated")), []);
});

test("environment defaults parse without starting the HTTP server", () => {
  const config = parseWebEnvironment({});

  assert.deepEqual(config, {
    host: "0.0.0.0",
    port: 3000,
    dataRoot: path.resolve(".chordpilot-data"),
    cacheDir: path.resolve(".chordpilot-data", "cache"),
    uploadLimitBytes: 512 * 1024 * 1024,
    pythonPath: "python3",
    ffmpegPath: "ffmpeg",
    ytDlpPath: "yt-dlp"
  });
});

test("runtime composition applies custom environment and shares backend logs", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "chordpilot-web-runtime-"));
  const dataRoot = path.join(root, "persistent-data");
  const calls = [];
  const runtime = createWebRuntime({
    HOST: "127.0.0.1",
    PORT: "43123",
    CHORDPILOT_DATA_ROOT: dataRoot,
    CHORDPILOT_UPLOAD_LIMIT_BYTES: "4096",
    CHORDPILOT_PYTHON: "configured-python",
    CHORDPILOT_FFMPEG: "configured-ffmpeg",
    CHORDPILOT_YTDLP: "configured-yt-dlp",
    CHORDPILOT_CACHE_DIR: path.join(dataRoot, "analysis-cache"),
    CHORDPILOT_AUTO_INSTALL_DEMUCS: "0"
  }, {
    spawnImpl(command, args, options) {
      calls.push({ command, args, options });
      return completedChild(JSON.stringify({ title: "Composed" }));
    }
  });
  t.after(async () => {
    await runtime.stop();
    fs.rmSync(root, { recursive: true, force: true });
  });

  assert.equal(runtime.server.listening, false);
  assert.deepEqual(runtime.config, {
    host: "127.0.0.1",
    port: 43123,
    dataRoot: path.resolve(dataRoot),
    cacheDir: path.resolve(dataRoot, "analysis-cache"),
    uploadLimitBytes: 4096,
    pythonPath: "configured-python",
    ffmpegPath: "configured-ffmpeg",
    ytDlpPath: "configured-yt-dlp"
  });
  for (const directory of ["media", "generated", "sessions", "cache", "tmp"]) {
    assert.equal(fs.statSync(path.join(dataRoot, directory)).isDirectory(), true);
  }

  const messages = [];
  const unsubscribe = runtime.logBroker.subscribe((message) => messages.push(message));
  const chart = await runtime.services.analyze({ audioPath: "/opaque/private/audio.wav", mode: "fast" });
  unsubscribe();

  assert.equal(chart.title, "Composed");
  assert.deepEqual(messages, ["backend: trying configured-python", "backend: complete"]);
  assert.equal(calls[0].command, "configured-python");
  assert.equal(calls[0].options.env.CHORDPILOT_CACHE_DIR, path.join(dataRoot, "analysis-cache"));
  assert.equal(calls[0].options.env.CHORDPILOT_AUTO_INSTALL_DEMUCS, "0");
  assert.equal(calls[0].options.env.CHORDPILOT_FFMPEG, "configured-ffmpeg");
  assert.equal(calls[0].options.env.TORCH_HOME, path.join(dataRoot, "analysis-cache", "torch"));
});

test("environment rejects invalid numeric values", () => {
  for (const [name, value] of [
    ["PORT", "0"],
    ["PORT", "65536"],
    ["PORT", "not-a-number"],
    ["CHORDPILOT_UPLOAD_LIMIT_BYTES", "-1"],
    ["CHORDPILOT_UPLOAD_LIMIT_BYTES", "1.5"]
  ]) {
    assert.throws(() => parseWebEnvironment({ [name]: value }), new RegExp(`${name} must be a positive integer`));
  }
});

test("shutdown is idempotent, closes the queue before HTTP, terminates children, and closes SSE", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "chordpilot-web-shutdown-"));
  const port = await unusedTcpPort();
  let childKillCount = 0;
  let child;
  const runtime = createWebRuntime({
    HOST: "127.0.0.1",
    PORT: String(port),
    CHORDPILOT_DATA_ROOT: path.join(root, "data"),
    CHORDPILOT_YTDLP: "managed-yt-dlp"
  }, {
    spawnImpl() {
      child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.stdin = { write() {}, end() {} };
      child.kill = () => {
        childKillCount += 1;
        queueMicrotask(() => child.emit("close", 143));
        return true;
      };
      return child;
    }
  });
  t.after(async () => {
    await runtime.stop();
    fs.rmSync(root, { recursive: true, force: true });
  });

  await runtime.start();
  const connection = openSse(`http://127.0.0.1:${port}/api/events`);
  await connection.connected;
  const childResult = runtime.services.downloadYoutubeAudio("https://youtu.be/managed-child").catch((error) => error);

  const lifecycle = [];
  const closeQueue = runtime.queue.close.bind(runtime.queue);
  runtime.queue.close = () => {
    lifecycle.push("queue");
    return closeQueue();
  };
  const closeServer = runtime.server.close.bind(runtime.server);
  runtime.server.close = (callback) => {
    lifecycle.push("server");
    return closeServer(callback);
  };

  const stopping = runtime.stop();
  assert.equal(runtime.stop(), stopping);
  await stopping;
  await connection.closed;
  const childError = await childResult;
  await runtime.stop();

  assert.deepEqual(lifecycle, ["queue", "server"]);
  assert.equal(childKillCount, 1);
  assert.equal(childError instanceof Error, true);
  assert.equal(runtime.queue.state().closing, true);
  assert.equal(runtime.server.listening, false);
});

test("shutdown escalates an uncooperative child from SIGTERM to SIGKILL", { timeout: 1_000 }, async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "chordpilot-web-child-escalation-"));
  const signals = [];
  let markSpawned;
  const spawned = new Promise((resolve) => { markSpawned = resolve; });
  const runtime = createWebRuntime({
    CHORDPILOT_DATA_ROOT: path.join(root, "data"),
    CHORDPILOT_YTDLP: "uncooperative-yt-dlp"
  }, {
    childShutdownGraceMs: 10,
    childShutdownKillWaitMs: 10,
    spawnImpl() {
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.stdin = { write() {}, end() {} };
      child.kill = (signal) => {
        signals.push(signal);
        return true;
      };
      markSpawned();
      return child;
    }
  });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const childWork = runtime.queue.enqueue(
    "uncooperative-child",
    () => runtime.services.downloadYoutubeAudio("https://youtu.be/uncooperative-child")
  );
  await spawned;
  const stopping = runtime.stop();
  const [childResult, stopResult] = await Promise.allSettled([childWork, stopping]);

  assert.deepEqual(signals, ["SIGTERM", "SIGKILL"]);
  assert.equal(childResult.status, "rejected");
  assert.equal(childResult.reason instanceof Error, true);
  assert.equal(stopResult.status, "fulfilled");
  assert.equal(runtime.stop(), stopping);
  assert.deepEqual(runtime.queue.state(), { active: 0, queued: 0, closing: true });
});

test("shutdown settles child work once when signalling throws synchronously", { timeout: 1_000 }, async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "chordpilot-web-child-signal-error-"));
  const signals = [];
  let errorEvents = 0;
  let markSpawned;
  const spawned = new Promise((resolve) => { markSpawned = resolve; });
  const runtime = createWebRuntime({
    CHORDPILOT_DATA_ROOT: path.join(root, "data"),
    CHORDPILOT_YTDLP: "throwing-yt-dlp"
  }, {
    childShutdownGraceMs: 10,
    childShutdownKillWaitMs: 10,
    spawnImpl() {
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.stdin = { write() {}, end() {} };
      const emit = child.emit.bind(child);
      child.emit = (event, ...args) => {
        if (event === "error") errorEvents += 1;
        return emit(event, ...args);
      };
      child.kill = (signal) => {
        signals.push(signal);
        throw new Error("kill failed synchronously");
      };
      markSpawned();
      return child;
    }
  });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const childWork = runtime.queue.enqueue(
    "throwing-child",
    () => runtime.services.downloadYoutubeAudio("https://youtu.be/throwing-child")
  );
  await spawned;
  const stopping = runtime.stop();
  const [childResult, stopResult] = await Promise.allSettled([childWork, stopping]);

  assert.deepEqual(signals, ["SIGTERM"]);
  assert.equal(errorEvents, 1);
  assert.equal(childResult.status, "rejected");
  assert.equal(childResult.reason instanceof Error, true);
  assert.equal(stopResult.status, "fulfilled");
  assert.deepEqual(runtime.queue.state(), { active: 0, queued: 0, closing: true });
  await runtime.queue.idle();
});

test("shutdown synchronizes with an in-flight start before it resolves", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "chordpilot-web-start-stop-"));
  const port = await unusedTcpPort();
  const runtime = createWebRuntime({
    HOST: "127.0.0.1",
    PORT: String(port),
    CHORDPILOT_DATA_ROOT: path.join(root, "data")
  });
  const listen = runtime.server.listen.bind(runtime.server);
  let releaseBind;
  runtime.server.listen = (...args) => {
    releaseBind = () => listen(...args);
    return runtime.server;
  };
  t.after(async () => {
    if (runtime.server.listening) {
      await new Promise((resolve) => runtime.server.close(resolve));
    }
    fs.rmSync(root, { recursive: true, force: true });
  });

  const starting = runtime.start();
  const stopping = runtime.stop();
  releaseBind();
  await Promise.all([starting, stopping]);

  assert.equal(runtime.server.listening, false);
});

test("shutdown cancels queued work and blocks delayed active work from spawning children", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "chordpilot-web-queued-shutdown-"));
  let spawnCount = 0;
  const runtime = createWebRuntime({
    CHORDPILOT_DATA_ROOT: path.join(root, "data"),
    CHORDPILOT_YTDLP: "managed-yt-dlp"
  }, {
    spawnImpl() {
      spawnCount += 1;
      return completedChild("");
    }
  });
  t.after(async () => {
    await runtime.stop();
    fs.rmSync(root, { recursive: true, force: true });
  });

  let releaseActive;
  const activeGate = new Promise((resolve) => { releaseActive = resolve; });
  const active = runtime.queue.enqueue("active", async () => {
    await activeGate;
    return runtime.services.downloadYoutubeAudio("https://youtu.be/active-child");
  });
  await new Promise((resolve) => setImmediate(resolve));
  const pending = runtime.queue.enqueue(
    "pending",
    () => runtime.services.downloadYoutubeAudio("https://youtu.be/pending-child")
  );

  let stopResolved = false;
  const stopping = runtime.stop().then(() => { stopResolved = true; });
  await new Promise((resolve) => setImmediate(resolve));
  const resolvedBeforeActiveSettled = stopResolved;
  releaseActive();
  const [activeResult, pendingResult, stopResult] = await Promise.allSettled([active, pending, stopping]);

  assert.equal(resolvedBeforeActiveSettled, false);
  assert.equal(activeResult.status, "rejected");
  assert.equal(activeResult.reason.code, "SERVER_SHUTTING_DOWN");
  assert.equal(pendingResult.status, "rejected");
  assert.equal(pendingResult.reason.code, "SERVER_SHUTTING_DOWN");
  assert.equal(stopResult.status, "fulfilled");
  assert.equal(spawnCount, 0);
  assert.deepEqual(runtime.queue.state(), { active: 0, queued: 0, closing: true });
});
