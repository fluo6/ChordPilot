const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const UUID_PATTERN = /^[a-f0-9-]{36}$/;
const REFERENCE_FIELDS = ["id", "name", "extension", "kind"];
const ANALYSIS_CACHE_DIRECTORIES = ["decoded", "analysis", "stems", "history"];
const MODEL_CACHE_DIRECTORIES = ["torch"];

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

function isLocationMetadataKey(key) {
  const normalized = String(key).replace(/[_-]/g, "").toLowerCase();
  return ["path", "url", "uri", "src", "location", "directory"].includes(normalized)
    || normalized.startsWith("path")
    || normalized.endsWith("path")
    || normalized.endsWith("src")
    || normalized.endsWith("uri")
    || normalized.endsWith("url")
    || normalized.endsWith("location")
    || normalized.endsWith("directory");
}

function isFilesystemLocation(value) {
  if (typeof value !== "string") return false;
  const location = value.trim();
  if (!location) return false;
  return /^file:/i.test(location)
    || path.isAbsolute(location)
    || /^[a-z]:/i.test(location)
    || /^\\\\/.test(location)
    || /^~[\\/]/.test(location)
    || /^\.{1,2}(?:[\\/]|$)/.test(location)
    || location.includes("/")
    || location.includes("\\")
    || Boolean(path.extname(location));
}

function shouldRedactLocationMetadata(key, value) {
  const normalized = String(key).replace(/[_-]/g, "").toLowerCase();
  return isLocationMetadataKey(key)
    || (["source", "file"].includes(normalized) && isFilesystemLocation(value));
}

function isOpaqueMediaUrl(key, value, record) {
  return String(key).toLowerCase() === "url"
    && UUID_PATTERN.test(String(record?.id || ""))
    && value === `/api/media/${record.id}`;
}

function redactLocationMetadata(value, { preserveOpaqueMediaUrls = false } = {}) {
  if (Array.isArray(value)) {
    return value.map((child) => redactLocationMetadata(child, { preserveOpaqueMediaUrls }));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(Object.entries(value)
    .filter(([key, child]) => !shouldRedactLocationMetadata(key, child)
      || (preserveOpaqueMediaUrls && isOpaqueMediaUrl(key, child, value)))
    .map(([key, child]) => [key, redactLocationMetadata(child, { preserveOpaqueMediaUrls })]));
}

const redactPaths = redactLocationMetadata;

function referenceFrom(value) {
  if (!value || typeof value !== "object" || !value.id) {
    return null;
  }
  return Object.fromEntries(REFERENCE_FIELDS
    .filter((field) => value[field] !== undefined && value[field] !== "")
    .map((field) => [field, value[field]]));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertSessionSchema(session) {
  if (!isPlainObject(session) || session.app !== "ChordPilot" || session.version !== 1) {
    throw new StorageError("INVALID_SESSION", "Session data is invalid.");
  }
  for (const field of ["chart", "audio", "analysis", "ui"]) {
    if (session[field] !== undefined && session[field] !== null && !isPlainObject(session[field])) {
      throw new StorageError("INVALID_SESSION", "Session data is invalid.");
    }
  }
  return session;
}

function createStorage({ root, cacheRoot: configuredCacheRoot, randomUUID = crypto.randomUUID, now = () => new Date().toISOString() } = {}) {
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
  const cacheRoot = path.resolve(configuredCacheRoot || directories.cache);
  assertContained(dataRoot, cacheRoot);

  function ensureOwnedDirectory(parent, directory) {
    assertContained(parent, directory);
    try {
      const stats = fs.lstatSync(directory);
      if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error("invalid directory");
    } catch (_error) {
      throw new StorageError("INVALID_DATA_DIRECTORY", "Configured ChordPilot storage is invalid.");
    }
    return directory;
  }

  function ensureDirectory(key) {
    const directory = directories[key];
    return ensureOwnedDirectory(dataRoot, directory);
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
    fs.mkdirSync(cacheRoot, { recursive: true });
    ensureOwnedDirectory(cacheRoot, cacheRoot);
    for (const child of [...ANALYSIS_CACHE_DIRECTORIES, ...MODEL_CACHE_DIRECTORIES]) {
      fs.mkdirSync(path.join(cacheRoot, child), { recursive: true });
      ensureOwnedDirectory(cacheRoot, path.join(cacheRoot, child));
    }
  }

  function directoryUsage(directory, { include = () => true } = {}) {
    let count = 0;
    let bytes = 0;
    const visit = (current) => {
      ensureOwnedDirectory(directory, current);
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const candidate = path.join(current, entry.name);
        assertContained(directory, candidate);
        const stats = fs.lstatSync(candidate);
        if (stats.isSymbolicLink()) {
          throw new StorageError("INVALID_DATA_DIRECTORY", "Configured ChordPilot storage is invalid.");
        }
        if (stats.isDirectory()) visit(candidate);
        else if (stats.isFile() && include(candidate)) {
          count += 1;
          bytes += stats.size;
        }
      }
    };
    visit(directory);
    return { count, bytes };
  }

  function combinedUsage(names) {
    return names.reduce((total, name) => {
      const directory = path.join(cacheRoot, name);
      ensureOwnedDirectory(cacheRoot, directory);
      const usage = directoryUsage(directory);
      return { count: total.count + usage.count, bytes: total.bytes + usage.bytes };
    }, { count: 0, bytes: 0 });
  }

  function summary() {
    const media = ensureDirectory("media");
    const generated = ensureDirectory("generated");
    const sessions = ensureDirectory("sessions");
    return {
      media: directoryUsage(media, { include: (file) => !file.endsWith(".json") && !file.endsWith(".part") }),
      generated: directoryUsage(generated, { include: (file) => (!file.endsWith(".json") || file.includes(".data.json")) && !file.endsWith(".part") }),
      sessions: directoryUsage(sessions, { include: (file) => file.endsWith(".json") }),
      analysis: combinedUsage(ANALYSIS_CACHE_DIRECTORIES),
      models: combinedUsage(MODEL_CACHE_DIRECTORIES)
    };
  }

  function cacheTargets(scope) {
    if (scope === "analysis") return ANALYSIS_CACHE_DIRECTORIES;
    if (scope === "models") return MODEL_CACHE_DIRECTORIES;
    if (scope === "all") return [...ANALYSIS_CACHE_DIRECTORIES, ...MODEL_CACHE_DIRECTORIES];
    throw new StorageError("INVALID_CACHE_SCOPE", "Invalid cache scope.");
  }

  function clearCache(scope) {
    const targets = cacheTargets(String(scope || ""));
    const directoriesToClear = targets.map((name) => {
      const directory = path.join(cacheRoot, name);
      ensureOwnedDirectory(cacheRoot, directory);
      directoryUsage(directory);
      return directory;
    });
    for (const directory of directoriesToClear) {
      const trash = path.join(cacheRoot, `.clear-${path.basename(directory)}-${crypto.randomUUID()}`);
      assertContained(cacheRoot, trash);
      fs.renameSync(directory, trash);
      try {
        fs.mkdirSync(directory);
      } catch (error) {
        fs.renameSync(trash, directory);
        throw error;
      }
      fs.rmSync(trash, { recursive: true, force: true });
    }
    return summary();
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

  function createGeneratedPath(suffix = ".part") {
    const generatedDirectory = ensureDirectory("generated");
    const safeSuffix = String(suffix || ".part").replace(/[^a-zA-Z0-9._-]/g, "");
    const generatedPath = path.join(generatedDirectory, `${newId("media")}${safeSuffix || ".part"}`);
    assertContained(generatedDirectory, generatedPath);
    return generatedPath;
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
    const expectedFilename = extension === "json" ? `${mediaId}.data.json` : `${mediaId}.${extension}`;
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
    const filename = extension === "json" ? `${id}.data.json` : `${id}.${extension}`;
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
    try {
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
      return await commitMedia({ tempPath, originalName: name, kind });
    } catch (error) {
      try {
        removeOwnedFile("tmp", tempPath);
      } catch (_cleanupError) {
        // The original media registration error is more useful to the caller.
      }
      throw error;
    }
  }

  async function normalizeMedia(value, kind, { copy = true } = {}) {
    if (!value) return null;
    if (typeof value === "string") {
      return publicRecord(await registerExisting({ sourcePath: value, originalName: path.basename(value), kind, copy }));
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
        copy
      }));
    }
    return null;
  }

  async function normalizeStems(stems, options) {
    if (!Array.isArray(stems)) return stems;
    return Promise.all(stems.map(async (stem) => {
      const media = await normalizeMedia(stem, "stem", options);
      if (!media) return redactPaths(stem);
      return { ...media, ...(stem?.name ? { name: stem.name } : {}) };
    }));
  }

  async function normalizeChart(chart, options) {
    if (!chart || typeof chart !== "object") return chart;
    const normalized = redactPaths(chart);
    if (chart.stems && typeof chart.stems === "object") {
      normalized.stems = { ...redactPaths(chart.stems), stems: await normalizeStems(chart.stems.stems, options) };
    }
    return normalized;
  }

  async function normalizeSessionMedia(value, kind) {
    if (!value?.id) return null;
    return normalizeMedia(referenceFrom(value), kind);
  }

  async function normalizeSessionStems(stems) {
    if (!Array.isArray(stems)) return stems;
    return Promise.all(stems.map(async (stem) => {
      const media = await normalizeSessionMedia(stem, "stem");
      return media ? referenceFrom(media) : referenceFrom(stem) || redactPaths(stem);
    }));
  }

  async function normalizeSessionForStorage(session) {
    const normalized = redactPaths(session || {});
    if (session?.audio) {
      const audio = await normalizeSessionMedia(session.audio, "source");
      normalized.audio = audio ? referenceFrom(audio) : referenceFrom(session.audio);
      const cover = await normalizeSessionMedia(session.audio.cover, "cover");
      if (cover) normalized.audio.cover = referenceFrom(cover);
    }
    if (session?.audioPreview) {
      const preview = await normalizeSessionMedia(session.audioPreview, "preview");
      const { path: _path, url: _url, id: _id, name: _name, extension: _extension, kind: _kind, size: _size, createdAt: _createdAt, ...previewFields } = redactPaths(session.audioPreview);
      normalized.audioPreview = {
        ...previewFields,
        ...(preview ? referenceFrom(preview) : referenceFrom(session.audioPreview))
      };
      if (session.audioPreview.stems && typeof session.audioPreview.stems === "object") {
        normalized.audioPreview.stems = {
          ...redactPaths(session.audioPreview.stems),
          stems: await normalizeSessionStems(session.audioPreview.stems.stems)
        };
      }
    }
    if (session?.chart) {
      normalized.chart = redactPaths(session.chart);
      if (normalized.chart?.stems && Array.isArray(normalized.chart.stems.stems)) {
        normalized.chart.stems.stems = await normalizeSessionStems(session.chart.stems.stems);
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
    return redactLocationMetadata(hydrateSession(session), { preserveOpaqueMediaUrls: true });
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
    assertSessionSchema(session);
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

  function portableSession(id) {
    const record = readStoredSession(id);
    return record && redactPaths(record.session);
  }

  function deleteSession(id) {
    const sessionId = assertUuid(id, "session");
    const sessionsDirectory = ensureDirectory("sessions");
    const sessionPath = path.join(sessionsDirectory, `${sessionId}.json`);
    assertContained(sessionsDirectory, sessionPath);
    if (!fs.existsSync(sessionPath)) return false;
    const stats = fs.lstatSync(sessionPath);
    if (!stats.isFile() || stats.isSymbolicLink()) {
      throw new StorageError("INVALID_SESSION", "Stored session data is invalid.");
    }
    fs.rmSync(sessionPath);
    return true;
  }

  async function importSession(tempPath, { sanitize = (session) => session } = {}) {
    const tmpDirectory = ensureDirectory("tmp");
    assertContained(tmpDirectory, tempPath);
    try {
      ensureDirectory("tmp");
      const stats = fs.lstatSync(tempPath);
      if (!stats.isFile() || stats.isSymbolicLink()) {
        throw new StorageError("INVALID_SESSION", "Imported session data is invalid.");
      }
      const imported = JSON.parse(fs.readFileSync(tempPath, "utf8"));
      const session = sanitize(imported?.session && typeof imported.session === "object" ? imported.session : imported);
      assertSessionSchema(session);
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
    createGeneratedPath,
    commitMedia,
    registerExisting,
    resolveMedia,
    publicMedia,
    normalizeMedia,
    normalizeChart,
    normalizeSessionForStorage,
    hydrateSession,
    assertSessionSchema,
    saveSession,
    listSessions,
    openSession,
    portableSession,
    importSession,
    deleteSession,
    summary,
    clearCache
  };
}

module.exports = { StorageError, assertContained, createStorage, redactLocationMetadata };
