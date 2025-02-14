
// models/profit.js
const mongoose = require("mongoose");

const ProfitSchema = new mongoose.Schema({
  propertyId: { type: mongoose.Schema.Types.ObjectId, ref: "Property", required: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
  profitValue: { type: Number, required: true },
  pdfUrl: { type: String, required: true }, // Store the S3 URL or local file path
  uploadedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Profit", ProfitSchema);
