// models/organization.js
const mongoose = require('mongoose');
const AccessCategorySchema = new mongoose.Schema({
  name: String,
  checked: Boolean,
  quantity: Number,
  details: [String], // array of key codes
  // We can store photos as array of arrays: 
  // photoUrls: [[String]] => each subIndex has an array 
  photoUrls: [[String]] 
});

const MaintenanceItemSchema = new mongoose.Schema({
  notes: String,
  photos: [String] 
});

const MaintenanceCategorySchema = new mongoose.Schema({
  name: String,
  checked: Boolean,
  quantity: Number,
  items: [MaintenanceItemSchema] 
});

const PropertySchema = new mongoose.Schema({
  name: { type: String, required: true },
  propertyCode: { type: String, default: "" },
  defaultInspectionAmountCents: { type: Number, min: 0, default: null },
  apMethod: {
    type: String,
    enum: ["email", "portal", "download"],
    default: "download"
  },
  apEmail: { type: String, default: "" },
  apPortal: { type: String, default: "" },
  billingInstructions: { type: String, default: "" },
  purchaseOrder: { type: String, default: "" },
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
  accessCategories: [AccessCategorySchema],
  maintenanceCategories: [MaintenanceCategorySchema],
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
  
  airbnbCalendarUrl: { type: String, default: "" }, // ✅ Store Airbnb `.ics` URL

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
