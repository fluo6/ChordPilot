const express = require("express");
const multer = require("multer");
const path = require("node:path");

const { HttpError, asyncRoute } = require("./http-errors");

function inlineFilename(name) {
  return path.basename(String(name || "media"))
    .replace(/[<>:"/\\|?*\x00-\x1f]+/g, "-")
    .replace(/"/g, "-") || "media";
}

function apiError(error) {
  if (error instanceof HttpError) return error;
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    return new HttpError(413, "FILE_TOO_LARGE", "Uploaded file is too large.");
  }
  if (error.type === "entity.parse.failed") {
    return new HttpError(400, "INVALID_JSON", "Request body must be valid JSON.");
  }
  if (error.type === "entity.too.large") {
    return new HttpError(413, "PAYLOAD_TOO_LARGE", "Request body is too large.");
  }
  if (error.code === "INVALID_MEDIA_ID") {
    return new HttpError(400, error.code, error.message);
  }
  return new HttpError(error.status || 500, error.code || "INTERNAL_ERROR", error.message || "An unexpected server error occurred.");
}

function createWebApp({ rendererRoot, storage, services, queue, logBroker, uploadLimitBytes }) {
  void services;
  void uploadLimitBytes;

  const app = express();
  const indexPath = path.join(rendererRoot, "index.html");

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
    const media = await storage.resolveMedia(req.params.id);
    if (!media) {
      throw new HttpError(404, "MEDIA_NOT_FOUND", "Media not found.");
    }
    await new Promise((resolve, reject) => {
      res.sendFile(media.path, {
        acceptRanges: true,
        headers: { "Content-Disposition": `inline; filename="${inlineFilename(media.name)}"` }
      }, (error) => (error ? reject(error) : resolve()));
    });
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
