# ChordPilot LAN Web Runtime Design

**Date:** 2026-08-31
**Status:** Approved in chat

## Goal

Make the complete ChordPilot workflow available from a browser on another
computer on the same trusted LAN. A developer must be able to run one command:

```bash
docker compose up -d --build
```

and then use ChordPilot at `http://<host-ip>:2712` by default. The browser
runtime must support local audio uploads, YouTube imports, metadata lookup,
fast and high-quality analysis, stem playback, transformed previews, session
save/open/import, chart exports, and audio downloads. The existing Electron
desktop runtime must continue to work.

This is a single-user development service with no authentication. It is only
for a trusted LAN and must not be exposed directly to the public internet.

## Approaches Considered

### Single-container web runtime (selected)

A Node server serves the existing renderer, implements its native operations
as HTTP endpoints, streams backend logs, and invokes the existing Python,
ffmpeg, and yt-dlp workflows. A browser bridge exposes the same
`window.chordPilot` contract as the Electron preload bridge.

This approach has one Compose service, one origin, one persistent volume, and
the least operational overhead while still testing a real browser client.

### Split frontend and backend containers

Separate static-web and API services would provide a production-style
boundary, but would introduce CORS, two health checks, multiple image builds,
and cross-service storage concerns without benefiting this trusted LAN use
case.

### Electron through remote desktop/noVNC

This would preserve native dialogs but would test a streamed Electron desktop,
not a browser application. Audio, input, and downloads would be less natural,
and the resulting stack would be heavier and more fragile.

## Architecture

The application will have three runtime layers:

1. **Shared services** contain the filesystem, process, metadata, audio,
   analysis, export, and session operations that currently live in the
   Electron main process. They accept explicit inputs and return serializable
   results without depending on Electron UI objects.
2. **Runtime adapters** expose those services through either Electron IPC or a
   same-origin Node HTTP API. The Electron preload contract remains available
   to the desktop renderer. The HTTP adapter adds validation, upload handling,
   downloads, log streaming, and media serving.
3. **Renderer bridges** provide the existing `window.chordPilot` methods. The
   Electron bridge continues to use IPC. A browser bridge uses `fetch`, browser
   file inputs/downloads, an in-app session chooser, and server-sent events.

The browser and Electron runtimes share the current HTML, CSS, renderer logic,
Python backend, and service behavior. Browser-specific UI is limited to the
bridge and the session selection/import dialog.

## Browser Contract

The browser bridge will implement every method currently exposed by
`src/main/preload.js`:

- `chooseAudio` opens a browser file picker, uploads one MP3 or WAV, and
  resolves to an audio record with an opaque media ID and same-origin URL.
- `downloadYoutubeAudio` submits a URL for server-side yt-dlp/ffmpeg import.
- `lookupMetadata` performs the existing tag and MusicBrainz lookup through the
  server.
- `processAudio` creates pitch/tempo-transformed mix or stem previews from a
  server media ID.
- `exportAudioTrack` downloads the chosen original, stem, or generated preview
  through the browser.
- `showMessage` displays a browser dialog with equivalent information.
- `analyze` runs the existing Python JSON command for fast or high-quality
  analysis and resolves media paths in the returned chart to opaque media
  references.
- `exportChart` renders the requested format on the server and downloads it.
- `saveSession` stores a persistent server copy and downloads a portable JSON
  session file.
- `openSession` opens an in-app list of stored sessions and also permits a
  session JSON upload from the visiting laptop.
- `openSessionPath` treats the supplied value as an opaque session ID, never a
  filesystem path.
- `onBackendLog` subscribes to server-sent progress events and returns an
  unsubscribe callback.

The renderer will load exactly one bridge before its existing scripts. Runtime
detection will be explicit rather than relying on failed Electron calls.

## HTTP API and Jobs

All browser APIs are same-origin and live under `/api`. Request and response
bodies use JSON except uploads and binary downloads. A stable error response
contains an error code and human-readable message; the bridge converts it into
an `Error` for the existing renderer handlers.

The server uses opaque, generated IDs for media, sessions, jobs, and exports.
It maintains authoritative metadata records under the configured data root.
Clients cannot submit absolute or relative server paths. Every resolved path
must remain within its assigned data directory after canonicalization.

Analysis, Demucs, preview, import, and export execution uses asynchronous child
processes. CPU-heavy analysis work is serialized through a one-worker queue to
avoid overlapping Demucs processes exhausting memory. Lightweight operations
such as metadata reads and session listing may run concurrently. Long-running
HTTP requests have no application timeout, and backend output is published to
connected clients over a server-sent event endpoint.

If a client disconnects, an accepted analysis job may complete and cache its
artifacts. Partially written upload and export files use temporary names and
are either atomically promoted on success or removed after failure.

## Storage Model

One Docker named volume is mounted at `/data`. The server uses these logical
subdirectories:

- `/data/media` for uploaded and YouTube-imported source audio;
- `/data/generated` for previews, exported audio, and browser-playable stem
  references;
- `/data/sessions` for server-side session JSON and its index metadata;
- `/data/cache` for Python analysis, decoded WAV, and Demucs artifacts;
- `/data/tmp` for incomplete uploads and short-lived exports.

Source and generated media URLs include only opaque IDs. Session JSON stored or
downloaded by the web runtime records media IDs and portable metadata rather
than leaking container paths. On session import, the server validates the
document and reconnects media IDs that still exist. If referenced audio is not
available, the session opens in the same missing-source state supported by the
desktop renderer.

The default upload limit is configurable and documented. It must be high
enough for normal song-length lossless audio, with a default of 512 MiB. MIME
type and filename checks provide early feedback, while ffmpeg/Python decoding
remains the authoritative content validation.

## Container and Compose Design

The image uses a supported Node runtime and a Python virtual environment. The
build installs Node production dependencies plus pinned Python audio
dependencies, yt-dlp, CPU Demucs, and system ffmpeg. Runtime installation of
Demucs is disabled so the first high-quality analysis is predictable.

The image exposes port `3000`, stores mutable state only beneath `/data`, and
runs the Node web entry point. It includes a health endpoint that verifies the
HTTP process and required data directories without starting expensive audio
work.

`docker-compose.yml` defines one service with:

- build context at the repository root;
- `${CHORDPILOT_PORT:-2712}:3000` port mapping, which binds on all host
  interfaces;
- a named persistent data volume;
- `restart: unless-stopped`;
- a health check against the internal health endpoint;
- environment values for the data root, Python executable, ffmpeg, cache root,
  upload limit, and disabled Demucs auto-install.

A `.dockerignore` excludes Git metadata, local dependencies, build artifacts,
test caches, and persistent development data from the build context.

## Security and Failure Handling

The intended security boundary is the trusted LAN. The service has no login,
TLS, or per-user isolation. Documentation must state that anyone who can reach
the port can upload audio, start CPU-intensive work, inspect stored sessions,
and download stored media.

Within that boundary, the server will:

- reject unknown IDs, unsupported extensions/formats, malformed JSON, and
  oversized uploads;
- constrain all filesystem access to typed storage directories;
- use argument arrays rather than shell interpolation for child processes;
- redact internal filesystem paths from API errors;
- limit request body sizes;
- serialize heavy jobs;
- return clear non-2xx errors that the existing UI can display;
- shut down cleanly by refusing new work and terminating managed children.

External failures from MusicBrainz, YouTube, ffmpeg, Python, or Demucs are
reported with an actionable summary and progress logs. A failure must not
invalidate an existing source upload or previously completed analysis.

## Compatibility

Electron remains a first-class runtime. Existing desktop IPC channel names and
preload method signatures stay stable. Shared-service extraction must preserve
current desktop file-dialog behavior and packaged resource resolution.

Browser sessions and desktop sessions use the same top-level session schema.
Runtime-specific media references are normalized at their adapter boundary so
renderer state does not need to understand container paths.

## Testing

Automated coverage will include:

- unit tests for opaque ID parsing, storage containment, metadata records,
  session normalization, API validation, and error mapping;
- browser bridge tests for upload selection, JSON API calls, downloads,
  session selection/import, and log subscription;
- HTTP integration tests for health/static serving, upload and media range
  requests, session save/list/open/import, chart export, audio export, invalid
  IDs, traversal attempts, body limits, and consistent errors;
- regression execution of all existing JavaScript and Python tests;
- Compose configuration validation and Docker image build;
- container health verification;
- an end-to-end server flow using a generated WAV: upload, analyze, persist a
  session, export a chart, and retrieve generated media.

The Docker verification must confirm that the service responds through the
host-published port, not only through the container's internal network.
Interactive browser confirmation from another LAN laptop remains a final user
check because the automated environment cannot represent that laptop or its
firewall.

## Documentation and Operation

The README will add a LAN web section modeled on the sibling repositories. It
will document:

- `docker compose up -d --build` and `docker compose down`;
- finding the host address with `hostname -I` on Linux;
- opening `http://<host-ip>:2712` from another laptop;
- changing the port with `CHORDPILOT_PORT`;
- inspecting service health and logs;
- volume persistence and an explicit command for intentionally removing data;
- host firewall troubleshooting;
- CPU/RAM and first-run Demucs model-download expectations;
- the trusted-LAN-only warning.

## Acceptance Criteria

The work is complete when:

1. The existing Electron application and test suites still pass.
2. `docker compose up -d --build` produces a healthy service without manual
   dependency installation.
3. A browser on the host can complete upload, playback, fast analysis, editing,
   session save/open, chart export, and audio export.
4. The container has the dependencies and wiring required to start a CPU
   high-quality Demucs analysis and stream its progress.
5. YouTube import and metadata lookup use the server runtime and report useful
   errors when external services are unavailable.
6. Restarting the service preserves uploads, sessions, and analysis artifacts.
7. Arbitrary server filesystem paths and traversal attempts are rejected.
8. The documented LAN URL is reachable from another laptop once the host
   firewall permits the configured port.

## Out of Scope

- Public-internet deployment, authentication, TLS, and multi-user isolation;
- GPU passthrough or GPU-specific Demucs images;
- horizontal scaling or distributed job queues;
- cloud/object storage;
- mobile-specific UI redesign;
- changing ChordPilot's analysis algorithms or chart-editing behavior.
