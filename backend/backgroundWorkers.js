const InspectionJob = require("./models/inspectionJob");
const MonthlyPortfolioSummary = require("./models/monthlyPortfolioSummary");
const WarRoomNotificationEvent = require("./models/warRoomNotificationEvent");
const RouteRun = require("./models/routeRun");
const { ensureAssignmentSchedulingIndex } = require("./services/assignmentIndexes");
const inspectionWorker = require("./services/inspectionWorker");
const monthlyWorker = require("./services/monthlyPortfolioSummaryWorker");
const warRoomWorker = require("./services/warRoomNotifications");
const {
  createQueueMetricSource,
  startWorkerObservability,
  workerMetricsEnabled,
  workerMetricsConfig,
} = require("./services/workerObservability");

function enabledByEnvironment(env, name, fallback = true) {
  const value = env[name];
  return value === undefined ? fallback : String(value).trim().toLowerCase() !== "false";
}

async function ensureBackgroundWorkerIndexes() {
  const assignmentIndex = await ensureAssignmentSchedulingIndex();
  await Promise.all([
    InspectionJob.createIndexes(),
    MonthlyPortfolioSummary.createIndexes(),
    RouteRun.createIndexes(),
    WarRoomNotificationEvent.createIndexes(),
  ]);
  return { assignmentIndex };
}

function startBackgroundWorkers({
  env = process.env,
  inspectionEnabled = enabledByEnvironment(env, "RUN_INSPECTION_WORKER"),
  monthlyEnabled = enabledByEnvironment(env, "RUN_MONTHLY_PORTFOLIO_SUMMARY_WORKER"),
  warRoomEnabled = enabledByEnvironment(env, "RUN_WAR_ROOM_NOTIFICATION_WORKER"),
  logger = console,
} = {}) {
  workerMetricsConfig(env);
  const controllers = [];
  const metricSources = [];

  if (inspectionEnabled) {
    const controller = inspectionWorker.startInspectionWorker();
    controllers.push(controller);
    metricSources.push(createQueueMetricSource({
      name: "inspection",
      Model: InspectionJob,
      controller,
      leaseMs: inspectionWorker.LEASE_MS,
    }));
    logger.log("Inspection job worker started.");
  }

  if (monthlyEnabled) {
    const controller = monthlyWorker.startMonthlyPortfolioSummaryWorker({ env });
    controllers.push(controller);
    metricSources.push(createQueueMetricSource({
      name: "monthly-portfolio-summary",
      Model: MonthlyPortfolioSummary,
      controller,
      leaseMs: monthlyWorker.LEASE_MS,
    }));
    logger.log("Monthly portfolio summary worker started.");
  }

  if (warRoomEnabled) {
    const controller = warRoomWorker.startWarRoomNotificationWorker();
    controllers.push(controller);
    metricSources.push(createQueueMetricSource({
      name: "war-room-notification",
      Model: WarRoomNotificationEvent,
      controller,
      leaseMs: warRoomWorker.LEASE_MS,
      queueFilter: () => ({
        status: { $in: ["queued", "failed"] },
        $expr: { $lt: ["$attempts", "$maxAttempts"] },
      }),
    }));
    logger.log("War Room notification worker started.");
  }

  const observability = startWorkerObservability({ sources: metricSources, env });
  controllers.push(observability);
  if (workerMetricsEnabled(env) && metricSources.length) {
    logger.log("Worker and queue CloudWatch metrics started.");
  }

  return { controllers, metricSources, observability };
}

module.exports = {
  enabledByEnvironment,
  ensureBackgroundWorkerIndexes,
  startBackgroundWorkers,
};
