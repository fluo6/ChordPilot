import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..", "..");
const distDirectory = path.join(repositoryRoot, "dist");

function argumentValue(name, fallback) {
  const argument = process.argv.find((value) => value.startsWith(`--${name}=`));
  return argument ? argument.slice(name.length + 3) : fallback;
}

const platform = argumentValue("platform", process.platform);
const architecture = argumentValue("architecture", process.arch);
const mode = argumentValue("mode", "unpacked");

if (!new Set(["win32", "darwin"]).has(platform)) {
  throw new Error(`Unsupported verification platform: ${platform}`);
}
if (!new Set(["x64", "arm64"]).has(architecture)) {
  throw new Error(`Unsupported verification architecture: ${architecture}`);
}
if (!new Set(["unpacked", "distribution"]).has(mode)) {
  throw new Error(`Unsupported verification mode: ${mode}`);
}
if (!fs.existsSync(distDirectory)) {
  throw new Error(`Build output directory does not exist: ${distDirectory}`);
}

function walk(directory, depth = 0) {
  if (depth > 4) {
    return [];
  }

  const results = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    results.push(entryPath);
    if (entry.isDirectory() && !entry.isSymbolicLink()) {
      results.push(...walk(entryPath, depth + 1));
    }
  }
  return results;
}

function newest(paths) {
  return [...paths].sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)[0];
}

const distEntries = walk(distDirectory);

if (mode === "distribution") {
  const platformLabel = platform === "win32" ? "Windows" : "macOS";
  const expectedSuffixes = platform === "win32" ? [".zip"] : [".dmg", ".zip"];
  const artifacts = distEntries.filter((entryPath) => {
    const name = path.basename(entryPath);
    return name.includes(`-${platformLabel}-${architecture}.`) && expectedSuffixes.some((suffix) => name.endsWith(suffix));
  });

  const foundSuffixes = new Set(artifacts.map((artifact) => path.extname(artifact)));
  const missingSuffixes = expectedSuffixes.filter((suffix) => !foundSuffixes.has(suffix));
  if (missingSuffixes.length > 0) {
    throw new Error(`Missing ${platformLabel} ${architecture} artifacts: ${missingSuffixes.join(", ")}`);
  }

  for (const artifact of artifacts) {
    if (fs.statSync(artifact).size === 0) {
      throw new Error(`Build artifact is empty: ${artifact}`);
    }
    console.log(`Verified artifact: ${path.relative(repositoryRoot, artifact)}`);
  }
} else if (platform === "win32") {
  const executables = distEntries.filter((entryPath) => path.basename(entryPath) === "ChordPilot.exe");
  const matchingExecutables = executables.filter((entryPath) => {
    const parentName = path.basename(path.dirname(entryPath));
    return architecture === "arm64" ? parentName.includes("arm64") : parentName === "win-unpacked";
  });
  const executable = newest(matchingExecutables);
  if (!executable || fs.statSync(executable).size === 0) {
    throw new Error(`No valid unpacked Windows ${architecture} executable was found.`);
  }

  const packagedMain = path.join(path.dirname(executable), "resources", "app", "src", "main", "main.js");
  if (!fs.existsSync(packagedMain)) {
    throw new Error(`Packaged application code is missing: ${packagedMain}`);
  }
  console.log(`Verified executable: ${path.relative(repositoryRoot, executable)}`);
} else {
  const appBundles = distEntries.filter((entryPath) => path.basename(entryPath) === "ChordPilot.app");
  const matchingBundles = appBundles.filter((entryPath) => {
    const parentName = path.basename(path.dirname(entryPath));
    return architecture === "arm64" ? parentName.includes("arm") || parentName === "mac" : !parentName.includes("arm");
  });
  const appBundle = newest(matchingBundles);
  if (!appBundle) {
    throw new Error(`No unpacked macOS ${architecture} app bundle was found.`);
  }

  const executable = path.join(appBundle, "Contents", "MacOS", "ChordPilot");
  const packagedMain = path.join(appBundle, "Contents", "Resources", "app", "src", "main", "main.js");
  if (!fs.existsSync(executable) || fs.statSync(executable).size === 0) {
    throw new Error(`macOS application executable is missing: ${executable}`);
  }
  if (!fs.existsSync(packagedMain)) {
    throw new Error(`Packaged application code is missing: ${packagedMain}`);
  }
  console.log(`Verified app bundle: ${path.relative(repositoryRoot, appBundle)}`);
}
