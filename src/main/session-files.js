const fs = require("node:fs");
const path = require("node:path");
const { safeFileName } = require("../runtime/chordpilot-services");

function createSessionFiles({ dialog, getWindow, getServices, preferencesPath, fallbackFolder }) {
  const filters = [
    { name: "ChordPilot Session", extensions: ["chordpilot-session.json", "json"] },
    { name: "JSON", extensions: ["json"] }
  ];
  let lastFolder;
  try { lastFolder = JSON.parse(fs.readFileSync(preferencesPath, "utf8")).lastSessionFolder; } catch (_) {}

  function folder() {
    try { if (lastFolder && fs.statSync(lastFolder).isDirectory()) return lastFolder; } catch (_) {}
    return fallbackFolder;
  }

  function rememberFolder(file) {
    lastFolder = path.dirname(file);
    try {
      fs.mkdirSync(path.dirname(preferencesPath), { recursive: true });
      fs.writeFileSync(preferencesPath, JSON.stringify({ lastSessionFolder: lastFolder }), "utf8");
    } catch (error) {
      console.warn("Could not remember the session folder:", error.message);
    }
  }

  async function save(session, options = {}) {
    let file = options.saveAs ? null : options.path;
    if (!file) {
      const title = session?.chart?.title || session?.audio?.name || "chordpilot-session";
      const result = await dialog.showSaveDialog(getWindow(), {
        title: options.saveAs ? "Save ChordPilot Session As" : "Save ChordPilot Session",
        defaultPath: path.join(folder(), `${safeFileName(title, "chordpilot-session")}.chordpilot-session.json`),
        filters
      });
      if (result.canceled || !result.filePath) return null;
      file = result.filePath;
    }
    const saved = await getServices().writeSessionFile(file, session);
    rememberFolder(file);
    return saved;
  }

  async function open() {
    const result = await dialog.showOpenDialog(getWindow(), {
      title: "Open ChordPilot Session",
      defaultPath: folder(),
      properties: ["openFile"],
      filters: [...filters, { name: "All Files", extensions: ["*"] }]
    });
    return result.canceled || !result.filePaths?.length ? null : openPath(result.filePaths[0]);
  }

  async function openPath(file) {
    return getServices().readSessionFile(file);
  }

  return { save, open, openPath };
}

module.exports = { createSessionFiles };
