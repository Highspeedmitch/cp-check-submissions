const mongoose = require("mongoose");

function createInspectionAiSummarySchema() {
  return new mongoose.Schema({
    status: {
      type: String,
      enum: ["not_requested", "generated", "failed"],
      default: "not_requested",
    },
    mode: {
      type: String,
      enum: ["off", "dev-preview", "shadow", "live"],
      default: "off",
    },
    text: { type: String, default: "", maxlength: 300 },
    modelId: { type: String, default: "", maxlength: 250 },
    promptVersion: { type: String, default: "", maxlength: 50 },
    sourceHash: { type: String, default: "", maxlength: 64 },
    inputTokens: { type: Number, default: 0, min: 0 },
    outputTokens: { type: Number, default: 0, min: 0 },
    latencyMs: { type: Number, default: 0, min: 0 },
    attemptedAt: { type: Date, default: null },
    generatedAt: { type: Date, default: null },
    lastError: { type: String, default: "", maxlength: 500 },
  }, { _id: false });
}

module.exports = { createInspectionAiSummarySchema };
