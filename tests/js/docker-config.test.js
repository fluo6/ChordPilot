const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");

test("Docker build context excludes local secrets and tool state", () => {
  const ignored = new Set(
    fs.readFileSync(path.join(root, ".dockerignore"), "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
  );

  for (const pattern of [
    ".git",
    ".env*",
    ".npmrc",
    ".agents",
    ".codex",
    ".superpowers",
    ".tool-cache",
    ".chordpilot-data",
    "node_modules"
  ]) {
    assert.ok(ignored.has(pattern), `${pattern} must be excluded from the Docker build context`);
  }
});

test("container runtime homes and caches stay beneath the data volume", () => {
  const dockerfile = fs.readFileSync(path.join(root, "Dockerfile"), "utf8");

  for (const assignment of [
    "HOME=/data/home",
    "XDG_CACHE_HOME=/data/cache",
    "XDG_CONFIG_HOME=/data/config",
    "XDG_DATA_HOME=/data/share",
    "TMPDIR=/data/tmp",
    "TORCH_HOME=/data/cache/torch"
  ]) {
    assert.match(dockerfile, new RegExp(`\\b${assignment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`));
  }

  assert.match(dockerfile, /mkdir -p \/data\/home \/data\/cache \/data\/config \/data\/share \/data\/tmp/);
});
