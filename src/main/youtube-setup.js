const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { Readable, Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");

const windowsTools = {
  ytDlp: { label: "YouTube downloader (yt-dlp)", repo: "yt-dlp/yt-dlp", asset: "yt-dlp.exe", files: ["yt-dlp.exe"] },
  ffmpeg: { label: "Audio conversion tools (FFmpeg and FFprobe)", repo: "yt-dlp/FFmpeg-Builds", release: "tags/latest", asset: "ffmpeg-master-latest-win64-gpl.zip", files: ["ffmpeg.exe", "ffprobe.exe"] },
  runtime: { label: "YouTube JavaScript runtime (Deno)", repo: "denoland/deno", asset: "deno-x86_64-pc-windows-msvc.zip", files: ["deno.exe"] }
};

function createYoutubeSetup({ toolsDir, candidates = {}, platform = process.platform, arch = process.arch, run = promisify(execFile), fetchImpl = fetch, emitLog = () => {} }) {
  let pending;
  const extension = platform === "win32" ? ".exe" : "";

  async function working(command, args = ["--version"], minimum) {
    try {
      const { stdout } = await run(command, args, { windowsHide: true, timeout: 10000, maxBuffer: 1024 * 1024 });
      if (minimum) {
        const match = String(stdout).match(/(?:v|deno\s+)?(\d+)\.(\d+)\.(\d+)/);
        if (!match) return false;
        const version = match.slice(1).map(Number);
        for (let i = 0; i < minimum.length; i += 1) {
          if (version[i] !== minimum[i]) return version[i] > minimum[i];
        }
      }
      return true;
    } catch (_error) {
      return false;
    }
  }

  function paths(key, name) {
    return [...new Set([path.join(toolsDir, name + extension), ...(candidates[key] || []), name + extension])];
  }

  async function inspect() {
    const result = {};
    for (const command of paths("ytDlp", "yt-dlp")) {
      if (await working(command, ["--ignore-config", "--js-runtimes", "deno", "--version"])) { result.ytDlpPath = command; break; }
    }
    for (const command of paths("ffmpeg", "ffmpeg")) {
      const directory = path.dirname(command);
      const probe = directory === "." ? "ffprobe" + extension : path.join(directory, "ffprobe" + extension);
      if (await working(command, ["-version"]) && await working(probe, ["-version"])) {
        result.ffmpegPath = command;
        result.ytDlpFfmpegLocation = directory === "." ? "" : directory;
        break;
      }
    }
    for (const [key, minimum] of [["deno", [2, 3, 0]], ["node", [22, 0, 0]]]) {
      for (const command of paths(key, key)) {
        if (await working(command, ["--version"], minimum)) { result.jsRuntime = `${key}:${command}`; break; }
      }
      if (result.jsRuntime) break;
    }
    return result;
  }

  async function install(tool) {
    emitLog(`youtube setup: Finding the latest ${tool.label} download...`);
    const response = await fetchImpl(`https://api.github.com/repos/${tool.repo}/releases/${tool.release || "latest"}`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "ChordPilot" },
      signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) throw new Error(`Could not check ${tool.label} downloads (HTTP ${response.status}).`);
    const release = await response.json();
    const asset = release.assets?.find((item) => item.name === tool.asset);
    const digest = asset?.digest?.match(/^sha256:([a-f0-9]{64})$/i)?.[1];
    if (!asset || !digest || !asset.browser_download_url?.startsWith(`https://github.com/${tool.repo}/releases/download/`)) {
      throw new Error(`A verified ${tool.label} download is unavailable. Please try again later.`);
    }
    fs.mkdirSync(toolsDir, { recursive: true });
    const staging = fs.mkdtempSync(path.join(toolsDir, ".install-"));
    try {
      const archivePath = path.join(staging, tool.asset);
      const download = await fetchImpl(asset.browser_download_url, { signal: AbortSignal.timeout(10 * 60 * 1000) });
      if (!download.ok || !download.body) throw new Error(`Could not download ${tool.label} (HTTP ${download.status}).`);
      const hash = crypto.createHash("sha256");
      let received = 0;
      let lastPercent = -1;
      emitLog(`youtube setup: Downloading ${tool.label}...`);
      const monitor = new Transform({ transform(chunk, _encoding, callback) {
        received += chunk.length;
        if (received > 512 * 1024 * 1024) { callback(new Error("Tool download exceeds the size limit.")); return; }
        hash.update(chunk);
        const percent = Math.min(100, Math.floor(received / (asset.size || received) * 100));
        if (percent >= lastPercent + 5 || percent === 100 && lastPercent !== 100) {
          lastPercent = percent;
          emitLog(`youtube setup: Downloading ${tool.label} (${percent}%)`);
        }
        callback(null, chunk);
      } });
      await pipeline(Readable.fromWeb(download.body), monitor, fs.createWriteStream(archivePath, { flags: "wx" }));
      if (hash.digest("hex") !== digest.toLowerCase()) throw new Error(`${tool.label} checksum did not match. Please retry the download.`);
      emitLog(`youtube setup: Installing ${tool.label}...`);
      const binDir = path.join(staging, "bin");
      fs.mkdirSync(binDir);
      if (tool.asset.endsWith(".zip")) {
        // Only the named executables are copied; archive paths never become filesystem paths.
        const script = "$ErrorActionPreference = 'Stop'; Add-Type -AssemblyName System.IO.Compression.FileSystem; " +
          "$taskZip = [System.IO.Compression.ZipFile]::OpenRead($env:CHORDPILOT_SETUP_ARCHIVE); try { " +
          "foreach ($taskName in ($env:CHORDPILOT_SETUP_FILES -split ',')) { " +
          "$taskEntries = @($taskZip.Entries | Where-Object { $_.Name -ceq $taskName }); " +
          "if ($taskEntries.Count -ne 1) { throw ('Expected one executable: ' + $taskName) }; " +
          "[System.IO.Compression.ZipFileExtensions]::ExtractToFile($taskEntries[0], [System.IO.Path]::Combine($env:CHORDPILOT_SETUP_DEST, $taskName)) " +
          "} } finally { $taskZip.Dispose() }";
        await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
          windowsHide: true, timeout: 120000,
          env: { ...process.env, CHORDPILOT_SETUP_ARCHIVE: archivePath, CHORDPILOT_SETUP_DEST: binDir, CHORDPILOT_SETUP_FILES: tool.files.join(",") }
        });
      } else {
        fs.copyFileSync(archivePath, path.join(binDir, tool.files[0]));
      }
      for (const name of tool.files) {
        const stagedPath = path.join(binDir, name);
        const minimum = name === "deno.exe" ? [2, 3, 0] : undefined;
        if (!fs.existsSync(stagedPath) || !await working(stagedPath, name.startsWith("ff") ? ["-version"] : ["--version"], minimum)) {
          throw new Error(`${tool.label} could not run after downloading. Please retry or check your antivirus settings.`);
        }
      }
      for (const name of tool.files) fs.renameSync(path.join(binDir, name), path.join(toolsDir, name));
      emitLog(`youtube setup: ${tool.label} is ready.`);
    } finally {
      if (path.dirname(path.resolve(staging)) === path.resolve(toolsDir)) fs.rmSync(staging, { recursive: true, force: true });
    }
  }

  async function prepare(confirm) {
    const current = await inspect();
    const missing = [!current.ytDlpPath && "ytDlp", !current.ffmpegPath && "ffmpeg", !current.jsRuntime && "runtime"].filter(Boolean);
    if (!missing.length) return current;
    if (platform !== "win32" || arch === "ia32") {
      throw new Error(`YouTube needs ${missing.map((key) => windowsTools[key].label).join(", ")}. Automatic setup currently supports 64-bit Windows. Install yt-dlp, FFmpeg/FFprobe, and Deno using your system's package manager, then try again.`);
    }
    if (!await confirm(missing.map((key) => windowsTools[key].label))) return null;
    try {
      for (const key of missing) await install(windowsTools[key]);
      const ready = await inspect();
      if (!ready.ytDlpPath || !ready.ffmpegPath || !ready.jsRuntime) throw new Error("Installed tools could not be started. Please try again.");
      emitLog("youtube setup: Setup complete. Continuing your YouTube download...");
      return ready;
    } catch (error) {
      throw new Error(`YouTube setup could not finish: ${error.message} Check your internet connection and click Start From Link to retry.`);
    }
  }

  return { ensureReady(confirm) {
    if (!pending) pending = prepare(confirm).finally(() => { pending = null; });
    return pending;
  } };
}

module.exports = { createYoutubeSetup };
