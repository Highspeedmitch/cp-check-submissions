require("dotenv").config();
const mongoose = require("mongoose");
const { validateRuntimeConfig } = require("./config/security");
const { startInspectionWorker } = require("./services/inspectionWorker");

validateRuntimeConfig();

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Inspection worker connected to MongoDB.");
  const stop = startInspectionWorker();
  async function shutdown(signal) {
    console.log(`Inspection worker received ${signal}; shutting down.`);
    stop();
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
