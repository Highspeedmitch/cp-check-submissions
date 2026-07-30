const mongoose = require("mongoose");
const { DEFAULT_COM_FIELDS } = require("../services/inspectionTemplates");

const ProspectFieldSchema = new mongoose.Schema({
  key: { type: String, required: true },
  label: { type: String, required: true },
  reportLabel: { type: String, default: "" },
  type: { type: String, enum: ["text", "textarea", "yes_no_issue"], required: true },
  section: { type: String, default: "Property Condition" },
  required: { type: Boolean, default: false },
  allowPhotos: { type: Boolean, default: false },
  descriptionLabel: { type: String, default: "Describe the opportunity" },
  locked: { type: Boolean, default: false },
  order: { type: Number, default: 0 },
}, { _id: false });

const ProspectTemplateSchema = new mongoose.Schema({
  key: { type: String, default: "default", unique: true },
  name: { type: String, default: "Prospect Property Assessment" },
  title: { type: String, default: "Complimentary Exterior Property Assessment" },
  version: { type: Number, default: 1, min: 1 },
  fields: { type: [ProspectFieldSchema], default: () => DEFAULT_COM_FIELDS },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true });

module.exports = mongoose.model("ProspectTemplate", ProspectTemplateSchema);
