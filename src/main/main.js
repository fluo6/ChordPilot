const { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme } = require("electron");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createChordPilotServices, safeFileName, shouldShowBackendLog } = require("../runtime/chordpilot-services");

const isDev = !app.isPackaged;
const appRoot = app.isPackaged ? path.join(process.resourcesPath, "app") : path.join(__dirname, "..", "..");
const backendScript = path.join(appRoot, "backend", "chordpilot.py");
const appIconPath = path.join(appRoot, "src", "assets", "icon.png");

let mainWindow;
let services;

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
  if (isDev) mainWindow.webContents.openDevTools({ mode: "detach" });
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
  if (fs.existsSync(bundledExe)) candidates.push({ command: bundledExe, prefix: [] });
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
    if (process.platform === "darwin") {
      candidates.push({ command: "/opt/homebrew/bin/python3", prefix: [backendScript] });
      candidates.push({ command: "/usr/local/bin/python3", prefix: [backendScript] });
    }
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
    path.join(appRoot, "node_modules", "ffmpeg-static", "ffmpeg"),
    ...(process.platform === "darwin" ? ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg"] : [])
  ];
  for (const candidate of candidates) if (fs.existsSync(candidate)) return candidate;
  try {
    const requiredPath = require("ffmpeg-static");
    if (requiredPath && fs.existsSync(requiredPath)) return requiredPath;
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
    ...(process.platform === "darwin" ? ["/opt/homebrew/bin/yt-dlp", "/usr/local/bin/yt-dlp"] : []),
    binaryName
  ];
  return candidates.find((candidate) => candidate === binaryName || fs.existsSync(candidate)) || binaryName;
}

function getYtDlpFfmpegLocation() {
  const localTools = [
    path.join(appRoot, "Tools"),
    path.join(process.resourcesPath || appRoot, "Tools"),
    path.join(process.cwd(), "Tools")
  ];
  const ffmpegName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  for (const toolsDir of localTools) if (fs.existsSync(path.join(toolsDir, ffmpegName))) return toolsDir;
  const ffmpegPath = getBundledFfmpegPath();
  return ffmpegPath && fs.existsSync(ffmpegPath) ? path.dirname(ffmpegPath) : "";
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

function emitBackendLog(message) {
  if (!shouldShowBackendLog(message)) return;
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("backend:log", message);
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
  return result.canceled || result.filePaths.length === 0 ? null : services.buildAudioPayload(result.filePaths[0]);
});

ipcMain.handle("audio:downloadYoutube", async (_event, url) => services.downloadYoutubeAudio(url));
ipcMain.handle("audio:process", async (_event, payload) => services.processAudioPreview(payload || {}));

ipcMain.handle("app:message", async (_event, payload) => dialog.showMessageBox(mainWindow, {
  type: payload?.type || "error",
  title: String(payload?.title || "ChordPilot"),
  message: String(payload?.message || "An error occurred."),
  detail: String(payload?.detail || ""),
  buttons: ["OK"],
  defaultId: 0,
  cancelId: 0
}));

ipcMain.handle("audio:exportTrack", async (_event, payload = {}) => {
  const sourcePath = String(payload.sourcePath || "");
  const label = safeFileName(payload.label || path.basename(sourcePath, path.extname(sourcePath)), "audio-track");
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
  if (result.canceled || !result.filePath) return null;
  const format = path.extname(result.filePath).slice(1).toLowerCase() || "wav";
  return services.exportAudioTrack({ sourcePath, outputPath: result.filePath, format });
});

ipcMain.handle("audio:lookupMetadata", async (_event, audio) => services.lookupAudioMetadata(audio || {}));

ipcMain.handle("chart:analyze", async (_event, payload) => {
  const audioPath = typeof payload === "string" ? payload : payload.audioPath;
  const mode = typeof payload === "string" ? "fast" : payload.mode || "fast";
  const options = typeof payload === "string" ? {} : payload.options || {};
  return services.analyze({ audioPath, mode, options });
});

ipcMain.handle("chart:export", async (_event, payload) => {
  const { chart, format } = payload;
  const extensions = { txt: "txt", csv: "csv", json: "json", musicxml: "musicxml" };
  const extension = extensions[format] || format;
  const result = await dialog.showSaveDialog(mainWindow, {
    title: `Export ${format.toUpperCase()}`,
    defaultPath: path.join(os.homedir(), "Desktop", `${chart.title || "chord-chart"}.${extension}`),
    filters: [{ name: format.toUpperCase(), extensions: [extension] }]
  });
  if (result.canceled || !result.filePath) return null;
  return services.exportChart({ chart, format, outputPath: result.filePath });
});

ipcMain.handle("session:save", async (_event, session) => {
  const title = session?.chart?.title || session?.audio?.name || "chordpilot-session";
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Save ChordPilot Session",
    defaultPath: path.join(os.homedir(), "Desktop", `${safeFileName(title, "chordpilot-session")}.chordpilot-session.json`),
    filters: [
      { name: "ChordPilot Session", extensions: ["chordpilot-session.json", "json"] },
      { name: "JSON", extensions: ["json"] }
    ]
  });
  return result.canceled || !result.filePath ? null : services.writeSessionFile(result.filePath, session);
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
  return result.canceled || result.filePaths.length === 0 ? null : services.readSessionFile(result.filePaths[0]);
});

ipcMain.handle("session:openPath", async (_event, sessionPath) => services.readSessionFile(sessionPath));

app.whenReady().then(() => {
  const userData = app.getPath("userData");
  services = createChordPilotServices({
    appRoot,
    backendScript,
    tempDir: app.getPath("temp"),
    coverDir: path.join(userData, "covers"),
    importDir: path.join(userData, "youtube-audio"),
    previewDir: app.getPath("temp"),
    pythonCandidates: getBackendCandidates(),
    ffmpegPath: getBundledFfmpegPath() || "ffmpeg",
    ytDlpPath: getYtDlpPath(),
    ytDlpFfmpegLocation: getYtDlpFfmpegLocation(),
    env: backendEnv(process.env),
    toUrl: pathToFileUrl,
    emitLog: emitBackendLog
  });
  createWindow();
});

app.on("before-quit", () => services?.cleanup());
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
