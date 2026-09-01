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
