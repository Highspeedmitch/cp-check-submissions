const mongoose = require("mongoose");

const CommunicationSchema = new mongoose.Schema({
  propertyId: { type: mongoose.Schema.Types.ObjectId, ref: "Property", required: true }, // Links to the property
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true }, // Links to the organization
  message: { type: String, required: true },
  date: { type: Date, default: Date.now }, // Timestamp of the communication
});

module.exports = mongoose.model("Communication", CommunicationSchema);
