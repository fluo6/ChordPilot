const express = require("express");
const multer = require("multer");
const fs = require("node:fs");
const path = require("node:path");

const { HttpError, asyncRoute } = require("./http-errors");

const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "flac", "m4a", "aac", "ogg"]);
const AUDIO_FORMAT_MESSAGE = "Upload an MP3, WAV, FLAC, M4A, AAC, or OGG audio file.";
const CHART_EXPORT_FORMATS = new Set(["txt", "csv", "json", "musicxml"]);
const AUDIO_EXPORT_FORMATS = new Set(["wav", "mp3", "flac", "m4a"]);
const SESSION_UPLOAD_LIMIT_BYTES = 10 * 1024 * 1024;

function inlineFilename(name) {
  return path.basename(String(name || "media"))
    .replace(/[<>:"/\\|?*\x00-\x1f]+/g, "-")
    .replace(/[^\x20-\x7e]+/g, "-")
    .replace(/"/g, "-") || "media";
}

function apiError(error) {
  if (error instanceof HttpError) return error;
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    return new HttpError(413, "FILE_TOO_LARGE", "Uploaded file is too large.");
  }
  if (error instanceof multer.MulterError) {
    return new HttpError(400, "INVALID_UPLOAD", "Upload exactly one audio file in the audio field.");
  }
  if (error.type === "entity.parse.failed") {
    return new HttpError(400, "INVALID_JSON", "Request body must be valid JSON.");
  }
  if (error.type === "entity.too.large") {
    return new HttpError(413, "PAYLOAD_TOO_LARGE", "Request body is too large.");
  }
  if (error.code === "INVALID_MEDIA_ID") {
    return new HttpError(400, "INVALID_MEDIA_ID", "Invalid media ID.");
  }
  if (error.code === "INVALID_SESSION_ID") {
    return new HttpError(400, "INVALID_SESSION_ID", "Invalid session ID.");
  }
  if (error.code === "INVALID_SESSION") {
    return new HttpError(400, "INVALID_SESSION", "Session data is invalid.");
  }
  return new HttpError(500, "INTERNAL_ERROR", "An unexpected server error occurred.");
}

function removeTempFile(filePath) {
  if (!filePath) return;
  try {
    fs.rmSync(filePath, { force: true });
  } catch (_error) {
    // The request must still receive the original stable API error.
  }
}

function audioExtension(name) {
  return path.extname(String(name || "")).slice(1).toLowerCase();
}

function exportFilename(name, format) {
  const stem = path.basename(inlineFilename(name || "chordpilot-export"), path.extname(inlineFilename(name || "chordpilot-export")));
  return `${stem || "chordpilot-export"}.${format}`;
}

function withoutMediaPaths(value) {
  if (Array.isArray(value)) return value.map(withoutMediaPaths);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !["path", "coverPath", "url", "coverUrl"].includes(key))
    .map(([key, child]) => [key, withoutMediaPaths(child)]));
}

function createWebApp({ rendererRoot, storage, services, queue, logBroker, uploadLimitBytes }) {
  const app = express();
  const indexPath = path.join(rendererRoot, "index.html");
  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, callback) => {
        try {
          callback(null, path.dirname(storage.createTempPath(".part")));
        } catch (error) {
          callback(error);
        }
      },
      filename: (_req, _file, callback) => {
        try {
          callback(null, path.basename(storage.createTempPath(".part")));
        } catch (error) {
          callback(error);
        }
      }
    }),
    limits: { fileSize: uploadLimitBytes, files: 1 },
    fileFilter: (_req, file, callback) => {
      if (!AUDIO_EXTENSIONS.has(audioExtension(file.originalname))) {
        callback(new HttpError(400, "UNSUPPORTED_AUDIO_FORMAT", AUDIO_FORMAT_MESSAGE));
        return;
      }
      callback(null, true);
    }
  });
  const sessionUpload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, callback) => {
        try {
          callback(null, path.dirname(storage.createTempPath(".part")));
        } catch (error) {
          callback(error);
        }
      },
      filename: (_req, _file, callback) => {
        try {
          callback(null, path.basename(storage.createTempPath(".json.part")));
        } catch (error) {
          callback(error);
        }
      }
    }),
    limits: { fileSize: SESSION_UPLOAD_LIMIT_BYTES, files: 1 }
  });

  async function resolveMedia(id) {
    const media = await storage.resolveMedia(id);
    if (!media) {
      throw new HttpError(404, "MEDIA_NOT_FOUND", "Media not found.");
    }
    return media;
  }

  async function normalizeAudio(payload, media, { copy = false, kind = "source" } = {}) {
    const safePayload = withoutMediaPaths(payload || {});
    const source = media || payload;
    const publicMedia = await storage.normalizeMedia(source, kind, { copy });
    const coverSource = payload?.cover || (payload?.coverPath ? {
      path: payload.coverPath,
      name: path.basename(payload.coverPath),
      kind: "cover"
    } : null);
    const cover = await storage.normalizeMedia(coverSource, "cover", { copy });
    return {
      ...safePayload,
      ...publicMedia,
      ...(cover ? { cover } : {})
    };
  }

  async function normalizePreview(payload) {
    const media = await storage.normalizeMedia(payload, "preview", { copy: false });
    return {
      ...withoutMediaPaths(payload || {}),
      ...media
    };
  }

  function sessionResponse(saved) {
    return {
      id: saved.id,
      path: saved.id,
      session: saved.session,
      downloadUrl: `/api/sessions/${saved.id}/download`
    };
  }

  async function registerExport({ outputPath, filename, format }) {
    const media = await storage.registerExisting({
      sourcePath: outputPath,
      originalName: filename,
      kind: "export",
      copy: false
    });
    return { downloadUrl: media.url, filename, format };
  }

  app.use("/api", express.json({ limit: "10mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, queue: queue.state() });
  });

  app.get("/api/events", (req, res) => {
    res.status(200);
    res.set({
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream"
    });

    const unsubscribe = logBroker.subscribe((message) => {
      res.write(`event: log\ndata: ${JSON.stringify(message)}\n\n`);
    });
    const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 20_000);
    let closed = false;
    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      unsubscribe();
    };
    req.once("close", cleanup);
    res.once("close", cleanup);
    res.flushHeaders();
  });

  app.get("/api/media/:id", asyncRoute(async (req, res) => {
    const media = await resolveMedia(req.params.id);
    await new Promise((resolve, reject) => {
      res.sendFile(media.path, {
        acceptRanges: true,
        headers: { "Content-Disposition": `inline; filename="${inlineFilename(media.name)}"` }
      }, (error) => (error ? reject(error) : resolve()));
    });
  }));

  app.post("/api/media/upload", (req, res, next) => {
    upload.single("audio")(req, res, (error) => {
      if (error) {
        removeTempFile(req.file?.path);
        next(error);
        return;
      }
      next();
    });
  }, asyncRoute(async (req, res) => {
    if (!req.file) {
      throw new HttpError(400, "AUDIO_REQUIRED", "Upload one audio file in the audio field.");
    }
    let media;
    try {
      media = await storage.commitMedia({
        tempPath: req.file.path,
        originalName: req.file.originalname,
        kind: "source"
      });
    } finally {
      removeTempFile(req.file.path);
    }
    const payload = typeof services.buildAudioPayload === "function"
      ? await services.buildAudioPayload(media.path)
      : {};
    res.json({ audio: await normalizeAudio(payload, media, { kind: "source" }) });
  }));

  app.post("/api/metadata", asyncRoute(async (req, res) => {
    const id = req.body?.audio?.id;
    const media = await resolveMedia(id);
    const audio = { ...req.body.audio, ...media };
    Object.defineProperty(audio, "path", { value: media.path, enumerable: false });
    const metadata = await services.lookupAudioMetadata(audio);
    res.json({ metadata: withoutMediaPaths(metadata) });
  }));

  app.post("/api/youtube", asyncRoute(async (req, res) => {
    const audio = await queue.enqueue("youtube", async () => {
      const downloaded = await services.downloadYoutubeAudio(req.body?.url);
      return normalizeAudio(downloaded, null, { copy: false, kind: "source" });
    });
    res.json({ audio });
  }));

  app.post("/api/preview", asyncRoute(async (req, res) => {
    const media = await resolveMedia(req.body?.mediaId);
    const preview = await queue.enqueue("preview", async () => {
      const generated = await services.processAudioPreview({
        audioPath: media.path,
        semitones: req.body?.semitones,
        tempoRate: req.body?.tempoRate
      });
      return normalizePreview(generated);
    });
    res.json({ preview });
  }));

  app.post("/api/analyze", asyncRoute(async (req, res) => {
    const media = await resolveMedia(req.body?.mediaId);
    const chart = await queue.enqueue("analysis", async () => {
      const result = await services.analyze({
        audioPath: media.path,
        mode: req.body?.mode || "fast",
        options: req.body?.options || {}
      });
      return storage.normalizeChart(result, { copy: false });
    });
    res.json({ chart });
  }));

  app.post("/api/sessions", asyncRoute(async (req, res) => {
    storage.assertSessionSchema(req.body);
    res.json(sessionResponse(await storage.saveSession(req.body)));
  }));

  app.get("/api/sessions", asyncRoute(async (_req, res) => {
    const sessions = storage.listSessions().map((stored) => ({
      id: stored.id,
      title: stored.session?.chart?.title || stored.session?.audio?.name || "Untitled",
      audioName: stored.session?.audio?.name || "",
      savedAt: stored.createdAt
    }));
    res.json({ sessions });
  }));

  app.get("/api/sessions/:id", asyncRoute(async (req, res) => {
    const opened = await storage.openSession(req.params.id);
    if (!opened) {
      throw new HttpError(404, "SESSION_NOT_FOUND", "Session not found.");
    }
    res.json(sessionResponse(opened));
  }));

  app.get("/api/sessions/:id/download", asyncRoute(async (req, res) => {
    const session = storage.portableSession(req.params.id);
    if (!session) {
      throw new HttpError(404, "SESSION_NOT_FOUND", "Session not found.");
    }
    const title = session.chart?.title || session.audio?.name || "chordpilot-session";
    res.attachment(`${path.basename(inlineFilename(title), path.extname(inlineFilename(title)))}.chordpilot-session.json`);
    res.json(session);
  }));

  app.post("/api/sessions/import", (req, res, next) => {
    sessionUpload.single("session")(req, res, (error) => {
      if (error) {
        removeTempFile(req.file?.path);
        next(error);
        return;
      }
      next();
    });
  }, asyncRoute(async (req, res) => {
    if (!req.file) {
      throw new HttpError(400, "SESSION_REQUIRED", "Upload one session file in the session field.");
    }
    const imported = await storage.importSession(req.file.path);
    res.json(sessionResponse(imported));
  }));

  app.post("/api/exports/chart", asyncRoute(async (req, res) => {
    const format = String(req.body?.format || "").toLowerCase();
    if (!CHART_EXPORT_FORMATS.has(format)) {
      throw new HttpError(400, "UNSUPPORTED_CHART_FORMAT", "Unsupported chart export format.");
    }
    const filename = exportFilename(req.body?.chart?.title || "chord-chart", format);
    const outputPath = storage.createGeneratedPath(`.part.${format}`);
    const exported = await queue.enqueue("chart-export", async () => {
      try {
        await services.exportChart({ chart: withoutMediaPaths(req.body?.chart || {}), format, outputPath });
        return await registerExport({ outputPath, filename, format });
      } catch (error) {
        removeTempFile(outputPath);
        throw error;
      }
    });
    res.json(exported);
  }));

  app.post("/api/exports/audio", asyncRoute(async (req, res) => {
    const format = String(req.body?.format || "").toLowerCase();
    if (!AUDIO_EXPORT_FORMATS.has(format)) {
      throw new HttpError(400, "UNSUPPORTED_AUDIO_FORMAT", "Unsupported audio export format.");
    }
    const source = await resolveMedia(req.body?.mediaId);
    const filename = exportFilename(req.body?.filename || source.name, format);
    const outputPath = storage.createGeneratedPath(`.part.${format}`);
    const exported = await queue.enqueue("audio-export", async () => {
      try {
        await services.exportAudioTrack({ sourcePath: source.path, outputPath, format });
        return await registerExport({ outputPath, filename, format });
      } catch (error) {
        removeTempFile(outputPath);
        throw error;
      }
    });
    res.json(exported);
  }));

  app.use("/api", (_req, _res, next) => {
    next(new HttpError(404, "NOT_FOUND", "API route not found."));
  });

  app.use(express.static(rendererRoot));
  app.use((_req, res, next) => {
    res.sendFile(indexPath, (error) => {
      if (error) next(error);
    });
  });

  app.use((error, _req, res, next) => {
    if (res.headersSent) return next(error);
    const stable = apiError(error);
    res.status(stable.status).json({ error: { code: stable.code, message: stable.message } });
  });

  return app;
}

module.exports = { createWebApp };
