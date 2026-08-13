const { initializeRuntime } = require("./runtimeBootstrap");
const mongoose = require("mongoose");
const { captureBackendException, flushBackendMonitoring } = require("./monitoring");
const { createApp } = require("./app");
const { ensureBackgroundWorkerIndexes, startBackgroundWorkers } = require("./backgroundWorkers");
const { createShutdownCoordinator, installShutdownHandlers } = require("./runtimeShutdown");
const { purgeExpiredProspectAssessments } = require("./services/prospectRetention");
const { startPollingWorker } = require("./services/pollingWorker");
const CalendarFeedSubscription = require("./models/calendarFeedSubscription");

const PROSPECT_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

function scheduleProspectCleanup({
  intervalMs = PROSPECT_CLEANUP_INTERVAL_MS,
  purge = purgeExpiredProspectAssessments,
} = {}) {
  return startPollingWorker({
    name: "prospect-retention-cleanup",
    pollMs: intervalMs,
    async runOnce() {
      await purge();
      return false;
    },
  });
}

async function startServer() {
  initializeRuntime();

  await mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  console.log("MongoDB connected.");
  const { assignmentIndex } = await ensureBackgroundWorkerIndexes();
  if (assignmentIndex.changed) {
    console.log("Assignment scheduling index migrated to scheduled-only uniqueness.");
  }
  await CalendarFeedSubscription.createIndexes();

  const workerRuntime = startBackgroundWorkers();

  const port = process.env.PORT || 10000;
  const server = createApp().listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
  const prospectCleanupWorker = scheduleProspectCleanup();
  const shutdown = createShutdownCoordinator({
    server,
    workers: [...workerRuntime.controllers, prospectCleanupWorker],
    disconnect: () => mongoose.disconnect(),
  });
  const removeShutdownHandlers = installShutdownHandlers(shutdown);
  return {
    server,
    prospectCleanupWorker,
    workerRuntime,
    shutdown,
    removeShutdownHandlers,
  };
}

if (require.main === module) {
  startServer().catch(async (error) => {
    console.error("Server startup error:", error);
    captureBackendException(error, { tags: { phase: "server-startup" } });
    await mongoose.disconnect().catch(() => {});
    await flushBackendMonitoring(2000);
    process.exitCode = 1;
  });
}

module.exports = {
  PROSPECT_CLEANUP_INTERVAL_MS,
  scheduleProspectCleanup,
  startServer,
};
