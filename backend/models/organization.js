// models/organization.js
const mongoose = require('mongoose');

const PropertySchema = new mongoose.Schema({
  name: { type: String, required: true },
  lat: { type: Number },
  lng: { type: Number },
  emails: { type: [String], default: [] },
  accessInstructions: { type: String, default: "" },
  maintenanceInfo: { type: String, default: "" },
  generalInfo: { type: String, default: "" },
  region: { type: String, default: "Uncategorized" },
  customFields: [
    {
      name: { type: String, required: true },
      type: { type: String, enum: ["text", "yesno"], required: true }
    }
  ],
  maintenanceData: {
    breakerBoxLocation: { type: String, default: "" },
    airFilterSize: { type: String, default: "" },
    additionalNotes: { type: String, default: "" }
  },

  // ✅ NEW ADDRESS FIELDS
  streetAddress: { type: String, default: "" },
  suite: { type: String, default: "" },
  city: { type: String, default: "" },
  state: { type: String, default: "" },
  zip: { type: String, default: "" },

  // Optionally store an array of client user IDs who own this property
  clientOwners: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
});

const OrganizationSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  orgType: { 
    type: String, 
    enum: ["COM", "RES", "LTR", "STR"],
    required: true 
  },
  properties: { type: [PropertySchema], default: [] },
});

module.exports = mongoose.model('Organization', OrganizationSchema);
