const childProcess = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const { createChordPilotServices } = require("../runtime/chordpilot-services");
const { getBuildInfo } = require("../runtime/build-info");
const { createWebApp } = require("./app");
const { createStorage } = require("./storage");
const { createLogBroker, createSerialQueue } = require("./work-queue");

const DEFAULT_UPLOAD_LIMIT_BYTES = 512 * 1024 * 1024;
const DEFAULT_CHILD_SHUTDOWN_GRACE_MS = 2_000;
const DEFAULT_CHILD_KILL_WAIT_MS = 250;

function positiveInteger(value, fallback, name, maximum = Number.MAX_SAFE_INTEGER) {
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > maximum) {
    throw new Error(`${name} must be a positive integer${maximum < Number.MAX_SAFE_INTEGER ? ` no greater than ${maximum}` : ""}.`);
  }
  return parsed;
}

function parseWebEnvironment(env = process.env) {
  const dataRoot = path.resolve(env.CHORDPILOT_DATA_ROOT || path.join(process.cwd(), ".chordpilot-data"));
  return {
    host: String(env.HOST || "0.0.0.0"),
    port: positiveInteger(env.PORT, 3000, "PORT", 65535),
    dataRoot,
    cacheDir: path.resolve(env.CHORDPILOT_CACHE_DIR || path.join(dataRoot, "cache")),
    uploadLimitBytes: positiveInteger(
      env.CHORDPILOT_UPLOAD_LIMIT_BYTES,
      DEFAULT_UPLOAD_LIMIT_BYTES,
      "CHORDPILOT_UPLOAD_LIMIT_BYTES"
    ),
    pythonPath: String(env.CHORDPILOT_PYTHON || "python3"),
    ffmpegPath: String(env.CHORDPILOT_FFMPEG || "ffmpeg"),
    ytDlpPath: String(env.CHORDPILOT_YTDLP || "yt-dlp")
  };
}

function createWebRuntime(env = process.env, {
  spawnImpl = childProcess.spawn,
  childShutdownGraceMs = DEFAULT_CHILD_SHUTDOWN_GRACE_MS,
  childShutdownKillWaitMs = DEFAULT_CHILD_KILL_WAIT_MS
} = {}) {
  const config = parseWebEnvironment(env);
  const appRoot = path.resolve(__dirname, "../..");
  const storage = createStorage({ root: config.dataRoot, cacheRoot: config.cacheDir });
  storage.initialize();
  fs.mkdirSync(config.cacheDir, { recursive: true });
  fs.mkdirSync(path.join(config.cacheDir, "torch"), { recursive: true });

  const queue = createSerialQueue();
  const logBroker = createLogBroker();
  const activeChildren = new Set();
  const childRecords = new Map();
  const sockets = new Set();
  let shuttingDown = false;
  const gracefulChildWait = Number.isFinite(childShutdownGraceMs) && childShutdownGraceMs >= 0
    ? childShutdownGraceMs
    : DEFAULT_CHILD_SHUTDOWN_GRACE_MS;
  const forcedChildWait = Number.isFinite(childShutdownKillWaitMs) && childShutdownKillWaitMs >= 0
    ? childShutdownKillWaitMs
    : DEFAULT_CHILD_KILL_WAIT_MS;

  function trackedSpawn(...args) {
    if (shuttingDown) {
      const error = new Error("The server is shutting down.");
      error.code = "SERVER_SHUTTING_DOWN";
      throw error;
    }
    const child = spawnImpl(...args);
    activeChildren.add(child);
    let settleExit;
    const exit = new Promise((resolve) => {
      let settled = false;
      settleExit = () => {
        if (settled) return;
        settled = true;
        activeChildren.delete(child);
        childRecords.delete(child);
        resolve();
      };
      child.once("close", settleExit);
      child.once("error", settleExit);
    });
    childRecords.set(child, { child, exit, settleExit });
    return child;
  }

  const childEnv = {
    ...env,
    CHORDPILOT_CACHE_DIR: config.cacheDir,
    CHORDPILOT_DATA_ROOT: config.dataRoot,
    CHORDPILOT_FFMPEG: config.ffmpegPath,
    TORCH_HOME: path.join(config.cacheDir, "torch")
  };
  if (env.CHORDPILOT_AUTO_INSTALL_DEMUCS !== undefined && String(env.CHORDPILOT_AUTO_INSTALL_DEMUCS).trim() !== "") {
    childEnv.CHORDPILOT_AUTO_INSTALL_DEMUCS = String(env.CHORDPILOT_AUTO_INSTALL_DEMUCS);
  } else {
    delete childEnv.CHORDPILOT_AUTO_INSTALL_DEMUCS;
  }

  const services = createChordPilotServices({
    appRoot,
    backendScript: path.join(appRoot, "backend", "chordpilot.py"),
    tempDir: path.join(config.dataRoot, "tmp"),
    coverDir: path.join(config.dataRoot, "tmp"),
    importDir: path.join(config.dataRoot, "tmp"),
    previewDir: path.join(config.dataRoot, "tmp"),
    pythonCandidates: [{ command: config.pythonPath, prefix: [path.join(appRoot, "backend", "chordpilot.py")] }],
    ffmpegPath: config.ffmpegPath,
    ytDlpPath: config.ytDlpPath,
    env: childEnv,
    toUrl: (filePath) => filePath,
    emitLog: (message) => logBroker.publish(message),
    spawnImpl: trackedSpawn
  });
  const buildInfo = getBuildInfo({ appRoot });
  const app = createWebApp({
    rendererRoot: path.join(appRoot, "src", "renderer"),
    storage,
    services,
    queue,
    logBroker,
    uploadLimitBytes: config.uploadLimitBytes,
    buildInfo
  });
  const server = http.createServer(app);
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });

  let startPromise;
  let stopPromise;

  async function closeHttpServer() {
    const pendingStart = startPromise;
    if (pendingStart) {
      try {
        await pendingStart;
      } catch (_error) {
        // A failed bind leaves no listening server to close.
      }
    }
    if (!server.listening) return;
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error && error.code !== "ERR_SERVER_NOT_RUNNING") reject(error);
        else resolve();
      });
    });
  }

  async function waitForChildExits(records, timeoutMs) {
    if (!records.length) return;
    let timer;
    try {
      await Promise.race([
        Promise.all(records.map((record) => record.exit)),
        new Promise((resolve) => { timer = setTimeout(resolve, timeoutMs); })
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function forceSettleChild(record, error) {
    if (!activeChildren.has(record.child)) return;
    try {
      record.child.emit("error", error);
    } catch (_error) {
      // Tracking still has to settle if a child listener throws during forced release.
    } finally {
      record.settleExit();
    }
  }

  function signalChildren(records, signal) {
    for (const record of records) {
      if (!activeChildren.has(record.child)) continue;
      try {
        record.child.kill(signal);
      } catch (cause) {
        const error = new Error(`Child process could not be signalled during server shutdown: ${cause.message}`);
        error.code = "SERVER_SHUTTING_DOWN";
        error.cause = cause;
        forceSettleChild(record, error);
      }
    }
  }

  async function terminateActiveChildren() {
    const records = [...activeChildren].map((child) => childRecords.get(child)).filter(Boolean);
    signalChildren(records, "SIGTERM");
    await waitForChildExits(records, gracefulChildWait);

    const remaining = records.filter((record) => activeChildren.has(record.child));
    signalChildren(remaining, "SIGKILL");
    await waitForChildExits(remaining, forcedChildWait);
    for (const record of remaining.filter((candidate) => activeChildren.has(candidate.child))) {
      const error = new Error("Child process did not exit during server shutdown.");
      error.code = "SERVER_SHUTTING_DOWN";
      forceSettleChild(record, error);
    }
  }

  function start() {
    if (stopPromise) {
      const error = new Error("The server is shutting down.");
      error.code = "SERVER_SHUTTING_DOWN";
      return Promise.reject(error);
    }
    if (server.listening) return Promise.resolve(server.address());
    if (startPromise) return startPromise;
    startPromise = new Promise((resolve, reject) => {
      const onError = (error) => {
        server.off("listening", onListening);
        startPromise = undefined;
        reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        resolve(server.address());
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(config.port, config.host);
    });
    return startPromise;
  }

  function stop() {
    if (stopPromise) return stopPromise;
    shuttingDown = true;
    queue.close({ cancelPending: true });
    stopPromise = (async () => {
      const serverClosed = closeHttpServer();
      await terminateActiveChildren();
      await queue.idle();
      services.cleanup();
      logBroker.close();
      for (const socket of sockets) socket.destroy();
      if (typeof server.closeAllConnections === "function") server.closeAllConnections();
      await serverClosed;
    })();
    return stopPromise;
  }

  return { app, server, storage, services, queue, logBroker, config, buildInfo, start, stop };
}

async function run() {
  const runtime = createWebRuntime(process.env);
  const shutdown = async () => {
    try {
      await runtime.stop();
    } catch (error) {
      process.exitCode = 1;
      console.error(error);
    }
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  try {
    const address = await runtime.start();
    const host = typeof address === "object" && address ? address.address : runtime.config.host;
    const port = typeof address === "object" && address ? address.port : runtime.config.port;
    console.log(`ChordPilot web runtime v${runtime.buildInfo?.version || "0.1.0"} (built ${runtime.buildInfo?.builtAt || "unknown"}) listening on http://${host}:${port}`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
    await runtime.stop();
  }
}

if (require.main === module) {
  run();
}

module.exports = { createWebRuntime, parseWebEnvironment, positiveInteger, run };
