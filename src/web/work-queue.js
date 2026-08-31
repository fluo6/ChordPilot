function createSerialQueue({ onStateChange = () => {} } = {}) {
  let active = 0;
  let queued = 0;
  let closing = false;
  let tail = Promise.resolve();

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
      const error = new Error("The server is shutting down.");
      error.code = "SERVER_SHUTTING_DOWN";
      return Promise.reject(error);
    }

    queued += 1;
    notify();
    const job = tail.then(async () => {
      queued -= 1;
      active += 1;
      notify();
      return work();
    });
    const result = job.finally(() => {
      active -= 1;
      notify();
    });
    tail = result.catch(() => undefined);
    return result;
  }

  function close() {
    if (closing) return;
    closing = true;
    notify();
  }

  return { enqueue, close, state };
}

function createLogBroker() {
  const listeners = new Set();
  let closed = false;

  function publish(message) {
    if (closed) return;
    for (const listener of listeners) {
      try {
        listener(message);
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

module.exports = { createSerialQueue, createLogBroker };
