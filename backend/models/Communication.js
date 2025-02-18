const mongoose = require("mongoose");

const CommunicationSchema = new mongoose.Schema({
  propertyId: { type: mongoose.Schema.Types.ObjectId, required: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
  message: { type: String, required: true },
  date: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Communication", CommunicationSchema);
