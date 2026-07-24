const mongoose = require("mongoose");

const BidRequestSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  grossSquareFeet: { type: Number, required: true, min: 1 },
  propertyType: {
    type: String,
    enum: ["free_standing", "strip_mall", "individual_suite"],
    required: true,
  },
  address: { type: String, required: true },
  serviceFrequency: {
    type: String,
    enum: ["monthly", "weekly", "ad_hoc"],
    required: true,
  },
  knownIssues: { type: String, default: "" },
  attachmentKey: { type: String, required: true },
  attachmentName: { type: String, required: true },
  status: {
    type: String,
    enum: ["pending", "approved", "declined"],
    default: "pending",
    index: true,
  },
  adminNotes: { type: String, default: "" },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  reviewedAt: Date,
}, { timestamps: true });

module.exports = mongoose.model("BidRequest", BidRequestSchema);
