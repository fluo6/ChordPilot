function createSerialQueue({ onStateChange = () => {} } = {}) {
  let active = 0;
  let queued = 0;
  let closing = false;
  let cancelPending = false;
  let tail = Promise.resolve();

  function shutdownError() {
    const error = new Error("The server is shutting down.");
    error.code = "SERVER_SHUTTING_DOWN";
    return error;
  }

  function state() {
    return { active, queued, closing };
  }

  function notify() {
    try {
      onStateChange(state());
    } catch (_error) {
      // State observers must not disrupt queued work.
    }
  }

  function enqueue(_label, work) {
    if (closing) {
      return Promise.reject(shutdownError());
    }

    queued += 1;
    notify();
    const job = tail.then(async () => {
      queued -= 1;
      if (cancelPending) {
        notify();
        throw shutdownError();
      }
      active += 1;
      notify();
      try {
        return await work();
      } finally {
        active -= 1;
        notify();
      }
    });
    tail = job.catch(() => undefined);
    return job;
  }

  function close(options = {}) {
    const shouldCancelPending = options.cancelPending === true;
    if (closing && (!shouldCancelPending || cancelPending)) return;
    closing = true;
    cancelPending = cancelPending || shouldCancelPending;
    notify();
  }

  function idle() {
    return tail.then(() => undefined);
  }

  return { enqueue, close, idle, state };
}

function sanitizePublicLogText(value) {
  return String(value)
    .replace(/\bfile:(?:\/\/)?[^\s"'<>]+/gi, "[path]")
    .replace(/(["'])(?:[a-z]:[\\/]|\\\\|\/)[^"']+\1/gi, (_match, quote) => `${quote}[path]${quote}`)
    .replace(/(^|[\s(=])(?:[a-z]:[\\/]|\\\\)[^\s,;)\]}'"<>]+/gi, "$1[path]")
    .replace(/(^|[\s(=])\/(?!\/)[^\s,;)\]}'"<>]+/g, "$1[path]");
}

function sanitizePublicLog(message, seen = new WeakSet()) {
  if (typeof message === "string") return sanitizePublicLogText(message);
  if (!message || typeof message !== "object") return message;
  if (seen.has(message)) return "[unavailable]";
  seen.add(message);
  if (Array.isArray(message)) return message.map((item) => sanitizePublicLog(item, seen));
  return Object.fromEntries(Object.entries(message)
    .map(([key, value]) => [key, sanitizePublicLog(value, seen)]));
}

function createLogBroker({ sanitize = sanitizePublicLog } = {}) {
  const listeners = new Set();
  let closed = false;

  function publish(message) {
    if (closed) return;
    const publicMessage = sanitize(message);
    for (const listener of listeners) {
      try {
        listener(publicMessage);
      } catch (_error) {
        // A disconnected client must not prevent other listeners from receiving a log.
      }
    }
  }

  function subscribe(listener) {
    if (closed) return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function close() {
    closed = true;
    listeners.clear();
  }

  return { publish, subscribe, close };
}

module.exports = { createSerialQueue, createLogBroker, sanitizePublicLog };
