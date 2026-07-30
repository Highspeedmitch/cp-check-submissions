const mongoose = require("mongoose");

const ProspectAssessmentSchema = new mongoose.Schema({
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  businessName: { type: String, default: "", trim: true },
  propertyAddress: { type: String, required: true, trim: true },
  responses: { type: mongoose.Schema.Types.Mixed, default: {} },
  templateSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
  pdfKey: { type: String, required: true },
  pdfFileName: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, index: true },
  expiresAt: { type: Date, required: true, index: true },
});

module.exports = mongoose.model("ProspectAssessment", ProspectAssessmentSchema);
