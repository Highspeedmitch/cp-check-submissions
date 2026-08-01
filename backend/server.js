require("dotenv").config();
const mongoose = require("mongoose");
const { validateRuntimeConfig } = require("./config/security");
const { initializeFirebase } = require("./config/firebase");
const { config: validateTotpConfig } = require("./services/totpMfa");
const { createApp } = require("./app");
const { purgeExpiredProspectAssessments } = require("./services/prospectRetention");

const PROSPECT_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

function scheduleProspectCleanup() {
  purgeExpiredProspectAssessments().catch((error) => {
    console.error("Initial prospect assessment cleanup error:", error);
  });
  const timer = setInterval(() => {
    purgeExpiredProspectAssessments().catch((error) => {
      console.error("Prospect assessment cleanup error:", error);
    });
  }, PROSPECT_CLEANUP_INTERVAL_MS);
  timer.unref();
  return timer;
}

function startInspectionWorkerWhenReady() {
  mongoose.connection.once("open", () => {
    if (String(process.env.RUN_INSPECTION_WORKER || "true").toLowerCase() === "false") {
      return;
    }
    require("./services/inspectionWorker").startInspectionWorker();
    console.log("Inspection job worker started in the web process.");
  });
}

function startServer() {
  validateRuntimeConfig();
  validateTotpConfig();
  initializeFirebase();
  startInspectionWorkerWhenReady();

  mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
    .then(() => console.log("MongoDB connected."))
    .catch((error) => console.error("MongoDB connection error:", error));

  const port = process.env.PORT || 10000;
  const server = createApp().listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
  const prospectCleanupTimer = scheduleProspectCleanup();
  return { server, prospectCleanupTimer };
}

if (require.main === module) {
  startServer();
}

module.exports = {
  PROSPECT_CLEANUP_INTERVAL_MS,
  scheduleProspectCleanup,
  startServer,
};
