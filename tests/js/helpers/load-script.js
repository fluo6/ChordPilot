const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..", "..", "..");

function loadScript(relativePath, exportNames, globals = {}) {
  const filename = path.join(root, relativePath);
  const source = fs.readFileSync(filename, "utf8");
  const context = vm.createContext({
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    URL,
    ...globals
  });
  const exportsSource = exportNames.map((name) => `${JSON.stringify(name)}: typeof ${name} === "undefined" ? undefined : ${name}`).join(",");
  vm.runInContext(`${source}\n;globalThis.__testExports = {${exportsSource}};`, context, { filename });
  return { ...context.__testExports, context };
}

function plain(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

module.exports = { loadScript, plain, root };
