#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPOSITORY_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
MODE="unpacked"
INSTALL_DEPENDENCIES="false"

case "$(uname -m)" in
  arm64) ARCHITECTURE="arm64" ;;
  x86_64) ARCHITECTURE="x64" ;;
  *)
    echo "Unsupported Mac architecture: $(uname -m)" >&2
    exit 1
    ;;
esac

for argument in "$@"; do
  case "${argument}" in
    --distribution) MODE="distribution" ;;
    --unpacked) MODE="unpacked" ;;
    --install) INSTALL_DEPENDENCIES="true" ;;
    --arch=arm64) ARCHITECTURE="arm64" ;;
    --arch=x64) ARCHITECTURE="x64" ;;
    *)
      echo "Unknown argument: ${argument}" >&2
      echo "Usage: bash scripts/build-macos.sh [--unpacked|--distribution] [--arch=arm64|--arch=x64] [--install]" >&2
      exit 1
      ;;
  esac
done

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "The macOS build script must run on macOS." >&2
  exit 1
fi

command -v node >/dev/null 2>&1 || { echo "Node.js is required." >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "npm is required." >&2; exit 1; }

cd "${REPOSITORY_ROOT}"

if [[ "${INSTALL_DEPENDENCIES}" == "true" || ! -d node_modules/electron-builder ]]; then
  npm ci
fi

if [[ "${MODE}" == "distribution" ]]; then
  npm run dist:mac -- "--${ARCHITECTURE}"
else
  npm run build:mac -- "--${ARCHITECTURE}"
fi

node scripts/packaging/verify-build.mjs \
  --platform=darwin \
  "--architecture=${ARCHITECTURE}" \
  "--mode=${MODE}"

echo "macOS ${MODE} build completed and verified for ${ARCHITECTURE}."
