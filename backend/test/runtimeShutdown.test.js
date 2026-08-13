const test = require("node:test");
const assert = require("node:assert/strict");
const { createShutdownCoordinator } = require("../runtimeShutdown");

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test("graceful shutdown stops intake, drains workers, then disconnects", async () => {
  const order = [];
  const work = deferred();
  function worker() { order.push("worker-stop"); }
  worker.drain = async () => {
    order.push("worker-drain-start");
    await work.promise;
    order.push("worker-drain-finish");
  };
  const server = {
    listening: true,
    close(callback) {
      order.push("server-close");
      callback();
    },
    closeIdleConnections() { order.push("server-close-idle"); },
  };
  let exitCode = null;
  const shutdown = createShutdownCoordinator({
    server,
    workers: [worker],
    async disconnect() { order.push("database-disconnect"); },
    logger: { log() {}, error() {} },
    setExitCode(code) { exitCode = code; },
  });

  const first = shutdown("SIGTERM");
  const second = shutdown("SIGINT");
  assert.equal(first, second);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(order.slice(0, 4), [
    "server-close",
    "server-close-idle",
    "worker-stop",
    "worker-drain-start",
  ]);

  work.resolve();
  const result = await first;
  assert.equal(result.exitCode, 0);
  assert.equal(exitCode, 0);
  assert.ok(order.indexOf("worker-drain-finish") < order.indexOf("database-disconnect"));
});
