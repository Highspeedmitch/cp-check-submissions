// models/contractor.js
const mongoose = require("mongoose");

const ContractorSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
});

module.exports = mongoose.model("Contractor", ContractorSchema);
