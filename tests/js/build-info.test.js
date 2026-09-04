const assert = require("node:assert/strict");
const test = require("node:test");
const { getBuildInfo } = require("../../src/runtime/build-info");

test("getBuildInfo returns application name, version, and builtAt timestamp", () => {
  const info = getBuildInfo();
  assert.equal(info.app, "ChordPilot");
  assert.equal(info.version, "0.1.0");
  assert.match(info.builtAt, /^\d{4}-\d{2}-\d{2}/);
});

test("getBuildInfo respects CHORDPILOT_BUILD_TIME environment variable", (t) => {
  const previous = process.env.CHORDPILOT_BUILD_TIME;
  t.after(() => {
    if (previous === undefined) delete process.env.CHORDPILOT_BUILD_TIME;
    else process.env.CHORDPILOT_BUILD_TIME = previous;
  });
  process.env.CHORDPILOT_BUILD_TIME = "2026-09-04T22:30:00Z";
  const info = getBuildInfo();
  assert.equal(info.builtAt, "2026-09-04T22:30:00Z");
});
