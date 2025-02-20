// models/cleaner.js
const mongoose = require("mongoose");

const CleanerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
});

module.exports = mongoose.model("Cleaner", CleanerSchema);
