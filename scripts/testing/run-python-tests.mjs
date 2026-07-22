import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const testArgs = ["-m", "unittest", "discover", "-s", "tests/python", "-p", "test_*.py"];

function configuredCandidate() {
  const command = String(process.env.CHORDPILOT_PYTHON || "").trim();
  if (!command) {
    return null;
  }
  const env = { ...process.env };
  if (process.env.CHORDPILOT_PYTHONHOME) {
    env.PYTHONHOME = process.env.CHORDPILOT_PYTHONHOME;
    env.PYTHONPATH = "";
  }
  return { command, args: testArgs, env, label: "CHORDPILOT_PYTHON" };
}

function windowsCandidates() {
  const programFiles = process.env.ProgramFiles || "C:\\Program Files";
  const qgisRoot = path.join(programFiles, "QGIS 3.42.1");
  const qgisPython = path.join(qgisRoot, "bin", "python.exe");
  const qgisHome = path.join(qgisRoot, "apps", "Python312");
  const candidates = [];
  if (fs.existsSync(qgisPython) && fs.existsSync(qgisHome)) {
    candidates.push({
      command: qgisPython,
      args: testArgs,
      env: { ...process.env, PYTHONHOME: qgisHome, PYTHONPATH: "" },
      label: "QGIS Python"
    });
  }
  candidates.push({ command: "py", args: ["-3", ...testArgs], env: process.env, label: "py -3" });
  candidates.push({ command: "python", args: testArgs, env: process.env, label: "python" });
  return candidates;
}

const candidates = [
  configuredCandidate(),
  ...(process.platform === "win32"
    ? windowsCandidates()
    : [
        { command: "python3", args: testArgs, env: process.env, label: "python3" },
        { command: "python", args: testArgs, env: process.env, label: "python" }
      ])
].filter(Boolean);

for (const candidate of candidates) {
  const probe = spawnSync(candidate.command, ["--version"], { env: candidate.env, encoding: "utf8", windowsHide: true });
  if (probe.error || probe.status !== 0) {
    continue;
  }
  const version = String(probe.stdout || probe.stderr || candidate.label).trim();
  console.log(`Python tests: ${candidate.label} (${version})`);
  const result = spawnSync(candidate.command, candidate.args, { env: candidate.env, stdio: "inherit", windowsHide: true });
  process.exit(result.status ?? 1);
}

console.error("No usable Python 3 interpreter was found. Set CHORDPILOT_PYTHON and, when needed, CHORDPILOT_PYTHONHOME.");
process.exit(1);
