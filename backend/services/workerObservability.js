const {
  CloudWatchClient,
  PutMetricDataCommand,
} = require("@aws-sdk/client-cloudwatch");
const { captureBackendException } = require("../monitoring");
const { startPollingWorker } = require("./pollingWorker");

const DEFAULT_NAMESPACE = "Afterlight/Workers";
const DEFAULT_INTERVAL_MS = 60 * 1000;
const DEFAULT_FAILURE_WINDOW_MS = 15 * 60 * 1000;

function workerMetricsEnabled(env = process.env) {
  return String(env.WORKER_METRICS_ENABLED || "false").trim().toLowerCase() === "true";
}

function workerMetricsEnvironment(env = process.env) {
  return String(
    env.WORKER_METRICS_ENVIRONMENT
      || env.SENTRY_ENVIRONMENT
      || env.NODE_ENV
      || "development"
  ).trim();
}

function workerMetricsConfig(env = process.env) {
  if (!workerMetricsEnabled(env)) return null;
  const region = String(env.AWS_REGION || "").trim();
  const namespace = String(env.WORKER_METRICS_NAMESPACE || DEFAULT_NAMESPACE).trim();
  const environment = workerMetricsEnvironment(env);
  if (!region) throw new Error("AWS_REGION is required when WORKER_METRICS_ENABLED=true.");
  if (!/^[A-Za-z0-9/._-]{1,255}$/.test(namespace) || namespace.toUpperCase().startsWith("AWS/")) {
    throw new Error("WORKER_METRICS_NAMESPACE must be a valid custom CloudWatch namespace.");
  }
  if (!environment || environment.length > 255) {
    throw new Error("WORKER_METRICS_ENVIRONMENT must be between 1 and 255 characters.");
  }
  return { environment, namespace, region };
}

function createQueueMetricSource({
  name,
  Model,
  controller,
  leaseMs,
  queueFilter = () => ({ status: "queued" }),
} = {}) {
  if (!name || !Model || !controller || !leaseMs) {
    throw new TypeError("Queue metrics require a name, model, worker controller, and lease duration.");
  }
  return {
    name,
    controller,
    async getSnapshot({ now, failureWindowMs = DEFAULT_FAILURE_WINDOW_MS }) {
      const queued = queueFilter(now);
      const staleBefore = new Date(now.getTime() - leaseMs);
      const failedSince = new Date(now.getTime() - failureWindowMs);
      const oldestQuery = Model.findOne(queued)
        .sort({ availableAt: 1, createdAt: 1 })
        .select("availableAt createdAt")
        .lean();
      const [queueDepth, oldest, staleLeases, recentFailures] = await Promise.all([
        Model.countDocuments(queued),
        oldestQuery,
        Model.countDocuments({ status: "processing", lockedAt: { $lte: staleBefore } }),
        Model.countDocuments({ failedAt: { $gte: failedSince } }),
      ]);
      const queuedAt = oldest?.availableAt || oldest?.createdAt || null;
      return {
        queueDepth,
        oldestQueuedAgeSeconds: queuedAt
          ? Math.max(0, Math.floor((now.getTime() - new Date(queuedAt).getTime()) / 1000))
          : 0,
        staleLeases,
        recentFailures,
      };
    },
  };
}

function isWorkerHealthy(controller, now, maxHeartbeatAgeMs) {
  const status = controller?.getStatus?.();
  if (!status || status.stopped) return false;
  const latestActivity = status.lastPollCompletedAt || status.startedAt;
  if (!latestActivity || now.getTime() - new Date(latestActivity).getTime() > maxHeartbeatAgeMs) {
    return false;
  }
  if (!status.lastPollFailedAt) return true;
  return Boolean(
    status.lastPollSucceededAt
      && new Date(status.lastPollSucceededAt) >= new Date(status.lastPollFailedAt)
  );
}

function metricDatum(name, value, unit, dimensions) {
  return {
    MetricName: name,
    Value: Number(value),
    Unit: unit,
    Dimensions: dimensions,
  };
}

async function publishWorkerMetrics({
  sources,
  client,
  namespace = DEFAULT_NAMESPACE,
  environment,
  now = new Date(),
  maxHeartbeatAgeMs = 3 * DEFAULT_INTERVAL_MS,
  failureWindowMs = DEFAULT_FAILURE_WINDOW_MS,
} = {}) {
  const metricData = [];
  for (const source of sources) {
    const dimensions = [
      { Name: "Environment", Value: environment },
      { Name: "Worker", Value: source.name },
    ];
    let healthy = isWorkerHealthy(source.controller, now, maxHeartbeatAgeMs);
    try {
      const snapshot = await source.getSnapshot({ now, failureWindowMs });
      metricData.push(
        metricDatum("QueueDepth", snapshot.queueDepth, "Count", dimensions),
        metricDatum("OldestQueuedAgeSeconds", snapshot.oldestQueuedAgeSeconds, "Seconds", dimensions),
        metricDatum("StaleLeases", snapshot.staleLeases, "Count", dimensions),
        metricDatum("RecentFailures", snapshot.recentFailures, "Count", dimensions)
      );
    } catch (error) {
      healthy = false;
      console.error(`Unable to collect ${source.name} queue metrics:`, error.message);
      captureBackendException(error, {
        tags: {
          component: "worker-observability",
          worker: source.name,
          phase: "collect-queue-metrics",
        },
      });
    }
    metricData.push(metricDatum("WorkerHealthy", healthy ? 1 : 0, "Count", dimensions));
  }

  if (!metricData.length) return { published: 0 };
  await client.send(new PutMetricDataCommand({ Namespace: namespace, MetricData: metricData }));
  return { published: metricData.length };
}

function disabledController() {
  function stop() {}
  stop.stop = stop;
  stop.drain = async () => {};
  stop.getStatus = () => ({ name: "worker-observability", stopped: true });
  return stop;
}

function startWorkerObservability({
  sources = [],
  env = process.env,
  intervalMs = DEFAULT_INTERVAL_MS,
  client,
  now = () => new Date(),
} = {}) {
  const config = workerMetricsConfig(env);
  if (!config || !sources.length) return disabledController();
  const { environment, namespace, region } = config;
  const ownsClient = !client;
  const cloudWatch = client || new CloudWatchClient({
    region,
    maxAttempts: 3,
    cacheMiddleware: true,
    requestHandler: {
      connectionTimeout: 3000,
      requestTimeout: 5000,
    },
  });
  const loop = startPollingWorker({
    name: "worker-observability",
    pollMs: intervalMs,
    async runOnce() {
      await publishWorkerMetrics({
        sources,
        client: cloudWatch,
        namespace,
        environment,
        now: now(),
        maxHeartbeatAgeMs: Math.max(intervalMs * 3, DEFAULT_INTERVAL_MS * 3),
      });
      return false;
    },
  });

  function stop() {
    loop.stop();
  }
  stop.stop = stop;
  stop.getStatus = loop.getStatus;
  stop.drain = async () => {
    await loop.drain();
    if (ownsClient) cloudWatch.destroy();
  };
  return stop;
}

module.exports = {
  DEFAULT_FAILURE_WINDOW_MS,
  DEFAULT_INTERVAL_MS,
  DEFAULT_NAMESPACE,
  createQueueMetricSource,
  isWorkerHealthy,
  publishWorkerMetrics,
  startWorkerObservability,
  workerMetricsEnabled,
  workerMetricsEnvironment,
  workerMetricsConfig,
};
