const mongoose = require("mongoose");

const ResourceDeploymentSchema = new mongoose.Schema({
  resourceProfileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ResourceProfile",
    required: true,
    index: true,
  },
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Organization",
    required: true,
    index: true,
  },
  propertyIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  status: {
    type: String,
    enum: ["active", "paused", "ended"],
    default: "active",
    index: true,
  },
  rateOverrideCents: { type: Number, min: 0, default: null },
  startsAt: { type: Date, default: Date.now },
  endsAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true });

ResourceDeploymentSchema.index(
  { resourceProfileId: 1, organizationId: 1 },
  { unique: true }
);
ResourceDeploymentSchema.index({ organizationId: 1, status: 1, startsAt: 1, endsAt: 1 });

module.exports = mongoose.model("ResourceDeployment", ResourceDeploymentSchema);
