const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildAudioPreviewFilter,
  normalizeYoutubeUrl,
  safeFileName,
  shouldShowBackendLog
} = require("../../src/runtime/chordpilot-services");

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
