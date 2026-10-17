const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const setup = require("../../src/main/youtube-setup");

function fixture(t, overrides = {}) {
  const toolsDir = fs.mkdtempSync(path.join(os.tmpdir(), "chordpilot-setup-"));
  t.after(() => fs.rmSync(toolsDir, { recursive: true, force: true }));
  const available = new Set(["ffmpeg", "ffprobe", "node"]);
  const payload = Buffer.from("downloaded executable");
  const digest = crypto.createHash("sha256").update(payload).digest("hex");
  const options = {
    toolsDir,
    platform: "win32",
    candidates: { ytDlp: ["yt-dlp"], ffmpeg: ["ffmpeg"], ffprobe: ["ffprobe"], deno: ["deno"], node: ["node"] },
    run: async (command) => {
      if (!available.has(command.replace(/\.exe$/, "")) && !fs.existsSync(command)) throw new Error("missing");
      return { stdout: command === "node" ? "v24.0.0" : "2026.08.19" };
    },
    fetchImpl: async (url) => url.includes("api.github.com")
      ? new Response(JSON.stringify({ assets: [{ name: "yt-dlp.exe", digest: `sha256:${digest}`, browser_download_url: "https://github.com/yt-dlp/yt-dlp/releases/download/test/yt-dlp.exe", size: payload.length }] }))
      : new Response(payload),
    ...overrides
  };
  return { toolsDir, available, manager: setup.createYoutubeSetup(options) };
}

test("missing downloader prompts once, installs it, and is ready without restarting", async (t) => {
  const { toolsDir, manager } = fixture(t);
  const prompts = [];
  const result = await manager.ensureReady(async (missing) => { prompts.push(missing); return true; });
  assert.deepEqual(prompts, [["YouTube downloader (yt-dlp)"]]);
  assert.equal(result.ytDlpPath, path.join(toolsDir, "yt-dlp.exe"));
  assert.equal(result.jsRuntime, "node:node");
  assert.equal(fs.readFileSync(result.ytDlpPath, "utf8"), "downloaded executable");
  await manager.ensureReady(() => { throw new Error("already installed tools must not prompt"); });
});

test("cancelling setup downloads nothing and leaves installation empty", async (t) => {
  const { toolsDir, manager } = fixture(t, { fetchImpl: () => { throw new Error("download before confirmation"); } });
  assert.equal(await manager.ensureReady(async () => false), null);
  assert.deepEqual(fs.readdirSync(toolsDir), []);
});

test("checksum failure leaves no installed or partial executable and can be retried", async (t) => {
  let corrupt = true;
  const { toolsDir, manager } = fixture(t, {
    fetchImpl: async (url) => url.includes("api.github.com")
      ? new Response(JSON.stringify({ assets: [{ name: "yt-dlp.exe", digest: `sha256:${crypto.createHash("sha256").update("valid").digest("hex")}`, browser_download_url: "https://github.com/yt-dlp/yt-dlp/releases/download/test/yt-dlp.exe", size: 5 }] }))
      : new Response(corrupt ? "wrong" : "valid")
  });
  await assert.rejects(manager.ensureReady(async () => true), /checksum/i);
  assert.deepEqual(fs.readdirSync(toolsDir), []);
  corrupt = false;
  const result = await manager.ensureReady(async () => true);
  assert.equal(fs.readFileSync(result.ytDlpPath, "utf8"), "valid");
});

test("concurrent starts share one setup confirmation and installation", async (t) => {
  const { manager } = fixture(t);
  let prompts = 0;
  const confirm = async () => { prompts += 1; return true; };
  const results = await Promise.all([manager.ensureReady(confirm), manager.ensureReady(confirm)]);
  assert.equal(prompts, 1);
  assert.equal(results[0].ytDlpPath, results[1].ytDlpPath);
});

test("an older downloader without JavaScript runtime support triggers setup", async (t) => {
  const { toolsDir, manager } = fixture(t, {
    run: async (command, args) => {
      if (command === "yt-dlp") {
        if (args.includes("--js-runtimes")) throw new Error("no such option: --js-runtimes");
        return { stdout: "2024.01.01" };
      }
      if (["ffmpeg", "ffprobe.exe"].includes(command) || fs.existsSync(command)) return { stdout: "2026.08.19" };
      if (command === "node") return { stdout: "v24.0.0" };
      throw new Error("missing");
    }
  });
  const result = await manager.ensureReady(async () => true);
  assert.equal(result.ytDlpPath, path.join(toolsDir, "yt-dlp.exe"));
});
