const test = require("node:test");
const assert = require("node:assert/strict");
const { startPollingWorker } = require("../services/pollingWorker");

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test("polling worker stops scheduling and drains the active poll", async () => {
  const work = deferred();
  const scheduled = [];
  const controller = startPollingWorker({
    name: "test-worker",
    pollMs: 1000,
    runOnce: () => work.promise,
    setTimer(fn, delay) {
      scheduled.push({ fn, delay });
      return { unref() {} };
    },
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(controller.getStatus().polling, true);
  controller.stop();
  let drained = false;
  const draining = controller.drain().then(() => { drained = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(drained, false);

  work.resolve(true);
  await draining;
  assert.equal(controller.getStatus().polling, false);
  assert.equal(controller.getStatus().stopped, true);
  assert.equal(scheduled.length, 0);
});

test("polling worker records failures without rejecting its lifecycle", async () => {
  const failure = new Error("temporary database failure");
  let reported;
  const controller = startPollingWorker({
    name: "test-worker",
    pollMs: 1000,
    async runOnce() { throw failure; },
    onError(error) { reported = error; },
    setTimer() { return { unref() {} }; },
  });

  await controller.drain();
  controller.stop();
  assert.equal(reported, failure);
  assert.match(controller.getStatus().lastError, /temporary database failure/);
  assert.ok(controller.getStatus().lastPollFailedAt instanceof Date);
});
