const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { loadScript, plain } = require("./helpers/load-script");

function loadMain() {
  const handlers = new Map();
  const app = {
    isPackaged: false,
    whenReady: () => ({ then: () => {} }),
    on: () => {},
    getPath: () => ".",
    quit: () => {}
  };
  const electron = {
    app,
    BrowserWindow: class { static getAllWindows() { return []; } },
    Menu: { setApplicationMenu: () => {} },
    dialog: {},
    ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
    nativeTheme: {}
  };
  const nodeRequire = require;
  return loadScript("src/main/main.js", [
    "pathToFileUrl", "cleanMetadataSearchText", "musicBrainzQuery", "metadataCacheKey",
    "decodeFfmetadataValue", "clampNumber", "chainAtempo", "buildAudioPreviewFilter",
    "safeFileName", "normalizeYoutubeUrl", "parseYtDlpProgress", "firstUsefulLine",
    "audioExportArgsForExtension", "shouldShowBackendLog", "enrichChartPayload"
  ], {
    require: (name) => name === "electron" ? electron : nodeRequire(name),
    __dirname: path.join(process.cwd(), "src", "main"),
    process
  });
}

test("metadata and filename helpers clean user-facing text", () => {
  const m = loadMain();
  assert.equal(m.cleanMetadataSearchText("  My_song-FINAL.mp3 "), "My song FINAL");
  assert.equal(m.musicBrainzQuery({ title: "Song.wav", artist: " Artist " }), "Song Artist");
  assert.equal(m.musicBrainzQuery({ name: "file_name.flac" }), "file name");
  assert.equal(m.decodeFfmetadataValue("A\\=B\\;C\\\\D"), "A=B;C\\D");
  assert.equal(m.safeFileName("  a<>:\"/\\|?*b  "), "a-b");
  assert.equal(m.safeFileName("***", "fallback"), "-");
});

test("numeric clamping and audio filters cover pitch and tempo combinations", () => {
  const m = loadMain();
  assert.equal(m.clampNumber("1.5", 1, 0, 2), 1.5);
  assert.equal(m.clampNumber("bad", 1, 0, 2), 1);
  assert.equal(m.clampNumber(9, 1, 0, 2), 2);
  assert.deepEqual(plain(m.chainAtempo(1)), ["atempo=1.000000"]);
  assert.deepEqual(plain(m.chainAtempo(4)), ["atempo=2", "atempo=2.000000"]);
  assert.deepEqual(plain(m.chainAtempo(0.25)), ["atempo=0.5", "atempo=0.500000"]);
  assert.equal(m.buildAudioPreviewFilter(0, 1), "atempo=1.000000");
  assert.match(m.buildAudioPreviewFilter(12, 1), /asetrate=/);
  assert.match(m.buildAudioPreviewFilter(0, 1.5), /atempo=1.5/);
});

test("YouTube validation accepts supported URLs and rejects unsafe input", () => {
  const m = loadMain();
  assert.equal(m.normalizeYoutubeUrl("https://youtu.be/dQw4w9WgXcQ"), "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.equal(m.normalizeYoutubeUrl("https://youtube.com/watch?v=abc"), "https://www.youtube.com/watch?v=abc");
  assert.throws(() => m.normalizeYoutubeUrl("https://example.com/watch?v=abc"), /YouTube/);
  assert.throws(() => m.normalizeYoutubeUrl("https://youtube.com.evil.test/watch?v=abc"), /YouTube/);
  assert.throws(() => m.normalizeYoutubeUrl("javascript:alert(1)"), /YouTube/);
});

test("download progress and process error lines are parsed", () => {
  const m = loadMain();
  assert.equal(m.parseYtDlpProgress("[download]  42.5% of 3MiB"), "youtube: downloading 42.5%");
  assert.equal(m.parseYtDlpProgress("done"), "");
  assert.equal(m.firstUsefulLine("\n", " first\nsecond "), "first");
  assert.equal(m.firstUsefulLine("", ""), "No details were returned.");
  assert.equal(m.shouldShowBackendLog("analysis: loading"), true);
  assert.equal(m.shouldShowBackendLog("cache: hit"), true);
  assert.equal(m.shouldShowBackendLog("random noise"), true);
  assert.equal(m.shouldShowBackendLog("Error in sitecustomize"), false);
});

test("audio export codecs are selected by extension", () => {
  const m = loadMain();
  assert.deepEqual(plain(m.audioExportArgsForExtension("wav")), ["-codec:a", "pcm_s16le", "-ar", "48000"]);
  assert.deepEqual(plain(m.audioExportArgsForExtension("mp3")), ["-codec:a", "libmp3lame", "-b:a", "192k"]);
  assert.deepEqual(plain(m.audioExportArgsForExtension("flac")), ["-codec:a", "flac"]);
  assert.deepEqual(plain(m.audioExportArgsForExtension("m4a")), ["-codec:a", "aac", "-b:a", "192k"]);
  assert.deepEqual(plain(m.audioExportArgsForExtension("ogg")), ["-codec:a", "pcm_s16le", "-ar", "48000"]);
});

test("payload enrichment creates file URLs without mutating invalid values", () => {
  const m = loadMain();
  assert.equal(m.pathToFileUrl("C:\\Music\\song.wav"), "file://C:/Music/song.wav");
  const payload = { source_path: "C:\\Music\\song.wav", stems: { stems: [{ path: "C:\\Music\\vocals.wav" }] } };
  const enriched = m.enrichChartPayload(payload);
  assert.equal(enriched.stems.stems[0].url, "file://C:/Music/vocals.wav");
  assert.equal(m.enrichChartPayload(null), null);
});
