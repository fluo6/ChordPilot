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

  assert.throws(() => storage.resolveMedia(id), /outside the ChordPilot data root/);
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

test("importSession saves a portable session document", async (t) => {
  const { root, storage } = await makeStorage(t);
  const tempPath = storage.createTempPath(".json.part");
  fs.writeFileSync(tempPath, JSON.stringify({ app: "ChordPilot", version: 1 }));

  const imported = await storage.importSession(tempPath);
  assert.match(imported.id, /^[a-f0-9-]{36}$/);
  assert.equal((await storage.openSession(imported.id)).session.app, "ChordPilot");
});
