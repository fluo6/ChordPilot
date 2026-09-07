# ChordPilot LAN Web Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the complete ChordPilot workflow in a browser on another trusted-LAN computer with `docker compose up -d --build`, while preserving the Electron desktop runtime.

**Architecture:** Extract Electron-independent audio/backend operations into a shared CommonJS service factory, then place a same-origin Node web adapter around those services. The browser uses an HTTP/SSE implementation of the existing `window.chordPilot` contract; opaque storage IDs and a named Docker volume keep container paths private and persistent.

**Tech Stack:** Node.js 22, CommonJS, Node test runner, Express 5, Multer 2, Server-Sent Events, Python 3.11, ffmpeg, yt-dlp, librosa/SciPy, CPU Demucs, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-08-31-chordpilot-lan-web-runtime-design.md`

## Global Constraints

- Keep all existing Electron IPC channel names and preload method signatures stable.
- Bind the container to port `3000`; publish `${CHORDPILOT_PORT:-2712}:3000` on all host interfaces.
- Store all mutable web state beneath `CHORDPILOT_DATA_ROOT`, defaulting to `/data` in Docker.
- Default the maximum upload size to 512 MiB and allow `mp3`, `wav`, `aif`, `aiff`, `flac`, and `m4a`.
- Use opaque generated IDs at every browser/filesystem boundary; never accept an absolute or relative server path from a browser request.
- Serialize CPU-heavy work with one worker.
- Disable runtime Demucs installation in Docker with `CHORDPILOT_AUTO_INSTALL_DEMUCS=0`.
- Keep the service unauthenticated and document it as trusted-LAN-only.
- Use temporary filenames plus atomic rename for uploads and generated artifacts.
- Preserve the session schema version and normalize only runtime-specific media references at adapter boundaries.

## File Structure

- `backend/chordpilot_cache.py`: honor an explicit persistent analysis-cache root.
- `src/runtime/chordpilot-services.js`: Electron-independent metadata, process, preview, analysis, export, session-file, and cleanup services.
- `src/main/main.js`: Electron windows, dialogs, IPC registration, and translation to shared services only.
- `src/web/storage.js`: opaque media/session IDs, containment, metadata records, atomic writes, and session normalization.
- `src/web/work-queue.js`: one-worker FIFO queue and process/log lifecycle bookkeeping.
- `src/web/http-errors.js`: stable API error type, JSON error middleware, body limits, and async route wrapper.
- `src/web/app.js`: Express application factory, static assets, health, SSE, media, upload, operation, session, and export routes.
- `src/web/server.js`: environment parsing, service composition, listen/shutdown lifecycle.
- `src/renderer/web-session-dialog.js`: accessible stored-session chooser and session-file import UI.
- `src/renderer/web-bridge.js`: browser implementation of every preload bridge method.
- `src/renderer/index.html`: load the browser bridge before existing renderer scripts and host the session dialog.
- `src/renderer/styles.css`: session dialog presentation and responsive behavior.
- `requirements-web.in` / `requirements-web.txt`: direct Python constraints and generated fully pinned container lock.
- `Dockerfile`, `docker-compose.yml`, `.dockerignore`: LAN runtime packaging, persistence, published port, and health check.
- `scripts/testing/web-smoke.mjs`: generated-WAV end-to-end HTTP smoke flow.
- `tests/js/runtime-services.test.js`: shared-service regression tests.
- `tests/js/web-storage.test.js`: storage isolation and session normalization tests.
- `tests/js/web-work-queue.test.js`: serialization and log broker tests.
- `tests/js/web-app.test.js`: HTTP integration coverage with mocked expensive services.
- `tests/js/web-bridge.test.js`: browser bridge and session-dialog behavior.

---

### Task 1: Persistent Python Cache Root

**Files:**
- Modify: `backend/chordpilot_cache.py:1-7`
- Test: `tests/python/test_cache_audio_stems.py`

**Interfaces:**
- Consumes: environment variable `CHORDPILOT_CACHE_DIR`.
- Produces: `cache_root() -> pathlib.Path`, using the configured absolute directory when set and the current temporary-directory default otherwise.

- [ ] **Step 1: Write the failing cache-root tests**

Add these cases to `CacheAudioStemTests`:

```python
def test_cache_root_uses_configured_directory(self):
    with tempfile.TemporaryDirectory() as directory:
        configured = Path(directory) / "persistent-cache"
        with patch.dict(os.environ, {"CHORDPILOT_CACHE_DIR": str(configured)}):
            self.assertEqual(cache.cache_root(), configured)
            self.assertTrue(configured.is_dir())

def test_cache_root_keeps_temp_default_without_environment(self):
    with patch.dict(os.environ, {}, clear=True):
        root = cache.cache_root()
    self.assertEqual(root, Path(tempfile.gettempdir()) / "ChordPilot")
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `python3 -m unittest tests.python.test_cache_audio_stems.CacheAudioStemTests.test_cache_root_uses_configured_directory -v`

Expected: FAIL because `cache_root()` ignores `CHORDPILOT_CACHE_DIR`.

- [ ] **Step 3: Implement the environment override**

Replace `cache_root` with:

```python
def cache_root() -> Path:
    configured = os.environ.get("CHORDPILOT_CACHE_DIR", "").strip()
    root = Path(configured).expanduser() if configured else Path(tempfile.gettempdir()) / "ChordPilot"
    root.mkdir(parents=True, exist_ok=True)
    return root
```

- [ ] **Step 4: Run Python cache and full backend tests**

Run: `python3 -m unittest tests.python.test_cache_audio_stems -v`

Expected: PASS.

Run: `npm run test:python`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/chordpilot_cache.py tests/python/test_cache_audio_stems.py
git commit -m "feat: make analysis cache location configurable"
```

### Task 2: Shared Runtime Service Factory and Electron Regression

**Files:**
- Create: `src/runtime/chordpilot-services.js`
- Modify: `src/main/main.js:1-950`
- Test: `tests/js/runtime-services.test.js`

**Interfaces:**
- Consumes: `createChordPilotServices({ appRoot, backendScript, tempDir, coverDir, importDir, previewDir, pythonCandidates, ffmpegPath, ytDlpPath, env, toUrl, emitLog, spawnImpl, httpsGet })`.
- Produces: `{ buildAudioPayload, downloadYoutubeAudio, lookupAudioMetadata, processAudioPreview, exportAudioTrack, analyze, exportChart, readSessionFile, writeSessionFile, enrichChartPayload, cleanup }`.
- `exportAudioTrack({ sourcePath, outputPath, format }) -> Promise<{ path, format }>` performs conversion only; Electron remains responsible for choosing `outputPath`.
- `exportChart({ chart, format, outputPath }) -> Promise<object>` writes a temporary chart input, calls Python, and removes the input in `finally`.

- [ ] **Step 1: Write failing service contract tests**

Create `tests/js/runtime-services.test.js` with tests that inject a fake `spawnImpl` and temporary directories:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createChordPilotServices, buildAudioPreviewFilter, normalizeYoutubeUrl } = require("../../src/runtime/chordpilot-services");

test("preview filters clamp tempo and preserve pitch", () => {
  assert.match(buildAudioPreviewFilter(2, 1.25), /asetrate=/);
  assert.match(buildAudioPreviewFilter(0, 9), /atempo=2/);
});

test("YouTube URLs reject non-YouTube hosts", () => {
  assert.throws(() => normalizeYoutubeUrl("https://example.com/watch?v=x"), /Only YouTube/);
});

test("session file operations round-trip JSON without Electron", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "chordpilot-services-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const services = createChordPilotServices({
    appRoot: path.resolve(__dirname, "../.."),
    backendScript: path.resolve(__dirname, "../../backend/chordpilot.py"),
    tempDir: root,
    coverDir: path.join(root, "covers"),
    importDir: path.join(root, "imports"),
    previewDir: path.join(root, "previews"),
    pythonCandidates: [],
    ffmpegPath: "ffmpeg",
    ytDlpPath: "yt-dlp",
    env: {},
    toUrl: (value) => `test://${path.basename(value)}`,
    emitLog: () => {}
  });
  const filename = path.join(root, "session.json");
  await services.writeSessionFile(filename, { app: "ChordPilot", version: 1 });
  assert.equal((await services.readSessionFile(filename)).session.version, 1);
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `node --test tests/js/runtime-services.test.js`

Expected: FAIL because `src/runtime/chordpilot-services.js` does not exist.

- [ ] **Step 3: Extract the service factory**

Move the Electron-independent functions from `src/main/main.js` into the new module. Export the factory and these pure helpers for direct tests:

```js
module.exports = {
  createChordPilotServices,
  buildAudioPreviewFilter,
  normalizeYoutubeUrl,
  safeFileName,
  shouldShowBackendLog
};
```

Inside `createChordPilotServices`, create all configured directories once, track generated preview paths in a private `Set`, use injected `emitLog`, and use `spawnImpl || require("node:child_process").spawn`. Keep command execution as argument arrays. Do not import `electron` in this module.

- [ ] **Step 4: Reduce Electron main to adapter responsibilities**

In `src/main/main.js`, construct the service factory after Electron is ready. Keep window creation, platform candidate discovery, `dialog` calls, and IPC registration. Each IPC handler must translate native-dialog results into a service call; for example:

```js
ipcMain.handle("chart:analyze", async (_event, payload) => {
  const audioPath = typeof payload === "string" ? payload : payload.audioPath;
  const mode = typeof payload === "string" ? "fast" : payload.mode || "fast";
  const options = typeof payload === "string" ? {} : payload.options || {};
  return services.analyze({ audioPath, mode, options });
});
```

For audio/chart export and session save, keep `dialog.showSaveDialog` in this file and pass the selected path into `services.exportAudioTrack`, `services.exportChart`, or `services.writeSessionFile`. Call `services.cleanup()` from `before-quit`.

- [ ] **Step 5: Run service and renderer regression tests**

Run: `node --test tests/js/runtime-services.test.js tests/js/*.test.js`

Expected: all JavaScript tests PASS.

Run: `npm run test:python`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/runtime/chordpilot-services.js src/main/main.js tests/js/runtime-services.test.js
git commit -m "refactor: share ChordPilot runtime services"
```

### Task 3: Opaque Persistent Storage

**Files:**
- Create: `src/web/storage.js`
- Test: `tests/js/web-storage.test.js`

**Interfaces:**
- Consumes: `createStorage({ root, randomUUID, now })`.
- Produces: `initialize()`, `createTempPath(suffix)`, `commitMedia({ tempPath, originalName, kind })`, `registerExisting({ sourcePath, originalName, kind, copy })`, `resolveMedia(id)`, `publicMedia(id)`, `normalizeChart(chart)`, `normalizeSessionForStorage(session)`, `hydrateSession(session)`, `saveSession(session)`, `listSessions()`, `openSession(id)`, `importSession(tempPath)`.
- Media records are `{ id, kind, name, extension, size, path, url, createdAt }`; public records omit `path` and expose `/api/media/:id` as `url`.
- Session records use IDs matching `/^[a-f0-9-]{36}$/` and live at `<root>/sessions/<id>.json`.

- [ ] **Step 1: Write failing storage tests**

Create tests for initialization, atomic media commit, invalid IDs, containment, chart stem mapping, session persistence, and missing media. Include:

```js
test("resolveMedia rejects traversal instead of joining it", async (t) => {
  const { storage } = await makeStorage(t);
  assert.throws(() => storage.resolveMedia("../../etc/passwd"), /Invalid media ID/);
});

test("saved sessions contain IDs and hydrate public URLs", async (t) => {
  const { storage, root } = await makeStorage(t);
  const source = path.join(root, "tmp", "song.wav.part");
  fs.writeFileSync(source, "RIFF");
  const media = await storage.commitMedia({ tempPath: source, originalName: "song.wav", kind: "source" });
  const saved = await storage.saveSession({ app: "ChordPilot", version: 1, audio: media });
  assert.equal(saved.session.audio.id, media.id);
  assert.equal(saved.session.audio.path, undefined);
  assert.equal((await storage.openSession(saved.id)).session.audio.url, `/api/media/${media.id}`);
});
```

- [ ] **Step 2: Run the storage test to verify it fails**

Run: `node --test tests/js/web-storage.test.js`

Expected: FAIL because `src/web/storage.js` does not exist.

- [ ] **Step 3: Implement typed directories and containment**

Create `media`, `generated`, `sessions`, `cache`, and `tmp` beneath the resolved root. Validate UUIDs before lookup. Read metadata from `<directory>/<id>.json`; resolve its recorded basename within the typed directory and verify:

```js
function assertContained(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new StorageError("PATH_OUTSIDE_DATA_ROOT", "Stored file is outside the ChordPilot data root.");
  }
}
```

Write JSON and media to `.part` files, `fsync`/close them, then rename. Sanitize displayed/download names separately from actual UUID filenames.

- [ ] **Step 4: Implement chart and session normalization**

Convert source audio, covers, preview results, and `chart.stems.stems[*]` to media records at the web boundary. Persist `{ id, name, extension, kind }` references only. During hydration, set `exists: false` if a record is absent and otherwise add `url` plus the private `path` only to the server-side service request object.

- [ ] **Step 5: Run storage tests**

Run: `node --test tests/js/web-storage.test.js`

Expected: PASS, including traversal, missing-media, and atomic-write cases.

- [ ] **Step 6: Commit**

```bash
git add src/web/storage.js tests/js/web-storage.test.js
git commit -m "feat: add opaque persistent web storage"
```

### Task 4: Serial Work Queue and Log Broker

**Files:**
- Create: `src/web/work-queue.js`
- Test: `tests/js/web-work-queue.test.js`

**Interfaces:**
- Produces: `createSerialQueue({ onStateChange }) -> { enqueue(label, work), close(), state() }`.
- Produces: `createLogBroker() -> { publish(message), subscribe(listener), close() }`.
- `enqueue` rejects after `close()` with code `SERVER_SHUTTING_DOWN`; one queued work function runs at a time.

- [ ] **Step 1: Write failing queue and broker tests**

```js
test("serial queue never overlaps work", async () => {
  const queue = createSerialQueue();
  let active = 0;
  let maximum = 0;
  const work = () => queue.enqueue("analysis", async () => {
    active += 1;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 10));
    active -= 1;
  });
  await Promise.all([work(), work(), work()]);
  assert.equal(maximum, 1);
});

test("log broker unsubscribe stops delivery", () => {
  const broker = createLogBroker();
  const rows = [];
  const unsubscribe = broker.subscribe((message) => rows.push(message));
  broker.publish("one");
  unsubscribe();
  broker.publish("two");
  assert.deepEqual(rows, ["one"]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/js/web-work-queue.test.js`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the queue and broker**

Use a private promise tail for FIFO ordering, track `{ active, queued, closing }`, and ensure rejection in one work item does not poison later items. The broker stores listener functions in a `Set` and catches listener exceptions so one disconnected SSE client cannot interrupt publishing.

- [ ] **Step 4: Run queue tests**

Run: `node --test tests/js/web-work-queue.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/web/work-queue.js tests/js/web-work-queue.test.js
git commit -m "feat: serialize heavy web runtime jobs"
```

### Task 5: HTTP Foundation, Media Serving, and SSE

**Files:**
- Create: `src/web/http-errors.js`
- Create: `src/web/app.js`
- Modify: `package.json`
- Modify: `package-lock.json`
- Test: `tests/js/web-app.test.js`

**Interfaces:**
- Consumes: `createWebApp({ rendererRoot, storage, services, queue, logBroker, uploadLimitBytes })`.
- Produces: an Express application with `GET /api/health`, `GET /api/events`, `GET /api/media/:id`, and renderer static serving.
- Error body: `{ error: { code: string, message: string } }`.

- [ ] **Step 1: Add exact HTTP dependencies**

Run: `npm install express@5.1.0 multer@2.0.2`

Expected: `package.json` and `package-lock.json` add production dependencies.

- [ ] **Step 2: Write failing HTTP foundation tests**

Create a `startTestServer(t, overrides)` helper using `http.createServer(app).listen(0, "127.0.0.1")`. Add tests that assert:

```js
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
```

Also cover `index.html`, CSS MIME type, byte-range media response (`206`, `Content-Range`), invalid media ID, and one SSE log message.

- [ ] **Step 3: Run foundation tests to verify they fail**

Run: `node --test tests/js/web-app.test.js --test-name-pattern="health|unknown API|media|events|static"`

Expected: FAIL because the app modules do not exist.

- [ ] **Step 4: Implement HTTP errors and foundation routes**

Define:

```js
class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
```

Serve media using the resolved record and `res.sendFile` with `acceptRanges: true`, `Content-Disposition: inline`, and the sanitized filename. SSE responses send `event: log` plus JSON-encoded message data, a 20-second comment heartbeat, and unsubscribe on `req.close`. Serve renderer assets after `/api` routes; unknown `/api/*` returns JSON, while unknown non-API paths fall back to `index.html`.

Install `express.json({ limit: "10mb" })` only on JSON API routes. Convert Express body-parser syntax failures and Multer size failures into the stable error shape instead of returning HTML or stack traces.

- [ ] **Step 5: Run foundation tests**

Run: `node --test tests/js/web-app.test.js --test-name-pattern="health|unknown API|media|events|static"`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/web/http-errors.js src/web/app.js tests/js/web-app.test.js
git commit -m "feat: serve ChordPilot browser runtime"
```

### Task 6: Upload, Metadata, Import, Preview, and Analysis APIs

**Files:**
- Modify: `src/web/app.js`
- Modify: `src/web/storage.js`
- Test: `tests/js/web-app.test.js`

**Interfaces:**
- Produces: `POST /api/media/upload`, `POST /api/youtube`, `POST /api/metadata`, `POST /api/preview`, and `POST /api/analyze`.
- Upload uses multipart field `audio` and returns `{ audio: PublicMedia }`.
- Preview returns `{ preview: PublicMedia & { semitones, tempoRate } }`.
- Analyze accepts `{ mediaId, mode, options }` and returns `{ chart }` with public media IDs/URLs for stems.

- [ ] **Step 1: Write failing operation route tests**

Use injected service fakes and a real temporary storage root. Test upload extension/size rejection, successful upload, media-ID resolution before service calls, preview registration, analysis queue serialization, and stem mapping. A representative assertion:

```js
test("analysis resolves one media ID and hides returned stem paths", async (t) => {
  const calls = [];
  const runtime = await startTestServer(t, {
    services: {
      analyze: async (payload) => {
        calls.push(payload);
        return { title: "Song", bars: [], stems: { ok: true, stems: [{ name: "bass", path: runtime.stemPath }] } };
      }
    }
  });
  const media = await uploadFixture(runtime, "song.wav");
  const response = await postJson(runtime, "/api/analyze", { mediaId: media.id, mode: "fast", options: {} });
  assert.equal(calls[0].audioPath, runtime.storage.resolveMedia(media.id).path);
  assert.equal(response.chart.stems.stems[0].path, undefined);
  assert.match(response.chart.stems.stems[0].url, /^\/api\/media\//);
});
```

- [ ] **Step 2: Run operation tests to verify they fail**

Run: `node --test tests/js/web-app.test.js --test-name-pattern="upload|metadata|YouTube|preview|analysis"`

Expected: FAIL with route-not-found responses.

- [ ] **Step 3: Implement upload and lightweight operation routes**

Configure Multer disk storage into `storage.createTempPath(".part")`, limit one file to `uploadLimitBytes`, accept the six configured extensions, and remove the temp file on every error path. Commit the upload through storage before building its audio payload. For metadata, resolve `audio.id` to a server-side record and pass a copy with private `path` into services.

- [ ] **Step 4: Implement queued heavy operation routes**

Wrap YouTube import, preview, and analysis in `queue.enqueue(label, work)`. Register each generated/downloaded path with storage using `copy: false` only after the service promise resolves. Recursively map cover and stem paths into registered media references before sending JSON. Strip every `path` property in the public response.

- [ ] **Step 5: Run operation and storage tests**

Run: `node --test tests/js/web-app.test.js tests/js/web-storage.test.js`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/web/app.js src/web/storage.js tests/js/web-app.test.js
git commit -m "feat: expose web audio and analysis operations"
```

### Task 7: Session and Download APIs

**Files:**
- Modify: `src/web/app.js`
- Modify: `src/web/storage.js`
- Test: `tests/js/web-app.test.js`

**Interfaces:**
- Produces: `POST /api/sessions`, `GET /api/sessions`, `GET /api/sessions/:id`, `GET /api/sessions/:id/download`, `POST /api/sessions/import`, `POST /api/exports/chart`, and `POST /api/exports/audio`.
- Session save returns `{ id, path: id, session, downloadUrl }`; `path` remains an alias for the existing recent-session renderer field.
- Stored-session list returns newest first with `{ id, title, audioName, savedAt }`.
- Export responses return `{ downloadUrl, filename, format }` and use opaque generated-media IDs.

- [ ] **Step 1: Write failing session and export tests**

Cover session schema rejection, save/list/open ordering, import upload, missing source hydration, supported chart formats (`txt`, `csv`, `json`, `musicxml`), audio formats (`wav`, `mp3`, `flac`, `m4a`), unsupported format rejection, and response path redaction.

```js
test("session save returns an opaque recent-session path", async (t) => {
  const runtime = await startTestServer(t);
  const saved = await postJson(runtime, "/api/sessions", {
    app: "ChordPilot", version: 1, audio: null, chart: { title: "LAN Song", bars: [] }
  });
  assert.match(saved.path, /^[a-f0-9-]{36}$/);
  assert.equal(saved.path, saved.id);
  assert.match(saved.downloadUrl, new RegExp(`/api/sessions/${saved.id}/download$`));
});
```

- [ ] **Step 2: Run focused tests to verify they fail**

Run: `node --test tests/js/web-app.test.js --test-name-pattern="session|chart export|audio export"`

Expected: FAIL with route-not-found responses.

- [ ] **Step 3: Implement session routes**

Validate `app === "ChordPilot"`, `version === 1`, and object-shaped `chart`, `audio`, `analysis`, and `ui` fields when present. Save normalized JSON atomically. Import accepts multipart field `session`, enforces a 10 MiB limit, parses before commit, and removes its temp file. The download route sends the normalized portable JSON as `<safe-title>.chordpilot-session.json`.

- [ ] **Step 4: Implement export routes**

Resolve audio IDs before calling `services.exportAudioTrack`. Create destination `.part` paths inside `generated`, run the service through the queue, atomically register the completed result, and return its download URL. For charts, permit only the four known formats and generate the matching extension.

- [ ] **Step 5: Run all web integration tests**

Run: `node --test tests/js/web-app.test.js`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/web/app.js src/web/storage.js tests/js/web-app.test.js
git commit -m "feat: persist web sessions and exports"
```

### Task 8: Browser Bridge and Session Dialog

**Files:**
- Create: `src/renderer/web-session-dialog.js`
- Create: `src/renderer/web-bridge.js`
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/styles.css`
- Test: `tests/js/web-bridge.test.js`

**Interfaces:**
- Consumes: same-origin API endpoints from Tasks 5-7.
- Produces: every method currently exposed by `src/main/preload.js`, with identical arguments and promise result shapes.
- Produces: `window.chordPilotSessionDialog.choose({ sessions, onImport }) -> Promise<sessionId | importedResult | null>`.

- [ ] **Step 1: Write failing browser bridge tests**

Load both scripts with `tests/js/helpers/load-script.js` and fake `window`, `document`, `fetch`, `FormData`, `EventSource`, `Blob`, and `URL.createObjectURL`. Assert:

```js
test("analyze translates renderer audio references into media IDs", async () => {
  const calls = [];
  const bridge = loadWebBridge({ fetchJson: async (url, init) => { calls.push([url, JSON.parse(init.body)]); return { chart: { bars: [] } }; } });
  await bridge.analyze("6d11c6ec-76ce-4a9f-b874-bdfcf9c4213c", "fast", { known_key: "D" });
  assert.deepEqual(calls[0], ["/api/analyze", { mediaId: "6d11c6ec-76ce-4a9f-b874-bdfcf9c4213c", mode: "fast", options: { known_key: "D" } }]);
});

test("onBackendLog closes EventSource when unsubscribed", () => {
  const { bridge, eventSource } = loadWebBridge();
  const unsubscribe = bridge.onBackendLog(() => {});
  unsubscribe();
  assert.equal(eventSource.closed, true);
});
```

Also test upload cancellation, upload failure, browser download click/revoke, save-session result shape, stored-session selection, session import, and `showMessage` fallback.

- [ ] **Step 2: Run bridge tests to verify they fail**

Run: `node --test tests/js/web-bridge.test.js`

Expected: FAIL because the browser scripts do not exist.

- [ ] **Step 3: Implement shared browser request/download primitives**

Implement `requestJson(url, init)`, `pickFile(accept)`, `uploadFile(endpoint, field, file)`, and `downloadFrom(url, filename)`. `requestJson` must throw `new Error(payload.error.message)` on non-2xx responses. Derive a media ID from an audio object using `audio.id || audio.path`; web audio payloads set both `id` and `path` to the opaque ID so existing action code does not change.

- [ ] **Step 4: Implement the complete bridge**

Assign the bridge only when `window.chordPilot` is absent. Translate each preload method to the approved endpoint. `saveSession` first persists, then downloads from `downloadUrl`. Chart/audio exports download immediately and return `{ path: generatedId, format }`. Use one `EventSource("/api/events")` and parse JSON message data.

- [ ] **Step 5: Implement the accessible session dialog**

Add a native `<dialog id="webSessionDialog">` before renderer scripts. Render saved sessions as buttons with title, audio name, and saved time; include `Import Session`, `Cancel`, and an empty-state message. Trap the result through the dialog `close` event and restore focus. Keep the dialog hidden and unused in Electron.

Load scripts in this order:

```html
<script src="./web-session-dialog.js"></script>
<script src="./web-bridge.js"></script>
<script src="./state.js"></script>
```

- [ ] **Step 6: Run bridge and existing UI tests**

Run: `node --test tests/js/web-bridge.test.js tests/js/ui-utilities.test.js tests/js/*.test.js`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/web-session-dialog.js src/renderer/web-bridge.js src/renderer/index.html src/renderer/styles.css tests/js/web-bridge.test.js
git commit -m "feat: add full browser runtime bridge"
```

### Task 9: Web Server Composition and Graceful Shutdown

**Files:**
- Create: `src/web/server.js`
- Modify: `package.json`
- Modify: `tests/js/web-app.test.js`

**Interfaces:**
- Consumes: `PORT`, `CHORDPILOT_DATA_ROOT`, `CHORDPILOT_UPLOAD_LIMIT_BYTES`, `CHORDPILOT_PYTHON`, `CHORDPILOT_FFMPEG`, `CHORDPILOT_YTDLP`, and `CHORDPILOT_CACHE_DIR`.
- Produces: `createWebRuntime(env) -> { app, server, storage, services, queue, logBroker, start(), stop() }` and executable `node src/web/server.js`.

- [ ] **Step 1: Write failing runtime composition tests**

Test default parsing without calling `listen`, custom port/data/upload values, invalid numeric values, and idempotent shutdown. Assert that service `emitLog` publishes through the same broker used by SSE and that `stop()` closes the queue before the HTTP server.

- [ ] **Step 2: Run composition tests to verify they fail**

Run: `node --test tests/js/web-app.test.js --test-name-pattern="runtime composition|shutdown|environment"`

Expected: FAIL because `src/web/server.js` does not exist.

- [ ] **Step 3: Implement environment parsing and composition**

Use defaults:

```js
const config = {
  host: env.HOST || "0.0.0.0",
  port: positiveInteger(env.PORT, 3000),
  dataRoot: path.resolve(env.CHORDPILOT_DATA_ROOT || path.join(process.cwd(), ".chordpilot-data")),
  uploadLimitBytes: positiveInteger(env.CHORDPILOT_UPLOAD_LIMIT_BYTES, 512 * 1024 * 1024)
};
```

Set the Python child environment to include `CHORDPILOT_CACHE_DIR=<dataRoot>/cache`, `CHORDPILOT_AUTO_INSTALL_DEMUCS=0` when explicitly configured, and `TORCH_HOME=<dataRoot>/cache/torch`. Track active child processes through the shared service factory. On `SIGINT`/`SIGTERM`, close the queue, stop accepting HTTP connections, terminate managed children, close SSE clients, and resolve once.

- [ ] **Step 4: Add package scripts**

Add:

```json
"start:web": "node src/web/server.js",
"test:web": "node --test tests/js/web-*.test.js tests/js/runtime-services.test.js",
"smoke:web": "node scripts/testing/web-smoke.mjs"
```

- [ ] **Step 5: Run web and full tests**

Run: `npm run test:web`

Expected: PASS.

Run: `npm test`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/web/server.js package.json tests/js/web-app.test.js
git commit -m "feat: compose LAN web server runtime"
```

### Task 10: Container Image and Compose Stack

**Files:**
- Create: `requirements-web.in`
- Create: `requirements-web.txt`
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `.dockerignore`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces: image entry point `npm run start:web`, internal port `3000`, health endpoint `/api/health`, named volume `chordpilot-data`, and published port `${CHORDPILOT_PORT:-2712}`.

- [ ] **Step 1: Create direct Python constraints and compile a lock**

Create `requirements-web.in`:

```text
numpy>=2.0,<3
scipy>=1.14,<2
librosa>=0.11,<1
soundfile>=0.13,<1
music21==10.5.0
demucs==4.1.0
essentia==2.1b6.dev1389
yt-dlp[default]
```

Create an isolated Python 3.11 environment and generate a transitive lock:

```bash
python3.11 -m venv /tmp/chordpilot-requirements
/tmp/chordpilot-requirements/bin/pip install pip-tools
/tmp/chordpilot-requirements/bin/pip-compile --resolver=backtracking --generate-hashes --output-file=requirements-web.txt requirements-web.in
```

Expected: every resolved package in `requirements-web.txt` has an exact `==` version and hashes. Confirm `demucs`, CPU `torch`, `essentia`, `librosa`, `music21`, and `yt-dlp` are present. The selected Essentia pre-release is the release that supplies CPython 3.11 Linux wheels; do not replace it with the CPython 3.14-only latest build while this image remains on Python 3.11.

- [ ] **Step 2: Write the Dockerfile**

Use `node:22-bookworm-slim`, install `python3`, `python3-venv`, `ffmpeg`, `curl`, and `ca-certificates`, create `/opt/chordpilot-venv`, install the locked Python packages, run `npm ci --omit=dev`, copy app sources, create `/data`, and run as the non-root `node` user after assigning `/data` ownership. Set:

```dockerfile
ENV PATH="/opt/chordpilot-venv/bin:${PATH}" \
    PORT=3000 \
    CHORDPILOT_DATA_ROOT=/data \
    CHORDPILOT_PYTHON=/opt/chordpilot-venv/bin/python \
    CHORDPILOT_FFMPEG=/usr/bin/ffmpeg \
    CHORDPILOT_YTDLP=/opt/chordpilot-venv/bin/yt-dlp \
    CHORDPILOT_CACHE_DIR=/data/cache \
    CHORDPILOT_AUTO_INSTALL_DEMUCS=0 \
    TORCH_HOME=/data/cache/torch
```

Add a build-time import check for `numpy`, `scipy`, `librosa`, `soundfile`, `music21`, `essentia`, and `demucs` plus `ffmpeg -version` and `yt-dlp --version`.

- [ ] **Step 3: Write Compose and build-context files**

Create `docker-compose.yml`:

```yaml
services:
  chordpilot:
    build: .
    ports:
      - "${CHORDPILOT_PORT:-2712}:3000"
    restart: unless-stopped
    environment:
      CHORDPILOT_UPLOAD_LIMIT_BYTES: "${CHORDPILOT_UPLOAD_LIMIT_BYTES:-536870912}"
    volumes:
      - chordpilot-data:/data
    healthcheck:
      test: ["CMD", "curl", "--fail", "--silent", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 5s
      retries: 5
      start_period: 20s

volumes:
  chordpilot-data:
```

Exclude `.git`, `node_modules`, `dist`, `.chordpilot-data`, `__pycache__`, `.pytest_cache`, `.coverage`, and local media/session artifacts in `.dockerignore`.

- [ ] **Step 4: Validate Compose and build the image**

Run: `docker compose config`

Expected: exit 0, published port `2712`, target port `3000`, and named volume present.

Run: `docker compose build`

Expected: exit 0; dependency import checks PASS.

- [ ] **Step 5: Run container dependency checks**

Run:

```bash
docker compose run --rm chordpilot /opt/chordpilot-venv/bin/python -c "import demucs, essentia, librosa, music21, numpy, scipy, soundfile; print('python audio stack ok')"
docker compose run --rm chordpilot ffmpeg -version
docker compose run --rm chordpilot yt-dlp --version
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```bash
git add requirements-web.in requirements-web.txt Dockerfile docker-compose.yml .dockerignore package.json package-lock.json
git commit -m "build: add LAN Docker Compose stack"
```

### Task 11: End-to-End Smoke Test and LAN Documentation

**Files:**
- Create: `scripts/testing/web-smoke.mjs`
- Modify: `README.md`
- Test: `scripts/testing/web-smoke.mjs`

**Interfaces:**
- Consumes: `CHORDPILOT_WEB_URL`, defaulting to `http://127.0.0.1:2712`.
- Produces: deterministic smoke output for health, upload, fast analyze, session save/open, chart export/download, and media byte-range retrieval.

- [ ] **Step 1: Write the failing smoke script**

Generate a one-second mono 44.1 kHz PCM WAV with `Buffer` and no external fixture. The script must:

1. GET `/api/health` and require `{ ok: true }`.
2. multipart-upload `smoke.wav`.
3. POST `/api/analyze` in fast mode and require a non-empty `bars` array.
4. POST `/api/sessions`, then GET the returned session ID.
5. POST `/api/exports/chart` for JSON and download the result.
6. GET the source media with `Range: bytes=0-15` and require status `206` plus 16 bytes.
7. print `ChordPilot web smoke passed` and remove its local temporary file in `finally`.

Run: `node scripts/testing/web-smoke.mjs`

Expected before the container starts: FAIL with a connection error.

- [ ] **Step 2: Start the stack and wait for health**

Run: `docker compose up -d --build`

Expected: service starts.

Run: `docker compose ps`

Expected: `chordpilot` becomes `healthy`.

- [ ] **Step 3: Run the complete smoke and persistence check**

Run: `npm run smoke:web`

Expected: `ChordPilot web smoke passed`.

Run: `docker compose restart chordpilot`

Expected: service becomes healthy again.

Run the smoke script with a `--verify-existing-session` option that records its session ID before restart and confirms the same session is retrievable after restart.

Expected: persistence check PASS.

- [ ] **Step 4: Add LAN web instructions to README**

Document:

```bash
docker compose up -d --build
hostname -I
docker compose ps
docker compose logs -f chordpilot
docker compose down
CHORDPILOT_PORT=2713 docker compose up -d --build
```

State that another laptop opens `http://<host-ip>:2712`, the host firewall must allow the selected TCP port, and the service has no authentication. Explain that `docker compose down` preserves data while `docker compose down -v` intentionally deletes uploads, sessions, models, and caches. Note that CPU Demucs is slow and its first run downloads the selected model into the persistent volume.

- [ ] **Step 5: Run final verification**

Run: `npm test`

Expected: PASS.

Run: `npm run test:web`

Expected: PASS.

Run: `git diff --check`

Expected: no output.

Run: `docker compose config`

Expected: PASS.

Run: `docker compose ps`

Expected: service healthy and port `0.0.0.0:2712->3000/tcp` published.

Run: `npm run smoke:web`

Expected: `ChordPilot web smoke passed`.

- [ ] **Step 6: Commit**

```bash
git add scripts/testing/web-smoke.mjs README.md
git commit -m "docs: add LAN browser workflow and smoke test"
```

### Task 12: Final Compatibility and Security Audit

**Files:**
- Modify only files implicated by failing audit checks.
- Test: all suites and the running Compose service.

**Interfaces:**
- Consumes: completed Tasks 1-11.
- Produces: evidence that desktop compatibility, web path isolation, container health, and documented end-to-end behavior meet the spec.

- [ ] **Step 1: Audit browser path boundaries**

Run:

```bash
rg -n "req\.(body|params|query).*path|path\.join\([^\n]*req\." src/web
```

Expected: no route passes client-controlled paths to filesystem APIs. Every file lookup goes through an opaque ID and `storage.resolveMedia`/`storage.openSession`.

- [ ] **Step 2: Audit renderer bridge parity**

Compare method names:

```bash
rg -o "^[[:space:]]+[A-Za-z][A-Za-z0-9]+:" src/main/preload.js src/renderer/web-bridge.js
```

Expected: both bridges expose `chooseAudio`, `downloadYoutubeAudio`, `lookupMetadata`, `processAudio`, `exportAudioTrack`, `showMessage`, `analyze`, `exportChart`, `saveSession`, `openSession`, `openSessionPath`, and `onBackendLog`.

- [ ] **Step 3: Run clean full verification**

Run:

```bash
npm ci
npm test
npm run test:web
docker compose config
docker compose up -d --build
npm run smoke:web
docker compose ps
git diff --check
git status --short
```

Expected: tests and smoke PASS, Compose reports healthy, diff check is empty, and status contains only intentional task changes.

- [ ] **Step 4: Manually inspect service logs for leaks and runtime installs**

Run: `docker compose logs --no-color chordpilot`

Expected: no host/container absolute paths appear in HTTP error messages, no `pip install` occurs at runtime, and health/SSE requests do not emit stack traces.

- [ ] **Step 5: Record the LAN handoff**

Report the detected host LAN addresses from `hostname -I`, the configured URL, container health, smoke result, resource note for CPU Demucs, and the remaining user check: open the URL from the other laptop and confirm its firewall path.
