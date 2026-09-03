(function installSessionDialog(browserWindow) {
  if (!browserWindow || browserWindow.chordPilot) return;

  const dialog = document.getElementById("webSessionDialog");
  const list = document.getElementById("webSessionList");
  const empty = document.getElementById("webSessionEmpty");
  const importButton = document.getElementById("webSessionImportButton");
  const importInput = document.getElementById("webSessionImport");
  const cancelButton = document.getElementById("webSessionCancel");
  const storageSummary = document.getElementById("webStorageSummary");
  const storageError = document.getElementById("webStorageError");
  const clearButtons = {
    analysis: document.getElementById("webClearAnalysis"),
    models: document.getElementById("webClearModels"),
    all: document.getElementById("webClearAll")
  };
  if (!dialog || !list || !empty || !importButton || !importInput || !cancelButton) return;

  function formatBytes(value) {
    const bytes = Math.max(0, Number(value) || 0);
    if (bytes < 1024) return `${bytes} B`;
    const units = ["KB", "MB", "GB", "TB"];
    let amount = bytes / 1024;
    let unit = units[0];
    for (let index = 1; amount >= 1024 && index < units.length; index += 1) {
      amount /= 1024;
      unit = units[index];
    }
    return `${Number.isInteger(amount) ? amount : amount.toFixed(1)} ${unit}`;
  }

  function usageText(label, usage = {}) {
    return `${label} ${Number(usage.count) || 0} · ${formatBytes(usage.bytes)}`;
  }

  function choose({ sessions = [], storage = {}, queue = {}, onImport, onDelete, onClearCache } = {}) {
    const focusedBeforeOpen = document.activeElement;
    let current = { sessions, storage, queue };
    let mutating = false;

    const setControlsDisabled = () => {
      const busy = mutating || Number(current.queue?.active) > 0 || Number(current.queue?.queued) > 0 || current.queue?.closing === true;
      Object.values(clearButtons).filter(Boolean).forEach((button) => { button.disabled = busy; });
    };

    const render = () => {
      list.innerHTML = "";
      if (Array.isArray(list.children)) list.children.length = 0;
      const currentSessions = Array.isArray(current.sessions) ? current.sessions : [];
      empty.hidden = currentSessions.length > 0;
      currentSessions.forEach((session) => {
        const row = document.createElement("div");
        row.className = "web-session-row";
        const openButton = document.createElement("button");
        openButton.type = "button";
        openButton.className = "web-session-choice";
        openButton.setAttribute("aria-label", `Open ${session.title || "Untitled"}`);
        const title = document.createElement("strong");
        title.textContent = session.title || "Untitled";
        const detail = document.createElement("span");
        detail.textContent = [session.audioName, session.savedAt ? new Date(session.savedAt).toLocaleString() : ""].filter(Boolean).join(" · ");
        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "web-session-delete";
        deleteButton.textContent = "Delete";
        deleteButton.setAttribute("aria-label", `Delete ${session.title || "Untitled"}`);
        openButton.addEventListener("click", () => finish(session.id));
        deleteButton.addEventListener("click", async () => {
          if (!browserWindow.confirm(`Delete the saved session “${session.title || "Untitled"}”? The audio file will be kept.`)) return;
          await mutate(() => onDelete?.(session.id));
        });
        openButton.append(title, detail);
        row.append(openButton, deleteButton);
        list.appendChild(row);
      });
      if (storageSummary) {
        storageSummary.textContent = [
          usageText("Uploads", current.storage?.media),
          usageText("Generated", current.storage?.generated),
          usageText("Sessions", current.storage?.sessions),
          usageText("Analysis cache", current.storage?.analysis),
          usageText("Models", current.storage?.models)
        ].join(" | ");
      }
      setControlsDisabled();
    };

    const mutate = async (operation) => {
      if (mutating) return;
      mutating = true;
      if (storageError) {
        storageError.hidden = true;
        storageError.textContent = "";
      }
      setControlsDisabled();
      try {
        const next = await operation();
        if (next && typeof next === "object") current = next;
        render();
      } catch (_error) {
        if (storageError) {
          storageError.textContent = "Could not update server storage. Please try again.";
          storageError.hidden = false;
        }
      } finally {
        mutating = false;
        setControlsDisabled();
      }
    };

    let settled = false;
    let result = null;
    let failure = null;
    let resolveChoice;
    let rejectChoice;
    const cleanup = () => {
      dialog.removeEventListener("close", complete);
      dialog.removeEventListener("cancel", cancel);
      cancelButton.removeEventListener("click", cancel);
      importButton.removeEventListener("click", importClick);
      importInput.removeEventListener("change", importChange);
      Object.entries(clearButtons).forEach(([scope, button]) => button?.removeEventListener("click", clearHandlers[scope]));
    };
    const finish = (nextResult, error = null) => {
      if (settled) return;
      settled = true;
      result = nextResult;
      failure = error;
      if (dialog.open) dialog.close();
      else complete();
    };
    const complete = () => {
      if (!settled) {
        settled = true;
      }
      cleanup();
      focusedBeforeOpen?.focus?.();
      if (failure) rejectChoice(failure);
      else resolveChoice(result || null);
    };
    const cancel = (event) => {
      event?.preventDefault?.();
      finish(null);
    };
    const importClick = () => importInput.click();
    const clearHandlers = Object.fromEntries(Object.entries(clearButtons).map(([scope]) => [scope, () => {
      const label = scope === "analysis" ? "analysis cache" : scope === "models" ? "downloaded models" : "analysis cache and downloaded models";
      if (!browserWindow.confirm(`Clear ${label}? Uploaded audio and saved sessions will be kept.`)) return;
      mutate(() => onClearCache?.(scope));
    }]));
    const importChange = async () => {
      const file = importInput.files?.[0];
      if (!file) return;
      try {
        finish(await onImport?.(file));
      } catch (error) {
        finish(null, error);
      }
    };

    const promise = new Promise((resolve, reject) => {
      resolveChoice = resolve;
      rejectChoice = reject;
    });
    dialog.addEventListener("close", complete);
    dialog.addEventListener("cancel", cancel);
    cancelButton.addEventListener("click", cancel);
    importInput.value = "";
    importInput.addEventListener("change", importChange);
    importButton.addEventListener("click", importClick);
    Object.entries(clearButtons).forEach(([scope, button]) => button?.addEventListener("click", clearHandlers[scope]));
    render();
    dialog.showModal();
    list.children?.[0]?.children?.[0]?.focus?.();
    return promise;
  }

  browserWindow.chordPilotSessionDialog = { choose };
})(window);
