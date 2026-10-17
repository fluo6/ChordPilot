const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createSessionFiles } = require("../../src/main/session-files");

test("Save overwrites the loaded session; Save As remembers its folder across restarts", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "chordpilot-session-files-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const loaded = path.join(root, "loaded.json");
  const copied = path.join(root, "copies", "copy.json");
  fs.mkdirSync(path.dirname(copied));
  fs.writeFileSync(loaded, JSON.stringify({ chart: { title: "Original" } }));
  const dialogs = [];
  let cancel = false;
  const dialog = {
    async showSaveDialog(_window, options) {
      dialogs.push(options);
      return cancel ? { canceled: true } : { canceled: false, filePath: copied };
    },
    async showOpenDialog(_window, options) {
      dialogs.push(options);
      return { canceled: true, filePaths: [] };
    }
  };
  const services = {
    async writeSessionFile(file, session) { fs.writeFileSync(file, JSON.stringify(session)); return { path: file }; },
    async readSessionFile(file) { return { path: file, session: JSON.parse(fs.readFileSync(file, "utf8")) }; }
  };
  const options = { dialog, getWindow: () => null, getServices: () => services, preferencesPath: path.join(root, "preferences.json"), fallbackFolder: root };
  const files = createSessionFiles(options);
  await files.openPath(loaded);
  await files.save({ chart: { title: "Updated" } }, { path: loaded });
  assert.equal(dialogs.length, 0);
  assert.equal(JSON.parse(fs.readFileSync(loaded)).chart.title, "Updated");
  await files.save({ chart: { title: "Copy" } }, { path: loaded, saveAs: true });
  assert.equal(path.dirname(dialogs[0].defaultPath), root);
  assert.equal(JSON.parse(fs.readFileSync(copied)).chart.title, "Copy");
  const restarted = createSessionFiles(options);
  await restarted.open();
  assert.equal(dialogs.at(-1).defaultPath, path.dirname(copied));
  cancel = true;
  assert.equal(await restarted.save({ chart: { title: "New" } }), null);
  assert.equal(path.dirname(dialogs.at(-1).defaultPath), path.dirname(copied));
  assert.equal(JSON.parse(fs.readFileSync(loaded)).chart.title, "Updated");
});
