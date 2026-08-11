const mongoose = require("mongoose");

const RouteRunStopSchema = new mongoose.Schema({
  propertyId: { type: mongoose.Schema.Types.ObjectId, required: true },
  propertyName: { type: String, required: true },
  stopIndex: { type: Number, min: 0, required: true },
  assignmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Assignment",
    default: null,
  },
}, { _id: false });

const RouteRunSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Organization",
    required: true,
    index: true,
  },
  routeId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  routeVersion: { type: Number, min: 1, required: true },
  routeName: { type: String, required: true },
  region: { type: String, required: true },
  stops: { type: [RouteRunStopSchema], default: [] },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  resourceProfileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ResourceProfile",
    default: null,
  },
  resourceDeploymentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ResourceDeployment",
    default: null,
  },
  startDate: { type: Date, required: true, index: true },
  endDate: { type: Date, required: true },
  // A route that crosses midnight remains attributed to this starting date.
  serviceDate: { type: String, required: true },
  status: {
    type: String,
    enum: ["scheduled", "in_progress", "completed", "partially_completed", "canceled"],
    default: "scheduled",
    index: true,
  },
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  canceledAt: { type: Date, default: null },
  canceledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  oneTimeCheckRequest: { type: String, default: "" },
}, { timestamps: true, autoIndex: false });

RouteRunSchema.index({ organizationId: 1, status: 1, startDate: 1 });
RouteRunSchema.index({ userId: 1, status: 1, startDate: 1 });

module.exports = mongoose.model("RouteRun", RouteRunSchema);
