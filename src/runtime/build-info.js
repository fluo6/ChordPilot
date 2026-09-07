const fs = require("node:fs");
const path = require("node:path");

function getBuildInfo(options = {}) {
  const appRoot = options.appRoot || path.resolve(__dirname, "../..");
  let version = "0.1.1";
  let builtAt = process.env.CHORDPILOT_BUILD_TIME || process.env.BUILD_TIME || "";

  try {
    const pkgPath = path.join(appRoot, "package.json");
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      if (pkg.version) version = pkg.version;
    }
  } catch (_error) {}

  try {
    const buildPath = path.join(appRoot, "src", "build-info.json");
    if (fs.existsSync(buildPath)) {
      const info = JSON.parse(fs.readFileSync(buildPath, "utf8"));
      if (info.version) version = info.version;
      if (info.builtAt && !builtAt) builtAt = info.builtAt;
    }
  } catch (_error) {}

  if (!builtAt) {
    builtAt = "2026-09-04T12:00:00Z";
  }

  return {
    app: "ChordPilot",
    version,
    builtAt
  };
}

module.exports = { getBuildInfo };
