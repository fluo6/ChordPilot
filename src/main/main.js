const { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const https = require("https");
const { spawn } = require("child_process");

const isDev = !app.isPackaged;
const appRoot = app.isPackaged ? path.join(process.resourcesPath, "app") : path.join(__dirname, "..", "..");
const backendScript = path.join(appRoot, "backend", "chordpilot.py");
const appIconPath = path.join(appRoot, "src", "assets", "icon.png");
const downloadPercentRegex = /\[download\]\s+([0-9]+(?:\.[0-9]+)?)%/;

let mainWindow;
const previewAudioPaths = new Set();

function createWindow() {
  nativeTheme.themeSource = "dark";
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    autoHideMenuBar: true,
    backgroundColor: "#0e1014",
    darkTheme: true,
    icon: appIconPath,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(appRoot, "src", "renderer", "index.html"));

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
}

function getBackendCandidates() {
  const bundledExe = process.platform === "win32"
    ? path.join(process.resourcesPath || appRoot, "backend", "chordpilot.exe")
    : path.join(process.resourcesPath || appRoot, "backend", "chordpilot");
  const candidates = [];

  if (process.env.CHORDPILOT_PYTHON) {
    candidates.push({
      command: process.env.CHORDPILOT_PYTHON,
      prefix: [backendScript],
      env: process.env.CHORDPILOT_PYTHONHOME ? pythonEnv(process.env.CHORDPILOT_PYTHONHOME) : process.env
    });
  }

  if (fs.existsSync(bundledExe)) {
    candidates.push({ command: bundledExe, prefix: [] });
  }

  if (process.platform === "win32") {
    const qgisRoot = path.join(process.env.ProgramFiles || "C:\\Program Files", "QGIS 3.42.1");
    const qgisPython = path.join(qgisRoot, "bin", "python.exe");
    const qgisPythonHome = path.join(qgisRoot, "apps", "Python312");
    if (fs.existsSync(qgisPython) && fs.existsSync(qgisPythonHome)) {
      candidates.push({ command: qgisPython, prefix: [backendScript], env: pythonEnv(qgisPythonHome) });
    }

    candidates.push({ command: "py", prefix: ["-3", backendScript] });
    candidates.push({ command: "python", prefix: [backendScript] });
    candidates.push({ command: "python3", prefix: [backendScript] });
  } else {
    candidates.push({ command: "python3", prefix: [backendScript] });
    candidates.push({ command: "python", prefix: [backendScript] });
  }

  return candidates;
}

function getBundledFfmpegPath() {
  const packageBinary = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const candidates = [
    path.join(appRoot, "node_modules", "ffmpeg-static", packageBinary),
    path.join(appRoot, "node_modules", "ffmpeg-static", "ffmpeg.exe"),
    path.join(appRoot, "node_modules", "ffmpeg-static", "ffmpeg")
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  try {
    const requiredPath = require("ffmpeg-static");
    if (requiredPath && fs.existsSync(requiredPath)) {
      return requiredPath;
    }
  } catch (_error) {
    // The packaged app can still run if ffmpeg is on PATH.
  }

  return "";
}

function getYtDlpPath() {
  const binaryName = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
  const candidates = [
    path.join(appRoot, "Tools", binaryName),
    path.join(process.resourcesPath || appRoot, "Tools", binaryName),
    path.join(process.cwd(), "Tools", binaryName),
    binaryName
  ];

  for (const candidate of candidates) {
    if (candidate === binaryName || fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return binaryName;
}

function getYtDlpFfmpegLocation() {
  const localTools = [
    path.join(appRoot, "Tools"),
    path.join(process.resourcesPath || appRoot, "Tools"),
    path.join(process.cwd(), "Tools")
  ];
  const ffmpegName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  for (const toolsDir of localTools) {
    if (fs.existsSync(path.join(toolsDir, ffmpegName))) {
      return toolsDir;
    }
  }

  const ffmpegPath = getBundledFfmpegPath();
  if (ffmpegPath && fs.existsSync(ffmpegPath)) {
    return path.dirname(ffmpegPath);
  }

  return "";
}

function pythonEnv(pythonHome) {
  return {
    ...process.env,
    PYTHONHOME: pythonHome,
    PYTHONPATH: "",
    CHORDPILOT_FFMPEG: getBundledFfmpegPath() || process.env.CHORDPILOT_FFMPEG || ""
  };
}

function backendEnv(baseEnv) {
  return {
    ...baseEnv,
    CHORDPILOT_FFMPEG: getBundledFfmpegPath() || baseEnv.CHORDPILOT_FFMPEG || ""
  };
}

function pathToFileUrl(filePath) {
  return `file://${filePath.replace(/\\/g, "/")}`;
}

function httpsJson(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "ChordPilot/0.1.0 (manual metadata lookup)"
      }
    }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        httpsJson(new URL(response.headers.location, url).toString()).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume();
        reject(new Error(`Metadata lookup returned HTTP ${response.statusCode}`));
        return;
      }

      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(new Error(`Metadata lookup returned invalid JSON: ${error.message}`));
        }
      });
    });
    request.setTimeout(12000, () => request.destroy(new Error("Metadata lookup timed out")));
    request.on("error", reject);
  });
}

function cleanMetadataSearchText(value) {
  return String(value || "")
    .trim()
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function musicBrainzQuery(audio = {}) {
  return [
    cleanMetadataSearchText(audio.title || audio.name),
    cleanMetadataSearchText(audio.artist)
  ].filter(Boolean).join(" ");
}

async function lookupAudioMetadata(audio = {}) {
  const query = musicBrainzQuery(audio);
  if (!query) {
    throw new Error("There is not enough file information to search for metadata.");
  }

  const payload = await httpsJson(`https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&fmt=json&limit=8`);
  const recordings = Array.isArray(payload.recordings) ? payload.recordings : [];
  if (!recordings.length) {
    return null;
  }

  const best = recordings
    .map((recording) => ({
      recording,
      release: Array.isArray(recording.releases) ? recording.releases.find((release) => release.title) || recording.releases[0] : null,
      score: Number(recording.score) || 0
    }))
    .sort((a, b) => b.score - a.score)[0];

  const artist = Array.isArray(best.recording["artist-credit"])
    ? best.recording["artist-credit"].map((item) => item.name).filter(Boolean).join(", ")
    : "";
  const date = best.release?.date || best.recording["first-release-date"] || "";

  return {
    title: best.recording.title || "",
    artist,
    album: best.release?.title || "",
    date: date ? String(date).slice(0, 4) : "",
    coverUrl: best.release?.id ? `https://coverartarchive.org/release/${best.release.id}/front-250` : "",
    metadataSource: "MusicBrainz",
    metadataUrl: best.recording.id ? `https://musicbrainz.org/recording/${best.recording.id}` : "",
    matchScore: best.score
  };
}

function metadataCacheKey(filePath) {
  const stat = fs.statSync(filePath);
  return crypto.createHash("sha1").update(`${filePath}:${stat.size}:${stat.mtimeMs}`).digest("hex");
}

function decodeFfmetadataValue(value) {
  return String(value || "")
    .replace(/\\n/g, "\n")
    .replace(/\\([\\=;#])/g, "$1")
    .trim();
}

function readAudioTags(filePath) {
  const ffmpeg = getBundledFfmpegPath() || "ffmpeg";
  if (!ffmpeg || !fs.existsSync(filePath)) {
    return Promise.resolve({});
  }

  return new Promise((resolve) => {
    const child = spawn(ffmpeg, [
      "-hide_banner",
      "-loglevel", "error",
      "-i", filePath,
      "-f", "ffmetadata",
      "-"
    ], { windowsHide: true });

    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.on("error", () => resolve({}));
    child.on("close", () => {
      const tags = {};
      stdout.split(/\r?\n/).forEach((line) => {
        if (!line || line.startsWith(";") || line.startsWith("[")) {
          return;
        }
        const index = line.indexOf("=");
        if (index <= 0) {
          return;
        }
        const key = line.slice(0, index).trim().toLowerCase();
        const value = decodeFfmetadataValue(line.slice(index + 1));
        if (value) {
          tags[key] = value;
        }
      });
      resolve(tags);
    });
  });
}

function extractAudioCover(filePath) {
  const ffmpeg = getBundledFfmpegPath() || "ffmpeg";
  if (!ffmpeg || !fs.existsSync(filePath)) {
    return Promise.resolve(null);
  }

  const coverDir = path.join(app.getPath("userData"), "covers");
  fs.mkdirSync(coverDir, { recursive: true });
  const coverPath = path.join(coverDir, `${metadataCacheKey(filePath)}.jpg`);
  if (fs.existsSync(coverPath)) {
    return Promise.resolve(coverPath);
  }

  return new Promise((resolve) => {
    const child = spawn(ffmpeg, [
      "-y",
      "-hide_banner",
      "-loglevel", "error",
      "-i", filePath,
      "-an",
      "-map", "0:v:0",
      "-frames:v", "1",
      coverPath
    ], { windowsHide: true });

    child.on("error", () => resolve(null));
    child.on("close", (code) => {
      if (code !== 0 || !fs.existsSync(coverPath)) {
        fs.rmSync(coverPath, { force: true });
        resolve(null);
        return;
      }
      resolve(coverPath);
    });
  });
}

async function buildAudioPayload(filePath) {
  const tags = await readAudioTags(filePath);
  const coverPath = await extractAudioCover(filePath);
  const stat = fs.statSync(filePath);
  const title = tags.title || path.basename(filePath, path.extname(filePath));
  return {
    path: filePath,
    name: path.basename(filePath),
    extension: path.extname(filePath).slice(1).toUpperCase(),
    size: stat.size,
    title,
    artist: tags.artist || tags.album_artist || tags.albumartist || "",
    album: tags.album || "",
    genre: tags.genre || "",
    date: tags.date || tags.year || "",
    track: tags.track || "",
    coverPath: coverPath || "",
    coverUrl: coverPath ? pathToFileUrl(coverPath) : "",
    url: pathToFileUrl(filePath)
  };
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, number));
}

function chainAtempo(rate) {
  const parts = [];
  let remaining = Math.max(0.25, Math.min(4, Number(rate) || 1));
  while (remaining > 2) {
    parts.push("atempo=2");
    remaining /= 2;
  }
  while (remaining < 0.5) {
    parts.push("atempo=0.5");
    remaining /= 0.5;
  }
  parts.push(`atempo=${remaining.toFixed(6)}`);
  return parts;
}

function buildAudioPreviewFilter(semitones, tempoRate) {
  const pitchFactor = Math.pow(2, semitones / 12);
  const filters = [];
  if (Math.abs(semitones) > 0.001) {
    filters.push("aresample=48000");
    filters.push(`asetrate=${(48000 * pitchFactor).toFixed(3)}`);
    filters.push("aresample=48000");
    filters.push(...chainAtempo(tempoRate / pitchFactor));
  } else {
    filters.push(...chainAtempo(tempoRate));
  }
  return filters.join(",");
}

function safeFileName(value, fallback = "audio") {
  return String(value || fallback).replace(/[<>:"/\\|?*]+/g, "-").trim() || fallback;
}

function normalizeYoutubeUrl(rawUrl) {
  const value = String(rawUrl || "").trim();
  if (!value) {
    return "";
  }

  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const isYoutubeHost = host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be";
    if (!isYoutubeHost) {
      throw new Error("Only YouTube links are supported.");
    }
    if (host === "youtu.be") {
      const id = url.pathname.replace(/^\/+|\/+$/g, "");
      return id ? `https://www.youtube.com/watch?v=${encodeURIComponent(id)}` : value;
    }
    const videoId = url.searchParams.get("v");
    return videoId ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}` : value;
  } catch (error) {
    if (error.message === "Only YouTube links are supported.") {
      throw error;
    }
    throw new Error("Enter a valid YouTube link.");
  }
}

function parseYtDlpProgress(line) {
  const match = downloadPercentRegex.exec(line);
  if (match) {
    return `youtube: downloading ${Number.parseFloat(match[1]).toFixed(1)}%`;
  }
  if (
    line.includes("[ExtractAudio]") ||
    line.includes("[EmbedThumbnail]") ||
    line.includes("[Metadata]") ||
    line.includes("Deleting original file") ||
    line.includes("[download] Destination:")
  ) {
    return `youtube: ${line.trim()}`;
  }
  return "";
}

function firstUsefulLine(...chunks) {
  for (const chunk of chunks) {
    for (const line of String(chunk || "").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }
  return "No details were returned.";
}

async function downloadYoutubeAudio(rawUrl) {
  const url = normalizeYoutubeUrl(rawUrl);
  const ytDlp = getYtDlpPath();
  const ffmpegLocation = getYtDlpFfmpegLocation();
  const outputDir = path.join(app.getPath("userData"), "youtube-audio");
  fs.mkdirSync(outputDir, { recursive: true });

  const args = [
    "--no-playlist",
    "-x",
    "--audio-format", "mp3",
    "--audio-quality", "0",
    "--embed-thumbnail",
    "--add-metadata",
    "--print", "after_move:filepath",
    "-o", path.join(outputDir, "%(title).180B [%(id)s].%(ext)s"),
    url
  ];

  if (ffmpegLocation) {
    args.splice(8, 0, "--ffmpeg-location", ffmpegLocation);
  }

  emitBackendLog(`youtube: starting download with ${ytDlp}`);

  return new Promise((resolve, reject) => {
    const child = spawn(ytDlp, args, {
      env: {
        ...process.env,
        TEMP: outputDir,
        TMP: outputDir,
        PYINSTALLER_CACHE_DIR: path.join(app.getPath("userData"), "ToolCache")
      },
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";

    const handleChunk = (chunk, stream) => {
      const text = chunk.toString("utf8");
      if (stream === "stdout") {
        stdout += text;
      } else {
        stderr += text;
      }
      text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).forEach((line) => {
        const progress = parseYtDlpProgress(line);
        if (progress) {
          emitBackendLog(progress);
        }
      });
    };

    child.stdout.on("data", (chunk) => handleChunk(chunk, "stdout"));
    child.stderr.on("data", (chunk) => handleChunk(chunk, "stderr"));
    child.on("error", (error) => reject(new Error(`Could not start yt-dlp: ${error.message}`)));
    child.on("close", async (code) => {
      if (code !== 0) {
        reject(new Error(`YouTube download failed: ${firstUsefulLine(stderr, stdout)}`));
        return;
      }

      const downloadedPath = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).reverse().find((line) => fs.existsSync(line));
      if (!downloadedPath) {
        reject(new Error("YouTube download completed, but the audio file path was not returned."));
        return;
      }

      try {
        const audio = await buildAudioPayload(downloadedPath);
        resolve({
          ...audio,
          sourceUrl: url,
          metadataSource: audio.metadataSource || "YouTube"
        });
      } catch (error) {
        reject(error);
      }
    });
  });
}

function audioExportArgsForExtension(extension) {
  if (extension === "mp3") {
    return ["-codec:a", "libmp3lame", "-b:a", "192k"];
  }
  if (extension === "flac") {
    return ["-codec:a", "flac"];
  }
  if (extension === "m4a") {
    return ["-codec:a", "aac", "-b:a", "192k"];
  }
  return ["-codec:a", "pcm_s16le", "-ar", "48000"];
}

function processAudioPreview({ audioPath, semitones = 0, tempoRate = 1 }) {
  const ffmpeg = getBundledFfmpegPath() || "ffmpeg";
  const sourcePath = String(audioPath || "");
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    return Promise.reject(new Error("Choose an audio file before applying audio preview."));
  }
  if (!ffmpeg) {
    return Promise.reject(new Error("ffmpeg is unavailable, so audio preview cannot be rendered."));
  }

  const cleanSemitones = clampNumber(semitones, 0, -12, 12);
  const cleanTempoRate = clampNumber(tempoRate, 1, 0.5, 2);
  const outputPath = path.join(app.getPath("temp"), `chordpilot-preview-${Date.now()}-${Math.random().toString(16).slice(2)}.wav`);
  const filter = buildAudioPreviewFilter(cleanSemitones, cleanTempoRate);

  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, [
      "-y",
      "-hide_banner",
      "-loglevel", "error",
      "-i", sourcePath,
      "-vn",
      "-af", filter,
      "-ar", "48000",
      "-ac", "2",
      outputPath
    ], {
      windowsHide: true
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        fs.rmSync(outputPath, { force: true });
        reject(new Error((stderr || `ffmpeg exited with code ${code}`).trim()));
        return;
      }
      resolve({
        path: outputPath,
        url: pathToFileUrl(outputPath),
        semitones: cleanSemitones,
        tempoRate: cleanTempoRate
      });
      previewAudioPaths.add(outputPath);
    });
  });
}

async function exportAudioTrack(payload = {}) {
  const ffmpeg = getBundledFfmpegPath() || "ffmpeg";
  const sourcePath = String(payload.sourcePath || "");
  const label = safeFileName(payload.label || path.basename(sourcePath, path.extname(sourcePath)), "audio-track");

  if (!sourcePath || !fs.existsSync(sourcePath)) {
    throw new Error("Audio source is missing for export.");
  }
  if (!ffmpeg) {
    throw new Error("ffmpeg is unavailable, so audio cannot be exported.");
  }

  const result = await dialog.showSaveDialog(mainWindow, {
    title: `Export ${label}`,
    defaultPath: path.join(os.homedir(), "Desktop", `${label}.wav`),
    filters: [
      { name: "WAV audio", extensions: ["wav"] },
      { name: "MP3 audio", extensions: ["mp3"] },
      { name: "FLAC audio", extensions: ["flac"] },
      { name: "M4A audio", extensions: ["m4a"] }
    ]
  });

  if (result.canceled || !result.filePath) {
    return null;
  }

  const extension = path.extname(result.filePath).slice(1).toLowerCase() || "wav";
  const outputPath = result.filePath;

  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, [
      "-y",
      "-hide_banner",
      "-loglevel", "error",
      "-i", sourcePath,
      "-vn",
      ...audioExportArgsForExtension(extension),
      outputPath
    ], {
      windowsHide: true
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        fs.rmSync(outputPath, { force: true });
        reject(new Error((stderr || `ffmpeg exited with code ${code}`).trim()));
        return;
      }
      resolve({ path: outputPath, format: extension });
    });
  });
}

function cleanupPreviewAudio() {
  previewAudioPaths.forEach((previewPath) => fs.rmSync(previewPath, { force: true }));
  previewAudioPaths.clear();
}

function enrichChartPayload(payload) {
  if (payload && payload.stems && Array.isArray(payload.stems.stems)) {
    payload.stems.stems = payload.stems.stems.map((stem) => ({
      ...stem,
      url: stem.path ? pathToFileUrl(stem.path) : ""
    }));
  }
  return payload;
}

function emitBackendLog(message) {
  if (!shouldShowBackendLog(message)) {
    return;
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("backend:log", message);
  }
}

function shouldShowBackendLog(message) {
  return ![
    "Error in sitecustomize",
    "PermissionError: [WinError 5] Access is denied: 'C:\\Users\\fujial\\AppData\\Local\\Microsoft\\WindowsApps'"
  ].some((noise) => message.includes(noise));
}

function readSessionFile(sessionPath) {
  const session = JSON.parse(fs.readFileSync(sessionPath, "utf8"));
  if (session?.audio?.path) {
    session.audio = {
      ...session.audio,
      name: session.audio.name || path.basename(session.audio.path),
      url: pathToFileUrl(session.audio.path),
      coverUrl: session.audio.coverPath && fs.existsSync(session.audio.coverPath) ? pathToFileUrl(session.audio.coverPath) : session.audio.coverUrl || "",
      exists: fs.existsSync(session.audio.path)
    };
  }
  if (session?.chart) {
    session.chart = enrichChartPayload(session.chart);
  }
  return { path: sessionPath, session };
}

function runBackend(args, input) {
  const candidates = getBackendCandidates();
  const errors = [];

  function attempt(index) {
    if (index >= candidates.length) {
      return Promise.reject(new Error(errors.join("\n") || "No Python backend could be started."));
    }

    const candidate = candidates[index];

    return new Promise((resolve, reject) => {
      let settled = false;
      emitBackendLog(`backend: trying ${candidate.command}`);
      const child = spawn(candidate.command, [...candidate.prefix, ...args], {
        cwd: appRoot,
        env: backendEnv(candidate.env || process.env),
        windowsHide: true
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on("data", (chunk) => {
        const text = chunk.toString();
        stderr += text;
        text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).forEach(emitBackendLog);
      });

      child.on("error", (error) => {
        if (settled) {
          return;
        }
        settled = true;
        const message = `${candidate.command}: ${error.message}`;
        errors.push(message);
        emitBackendLog(`backend: ${message}`);
        attempt(index + 1).then(resolve).catch(reject);
      });

      child.on("close", (code) => {
        if (settled) {
          return;
        }
        settled = true;
        if (code !== 0) {
          const message = `${candidate.command}: ${stderr || `exited with code ${code}`}`;
          errors.push(message);
          emitBackendLog(`backend: ${candidate.command} failed, trying next option`);
          attempt(index + 1).then(resolve).catch(reject);
          return;
        }

        try {
          const payload = JSON.parse(stdout);
          emitBackendLog("backend: complete");
          resolve(payload);
        } catch (error) {
          reject(new Error(`Backend returned invalid JSON: ${error.message}`));
        }
      });

      if (input) {
        child.stdin.write(input);
      }
      child.stdin.end();
    });
  }

  return attempt(0);
}

ipcMain.handle("audio:choose", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Choose an audio file",
    properties: ["openFile"],
    filters: [
      { name: "Audio", extensions: ["mp3", "wav", "aif", "aiff", "flac", "m4a"] },
      { name: "All Files", extensions: ["*"] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const filePath = result.filePaths[0];
  return buildAudioPayload(filePath);
});

ipcMain.handle("audio:downloadYoutube", async (_event, url) => {
  return downloadYoutubeAudio(url);
});

ipcMain.handle("audio:process", async (_event, payload) => {
  return processAudioPreview(payload || {});
});

ipcMain.handle("app:message", async (_event, payload) => {
  const message = String(payload?.message || "An error occurred.");
  const detail = String(payload?.detail || "");
  const title = String(payload?.title || "ChordPilot");
  return dialog.showMessageBox(mainWindow, {
    type: payload?.type || "error",
    title,
    message,
    detail,
    buttons: ["OK"],
    defaultId: 0,
    cancelId: 0
  });
});

ipcMain.handle("audio:exportTrack", async (_event, payload) => {
  return exportAudioTrack(payload || {});
});

ipcMain.handle("audio:lookupMetadata", async (_event, audio) => {
  return lookupAudioMetadata(audio || {});
});

ipcMain.handle("chart:analyze", async (_event, payload) => {
  const audioPath = typeof payload === "string" ? payload : payload.audioPath;
  const mode = typeof payload === "string" ? "fast" : payload.mode || "fast";
  const options = typeof payload === "string" ? {} : payload.options || {};
  return enrichChartPayload(await runBackend(["analyze", audioPath, "--mode", mode, "--options", JSON.stringify(options)]));
});

ipcMain.handle("chart:export", async (_event, payload) => {
  const { chart, format } = payload;
  const extensions = {
    txt: "txt",
    csv: "csv",
    json: "json",
    musicxml: "musicxml"
  };

  const extension = extensions[format] || format;
  const defaultName = `${chart.title || "chord-chart"}.${extension}`;
  const result = await dialog.showSaveDialog(mainWindow, {
    title: `Export ${format.toUpperCase()}`,
    defaultPath: path.join(os.homedir(), "Desktop", defaultName),
    filters: [{ name: format.toUpperCase(), extensions: [extension] }]
  });

  if (result.canceled || !result.filePath) {
    return null;
  }

  const tempPath = path.join(app.getPath("temp"), `chordpilot-${Date.now()}.json`);
  fs.writeFileSync(tempPath, JSON.stringify(chart, null, 2), "utf8");

  try {
    return await runBackend(["export", tempPath, format, result.filePath]);
  } finally {
    fs.rmSync(tempPath, { force: true });
  }
});

ipcMain.handle("session:save", async (_event, session) => {
  const title = session?.chart?.title || session?.audio?.name || "chordpilot-session";
  const safeTitle = String(title).replace(/[<>:"/\\|?*]+/g, "-").trim() || "chordpilot-session";
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Save ChordPilot Session",
    defaultPath: path.join(os.homedir(), "Desktop", `${safeTitle}.chordpilot-session.json`),
    filters: [
      { name: "ChordPilot Session", extensions: ["chordpilot-session.json", "json"] },
      { name: "JSON", extensions: ["json"] }
    ]
  });

  if (result.canceled || !result.filePath) {
    return null;
  }

  fs.writeFileSync(result.filePath, JSON.stringify(session, null, 2), "utf8");
  return { path: result.filePath };
});

ipcMain.handle("session:open", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Open ChordPilot Session",
    properties: ["openFile"],
    filters: [
      { name: "ChordPilot Session", extensions: ["chordpilot-session.json", "json"] },
      { name: "JSON", extensions: ["json"] },
      { name: "All Files", extensions: ["*"] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return readSessionFile(result.filePaths[0]);
});

ipcMain.handle("session:openPath", async (_event, sessionPath) => {
  return readSessionFile(sessionPath);
});

app.whenReady().then(createWindow);

app.on("before-quit", cleanupPreviewAudio);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
