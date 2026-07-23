
// models/profit.js
const mongoose = require("mongoose");

const ProfitSchema = new mongoose.Schema({
  propertyId: { type: mongoose.Schema.Types.ObjectId, required: true }, // ✅ Store property._id, but no "ref"
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
  monthlyProfit: { type: Number, required: true },
  ytdProfit: { type: Number, required: true },
  pdfUrl: { type: String, required: true },
  uploadedAt: { type: Date, default: Date.now }
});

// Supports the dashboard's organization-scoped latest-upload aggregation.
ProfitSchema.index({ organizationId: 1, propertyId: 1, uploadedAt: -1 });

module.exports = mongoose.model("Profit", ProfitSchema);

