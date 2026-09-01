const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createStorage } = require("../../src/web/storage");

async function makeStorage(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "chordpilot-web-storage-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let sequence = 0;
  const storage = createStorage({
    root,
    randomUUID: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`,
    now: () => "2026-08-31T12:00:00.000Z"
  });
  await storage.initialize();
  return { root, storage };
}

test("initialize creates only typed data directories", async (t) => {
  const { root } = await makeStorage(t);
  for (const directory of ["media", "generated", "sessions", "cache", "tmp"]) {
    assert.equal(fs.statSync(path.join(root, directory)).isDirectory(), true);
  }
});

test("commitMedia atomically promotes a temp file and redacts its filesystem path", async (t) => {
  const { root, storage } = await makeStorage(t);
  const tempPath = storage.createTempPath(".wav.part");
  fs.writeFileSync(tempPath, "RIFF");

  const media = await storage.commitMedia({ tempPath, originalName: "  song<>.wav  ", kind: "source" });
  const publicMedia = storage.publicMedia(media.id);

  assert.equal(fs.existsSync(tempPath), false);
  assert.equal(fs.readFileSync(media.path, "utf8"), "RIFF");
  assert.equal(fs.existsSync(`${media.path}.part`), false);
  assert.equal(fs.existsSync(path.join(root, "media", `${media.id}.json`)), true);
  assert.equal(media.name, "song-.wav");
  assert.equal(media.path.startsWith(path.join(root, "media")), true);
  assert.deepEqual(publicMedia, {
    id: media.id,
    kind: "source",
    name: "song-.wav",
    extension: "wav",
    size: 4,
    url: `/api/media/${media.id}`,
    createdAt: "2026-08-31T12:00:00.000Z"
  });
});

test("resolveMedia rejects traversal instead of joining it", async (t) => {
  const { storage } = await makeStorage(t);
  assert.throws(() => storage.resolveMedia("../../etc/passwd"), /Invalid media ID/);
});

test("resolveMedia rejects metadata whose basename escapes the typed directory", async (t) => {
  const { root, storage } = await makeStorage(t);
  const id = "11111111-1111-4111-8111-111111111111";
  fs.writeFileSync(path.join(root, "media", `${id}.json`), JSON.stringify({
    id,
    kind: "source",
    filename: "../../etc/passwd",
    name: "song.wav",
    extension: "wav",
    size: 4,
    createdAt: "2026-08-31T12:00:00.000Z"
  }));

  assert.throws(() => storage.resolveMedia(id), /Stored media metadata is invalid/);
});

test("resolveMedia refuses symlinked metadata records", async (t) => {
  const { root, storage } = await makeStorage(t);
  const id = "33333333-3333-4333-8333-333333333333";
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "chordpilot-web-storage-outside-"));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  const metadata = path.join(outside, "media.json");
  fs.writeFileSync(metadata, JSON.stringify({
    id,
    kind: "source",
    filename: "song.wav",
    name: "song.wav",
    extension: "wav",
    size: 4,
    createdAt: "2026-08-31T12:00:00.000Z"
  }));
  fs.symlinkSync(metadata, path.join(root, "media", `${id}.json`));

  assert.throws(() => storage.resolveMedia(id), /Stored media metadata is invalid/);
});

test("normalizeChart stores stem references as public opaque media", async (t) => {
  const { root, storage } = await makeStorage(t);
  const stemPath = path.join(root, "tmp", "vocals.wav.part");
  fs.writeFileSync(stemPath, "RIFF");
  const stem = await storage.commitMedia({ tempPath: stemPath, originalName: "vocals.wav", kind: "stem" });

  const chart = await storage.normalizeChart({
    title: "Song",
    stems: { ok: true, stems: [{ ...stem, name: "vocals" }] }
  });

  assert.equal(chart.stems.stems[0].id, stem.id);
  assert.equal(chart.stems.stems[0].url, `/api/media/${stem.id}`);
  assert.equal(chart.stems.stems[0].path, undefined);
  assert.equal(chart.stems.stems[0].name, "vocals");
});

test("saved sessions contain IDs and hydrate public URLs", async (t) => {
  const { storage, root } = await makeStorage(t);
  const source = path.join(root, "tmp", "song.wav.part");
  fs.writeFileSync(source, "RIFF");
  const media = await storage.commitMedia({ tempPath: source, originalName: "song.wav", kind: "source" });
  const saved = await storage.saveSession({ app: "ChordPilot", version: 1, audio: media });
  assert.equal(saved.session.audio.id, media.id);
  assert.equal(saved.session.audio.path, undefined);
  assert.equal(fs.readFileSync(path.join(root, "sessions", `${saved.id}.json`), "utf8").includes(media.path), false);
  assert.equal((await storage.openSession(saved.id)).session.audio.url, `/api/media/${media.id}`);
});

test("hydration keeps server paths non-enumerable and openSession redacts them", async (t) => {
  const { storage, root } = await makeStorage(t);
  const tempPath = path.join(root, "tmp", "song.wav.part");
  fs.writeFileSync(tempPath, "RIFF");
  const media = await storage.commitMedia({ tempPath, originalName: "song.wav", kind: "source" });
  const saved = await storage.saveSession({ app: "ChordPilot", version: 1, audio: media });
  const hydrated = storage.hydrateSession(await storage.normalizeSessionForStorage(saved.session));

  assert.equal(hydrated.audio.path, media.path);
  assert.equal(JSON.stringify(hydrated).includes(media.path), false);
  assert.equal((await storage.openSession(saved.id)).session.audio.path, undefined);
});

test("hydration keeps private paths for preview and stem service inputs without serializing them", async (t) => {
  const { storage, root } = await makeStorage(t);
  const previewTemp = path.join(root, "tmp", "preview.wav.part");
  const stemTemp = path.join(root, "tmp", "vocals.wav.part");
  fs.writeFileSync(previewTemp, "RIFF");
  fs.writeFileSync(stemTemp, "RIFF");
  const preview = await storage.commitMedia({ tempPath: previewTemp, originalName: "preview.wav", kind: "preview" });
  const stem = await storage.commitMedia({ tempPath: stemTemp, originalName: "vocals.wav", kind: "stem" });

  const hydrated = storage.hydrateSession(await storage.normalizeSessionForStorage({
    app: "ChordPilot",
    version: 1,
    audioPreview: { ...preview, stems: { ok: true, stems: [{ ...stem, name: "vocals" }] } },
    chart: { stems: { ok: true, stems: [{ ...stem, name: "vocals" }] } }
  }));

  assert.equal(hydrated.audioPreview.path, preview.path);
  assert.equal(hydrated.audioPreview.stems.stems[0].path, stem.path);
  assert.equal(hydrated.chart.stems.stems[0].path, stem.path);
  assert.equal(JSON.stringify(hydrated).includes(preview.path), false);
  assert.equal(JSON.stringify(hydrated).includes(stem.path), false);
});

test("hydration marks a missing media reference without exposing a path", async (t) => {
  const { storage } = await makeStorage(t);
  const session = await storage.hydrateSession({
    app: "ChordPilot",
    version: 1,
    audio: { id: "22222222-2222-4222-8222-222222222222", name: "missing.wav", extension: "wav", kind: "source" }
  });

  assert.equal(session.audio.exists, false);
  assert.equal(session.audio.path, undefined);
  assert.equal(session.audio.url, undefined);
});

test("session storage strips location metadata while retaining opaque media URLs", async (t) => {
  const { root, storage } = await makeStorage(t);
  const tempPath = path.join(root, "tmp", "song.wav.part");
  const absolutePath = path.join(root, "outside.wav");
  const relativePath = "../outside.wav";
  const fileUri = `file://${absolutePath}`;
  fs.writeFileSync(tempPath, "RIFF");
  const media = await storage.commitMedia({ tempPath, originalName: "song.wav", kind: "source" });

  const saved = await storage.saveSession({
    app: "ChordPilot",
    version: 1,
    audio: media,
    chart: {
      title: "Keep this title",
      lyrics: { source: "manual transcription" },
      bars: [{ evidence: { source: "confidence-model" } }],
      previewSourceUri: fileUri,
      src: relativePath,
      pathToAudio: absolutePath,
      fileLocation: relativePath,
      stems: { directory: absolutePath, stems: [] }
    }
  });
  const opened = await storage.openSession(saved.id);
  const portable = storage.portableSession(saved.id);

  for (const payload of [saved.session, opened.session, portable]) {
    assert.equal(payload.chart.title, "Keep this title");
    assert.equal(payload.chart.lyrics.source, "manual transcription");
    assert.equal(payload.chart.bars[0].evidence.source, "confidence-model");
    assert.equal(JSON.stringify(payload).includes(absolutePath), false);
    assert.equal(JSON.stringify(payload).includes(relativePath), false);
    assert.equal(JSON.stringify(payload).includes(fileUri), false);
  }
  assert.equal(opened.session.audio.url, `/api/media/${media.id}`);
});

test("importSession saves a portable session document", async (t) => {
  const { root, storage } = await makeStorage(t);
  const tempPath = storage.createTempPath(".json.part");
  fs.writeFileSync(tempPath, JSON.stringify({ app: "ChordPilot", version: 1 }));

  const imported = await storage.importSession(tempPath);
  assert.match(imported.id, /^[a-f0-9-]{36}$/);
  assert.equal((await storage.openSession(imported.id)).session.app, "ChordPilot");
});

test("storage operations reject typed directories replaced by symlinks after initialization", async (t) => {
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "chordpilot-web-storage-outside-"));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  const validId = "44444444-4444-4444-8444-444444444444";

  for (const directory of ["media", "generated", "sessions", "tmp"]) {
    const { root, storage } = await makeStorage(t);
    const target = path.join(root, directory);
    fs.rmSync(target, { recursive: true, force: true });
    fs.symlinkSync(outside, target);

    if (directory === "sessions") {
      assert.throws(() => storage.listSessions(), /Configured ChordPilot storage is invalid/);
    } else if (directory === "tmp") {
      assert.throws(() => storage.createTempPath(".wav.part"), /Configured ChordPilot storage is invalid/);
    } else {
      assert.throws(() => storage.resolveMedia(validId), /Configured ChordPilot storage is invalid/);
    }
  }
});

test("importSession rejects a symlinked temporary file", async (t) => {
  const { root, storage } = await makeStorage(t);
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "chordpilot-web-storage-outside-"));
  t.after(() => fs.rmSync(outsideRoot, { recursive: true, force: true }));
  const outside = path.join(outsideRoot, "session.json");
  const tempPath = path.join(root, "tmp", "import.json.part");
  fs.writeFileSync(outside, JSON.stringify({ app: "ChordPilot", version: 1 }));
  fs.symlinkSync(outside, tempPath);

  await assert.rejects(() => storage.importSession(tempPath), /Imported session data is invalid/);
});

test("resolveMedia rejects metadata that maps an ID to another stored file", async (t) => {
  const { root, storage } = await makeStorage(t);
  const firstTemp = path.join(root, "tmp", "first.wav.part");
  const secondTemp = path.join(root, "tmp", "second.wav.part");
  fs.writeFileSync(firstTemp, "RIFF");
  fs.writeFileSync(secondTemp, "WAVE");
  const first = await storage.commitMedia({ tempPath: firstTemp, originalName: "first.wav", kind: "source" });
  const second = await storage.commitMedia({ tempPath: secondTemp, originalName: "second.wav", kind: "source" });
  const metadataPath = path.join(root, "media", `${first.id}.json`);
  const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  metadata.filename = path.basename(second.path);
  fs.writeFileSync(metadataPath, JSON.stringify(metadata));

  assert.throws(() => storage.resolveMedia(first.id), /Stored media metadata is invalid/);
});

test("registerExisting removes its staging file when media registration fails", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "chordpilot-web-storage-register-failure-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const temporaryId = "11111111-1111-4111-8111-111111111111";
  const destinationId = "22222222-2222-4222-8222-222222222222";
  let calls = 0;
  const storage = createStorage({
    root,
    randomUUID: () => (++calls === 1 ? temporaryId : destinationId)
  });
  await storage.initialize();
  const sourcePath = path.join(root, "source.wav");
  fs.writeFileSync(sourcePath, "RIFF");
  fs.writeFileSync(path.join(root, "generated", `${destinationId}.wav.part`), "occupied");

  await assert.rejects(
    () => storage.registerExisting({ sourcePath, originalName: "export.wav", kind: "export", copy: false }),
    /Could not store media/
  );
  assert.deepEqual(fs.readdirSync(path.join(root, "tmp")), []);
});
