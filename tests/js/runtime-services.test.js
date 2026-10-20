const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");

const { createChordPilotServices, buildAudioPreviewFilter, normalizeYoutubeUrl } = require("../../src/runtime/chordpilot-services");

test("range analysis sends exact inputs to backend and resolves only registered desktop stems", async (t) => {
  let args;
  const { root, services } = makeServices(t, {
    pythonCandidates: [{ command: "python", prefix: [] }],
    spawnImpl(_command, value) { args = value; return fakeChild({ stdout: JSON.stringify({ chord: "C/E" }) }); }
  });
  const song = path.join(root, "song.wav"); const bass = path.join(root, "bass.wav");
  fs.writeFileSync(song, "audio"); fs.writeFileSync(bass, "bass");
  const session = path.join(root, "session.json");
  fs.writeFileSync(session, JSON.stringify({ audio: { path: song }, chart: { stems: { ok: true, stems: [{ name: "bass", path: bass }] } } }));
  await services.readSessionFile(session);
  assert.deepEqual(services.resolveStudySourcePaths(song, ["bass"]), { bass });
  assert.throws(() => services.resolveStudySourcePaths(song, ["other"]), /unavailable/);
  const result = await services.analyzeRange({ audioPath: song, sourcePaths: { bass }, start: .2, end: .8, options: { song_key: "C" } });
  assert.equal(result.chord, "C/E");
  assert.ok(args.includes("analyze-range"));
  assert.equal(args[args.indexOf("--end") + 1], "0.8");
  assert.deepEqual(JSON.parse(args[args.indexOf("--sources") + 1]), { bass });
});

function fakeChild({ stdout = "", stdoutChunks = [], stderr = "", code = 0, onSpawn } = {}) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = { write() {}, end() {} };
  queueMicrotask(() => {
    onSpawn?.();
    if (stdout) child.stdout.emit("data", Buffer.from(stdout));
    for (const chunk of stdoutChunks) child.stdout.emit("data", chunk);
    if (stderr) child.stderr.emit("data", Buffer.from(stderr));
    child.emit("close", code);
  });
  return child;
}

test('optional drums resolve prepared stems and never invoke main analysis', async t => {
  const calls=[];
  const {root,services}=makeServices(t,{pythonCandidates:[{command:'python'}],spawnImpl(command,args){
    calls.push(args);
    return fakeChild({stdout:JSON.stringify(args.includes('prepare-stems')
      ? {ok:true,stems:[{name:'drums',path:path.join(root,'drums.wav')}]}
      : {ok:true,events:[{time:.25,instrument:'kick',score:.8}]})});
  }});
  const audioPath=path.join(root,'song.wav');
  fs.writeFileSync(audioPath,'audio');fs.writeFileSync(path.join(root,'drums.wav'),'drums');
  await assert.rejects(services.analyzeDrums({audioPath}),/unavailable/);
  const stems=await services.prepareStems({audioPath});
  assert.equal(stems.stems[0].name,'drums');
  const result=await services.analyzeDrums({audioPath,force:true});
  assert.equal(result.events[0].instrument,'kick');
  assert.equal(calls.length,2);
  assert.ok(calls[0].includes('prepare-stems'));
  assert.ok(calls[1].includes('analyze-drums'));
  assert.ok(calls[1].includes('--force'));
  assert.ok(!calls.flat().includes('analyze'));
});

function makeServices(t, overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "chordpilot-services-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const options = {
    appRoot: path.resolve(__dirname, "../.."),
    backendScript: path.resolve(__dirname, "../../backend/chordpilot.py"),
    tempDir: path.join(root, "temp"),
    coverDir: path.join(root, "covers"),
    importDir: path.join(root, "imports"),
    previewDir: path.join(root, "previews"),
    pythonCandidates: [],
    ffmpegPath: "ffmpeg",
    ytDlpPath: "yt-dlp",
    env: {},
    toUrl: (value) => `test://${path.basename(value)}`,
    emitLog: () => {},
    ...overrides
  };
  return { root, options, services: createChordPilotServices(options) };
}

test("preview filters clamp tempo and preserve pitch", () => {
  assert.match(buildAudioPreviewFilter(2, 1.25), /asetrate=/);
  assert.match(buildAudioPreviewFilter(0, 9), /atempo=2/);
});

test("YouTube URLs reject non-YouTube hosts", () => {
  assert.throws(() => normalizeYoutubeUrl("https://example.com/watch?v=x"), /Only YouTube/);
});

test("YouTube setup cancellation returns without starting a download", async (t) => {
  const { services } = makeServices(t, {
    ensureYoutubeTools: async () => null,
    spawnImpl() { throw new Error("cancelled setup must not launch yt-dlp"); }
  });
  assert.equal(await services.downloadYoutubeAudio("https://youtu.be/abc"), null);
});

test("YouTube download immediately uses newly installed tools for the original link", async (t) => {
  const calls = [];
  const { root, services } = makeServices(t, {
    ensureYoutubeTools: async () => ({ ytDlpPath: "installed-yt-dlp", ffmpegPath: "installed-ffmpeg", ytDlpFfmpegLocation: "/installed/tools", jsRuntime: "node:/installed/node" }),
    spawnImpl(command, args, options) {
      calls.push({ command, args, options });
      return fakeChild({ stdout: command === "installed-yt-dlp" ? path.join(root, "song.mp3") : "" });
    }
  });
  fs.writeFileSync(path.join(root, "song.mp3"), "audio");
  const audio = await services.downloadYoutubeAudio("https://youtu.be/abc");
  assert.equal(audio.sourceUrl, "https://www.youtube.com/watch?v=abc");
  assert.equal(calls[0].command, "installed-yt-dlp");
  assert.ok(calls[0].args.includes("node:/installed/node"));
  assert.ok(calls[0].args.includes("/installed/tools"));
  assert.equal(calls[0].args.at(-1), "https://www.youtube.com/watch?v=abc");
  assert.ok(calls.some((call) => call.command === "installed-ffmpeg"));
});

test("YouTube import preserves Chinese filenames with Windows output encoding", async (t) => {
  const { root, services } = makeServices(t, {
    spawnImpl(command, args) {
      if (command !== "yt-dlp") return fakeChild();
      const filename = path.join(root, "袁娅维 Tia Ray - Love Can Fly [LJZJhK6JL4s].mp3");
      const encodingIndex = args.indexOf("--encoding");
      // Windows' legacy output encoding drops the Chinese characters unless overridden.
      const stdout = encodingIndex >= 0 && args[encodingIndex + 1] === "utf-8" ? filename : filename.replace("袁娅维", "");
      return fakeChild({ stdout });
    }
  });
  const filename = path.join(root, "袁娅维 Tia Ray - Love Can Fly [LJZJhK6JL4s].mp3");
  fs.writeFileSync(filename, "audio");
  const audio = await services.downloadYoutubeAudio("https://youtu.be/LJZJhK6JL4s");
  assert.equal(audio.path, filename);
});

test("YouTube import preserves multibyte filenames split across stdout chunks", async (t) => {
  const { root, services } = makeServices(t, {
    spawnImpl(command) {
      if (command !== "yt-dlp") return fakeChild();
      const filename = path.join(root, "袁娅维 🎵 [abc].mp3");
      const bytes = Buffer.from(filename + "\n");
      const split = bytes.indexOf(Buffer.from("袁")) + 1;
      return fakeChild({ stdoutChunks: [bytes.subarray(0, split), bytes.subarray(split)] });
    }
  });
  const filename = path.join(root, "袁娅维 🎵 [abc].mp3");
  fs.writeFileSync(filename, "audio");
  const audio = await services.downloadYoutubeAudio("https://youtu.be/abc");
  assert.equal(audio.path, filename);
});

test("analysis uses installed FFmpeg even when a Python candidate has stale settings", async (t) => {
  let backendEnv;
  const { root, services } = makeServices(t, {
    pythonCandidates: [{ command: "python", prefix: ["backend.py"], env: { PYTHONHOME: "configured-home", CHORDPILOT_FFMPEG: "" } }],
    ensureYoutubeTools: async () => ({ ytDlpPath: "installed-yt-dlp", ffmpegPath: "installed-ffmpeg", jsRuntime: "deno:deno" }),
    spawnImpl(command, _args, options) {
      if (command === "python") { backendEnv = options.env; return fakeChild({ stdout: "{}" }); }
      return fakeChild({ stdout: command === "installed-yt-dlp" ? path.join(root, "song.mp3") : "" });
    }
  });
  fs.writeFileSync(path.join(root, "song.mp3"), "audio");
  await services.downloadYoutubeAudio("https://youtu.be/abc");
  await services.analyze({ audioPath: path.join(root, "song.mp3") });
  assert.equal(backendEnv.CHORDPILOT_FFMPEG, "installed-ffmpeg");
  assert.equal(backendEnv.PYTHONHOME, "configured-home");
});

test("session file operations round-trip JSON without Electron", async (t) => {
  const { root, services } = makeServices(t);
  const filename = path.join(root, "session.json");
  await services.writeSessionFile(filename, { app: "ChordPilot", version: 1 });
  assert.equal((await services.readSessionFile(filename)).session.version, 1);
});

test("failed session replacement preserves the previous JSON and removes its temporary file", async (t) => {
  const { root, services } = makeServices(t);
  const filename = path.join(root, "session.json");
  fs.writeFileSync(filename, '{"version":1}');
  const rename = fs.renameSync;
  t.mock.method(fs, "renameSync", (source, destination) => {
    if (destination === filename) throw new Error("replacement failed");
    return rename(source, destination);
  });
  await assert.rejects(services.writeSessionFile(filename, { version: 2 }), /replacement failed/);
  assert.deepEqual(JSON.parse(fs.readFileSync(filename)), { version: 1 });
  assert.equal(fs.readdirSync(root).some((name) => name.endsWith(".part")), false);
});

test("factory creates configured runtime directories", (t) => {
  const { options } = makeServices(t);
  for (const directory of [options.tempDir, options.coverDir, options.importDir, options.previewDir]) {
    assert.equal(fs.statSync(directory).isDirectory(), true);
  }
});

test("audio export converts to the selected path without choosing a destination", async (t) => {
  const calls = [];
  const { root, services } = makeServices(t, {
    spawnImpl(command, args, options) {
      calls.push({ command, args, options });
      return fakeChild();
    }
  });
  const sourcePath = path.join(root, "source.wav");
  const outputPath = path.join(root, "track.mp3");
  fs.writeFileSync(sourcePath, "RIFF");

  assert.deepEqual(await services.exportAudioTrack({ sourcePath, outputPath, format: "mp3" }), {
    path: outputPath,
    format: "mp3"
  });
  assert.equal(calls[0].command, "ffmpeg");
  assert.deepEqual(calls[0].args, [
    "-y", "-hide_banner", "-loglevel", "error", "-i", sourcePath, "-vn",
    "-codec:a", "libmp3lame", "-b:a", "192k", outputPath
  ]);
});

test("analysis invokes configured Python candidates and enriches stem URLs", async (t) => {
  const calls = [];
  const payload = { stems: { stems: [{ path: "/runtime/vocals.wav" }] } };
  const { services } = makeServices(t, {
    pythonCandidates: [{ command: "python3", prefix: ["backend.py"], env: { TEST_ENV: "1" } }],
    spawnImpl(command, args, options) {
      calls.push({ command, args, options });
      return fakeChild({ stdout: JSON.stringify(payload) });
    }
  });

  const result = await services.analyze({ audioPath: "/runtime/song.wav", mode: "hq", options: { stems: true } });
  assert.equal(result.stems.stems[0].url, "test://vocals.wav");
  assert.deepEqual(calls[0].args, [
    "backend.py", "analyze", "/runtime/song.wav", "--mode", "hq", "--options", JSON.stringify({ stems: true })
  ]);
  assert.equal(calls[0].options.shell, undefined);
});

test("chart export removes its temporary input after backend failure", async (t) => {
  let inputPath;
  const { root, services } = makeServices(t, {
    pythonCandidates: [{ command: "python3", prefix: ["backend.py"] }],
    spawnImpl(_command, args) {
      inputPath = args[2];
      assert.equal(fs.existsSync(inputPath), true);
      return fakeChild({ stderr: "export failed", code: 1 });
    }
  });

  await assert.rejects(
    services.exportChart({ chart: { title: "Song" }, format: "txt", outputPath: path.join(root, "song.txt") }),
    /export failed/
  );
  assert.equal(fs.existsSync(inputPath), false);
});

test("cleanup removes only previews generated by the service", async (t) => {
  let generatedPath;
  const { root, services } = makeServices(t, {
    spawnImpl(_command, args) {
      generatedPath = args.at(-1);
      return fakeChild({ onSpawn: () => fs.writeFileSync(generatedPath, "RIFF") });
    }
  });
  const sourcePath = path.join(root, "source.wav");
  fs.writeFileSync(sourcePath, "RIFF");

  await services.processAudioPreview({ audioPath: sourcePath, semitones: 2, tempoRate: 1.25 });
  assert.equal(fs.existsSync(generatedPath), true);
  services.cleanup();
  assert.equal(fs.existsSync(generatedPath), false);
  assert.equal(fs.existsSync(sourcePath), true);
});
