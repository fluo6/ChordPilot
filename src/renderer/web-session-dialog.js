(function installSessionDialog(browserWindow) {
  if (!browserWindow || browserWindow.chordPilot) return;

  const dialog = document.getElementById("webSessionDialog");
  const list = document.getElementById("webSessionList");
  const empty = document.getElementById("webSessionEmpty");
  const importButton = document.getElementById("webSessionImportButton");
  const importInput = document.getElementById("webSessionImport");
  const cancelButton = document.getElementById("webSessionCancel");
  if (!dialog || !list || !empty || !importButton || !importInput || !cancelButton) return;

  function choose({ sessions = [], onImport } = {}) {
    const focusedBeforeOpen = document.activeElement;
    list.innerHTML = "";
    if (Array.isArray(list.children)) list.children.length = 0;
    empty.hidden = sessions.length > 0;
    sessions.forEach((session) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "web-session-choice";
      const title = document.createElement("strong");
      title.textContent = session.title || "Untitled";
      const detail = document.createElement("span");
      detail.textContent = [session.audioName, session.savedAt ? new Date(session.savedAt).toLocaleString() : ""].filter(Boolean).join(" · ");
      button.append(title, detail);
      button.addEventListener("click", () => finish(session.id));
      list.appendChild(button);
    });

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
    dialog.showModal();
    list.children?.[0]?.focus?.();
    return promise;
  }

  browserWindow.chordPilotSessionDialog = { choose };
})(window);
