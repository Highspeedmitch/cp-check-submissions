const mongoose = require("mongoose");

const PlatformOperatingCostSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  category: {
    type: String,
    enum: ["aws", "ai", "hosting", "software", "payroll", "other"],
    default: "other",
  },
  amountCents: { type: Number, min: 1, required: true },
  currency: { type: String, enum: ["USD"], default: "USD" },
  startMonth: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
  endMonth: { type: String, default: "", match: /^(|\d{4}-(0[1-9]|1[0-2]))$/ },
  recurrence: { type: String, enum: ["one_time", "monthly"], default: "one_time" },
  classification: { type: String, enum: ["estimated", "actual"], default: "estimated" },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  archivedAt: { type: Date, default: null, index: true },
  archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true });

PlatformOperatingCostSchema.index({ archivedAt: 1, startMonth: 1, endMonth: 1, recurrence: 1 });

module.exports = mongoose.model("PlatformOperatingCost", PlatformOperatingCostSchema);
