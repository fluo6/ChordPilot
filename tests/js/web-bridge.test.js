const assert = require("node:assert/strict");
const test = require("node:test");

const { loadScript, plain } = require("./helpers/load-script");

function response(payload, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: async () => payload,
    blob: async () => ({ payload })
  };
}

function makeElement(tagName = "div") {
  const listeners = new Map();
  return {
    tagName: tagName.toUpperCase(),
    children: [],
    classList: { add() {}, remove() {}, toggle() {} },
    append(...children) { this.children.push(...children); },
    appendChild(child) { this.children.push(child); return child; },
    addEventListener(type, listener, options = {}) {
      const entries = listeners.get(type) || [];
      entries.push({ listener, once: Boolean(options?.once) });
      listeners.set(type, entries);
    },
    removeEventListener(type, listener) {
      if (!listener) {
        listeners.delete(type);
        return;
      }
      const entries = (listeners.get(type) || []).filter((entry) => entry.listener !== listener);
      if (entries.length) listeners.set(type, entries);
      else listeners.delete(type);
    },
    dispatch(type, event = {}) {
      const entries = [...(listeners.get(type) || [])];
      entries.forEach((entry) => {
        entry.listener({ target: this, preventDefault() {}, ...event });
        if (entry.once) this.removeEventListener(type, entry.listener);
      });
    },
    click() {
      this.clicked = true;
      if (this.clickError) throw this.clickError;
      this.dispatch("click");
    },
    focus() { this.focused = true; },
    remove() { this.removed = true; },
    setAttribute(name, value) { this[name] = value; },
    getAttribute(name) { return this[name]; },
    textContent: "",
    value: "",
    style: {},
    files: []
  };
}

function bridgeEnvironment(overrides = {}) {
  const created = [];
  const anchors = [];
  const document = {
    body: makeElement("body"),
    activeElement: makeElement("button"),
    createElement(tagName) {
      const element = makeElement(tagName);
      created.push(element);
      if (tagName === "a") anchors.push(element);
      overrides.onCreate?.(element, tagName);
      return element;
    },
    getElementById() { return null; }
  };
  const eventSource = {
    closed: false,
    close() { this.closed = true; },
    addEventListener(type, callback) { this.listener = { type, callback }; }
  };
  const calls = [];
  class TestFormData {
    constructor() { this.entries = []; }
    append(name, value) { this.entries.push([name, value]); }
  }
  const window = {
    document,
    EventSource: function EventSource(url) { eventSource.url = url; return eventSource; },
    alert(message) { window.alerts.push(message); },
    alerts: [],
    URL: {
      createObjectURL(blob) { window.createdBlob = blob; return "blob:download"; },
      revokeObjectURL(url) { window.revoked = url; }
    },
    setTimeout(callback) { callback(); return 1; },
    clearTimeout() {},
    ...overrides.window
  };
  const fetch = overrides.fetch || (async (url, init = {}) => {
    calls.push([url, init]);
    return response({});
  });
  const loaded = loadScript("src/renderer/web-bridge.js", [], {
    window,
    document,
    fetch,
    FormData: TestFormData,
    EventSource: window.EventSource,
    Blob: class Blob {},
    URL: window.URL,
    setTimeout: window.setTimeout,
    clearTimeout: window.clearTimeout
  });
  return { bridge: window.chordPilot, calls, eventSource, created, anchors, window, document, ...loaded };
}

test("analyze translates renderer audio references into media IDs", async () => {
  const runtime = bridgeEnvironment({
    fetch: async (url, init) => {
      runtime.calls.push([url, init]);
      return response({ chart: { bars: [] } });
    }
  });

  await runtime.bridge.analyze("6d11c6ec-76ce-4a9f-b874-bdfcf9c4213c", "fast", { known_key: "D" });
  assert.deepEqual(plain(runtime.calls[0]), ["/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mediaId: "6d11c6ec-76ce-4a9f-b874-bdfcf9c4213c", mode: "fast", options: { known_key: "D" } })
  }]);
});

test("onBackendLog closes EventSource when unsubscribed", () => {
  const { bridge, eventSource } = bridgeEnvironment();
  const unsubscribe = bridge.onBackendLog(() => {});
  unsubscribe();
  assert.equal(eventSource.url, "/api/events");
  assert.equal(eventSource.closed, true);
});

test("web bridge preserves an existing Electron preload bridge", () => {
  const electronBridge = { chooseAudio() {} };
  const { window } = bridgeEnvironment({ window: { chordPilot: electronBridge } });
  assert.equal(window.chordPilot, electronBridge);
});

test("web bridge exposes the complete preload method surface", () => {
  const { bridge } = bridgeEnvironment();
  assert.deepEqual(Object.keys(bridge).sort(), [
    "analyze",
    "chooseAudio",
    "clearCache",
    "deleteSession",
    "downloadYoutubeAudio",
    "exportAudioTrack",
    "exportChart",
    "isWebRuntime",
    "lookupMetadata",
    "onBackendLog",
    "openSession",
    "openSessionPath",
    "processAudio",
    "saveSession",
    "showMessage",
    "storageSummary"
  ]);
});

test("web storage bridge uses same-origin management APIs and returns their public shape", async () => {
  const runtime = bridgeEnvironment({
    fetch: async (url, init = {}) => {
      runtime.calls.push([url, init]);
      if (url === "/api/storage") return response({ storage: { media: { count: 1, bytes: 4 } }, queue: { active: 0, queued: 0, closing: false } });
      if (url.includes("/api/sessions/")) return response({ deleted: true, storage: { sessions: { count: 0, bytes: 0 } } });
      return response({ cleared: "analysis", storage: { analysis: { count: 0, bytes: 0 } }, queue: { active: 0, queued: 0, closing: false } });
    }
  });

  assert.deepEqual(plain(await runtime.bridge.storageSummary()), {
    storage: { media: { count: 1, bytes: 4 } }, queue: { active: 0, queued: 0, closing: false }
  });
  assert.equal((await runtime.bridge.deleteSession("session id")).deleted, true);
  assert.equal((await runtime.bridge.clearCache("analysis")).cleared, "analysis");
  assert.deepEqual(plain(runtime.calls.map(([url, init]) => [url, init.method || "GET"])), [
    ["/api/storage", "GET"],
    ["/api/sessions/session%20id", "DELETE"],
    ["/api/storage/cache/analysis", "DELETE"]
  ]);
});

test("chooseAudio returns null when the file picker is cancelled", async () => {
  const { bridge, created } = bridgeEnvironment();
  const choosing = bridge.chooseAudio();
  const picker = created.find((element) => element.tagName === "INPUT");
  picker.dispatch("change");
  assert.equal(await choosing, null);
});

test("chooseAudio handles the browser file input cancel event", async () => {
  const { bridge, created } = bridgeEnvironment();
  const choosing = bridge.chooseAudio();
  const picker = created.find((element) => element.tagName === "INPUT");
  picker.dispatch("cancel");
  const result = await Promise.race([
    choosing,
    new Promise((_, reject) => setTimeout(() => reject(new Error("file picker did not settle")), 50))
  ]);
  assert.equal(result, null);
});

test("chooseAudio uploads one selected file and uses its opaque ID as path", async () => {
  const file = { name: "song.wav" };
  const runtime = bridgeEnvironment({
    fetch: async (url, init) => {
      runtime.calls.push([url, init]);
      return response({ audio: { id: "media-opaque", name: "song.wav", url: "/api/media/media-opaque" } });
    }
  });
  const choosing = runtime.bridge.chooseAudio();
  const picker = runtime.created.find((element) => element.tagName === "INPUT");
  assert.equal(picker.accept, ".mp3,.wav,.aif,.aiff,.flac,.m4a");
  picker.files = [file];
  picker.dispatch("change");
  const audio = await choosing;
  assert.equal(runtime.calls[0][0], "/api/media/upload");
  assert.equal(runtime.calls[0][1].method, "POST");
  assert.equal(audio.path, "media-opaque");
  assert.equal(JSON.stringify(audio).includes("/data/"), false);
});

test("YouTube imports expose renderer-compatible opaque source and cover references", async () => {
  const runtime = bridgeEnvironment({
    fetch: async (url, init) => {
      runtime.calls.push([url, init]);
      return response({
        audio: {
          id: "media-opaque",
          name: "song.mp3",
          url: "/api/media/media-opaque",
          cover: { id: "cover-opaque", url: "/api/media/cover-opaque" }
        }
      });
    }
  });
  const audio = await runtime.bridge.downloadYoutubeAudio("https://www.youtube.com/watch?v=abc");
  assert.deepEqual(JSON.parse(runtime.calls[0][1].body), { url: "https://www.youtube.com/watch?v=abc" });
  assert.equal(audio.path, "media-opaque");
  assert.equal(audio.cover.path, "cover-opaque");
  assert.equal(audio.coverUrl, "/api/media/cover-opaque");
});

test("chooseAudio surfaces upload failures from the stable API error", async () => {
  const runtime = bridgeEnvironment({
    fetch: async () => response({ error: { code: "FILE_TOO_LARGE", message: "Uploaded file is too large." } }, { ok: false, status: 413 })
  });
  const choosing = runtime.bridge.chooseAudio();
  const picker = runtime.created.find((element) => element.tagName === "INPUT");
  picker.files = [{ name: "song.wav" }];
  picker.dispatch("change");
  await assert.rejects(choosing, /Uploaded file is too large/);
});

test("exports download in the browser and revoke the temporary URL", async () => {
  const runtime = bridgeEnvironment({
    fetch: async (url, init) => {
      runtime.calls.push([url, init]);
      if (url === "/api/exports/chart") return response({ downloadUrl: "/api/media/chart-id", filename: "song.txt", format: "txt" });
      return response({ bytes: "chart" });
    }
  });
  const result = await runtime.bridge.exportChart({ title: "Song", bars: [] }, "txt");
  assert.deepEqual(plain(result), { path: "chart-id", format: "txt" });
  assert.equal(runtime.anchors[0].download, "song.txt");
  assert.equal(runtime.anchors[0].clicked, true);
  assert.equal(runtime.window.revoked, "blob:download");
});

test("exports still remove the anchor and revoke the blob URL when the browser click fails", async () => {
  const runtime = bridgeEnvironment({
    onCreate(element, tagName) {
      if (tagName === "a") element.clickError = new Error("download blocked");
    },
    fetch: async (url) => {
      if (url === "/api/exports/chart") return response({ downloadUrl: "/api/media/chart-id", filename: "song.txt", format: "txt" });
      return response({ bytes: "chart" });
    }
  });
  await assert.rejects(runtime.bridge.exportChart({ title: "Song", bars: [] }, "txt"), /download blocked/);
  assert.equal(runtime.anchors[0].removed, true);
  assert.equal(runtime.window.revoked, "blob:download");
});

test("audio export accepts the renderer's opaque path source", async () => {
  const runtime = bridgeEnvironment({
    fetch: async (url, init) => {
      runtime.calls.push([url, init]);
      if (url === "/api/exports/audio") return response({ downloadUrl: "/api/media/export-id", filename: "mix.wav", format: "wav" });
      return response({ bytes: "audio" });
    }
  });
  const result = await runtime.bridge.exportAudioTrack({ path: "source-id", label: "Full Mix" });
  assert.equal(JSON.parse(runtime.calls[0][1].body).mediaId, "source-id");
  assert.deepEqual(plain(result), { path: "export-id", format: "wav" });
});

test("saveSession persists before downloading and keeps the renderer path opaque", async () => {
  const runtime = bridgeEnvironment({
    fetch: async (url, init) => {
      runtime.calls.push([url, init]);
      if (url === "/api/sessions") return response({ id: "session-id", path: "session-id", session: { app: "ChordPilot" }, downloadUrl: "/api/sessions/session-id/download" });
      return response({ bytes: "session" });
    }
  });
  const result = await runtime.bridge.saveSession({ app: "ChordPilot", version: 1 });
  assert.equal(runtime.calls[0][0], "/api/sessions");
  assert.equal(runtime.calls[1][0], "/api/sessions/session-id/download");
  assert.deepEqual(plain(result), { path: "session-id" });
});

test("openSession selects a stored session and imports an uploaded session", async () => {
  let choice;
  const runtime = bridgeEnvironment({
    window: {
      chordPilotSessionDialog: { choose: async (options) => choice(options) }
    },
    fetch: async (url) => {
      if (url === "/api/sessions") return response({ sessions: [{ id: "stored-id", title: "Stored" }] });
      if (url === "/api/sessions/stored-id") return response({ id: "stored-id", path: "stored-id", session: { app: "ChordPilot" } });
      return response({ id: "imported-id", path: "imported-id", session: { app: "ChordPilot" } });
    }
  });
  choice = async ({ sessions }) => sessions[0].id;
  assert.equal((await runtime.bridge.openSession()).path, "stored-id");
  choice = async ({ onImport }) => onImport({ name: "session.json" });
  assert.equal((await runtime.bridge.openSession()).path, "imported-id");
});

test("showMessage falls back to the browser alert dialog", async () => {
  const { bridge, window } = bridgeEnvironment();
  const result = await bridge.showMessage({ title: "Problem", message: "Something happened", detail: "Details" });
  assert.match(window.alerts[0], /Problem/);
  assert.match(window.alerts[0], /Something happened/);
  assert.deepEqual(plain(result), { response: 0, checkboxChecked: false });
});

test("onBackendLog shares one source until the final listener unsubscribes", () => {
  const delivered = [];
  const { bridge, eventSource } = bridgeEnvironment();
  const unsubscribeFirst = bridge.onBackendLog((message) => delivered.push(["first", message]));
  const unsubscribeSecond = bridge.onBackendLog((message) => delivered.push(["second", message]));
  eventSource.listener.callback({ data: JSON.stringify("working") });
  assert.deepEqual(delivered, [["first", "working"], ["second", "working"]]);
  unsubscribeFirst();
  assert.equal(eventSource.closed, false);
  unsubscribeSecond();
  assert.equal(eventSource.closed, true);
});

test("session dialog renders stored sessions, imports a file, and restores focus", async () => {
  const elements = {};
  for (const id of ["webSessionDialog", "webSessionList", "webSessionEmpty", "webSessionImportButton", "webSessionImport", "webSessionCancel"]) {
    elements[id] = makeElement(id === "webSessionDialog" ? "dialog" : id === "webSessionImport" ? "input" : "div");
  }
  elements.webSessionDialog.showModal = function showModal() { this.open = true; };
  elements.webSessionDialog.close = function close() { this.open = false; this.dispatch("close"); };
  const previous = makeElement("button");
  const document = {
    activeElement: previous,
    getElementById(id) { return elements[id]; },
    createElement: makeElement
  };
  const window = { document, chordPilot: undefined };
  loadScript("src/renderer/web-session-dialog.js", [], { window, document });
  const choosing = window.chordPilotSessionDialog.choose({
    sessions: [{ id: "stored-id", title: "Saved Song", audioName: "song.wav", savedAt: "2026-01-01T00:00:00.000Z" }],
    onImport: async (file) => ({ id: "imported-id", file })
  });
  assert.equal(elements.webSessionList.children.length, 1);
  elements.webSessionList.children[0].children[0].click();
  assert.equal(await choosing, "stored-id");
  assert.equal(previous.focused, true);
});

test("session dialog uploads the selected import and resolves its result", async () => {
  const elements = {};
  for (const id of ["webSessionDialog", "webSessionList", "webSessionEmpty", "webSessionImportButton", "webSessionImport", "webSessionCancel"]) {
    elements[id] = makeElement(id === "webSessionDialog" ? "dialog" : id === "webSessionImport" ? "input" : "button");
  }
  elements.webSessionDialog.showModal = function showModal() { this.open = true; };
  elements.webSessionDialog.close = function close() { this.open = false; this.dispatch("close"); };
  const document = {
    activeElement: makeElement("button"),
    getElementById(id) { return elements[id]; },
    createElement: makeElement
  };
  const window = { document };
  loadScript("src/renderer/web-session-dialog.js", [], { window, document });
  const file = { name: "portable.chordpilot-session.json" };
  const choosing = window.chordPilotSessionDialog.choose({
    sessions: [],
    onImport: async (selected) => ({ id: "imported-id", selected })
  });
  elements.webSessionImportButton.click();
  assert.equal(elements.webSessionImport.clicked, true);
  elements.webSessionImport.files = [file];
  elements.webSessionImport.dispatch("change");
  assert.deepEqual(plain(await choosing), { id: "imported-id", selected: file });
});

test("session dialog rejects an import error so the renderer can show the API message", async () => {
  const elements = {};
  for (const id of ["webSessionDialog", "webSessionList", "webSessionEmpty", "webSessionImportButton", "webSessionImport", "webSessionCancel"]) {
    elements[id] = makeElement(id === "webSessionDialog" ? "dialog" : id === "webSessionImport" ? "input" : "button");
  }
  elements.webSessionDialog.showModal = function showModal() { this.open = true; };
  elements.webSessionDialog.close = function close() { this.open = false; this.dispatch("close"); };
  const document = {
    activeElement: makeElement("button"),
    getElementById(id) { return elements[id]; },
    createElement: makeElement
  };
  const window = { document };
  loadScript("src/renderer/web-session-dialog.js", [], { window, document });
  const choosing = window.chordPilotSessionDialog.choose({
    sessions: [],
    onImport: async () => { throw new Error("Session data is invalid."); }
  });
  elements.webSessionImport.files = [{ name: "broken.json" }];
  elements.webSessionImport.dispatch("change");
  await assert.rejects(choosing, /Session data is invalid/);
  assert.equal(elements.webSessionDialog.open, false);
});

test("session dialog removes stale import handlers after a stored session is chosen", async () => {
  const elements = {};
  for (const id of ["webSessionDialog", "webSessionList", "webSessionEmpty", "webSessionImportButton", "webSessionImport", "webSessionCancel"]) {
    elements[id] = makeElement(id === "webSessionDialog" ? "dialog" : id === "webSessionImport" ? "input" : "button");
  }
  elements.webSessionDialog.showModal = function showModal() { this.open = true; };
  elements.webSessionDialog.close = function close() { this.open = false; this.dispatch("close"); };
  const document = {
    activeElement: makeElement("button"),
    getElementById(id) { return elements[id]; },
    createElement: makeElement
  };
  const window = { document };
  loadScript("src/renderer/web-session-dialog.js", [], { window, document });

  let staleImports = 0;
  const first = window.chordPilotSessionDialog.choose({
    sessions: [{ id: "stored-id", title: "Stored" }],
    onImport: async () => { staleImports += 1; }
  });
  elements.webSessionList.children[0].children[0].click();
  assert.equal(await first, "stored-id");

  let currentImports = 0;
  const second = window.chordPilotSessionDialog.choose({
    sessions: [],
    onImport: async () => { currentImports += 1; return { id: "imported-id" }; }
  });
  elements.webSessionImport.files = [{ name: "portable.json" }];
  elements.webSessionImport.dispatch("change");
  assert.deepEqual(plain(await second), { id: "imported-id" });
  assert.equal(staleImports, 0);
  assert.equal(currentImports, 1);
});

test("session dialog manages sessions and cache with confirmations and refreshed public usage", async () => {
  const elements = {};
  const ids = [
    "webSessionDialog", "webSessionList", "webSessionEmpty", "webSessionImportButton", "webSessionImport", "webSessionCancel",
    "webStorageSummary", "webStorageError", "webClearAnalysis", "webClearModels", "webClearAll"
  ];
  for (const id of ids) elements[id] = makeElement(id === "webSessionDialog" ? "dialog" : "button");
  elements.webSessionDialog.showModal = function showModal() { this.open = true; };
  elements.webSessionDialog.close = function close() { this.open = false; this.dispatch("close"); };
  const document = {
    activeElement: makeElement("button"),
    getElementById(id) { return elements[id]; },
    createElement: makeElement
  };
  const confirmations = [];
  const window = {
    document,
    confirm(message) { confirmations.push(message); return true; }
  };
  loadScript("src/renderer/web-session-dialog.js", [], { window, document });
  const calls = [];
  const choosing = window.chordPilotSessionDialog.choose({
    sessions: [{ id: "stored-id", title: "Saved Song", audioName: "song.wav" }],
    storage: {
      media: { count: 1, bytes: 1024 }, generated: { count: 2, bytes: 2048 }, sessions: { count: 1, bytes: 512 },
      analysis: { count: 3, bytes: 4096 }, models: { count: 1, bytes: 8192 }
    },
    queue: { active: 0, queued: 0, closing: false },
    onDelete: async (id) => {
      calls.push(["delete", id]);
      return { sessions: [], storage: { media: { count: 1, bytes: 1024 }, generated: { count: 2, bytes: 2048 }, sessions: { count: 0, bytes: 0 }, analysis: { count: 3, bytes: 4096 }, models: { count: 1, bytes: 8192 } }, queue: { active: 0, queued: 0, closing: false } };
    },
    onClearCache: async (scope) => {
      calls.push(["clear", scope]);
      return { sessions: [], storage: { media: { count: 1, bytes: 1024 }, generated: { count: 2, bytes: 2048 }, sessions: { count: 0, bytes: 0 }, analysis: { count: 0, bytes: 0 }, models: { count: 1, bytes: 8192 } }, queue: { active: 0, queued: 0, closing: false } };
    }
  });

  assert.match(elements.webStorageSummary.textContent, /Uploads 1 · 1 KB/);
  assert.match(elements.webStorageSummary.textContent, /Generated 2 · 2 KB/);
  const deleteButton = elements.webSessionList.children[0].children[1];
  deleteButton.click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls[0], ["delete", "stored-id"]);
  assert.equal(elements.webSessionList.children.length, 0);
  assert.equal(elements.webSessionEmpty.hidden, false);

  elements.webClearAnalysis.click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls[1], ["clear", "analysis"]);
  assert.match(elements.webStorageSummary.textContent, /Analysis cache 0 · 0 B/);
  assert.equal(confirmations.length, 2);
  elements.webSessionCancel.click();
  assert.equal(await choosing, null);
});

test("session dialog disables cache actions while busy and never exposes mutation error details", async () => {
  const elements = {};
  const ids = [
    "webSessionDialog", "webSessionList", "webSessionEmpty", "webSessionImportButton", "webSessionImport", "webSessionCancel",
    "webStorageSummary", "webStorageError", "webClearAnalysis", "webClearModels", "webClearAll"
  ];
  for (const id of ids) elements[id] = makeElement(id === "webSessionDialog" ? "dialog" : "button");
  elements.webSessionDialog.showModal = function showModal() { this.open = true; };
  elements.webSessionDialog.close = function close() { this.open = false; this.dispatch("close"); };
  const document = { activeElement: makeElement("button"), getElementById(id) { return elements[id]; }, createElement: makeElement };
  const window = { document, confirm: () => true };
  loadScript("src/renderer/web-session-dialog.js", [], { window, document });
  const choosing = window.chordPilotSessionDialog.choose({
    sessions: [{ id: "stored-id", title: "Saved" }], storage: {}, queue: { active: 1, queued: 0, closing: false },
    onDelete: async () => { throw new Error("private /data/sessions/stored-id.json"); }
  });

  assert.equal(elements.webClearAnalysis.disabled, true);
  assert.equal(elements.webClearModels.disabled, true);
  assert.equal(elements.webClearAll.disabled, true);
  elements.webSessionList.children[0].children[1].click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(elements.webStorageError.hidden, false);
  assert.equal(elements.webStorageError.textContent, "Could not update server storage. Please try again.");
  assert.equal(elements.webStorageError.textContent.includes("/data/"), false);
  elements.webSessionCancel.click();
  await choosing;
});
