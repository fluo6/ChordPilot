const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const UUID_PATTERN = /^[a-f0-9-]{36}$/;
const REFERENCE_FIELDS = ["id", "name", "extension", "kind"];

class StorageError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "StorageError";
    this.code = code;
  }
}

function assertContained(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new StorageError("PATH_OUTSIDE_DATA_ROOT", "Stored file is outside the ChordPilot data root.");
  }
}

function assertUuid(id, label = "media") {
  if (!UUID_PATTERN.test(String(id || ""))) {
    throw new StorageError(`INVALID_${label.toUpperCase()}_ID`, `Invalid ${label} ID.`);
  }
  return String(id);
}

function sanitizeName(value, fallback = "media") {
  const name = path.basename(String(value || "").trim()).replace(/[<>:"/\\|?*\x00-\x1f]+/g, "-").trim();
  return name || fallback;
}

function extensionFor(name, fallback = "bin") {
  const extension = path.extname(name).slice(1).toLowerCase().replace(/[^a-z0-9]/g, "");
  return extension || fallback;
}

function normalizeExtension(value, fallback = "bin") {
  const extension = String(value || "").replace(/^\./, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return extension || fallback;
}

function privatePath(record, filePath) {
  Object.defineProperty(record, "path", {
    value: filePath,
    enumerable: false,
    writable: false,
    configurable: false
  });
  return record;
}

function redactPaths(value) {
  if (Array.isArray(value)) {
    return value.map(redactPaths);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== "path" && key !== "coverPath")
    .map(([key, child]) => [key, redactPaths(child)]));
}

function referenceFrom(value) {
  if (!value || typeof value !== "object" || !value.id) {
    return null;
  }
  return Object.fromEntries(REFERENCE_FIELDS
    .filter((field) => value[field] !== undefined && value[field] !== "")
    .map((field) => [field, value[field]]));
}

function createStorage({ root, randomUUID = crypto.randomUUID, now = () => new Date().toISOString() } = {}) {
  if (!root) {
    throw new StorageError("DATA_ROOT_REQUIRED", "A ChordPilot data root is required.");
  }

  const dataRoot = path.resolve(root);
  const directories = {
    media: path.join(dataRoot, "media"),
    generated: path.join(dataRoot, "generated"),
    sessions: path.join(dataRoot, "sessions"),
    cache: path.join(dataRoot, "cache"),
    tmp: path.join(dataRoot, "tmp")
  };

  function ensureDirectory(key) {
    const directory = directories[key];
    assertContained(dataRoot, directory);
    try {
      const stats = fs.lstatSync(directory);
      if (!stats.isDirectory() || stats.isSymbolicLink()) {
        throw new Error("invalid directory");
      }
    } catch (_error) {
      throw new StorageError("INVALID_DATA_DIRECTORY", "Configured ChordPilot storage is invalid.");
    }
    return directory;
  }

  function directoryKeyForKind(kind) {
    return kind === "source" ? "media" : "generated";
  }

  function directoryForKind(kind) {
    return ensureDirectory(directoryKeyForKind(kind));
  }

  function initialize() {
    for (const directory of Object.values(directories)) {
      fs.mkdirSync(directory, { recursive: true });
    }
    Object.keys(directories).forEach(ensureDirectory);
  }

  function newId(label) {
    return assertUuid(randomUUID(), label);
  }

  function createTempPath(suffix = ".part") {
    const tmpDirectory = ensureDirectory("tmp");
    const safeSuffix = String(suffix || ".part").replace(/[^a-zA-Z0-9._-]/g, "");
    const tempPath = path.join(tmpDirectory, `${newId("media")}${safeSuffix || ".part"}`);
    assertContained(tmpDirectory, tempPath);
    return tempPath;
  }

  function fsyncFile(filePath) {
    const descriptor = fs.openSync(filePath, "r");
    try {
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
  }

  function writeAtomicFile(directoryKey, destination, content) {
    const directory = ensureDirectory(directoryKey);
    const partPath = `${destination}.part`;
    assertContained(directory, destination);
    assertContained(directory, partPath);
    let descriptor;
    try {
      descriptor = fs.openSync(partPath, "w", 0o600);
      fs.writeFileSync(descriptor, content);
      fs.fsyncSync(descriptor);
    } finally {
      if (descriptor !== undefined) fs.closeSync(descriptor);
    }
    fs.renameSync(partPath, destination);
  }

  function writeMetadata(directoryKey, record) {
    const directory = ensureDirectory(directoryKey);
    const metadataPath = path.join(directory, `${record.id}.json`);
    assertContained(directory, metadataPath);
    writeAtomicFile(directoryKey, metadataPath, `${JSON.stringify(record)}\n`);
  }

  function removeOwnedFile(directoryKey, filePath) {
    const directory = ensureDirectory(directoryKey);
    assertContained(directory, filePath);
    fs.rmSync(filePath, { force: true });
  }

  function publicRecord(record) {
    if (!record) return null;
    const { id, kind, name, extension, size, createdAt } = record;
    return { id, kind, name, extension, size, url: `/api/media/${id}`, createdAt };
  }

  function readMedia(id) {
    const mediaId = assertUuid(id, "media");
    let directory;
    let metadataPath;
    for (const [directoryKey, candidate] of [["media", directories.media], ["generated", directories.generated]]) {
      ensureDirectory(directoryKey);
      const possiblePath = path.join(candidate, `${mediaId}.json`);
      assertContained(candidate, possiblePath);
      if (fs.existsSync(possiblePath)) {
        directory = candidate;
        metadataPath = possiblePath;
        break;
      }
    }
    if (!metadataPath) return null;

    ensureDirectory(directory === directories.media ? "media" : "generated");
    const metadataStats = fs.lstatSync(metadataPath);
    if (!metadataStats.isFile() || metadataStats.isSymbolicLink()) {
      throw new StorageError("INVALID_MEDIA_METADATA", "Stored media metadata is invalid.");
    }

    let stored;
    try {
      stored = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
    } catch (_error) {
      throw new StorageError("INVALID_MEDIA_METADATA", "Stored media metadata is invalid.");
    }
    const extension = normalizeExtension(stored.extension);
    const expectedFilename = `${mediaId}.${extension}`;
    if (
      stored.id !== mediaId ||
      typeof stored.filename !== "string" ||
      path.basename(stored.filename) !== stored.filename ||
      stored.filename !== expectedFilename
    ) {
      throw new StorageError("INVALID_MEDIA_METADATA", "Stored media metadata is invalid.");
    }
    ensureDirectory(directory === directories.media ? "media" : "generated");
    const filePath = path.resolve(directory, stored.filename);
    assertContained(directory, filePath);
    if (!fs.existsSync(filePath)) return null;
    const stats = fs.lstatSync(filePath);
    if (!stats.isFile() || stats.isSymbolicLink()) {
      throw new StorageError("INVALID_MEDIA_FILE", "Stored media is unavailable.");
    }
    return privatePath({
      id: mediaId,
      kind: String(stored.kind || "generated"),
      name: sanitizeName(stored.name, "media"),
      extension,
      size: Number(stored.size) || stats.size,
      url: `/api/media/${mediaId}`,
      createdAt: String(stored.createdAt || "")
    }, filePath);
  }

  function resolveMedia(id) {
    return readMedia(id);
  }

  function publicMedia(id) {
    return publicRecord(readMedia(id));
  }

  async function commitMedia({ tempPath, originalName, kind = "generated" } = {}) {
    if (!tempPath) {
      throw new StorageError("TEMP_FILE_REQUIRED", "A temporary media file is required.");
    }
    const tmpDirectory = ensureDirectory("tmp");
    assertContained(tmpDirectory, tempPath);
    const sourcePath = path.resolve(tempPath);
    if (!fs.existsSync(sourcePath) || !fs.lstatSync(sourcePath).isFile()) {
      throw new StorageError("TEMP_FILE_MISSING", "The temporary media file is unavailable.");
    }

    const directoryKey = directoryKeyForKind(kind);
    const directory = directoryForKind(kind);
    const id = newId("media");
    const name = sanitizeName(originalName, "media");
    const extension = extensionFor(name, extensionFor(sourcePath.replace(/\.part$/i, "")));
    const filename = `${id}.${extension}`;
    const destination = path.join(directory, filename);
    const destinationPart = `${destination}.part`;
    assertContained(directory, destination);
    assertContained(directory, destinationPart);

    try {
      ensureDirectory(directoryKey);
      fs.copyFileSync(sourcePath, destinationPart, fs.constants.COPYFILE_EXCL);
      ensureDirectory(directoryKey);
      fsyncFile(destinationPart);
      ensureDirectory(directoryKey);
      fs.renameSync(destinationPart, destination);
      ensureDirectory(directoryKey);
      const stats = fs.statSync(destination);
      const record = { id, kind: String(kind), name, extension, size: stats.size, filename, createdAt: String(now()) };
      writeMetadata(directoryKey, record);
      removeOwnedFile("tmp", sourcePath);
      return privatePath({ ...publicRecord(record) }, destination);
    } catch (error) {
      try {
        removeOwnedFile(directoryKey, destinationPart);
        removeOwnedFile(directoryKey, destination);
      } catch (_cleanupError) {
        // The original storage error is more useful to the caller.
      }
      if (error instanceof StorageError) throw error;
      throw new StorageError("MEDIA_COMMIT_FAILED", "Could not store media.");
    }
  }

  async function registerExisting({ sourcePath, originalName, kind = "generated", copy = true } = {}) {
    if (!sourcePath || !fs.existsSync(sourcePath) || !fs.lstatSync(sourcePath).isFile()) {
      throw new StorageError("SOURCE_FILE_MISSING", "The source media file is unavailable.");
    }
    const name = sanitizeName(originalName || path.basename(sourcePath), "media");
    const tempPath = createTempPath(`.${extensionFor(name)}.part`);
    if (copy) {
      ensureDirectory("tmp");
      fs.copyFileSync(sourcePath, tempPath, fs.constants.COPYFILE_EXCL);
    } else {
      try {
        ensureDirectory("tmp");
        fs.renameSync(sourcePath, tempPath);
      } catch (error) {
        if (error.code !== "EXDEV") throw error;
        ensureDirectory("tmp");
        fs.copyFileSync(sourcePath, tempPath, fs.constants.COPYFILE_EXCL);
        fs.rmSync(sourcePath);
      }
    }
    fsyncFile(tempPath);
    return commitMedia({ tempPath, originalName: name, kind });
  }

  async function normalizeMedia(value, kind) {
    if (!value) return null;
    if (typeof value === "string") {
      return publicRecord(await registerExisting({ sourcePath: value, originalName: path.basename(value), kind, copy: true }));
    }
    if (value.id) {
      const known = publicMedia(value.id);
      return known || referenceFrom(value);
    }
    if (value.path) {
      return publicRecord(await registerExisting({
        sourcePath: value.path,
        originalName: value.name || path.basename(value.path),
        kind: value.kind || kind,
        copy: true
      }));
    }
    return null;
  }

  async function normalizeStems(stems) {
    if (!Array.isArray(stems)) return stems;
    return Promise.all(stems.map(async (stem) => {
      const media = await normalizeMedia(stem, "stem");
      if (!media) return redactPaths(stem);
      return { ...media, ...(stem?.name ? { name: stem.name } : {}) };
    }));
  }

  async function normalizeChart(chart) {
    if (!chart || typeof chart !== "object") return chart;
    const normalized = redactPaths(chart);
    if (chart.stems && typeof chart.stems === "object") {
      normalized.stems = { ...redactPaths(chart.stems), stems: await normalizeStems(chart.stems.stems) };
    }
    return normalized;
  }

  async function normalizeSessionForStorage(session) {
    const normalized = redactPaths(session || {});
    if (session?.audio) {
      const audio = await normalizeMedia(session.audio, "source");
      normalized.audio = audio ? referenceFrom(audio) : referenceFrom(session.audio);
      const cover = await normalizeMedia(session.audio.cover || (session.audio.coverPath ? {
        path: session.audio.coverPath,
        name: path.basename(session.audio.coverPath),
        kind: "cover"
      } : null), "cover");
      if (cover) normalized.audio.cover = referenceFrom(cover);
    }
    if (session?.audioPreview) {
      const preview = await normalizeMedia(session.audioPreview, "preview");
      const { path: _path, url: _url, id: _id, name: _name, extension: _extension, kind: _kind, size: _size, createdAt: _createdAt, ...previewFields } = redactPaths(session.audioPreview);
      normalized.audioPreview = {
        ...previewFields,
        ...(preview ? referenceFrom(preview) : referenceFrom(session.audioPreview))
      };
      if (session.audioPreview.stems && typeof session.audioPreview.stems === "object") {
        normalized.audioPreview.stems = {
          ...redactPaths(session.audioPreview.stems),
          stems: (await normalizeStems(session.audioPreview.stems.stems)).map((stem) => referenceFrom(stem) || stem)
        };
      }
    }
    if (session?.chart) {
      normalized.chart = await normalizeChart(session.chart);
      if (normalized.chart?.stems && Array.isArray(normalized.chart.stems.stems)) {
        normalized.chart.stems.stems = normalized.chart.stems.stems.map((stem) => referenceFrom(stem) || stem);
      }
    }
    return normalized;
  }

  function hydrateMedia(value) {
    if (!value?.id) return value || null;
    const media = resolveMedia(value.id);
    if (!media) return { ...referenceFrom(value), exists: false };
    return privatePath({ ...publicRecord(media), exists: true }, media.path);
  }

  function hydrateStemList(stems) {
    if (!Array.isArray(stems)) return stems;
    return stems.map((stem) => {
      const media = hydrateMedia(stem);
      if (!media) return media;
      const hydrated = { ...media, ...(stem?.name ? { name: stem.name } : {}) };
      return Object.hasOwn(media, "path") ? privatePath(hydrated, media.path) : hydrated;
    });
  }

  function hydrateSession(session) {
    const hydrated = redactPaths(session || {});
    if (session?.audio) {
      hydrated.audio = hydrateMedia(session.audio);
      if (session.audio.cover) {
        const cover = hydrateMedia(session.audio.cover);
        hydrated.audio.cover = cover;
        if (cover?.url) hydrated.audio.coverUrl = cover.url;
      }
    }
    if (session?.audioPreview) {
      const preview = hydrateMedia(session.audioPreview);
      hydrated.audioPreview = { ...redactPaths(session.audioPreview), ...preview };
      if (preview && Object.hasOwn(preview, "path")) {
        privatePath(hydrated.audioPreview, preview.path);
      }
      if (session.audioPreview.stems && typeof session.audioPreview.stems === "object") {
        hydrated.audioPreview.stems = {
          ...redactPaths(session.audioPreview.stems),
          stems: hydrateStemList(session.audioPreview.stems.stems)
        };
      }
    }
    if (session?.chart) {
      hydrated.chart = { ...redactPaths(session.chart) };
      if (session.chart.stems && typeof session.chart.stems === "object") {
        hydrated.chart.stems = {
          ...redactPaths(session.chart.stems),
          stems: hydrateStemList(session.chart.stems.stems)
        };
      }
    }
    return hydrated;
  }

  function publicSession(session) {
    return redactPaths(hydrateSession(session));
  }

  function readStoredSession(id) {
    const sessionId = assertUuid(id, "session");
    const sessionsDirectory = ensureDirectory("sessions");
    const sessionPath = path.join(sessionsDirectory, `${sessionId}.json`);
    assertContained(sessionsDirectory, sessionPath);
    if (!fs.existsSync(sessionPath)) return null;
    ensureDirectory("sessions");
    const sessionStats = fs.lstatSync(sessionPath);
    if (!sessionStats.isFile() || sessionStats.isSymbolicLink()) {
      throw new StorageError("INVALID_SESSION", "Stored session data is invalid.");
    }
    try {
      const record = JSON.parse(fs.readFileSync(sessionPath, "utf8"));
      if (record.id !== sessionId || !record.session || typeof record.session !== "object") {
        throw new Error("invalid session");
      }
      return record;
    } catch (_error) {
      throw new StorageError("INVALID_SESSION", "Stored session data is invalid.");
    }
  }

  async function saveSession(session) {
    const id = newId("session");
    const record = { id, createdAt: String(now()), session: await normalizeSessionForStorage(session) };
    const sessionsDirectory = ensureDirectory("sessions");
    writeAtomicFile("sessions", path.join(sessionsDirectory, `${id}.json`), `${JSON.stringify(record)}\n`);
    return { id, createdAt: record.createdAt, session: publicSession(record.session) };
  }

  function listSessions() {
    const sessionsDirectory = ensureDirectory("sessions");
    return fs.readdirSync(sessionsDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && UUID_PATTERN.test(path.basename(entry.name, ".json")) && entry.name.endsWith(".json"))
      .map((entry) => readStoredSession(path.basename(entry.name, ".json")))
      .filter(Boolean)
      .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
      .map((record) => ({ id: record.id, createdAt: record.createdAt, session: publicSession(record.session) }));
  }

  async function openSession(id) {
    const record = readStoredSession(id);
    return record && { id: record.id, createdAt: record.createdAt, session: publicSession(record.session) };
  }

  async function importSession(tempPath) {
    const tmpDirectory = ensureDirectory("tmp");
    assertContained(tmpDirectory, tempPath);
    try {
      ensureDirectory("tmp");
      const stats = fs.lstatSync(tempPath);
      if (!stats.isFile() || stats.isSymbolicLink()) {
        throw new StorageError("INVALID_SESSION", "Imported session data is invalid.");
      }
      const imported = JSON.parse(fs.readFileSync(tempPath, "utf8"));
      const session = imported?.session && typeof imported.session === "object" ? imported.session : imported;
      if (!session || typeof session !== "object") {
        throw new StorageError("INVALID_SESSION", "Imported session data is invalid.");
      }
      return saveSession(session);
    } catch (error) {
      if (error instanceof StorageError) throw error;
      throw new StorageError("INVALID_SESSION", "Imported session data is invalid.");
    } finally {
      try {
        removeOwnedFile("tmp", tempPath);
      } catch (_cleanupError) {
        // The temporary directory may have been replaced after validation.
      }
    }
  }

  return {
    initialize,
    createTempPath,
    commitMedia,
    registerExisting,
    resolveMedia,
    publicMedia,
    normalizeChart,
    normalizeSessionForStorage,
    hydrateSession,
    saveSession,
    listSessions,
    openSession,
    importSession
  };
}

module.exports = { StorageError, assertContained, createStorage };
