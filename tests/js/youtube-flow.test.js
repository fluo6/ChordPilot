const test = require("node:test");
const assert = require("node:assert/strict");
const { loadScript } = require("./helpers/load-script");

test("cancelling YouTube setup preserves the link, dismisses loading, and shows no error", async () => {
  const elements = {
    youtubeUrlInput: { value: "https://youtu.be/abc" },
    youtubeStartBtn: { disabled: false },
    youtubeSourceHint: { textContent: "" }
  };
  let loading = false;
  let status;
  const runtime = loadScript("src/renderer/actions.js", ["startFromYoutubeLink"], {
    elements,
    window: { chordPilot: { downloadYoutubeAudio: async () => null } },
    beginLoading() { loading = true; return () => { loading = false; }; },
    setStatus(message) { status = message; },
    clearLog() {},
    showErrorDialog() { throw new Error("cancellation must not show an error"); }
  });
  await runtime.startFromYoutubeLink();
  assert.equal(elements.youtubeUrlInput.value, "https://youtu.be/abc");
  assert.equal(elements.youtubeStartBtn.disabled, false);
  assert.equal(loading, false);
  assert.match(status, /cancelled/i);
});

test("tool setup progress is visible in the loading panel", () => {
  const elements = {
    loadingText: { textContent: "Preparing..." },
    youtubeSourceHint: { textContent: "" },
    analysisLog: { appendChild() {}, scrollHeight: 0 }
  };
  const runtime = loadScript("src/renderer/shell.js", ["appendLog"], {
    state: { loadingCount: 1, isAnalyzing: false },
    elements,
    document: { createElement: () => ({}) }
  });
  runtime.appendLog("youtube setup: Downloading YouTube downloader (yt-dlp) (50%)");
  assert.match(elements.loadingText.textContent, /Downloading.*50%/);
  assert.equal(elements.youtubeSourceHint.textContent, elements.loadingText.textContent);
});
