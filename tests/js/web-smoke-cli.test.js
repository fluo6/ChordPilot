const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

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
