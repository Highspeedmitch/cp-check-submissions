require("dotenv").config();
const mongoose = require("mongoose");
const { validateRuntimeConfig } = require("./config/security");
const { initializeFirebase } = require("./config/firebase");
const { config: validateTotpConfig } = require("./services/totpMfa");
const { createApp } = require("./app");
const { purgeExpiredProspectAssessments } = require("./services/prospectRetention");
const { ensureAssignmentSchedulingIndex } = require("./services/assignmentIndexes");

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

async function startServer() {
  validateRuntimeConfig();
  validateTotpConfig();
  initializeFirebase();

  await mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  console.log("MongoDB connected.");
  const assignmentIndex = await ensureAssignmentSchedulingIndex();
  if (assignmentIndex.changed) {
    console.log("Assignment scheduling index migrated to scheduled-only uniqueness.");
  }

  if (String(process.env.RUN_INSPECTION_WORKER || "true").toLowerCase() !== "false") {
    require("./services/inspectionWorker").startInspectionWorker();
    console.log("Inspection job worker started in the web process.");
  }

  const port = process.env.PORT || 10000;
  const server = createApp().listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
  const prospectCleanupTimer = scheduleProspectCleanup();
  return { server, prospectCleanupTimer };
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error("Server startup error:", error);
    process.exit(1);
  });
}

module.exports = {
  PROSPECT_CLEANUP_INTERVAL_MS,
  scheduleProspectCleanup,
  startServer,
};
