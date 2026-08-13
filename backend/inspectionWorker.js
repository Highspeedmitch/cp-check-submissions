const { initializeRuntime } = require("./runtimeBootstrap");
const mongoose = require("mongoose");
const { captureBackendException, flushBackendMonitoring } = require("./monitoring");
const { ensureBackgroundWorkerIndexes, startBackgroundWorkers } = require("./backgroundWorkers");
const { createShutdownCoordinator, installShutdownHandlers } = require("./runtimeShutdown");

async function main() {
  initializeRuntime();
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Inspection worker connected to MongoDB.");
  const { assignmentIndex } = await ensureBackgroundWorkerIndexes();
  if (assignmentIndex.changed) {
    console.log("Assignment scheduling index migrated to scheduled-only uniqueness.");
  }
  const workerRuntime = startBackgroundWorkers({ inspectionEnabled: true });
  const shutdown = createShutdownCoordinator({
    workers: workerRuntime.controllers,
    disconnect: () => mongoose.disconnect(),
  });
  const removeShutdownHandlers = installShutdownHandlers(shutdown);
  return { workerRuntime, shutdown, removeShutdownHandlers };
}

if (require.main === module) {
  main().catch(async (error) => {
    console.error("Inspection worker failed to start:", error);
    captureBackendException(error, { tags: { phase: "worker-startup" } });
    await mongoose.disconnect().catch(() => {});
    await flushBackendMonitoring(2000);
    process.exitCode = 1;
  });
}

module.exports = { main };
