require("dotenv").config();
const mongoose = require("mongoose");
const { validateRuntimeConfig } = require("./config/security");
const { startInspectionWorker } = require("./services/inspectionWorker");
const { startMonthlyPortfolioSummaryWorker } = require("./services/monthlyPortfolioSummaryWorker");
const { ensureAssignmentSchedulingIndex } = require("./services/assignmentIndexes");
const MonthlyPortfolioSummary = require("./models/monthlyPortfolioSummary");

validateRuntimeConfig();

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Inspection worker connected to MongoDB.");
  await ensureAssignmentSchedulingIndex();
  await MonthlyPortfolioSummary.createIndexes();
  const stop = startInspectionWorker();
  const stopMonthlyPortfolioSummaries = String(
    process.env.RUN_MONTHLY_PORTFOLIO_SUMMARY_WORKER || "true"
  ).toLowerCase() === "false"
    ? () => {}
    : startMonthlyPortfolioSummaryWorker();
  async function shutdown(signal) {
    console.log(`Inspection worker received ${signal}; shutting down.`);
    stop();
    stopMonthlyPortfolioSummaries();
    await mongoose.disconnect();
    process.exit(0);
  }
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((error) => {
  console.error("Inspection worker failed to start:", error);
  process.exit(1);
});
