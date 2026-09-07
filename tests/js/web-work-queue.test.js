const test = require("node:test");
const assert = require("node:assert/strict");

const { createSerialQueue, createLogBroker } = require("../../src/web/work-queue");

test("serial queue never overlaps work", async () => {
  const queue = createSerialQueue();
  let active = 0;
  let maximum = 0;
  const work = () => queue.enqueue("analysis", async () => {
    active += 1;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 10));
    active -= 1;
  });

  await Promise.all([work(), work(), work()]);
  assert.equal(maximum, 1);
});

test("rejected work does not poison the FIFO tail", async () => {
  const queue = createSerialQueue();
  const runs = [];

  await assert.rejects(queue.enqueue("first", async () => {
    runs.push("first");
    throw new Error("failed");
  }), /failed/);
  await queue.enqueue("second", async () => runs.push("second"));

  assert.deepEqual(runs, ["first", "second"]);
});

test("queue reports transitions and rejects new work after close", async () => {
  const changes = [];
  const queue = createSerialQueue({ onStateChange: (state) => changes.push(state) });
  let release;
  const running = queue.enqueue("analysis", () => new Promise((resolve) => {
    release = resolve;
  }));

  await new Promise((resolve) => setImmediate(resolve));
  queue.close();
  assert.deepEqual(queue.state(), { active: 1, queued: 0, closing: true, label: "analysis" });
  await assert.rejects(queue.enqueue("export", async () => {}), (error) => error.code === "SERVER_SHUTTING_DOWN");
  release();
  await running;

  assert.deepEqual(queue.state(), { active: 0, queued: 0, closing: true });
  assert.deepEqual(changes, [
    { active: 0, queued: 1, closing: false },
    { active: 1, queued: 0, closing: false, label: "analysis" },
    { active: 1, queued: 0, closing: true, label: "analysis" },
    { active: 0, queued: 0, closing: true }
  ]);
});

test("queue close can cancel pending work without interrupting the active job", async () => {
  const queue = createSerialQueue();
  const runs = [];
  let releaseActive;
  const active = queue.enqueue("active", async () => {
    runs.push("active");
    await new Promise((resolve) => { releaseActive = resolve; });
  });
  await new Promise((resolve) => setImmediate(resolve));
  const pending = queue.enqueue("pending", async () => runs.push("pending"));

  queue.close({ cancelPending: true });
  releaseActive();
  const [activeResult, pendingResult] = await Promise.allSettled([active, pending]);

  assert.equal(activeResult.status, "fulfilled");
  assert.equal(pendingResult.status, "rejected");
  assert.equal(pendingResult.reason.code, "SERVER_SHUTTING_DOWN");
  assert.deepEqual(runs, ["active"]);
  assert.deepEqual(queue.state(), { active: 0, queued: 0, closing: true });
});

test("log broker unsubscribe stops delivery", () => {
  const broker = createLogBroker();
  const rows = [];
  const unsubscribe = broker.subscribe((message) => rows.push(message));
  broker.publish("one");
  unsubscribe();
  broker.publish("two");
  assert.deepEqual(rows, ["one"]);
});

test("log broker isolates listener failures and closes subscriptions", () => {
  const broker = createLogBroker();
  const rows = [];
  broker.subscribe(() => {
    throw new Error("disconnected");
  });
  broker.subscribe((message) => rows.push(message));

  broker.publish("one");
  broker.close();
  broker.publish("two");
  const unsubscribe = broker.subscribe((message) => rows.push(message));
  unsubscribe();

  assert.deepEqual(rows, ["one"]);
});
