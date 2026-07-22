const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("chordPilot", {
  chooseAudio: () => ipcRenderer.invoke("audio:choose"),
  downloadYoutubeAudio: (url) => ipcRenderer.invoke("audio:downloadYoutube", url),
  lookupMetadata: (audio) => ipcRenderer.invoke("audio:lookupMetadata", audio),
  processAudio: (payload) => ipcRenderer.invoke("audio:process", payload),
  exportAudioTrack: (payload) => ipcRenderer.invoke("audio:exportTrack", payload),
  showMessage: (payload) => ipcRenderer.invoke("app:message", payload),
  analyze: (audioPath, mode = "fast", options = {}) => ipcRenderer.invoke("chart:analyze", { audioPath, mode, options }),
  exportChart: (chart, format) => ipcRenderer.invoke("chart:export", { chart, format }),
  saveSession: (session) => ipcRenderer.invoke("session:save", session),
  openSession: () => ipcRenderer.invoke("session:open"),
  openSessionPath: (sessionPath) => ipcRenderer.invoke("session:openPath", sessionPath),
  onBackendLog: (callback) => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on("backend:log", listener);
    return () => ipcRenderer.removeListener("backend:log", listener);
  }
});
