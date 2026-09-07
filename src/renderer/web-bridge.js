(function installWebBridge(browserWindow) {
  if (!browserWindow || browserWindow.chordPilot) return;

  const requestJson = async (url, init = {}) => {
    const response = await fetch(url, init);
    let payload = {};
    try {
      payload = await response.json();
    } catch (_error) {
      // A malformed response is still surfaced as a normal renderer Error.
    }
    if (!response.ok) {
      throw new Error(payload?.error?.message || `Request failed (${response.status})`);
    }
    return payload;
  };

  const postJson = (url, payload) => requestJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  function mediaId(value) {
    if (value && typeof value === "object") return value.id || value.path || "";
    return String(value || "");
  }

  function browserMedia(value) {
    if (!value || typeof value !== "object") return value;
    const id = mediaId(value);
    const cover = value.cover && typeof value.cover === "object" ? browserMedia(value.cover) : value.cover;
    const result = id ? { ...value, id, path: id } : { ...value };
    if (cover) {
      result.cover = cover;
      result.coverUrl = cover.url || result.coverUrl || "";
    }
    return result;
  }

  function browserChart(chart) {
    if (!chart || typeof chart !== "object") return chart;
    const result = { ...chart };
    if (chart.stems && typeof chart.stems === "object") {
      result.stems = {
        ...chart.stems,
        stems: Array.isArray(chart.stems.stems) ? chart.stems.stems.map(browserMedia) : chart.stems.stems
      };
    }
    return result;
  }

  function browserSession(result) {
    if (!result || typeof result !== "object") return result;
    const session = result.session && typeof result.session === "object" ? { ...result.session } : result.session;
    if (session?.audio) session.audio = browserMedia(session.audio);
    if (session?.audioPreview) session.audioPreview = browserMedia(session.audioPreview);
    if (session?.chart) session.chart = browserChart(session.chart);
    return { ...result, path: result.id || result.path, session };
  }

  function pickFile(accept) {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = accept;
      input.style.display = "none";
      document.body.appendChild(input);
      let settled = false;
      const finish = (file) => {
        if (settled) return;
        settled = true;
        input.remove();
        resolve(file || null);
      };
      input.addEventListener("change", () => finish(input.files?.[0]));
      input.addEventListener("cancel", () => finish(null));
      input.click();
    });
  }

  async function uploadFile(endpoint, field, file) {
    if (!file) return null;
    const body = new FormData();
    body.append(field, file, file.name || "upload");
    return requestJson(endpoint, { method: "POST", body });
  }

  async function downloadFrom(url, filename) {
    const response = await fetch(url);
    if (!response.ok) {
      let payload = {};
      try { payload = await response.json(); } catch (_error) {}
      throw new Error(payload?.error?.message || `Download failed (${response.status})`);
    }
    const blob = await response.blob();
    const objectUrl = browserWindow.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = String(filename || "chordpilot-download");
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    try {
      anchor.click();
    } finally {
      anchor.remove();
      browserWindow.setTimeout(() => browserWindow.URL.revokeObjectURL(objectUrl), 0);
    }
    return true;
  }

  let eventSource;
  const logListeners = new Set();

  function closeLogSource() {
    if (!eventSource || logListeners.size) return;
    eventSource.close();
    eventSource = undefined;
  }

  function ensureLogSource() {
    if (eventSource) return eventSource;
    eventSource = new browserWindow.EventSource("/api/events");
    const deliver = (event) => {
      let message;
      try { message = JSON.parse(event.data); } catch (_error) { return; }
      logListeners.forEach((listener) => listener(message));
    };
    eventSource.addEventListener?.("log", deliver);
    eventSource.onmessage = deliver;
    return eventSource;
  }

  browserWindow.chordPilot = {
    isWebRuntime: true,

    async storageSummary() {
      return requestJson("/api/storage");
    },

    async deleteSession(sessionId) {
      return requestJson(`/api/sessions/${encodeURIComponent(mediaId(sessionId))}`, { method: "DELETE" });
    },

    async clearCache(scope) {
      return requestJson(`/api/storage/cache/${encodeURIComponent(String(scope || ""))}`, { method: "DELETE" });
    },

    async chooseAudio() {
      const file = await pickFile(".mp3,.wav,.aif,.aiff,.flac,.m4a");
      if (!file) return null;
      const payload = await uploadFile("/api/media/upload", "audio", file);
      return browserMedia(payload.audio);
    },

    async downloadYoutubeAudio(url) {
      const payload = await postJson("/api/youtube", { url });
      return browserMedia(payload.audio);
    },

    async lookupMetadata(audio) {
      const payload = await postJson("/api/metadata", { audio: { ...audio, id: mediaId(audio) } });
      return payload.metadata;
    },

    async processAudio(payload = {}) {
      const result = await postJson("/api/preview", {
        mediaId: mediaId(payload.audioPath),
        semitones: payload.semitones,
        tempoRate: payload.tempoRate
      });
      return browserMedia(result.preview);
    },

    async exportAudioTrack(payload = {}) {
      const result = await postJson("/api/exports/audio", {
        mediaId: mediaId(payload.sourcePath || payload.path),
        filename: payload.label,
        format: payload.format || "wav"
      });
      await downloadFrom(result.downloadUrl, result.filename);
      return { path: mediaIdFromUrl(result.downloadUrl), format: result.format };
    },

    async showMessage(payload = {}) {
      const text = [payload.title || "ChordPilot", payload.message || "An error occurred.", payload.detail || ""].filter(Boolean).join("\n\n");
      browserWindow.alert(text);
      return { response: 0, checkboxChecked: false };
    },

    async analyze(audioPath, mode = "fast", options = {}) {
      const result = await postJson("/api/analyze", { mediaId: mediaId(audioPath), mode, options });
      return browserChart(result.chart);
    },

    async exportChart(chart, format) {
      const result = await postJson("/api/exports/chart", { chart, format });
      await downloadFrom(result.downloadUrl, result.filename);
      return { path: mediaIdFromUrl(result.downloadUrl), format: result.format };
    },

    async saveSession(session) {
      const result = await postJson("/api/sessions", session);
      await downloadFrom(result.downloadUrl, "chordpilot-session.chordpilot-session.json");
      return { path: result.id };
    },

    async openSession() {
      const loadState = async () => {
        const [listed, storageState] = await Promise.all([
          requestJson("/api/sessions"),
          browserWindow.chordPilot.storageSummary()
        ]);
        return { sessions: listed.sessions || [], ...storageState };
      };
      const initial = await loadState();
      const selected = await browserWindow.chordPilotSessionDialog?.choose({
        ...initial,
        onImport: async (file) => browserSession(await uploadFile("/api/sessions/import", "session", file)),
        onDelete: async (id) => {
          await browserWindow.chordPilot.deleteSession(id);
          return loadState();
        },
        onClearCache: async (scope) => {
          await browserWindow.chordPilot.clearCache(scope);
          return loadState();
        }
      });
      if (!selected) return null;
      if (typeof selected === "object") return browserSession(selected);
      return browserSession(await requestJson(`/api/sessions/${encodeURIComponent(selected)}`));
    },

    async openSessionPath(sessionPath) {
      return browserSession(await requestJson(`/api/sessions/${encodeURIComponent(mediaId(sessionPath))}`));
    },

    onBackendLog(callback) {
      if (typeof callback !== "function") return () => {};
      ensureLogSource();
      logListeners.add(callback);
      return () => {
        logListeners.delete(callback);
        closeLogSource();
      };
    }
  };

  function mediaIdFromUrl(url) {
    const match = String(url || "").match(/\/api\/media\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : "";
  }
})(window);
