const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const runtimeServices = require("../../src/runtime/chordpilot-services");
const {
  buildAudioPreviewFilter,
  normalizeYoutubeUrl,
  safeFileName,
  shouldShowBackendLog
} = require("../../src/runtime/chordpilot-services");

function loadElectronExportHandler({ confirmResponse = 0 } = {}) {
  const handlers = new Map();
  const exportCalls = [];
  const prompts = [];
  let serviceOptions;
  const services = {
    cleanup() {},
    async downloadYoutubeAudio() {
      return serviceOptions.ensureYoutubeTools();
    },
    async exportAudioTrack(payload) {
      exportCalls.push(payload);
      return payload;
    }
  };
  class FakeBrowserWindow {
    constructor() {
      this.webContents = { openDevTools() {}, send() {} };
    }

    loadFile() {}
    isDestroyed() { return false; }
    static getAllWindows() { return []; }
  }
  const electron = {
    app: {
      isPackaged: false,
      getPath: () => "/tmp/chordpilot-main-test",
      whenReady: () => ({ then(callback) { callback(); } }),
      on() {},
      quit() {}
    },
    BrowserWindow: FakeBrowserWindow,
    Menu: { setApplicationMenu() {} },
    dialog: {
      async showMessageBox(_window, payload) {
        prompts.push(payload);
        return { response: confirmResponse };
      },
      async showSaveDialog() {
        return { canceled: false, filePath: "/tmp/chordpilot-main-test/export.wav" };
      },
      async showOpenDialog() {
        return { canceled: true, filePaths: [] };
      }
    },
    ipcMain: { handle(name, handler) { handlers.set(name, handler); } },
    nativeTheme: {}
  };
  const filename = path.resolve(__dirname, "../../src/main/main.js");
  const source = fs.readFileSync(filename, "utf8");
  const localRequire = (request) => {
    if (request === "electron") return electron;
    if (request === "../runtime/chordpilot-services") {
      return { ...runtimeServices, createChordPilotServices: (options) => { serviceOptions = options; return services; } };
    }
    if (request === "./youtube-setup") {
      return { createYoutubeSetup: () => ({ ensureReady: async (confirm) => await confirm(["YouTube downloader (yt-dlp)"]) ? { ytDlpPath: "ready" } : null }) };
    }
    return createRequire(filename)(request);
  };
  vm.runInNewContext(source, {
    require: localRequire,
    module: { exports: {} },
    exports: {},
    __dirname: path.dirname(filename),
    __filename: filename,
    process,
    console,
    setTimeout,
    clearTimeout
  }, { filename });
  return { handler: handlers.get("audio:exportTrack"), exportCalls, youtubeHandler: handlers.get("audio:downloadYoutube"), prompts };
}

test("Electron asks for download/install confirmation and forwards cancellation", async () => {
  const accepted = loadElectronExportHandler();
  assert.equal((await accepted.youtubeHandler({}, "https://youtu.be/abc")).ytDlpPath, "ready");
  assert.deepEqual(Array.from(accepted.prompts[0].buttons), ["Download & Install", "Cancel"]);
  assert.equal(accepted.prompts[0].cancelId, 1);
  const cancelled = loadElectronExportHandler({ confirmResponse: 1 });
  assert.equal(await cancelled.youtubeHandler({}, "https://youtu.be/abc"), null);
});

test("runtime filename and backend-log helpers retain user-facing safeguards", () => {
  assert.equal(safeFileName("  a<>:\"/\\|?*b  "), "a-b");
  assert.equal(safeFileName("***", "fallback"), "-");
  assert.equal(shouldShowBackendLog("analysis: loading"), true);
  assert.equal(shouldShowBackendLog("Error in sitecustomize"), false);
});

test("runtime audio filters preserve pitch while compensating tempo", () => {
  assert.equal(buildAudioPreviewFilter(0, 1), "atempo=1.000000");
  assert.equal(buildAudioPreviewFilter(12, 1), "aresample=48000,asetrate=96000.000,aresample=48000,atempo=0.500000");
  assert.equal(buildAudioPreviewFilter(-12, 1), "aresample=48000,asetrate=24000.000,aresample=48000,atempo=2.000000");
  assert.match(buildAudioPreviewFilter(0, 9), /atempo=2/);
});

test("runtime YouTube normalization accepts supported hosts and rejects unsafe input", () => {
  assert.equal(normalizeYoutubeUrl("https://youtu.be/dQw4w9WgXcQ"), "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.equal(normalizeYoutubeUrl("https://youtube.com/watch?v=abc"), "https://www.youtube.com/watch?v=abc");
  assert.throws(() => normalizeYoutubeUrl("https://example.com/watch?v=abc"), /YouTube/);
  assert.throws(() => normalizeYoutubeUrl("https://youtube.com.evil.test/watch?v=abc"), /YouTube/);
  assert.throws(() => normalizeYoutubeUrl("javascript:alert(1)"), /YouTube/);
});

test("Electron audio export forwards renderer path aliases and preserves sourcePath callers", async () => {
  const { handler, exportCalls } = loadElectronExportHandler();

  await handler(null, { path: "opaque-renderer-source", label: "Mix" });
  await handler(null, { sourcePath: "legacy-source.wav", path: "ignored-alias", label: "Legacy" });

  assert.equal(exportCalls[0].sourcePath, "opaque-renderer-source");
  assert.equal(exportCalls[1].sourcePath, "legacy-source.wav");
});
