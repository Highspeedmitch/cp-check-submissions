const test = require("node:test");
const assert = require("node:assert/strict");
const {
  publishWorkerMetrics,
  startWorkerObservability,
  workerMetricsConfig,
  workerMetricsEnvironment,
} = require("../services/workerObservability");

test("worker metrics use a stable explicit environment dimension", () => {
  assert.equal(workerMetricsEnvironment({ WORKER_METRICS_ENVIRONMENT: "dev" }), "dev");
  assert.equal(workerMetricsEnvironment({ SENTRY_ENVIRONMENT: "staging" }), "staging");
  assert.equal(workerMetricsEnvironment({ NODE_ENV: "production" }), "production");
});

test("enabled worker metrics fail fast on incomplete or reserved configuration", () => {
  assert.throws(
    () => workerMetricsConfig({ WORKER_METRICS_ENABLED: "true" }),
    /AWS_REGION/
  );
  assert.throws(
    () => workerMetricsConfig({
      WORKER_METRICS_ENABLED: "true",
      AWS_REGION: "us-east-2",
      WORKER_METRICS_NAMESPACE: "AWS/Reserved",
    }),
    /custom CloudWatch namespace/
  );
  assert.deepEqual(workerMetricsConfig({
    WORKER_METRICS_ENABLED: " true ",
    AWS_REGION: "us-east-2",
    WORKER_METRICS_ENVIRONMENT: "dev",
  }), {
    environment: "dev",
    namespace: "Afterlight/Workers",
    region: "us-east-2",
  });
});

test("worker metrics publish health and queue snapshots with low-cardinality dimensions", async () => {
  const now = new Date("2026-08-13T18:00:00.000Z");
  let command;
  const client = { async send(received) { command = received; } };
  const controller = {
    getStatus() {
      return {
        startedAt: new Date(now.getTime() - 60_000),
        lastPollCompletedAt: new Date(now.getTime() - 5_000),
        lastPollSucceededAt: new Date(now.getTime() - 5_000),
        lastPollFailedAt: null,
        stopped: false,
      };
    },
  };
  const result = await publishWorkerMetrics({
    client,
    environment: "dev",
    now,
    sources: [{
      name: "inspection",
      controller,
      async getSnapshot() {
        return {
          queueDepth: 3,
          oldestQueuedAgeSeconds: 42,
          staleLeases: 1,
          recentFailures: 2,
        };
      },
    }],
  });

  assert.equal(result.published, 5);
  assert.equal(command.input.Namespace, "Afterlight/Workers");
  const values = Object.fromEntries(command.input.MetricData.map((datum) => [datum.MetricName, datum.Value]));
  assert.deepEqual(values, {
    QueueDepth: 3,
    OldestQueuedAgeSeconds: 42,
    StaleLeases: 1,
    RecentFailures: 2,
    WorkerHealthy: 1,
  });
  assert.deepEqual(command.input.MetricData[0].Dimensions, [
    { Name: "Environment", Value: "dev" },
    { Name: "Worker", Value: "inspection" },
  ]);
});

test("worker observability is an inert controller unless explicitly enabled", async () => {
  const controller = startWorkerObservability({ env: {}, sources: [{}] });
  controller.stop();
  await controller.drain();
  assert.equal(controller.getStatus().stopped, true);
});
