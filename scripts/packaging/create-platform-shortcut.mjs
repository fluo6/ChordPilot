import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..", "..");
const requestedPlatform = process.argv
  .find((argument) => argument.startsWith("--platform="))
  ?.split("=", 2)[1] || process.platform;

if (requestedPlatform !== process.platform) {
  throw new Error(`Cannot create a ${requestedPlatform} shortcut while running on ${process.platform}. Build on the target operating system.`);
}

if (process.platform === "win32") {
  const result = spawnSync("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    path.join(scriptDirectory, "create-windows-shortcut.ps1"),
    "-RepositoryRoot",
    repositoryRoot
  ], { stdio: "inherit" });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Windows shortcut creation failed with exit code ${result.status}.`);
  }
} else if (process.platform === "darwin") {
  const distDirectory = path.join(repositoryRoot, "dist");
  const appCandidates = [];

  function findAppBundles(directory, depth = 0) {
    if (!fs.existsSync(directory) || depth > 3) {
      return;
    }

    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory() && entry.name === "ChordPilot.app") {
        appCandidates.push(entryPath);
      } else if (entry.isDirectory()) {
        findAppBundles(entryPath, depth + 1);
      }
    }
  }

  findAppBundles(distDirectory);
  if (appCandidates.length === 0) {
    throw new Error("No built ChordPilot.app was found under dist.");
  }

  appCandidates.sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
  const appBundle = appCandidates[0];
  const shortcutPath = path.join(repositoryRoot, "ChordPilot - macOS.app");

  if (fs.existsSync(shortcutPath) || fs.lstatSync(shortcutPath, { throwIfNoEntry: false })) {
    const existing = fs.lstatSync(shortcutPath);
    if (!existing.isSymbolicLink()) {
      throw new Error(`${shortcutPath} already exists and is not a symlink.`);
    }
    fs.unlinkSync(shortcutPath);
  }

  fs.symlinkSync(path.relative(repositoryRoot, appBundle), shortcutPath, "dir");
  console.log(`Created ChordPilot - macOS.app -> ${path.relative(repositoryRoot, appBundle)}`);
} else {
  console.log(`No platform shortcut is needed for ${process.platform}.`);
}
