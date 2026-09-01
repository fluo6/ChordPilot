const http = require("node:http");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { createWebApp } = require("../../src/web/app");
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

  return { url: `http://127.0.0.1:${port}`, storage, logBroker };
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
