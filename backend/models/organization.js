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
  fulfillmentPolicy: {
    defaultSource: {
      type: String,
      enum: ["customer_employee", "customer_contractor", "afterlight_staff", "afterlight_contractor", null],
      default: null,
    },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedAt: { type: Date, default: null },
  },
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
  physicalAddress: { type: String, default: "" },
  billingAddress: { type: String, default: "" },
  // Legacy field retained for backwards-compatible billing reads.
  streetAddress: { type: String, default: "" },
  suite: { type: String, default: "" },
  city: { type: String, default: "" },
  state: { type: String, default: "" },
  zip: { type: String, default: "" },
  
  airbnbCalendarUrl: { type: String, default: "" }, // ✅ Store Airbnb `.ics` URL

  // Optionally store an array of client user IDs who own this property
  clientOwners: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  propertyManagers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  inspectionTemplateOverride: {
    omittedFieldKeys: { type: [String], default: [] },
    additionalFields: {
      type: [{
        key: { type: String, required: true },
        label: { type: String, required: true },
        reportLabel: { type: String, default: "" },
        type: {
          type: String,
          enum: ["text", "textarea", "yes_no_issue"],
          required: true,
        },
        section: { type: String, default: "Property-Specific Checks" },
        required: { type: Boolean, default: false },
        allowPhotos: { type: Boolean, default: false },
        descriptionLabel: { type: String, default: "Describe the issue" },
        locked: { type: Boolean, default: false },
        order: { type: Number, default: 0 },
      }],
      default: [],
    },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedAt: { type: Date, default: null },
  },
});

const OrganizationSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  orgType: { 
    type: String, 
    enum: ["COM", "RES", "LTR", "STR"],
    required: true 
  },
  properties: { type: [PropertySchema], default: [] },
  serviceModel: {
    type: String,
    enum: ["platform", "managed", "hybrid"],
    default: "managed",
  },
  fulfillmentPolicy: {
    defaultSource: {
      type: String,
      enum: ["customer_employee", "customer_contractor", "afterlight_staff", "afterlight_contractor"],
      default: "afterlight_staff",
    },
    version: { type: Number, min: 1, default: 1 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedAt: { type: Date, default: null },
  },
  billingPolicyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "BillingPolicy",
    default: null,
  },
  inspectionTemplateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "InspectionTemplate",
    default: null,
  },
  reportingTimezone: {
    type: String,
    default: "America/Phoenix",
  },
  security: {
    requireMfaForAllUsers: { type: Boolean, default: false },
    adminActionPasskeyHash: { type: String, default: "" },
    adminActionPasskeyVersion: { type: Number, default: 0 },
    adminActionPasskeyRotatedAt: { type: Date, default: null },
    adminActionPasskeyRotatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
});

module.exports = mongoose.model('Organization', OrganizationSchema);
