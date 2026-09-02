const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

const smokeScript = path.resolve(__dirname, "../../scripts/testing/web-smoke.mjs");

test("smoke CLI reports invalid arguments without an uncaught stack", () => {
  const result = spawnSync(process.execPath, [smokeScript, "--bogus"], {
    encoding: "utf8",
    env: process.env
  });

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "ChordPilot web smoke failed: Unknown argument: --bogus\n");
});

test("smoke CLI preserves its primary error and attempts directory cleanup when WAV removal fails", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "chordpilot-smoke-cleanup-test-"));
  const preloadPath = path.join(root, "inject-cleanup-failure.mjs");
  const markerPath = path.join(root, "directory-cleanup-attempted.txt");
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(preloadPath, [
    'import fs from "node:fs/promises";',
    "const remove = fs.rm.bind(fs);",
    "const writeFile = fs.writeFile.bind(fs);",
    "fs.rm = async (target, options) => {",
    '  if (String(target).endsWith("/smoke.wav")) throw new Error("injected WAV cleanup failure");',
    "  await writeFile(process.env.CHORDPILOT_CLEANUP_MARKER, String(target));",
    "  return remove(target, options);",
    "};"
  ].join("\n"));

  const result = spawnSync(process.execPath, [
    "--import", pathToFileURL(preloadPath).href, smokeScript
  ], {
    encoding: "utf8",
    env: {
      ...process.env,
      CHORDPILOT_CLEANUP_MARKER: markerPath,
      CHORDPILOT_WEB_URL: "http://127.0.0.1:1",
      TMPDIR: root
    }
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /ChordPilot web smoke cleanup warning: .*injected WAV cleanup failure/);
  assert.match(result.stderr, /ChordPilot web smoke failed: GET http:\/\/127\.0\.0\.1:1\/api\/health could not connect:/);
  assert.doesNotMatch(result.stderr, /^ChordPilot web smoke failed: injected WAV cleanup failure$/m);
  assert.match(fs.readFileSync(markerPath, "utf8"), /chordpilot-web-smoke-/);
});
