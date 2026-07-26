const mongoose = require("mongoose");

const InspectionFieldSchema = new mongoose.Schema({
  key: { type: String, required: true },
  label: { type: String, required: true },
  reportLabel: { type: String, default: "" },
  type: {
    type: String,
    enum: ["text", "textarea", "yes_no_issue"],
    required: true,
  },
  section: { type: String, default: "Property Condition" },
  required: { type: Boolean, default: false },
  allowPhotos: { type: Boolean, default: false },
  descriptionLabel: { type: String, default: "Describe the issue" },
  locked: { type: Boolean, default: false },
  order: { type: Number, default: 0 },
}, { _id: false });

const InspectionTemplateSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Organization",
    required: true,
    index: true,
  },
  name: { type: String, required: true },
  orgType: { type: String, enum: ["COM"], default: "COM" },
  version: { type: Number, required: true, min: 1, default: 1 },
  active: { type: Boolean, default: true, index: true },
  title: { type: String, required: true },
  fields: { type: [InspectionFieldSchema], default: [] },
}, { timestamps: true });

InspectionTemplateSchema.index({ organizationId: 1, version: 1 }, { unique: true });

module.exports = mongoose.model("InspectionTemplate", InspectionTemplateSchema);
