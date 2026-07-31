const mongoose = require("mongoose");

const OrganizationInvitationSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Organization",
    required: true,
    index: true,
  },
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  role: {
    type: String,
    enum: ["admin", "property_manager", "user", "client", "contractor", "cleaner"],
    required: true,
  },
  propertyIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  tokenHash: { type: String, required: true, unique: true, select: false },
  status: {
    type: String,
    enum: ["pending", "accepting", "accepted", "revoked", "expired"],
    default: "pending",
    index: true,
  },
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  inviterScope: { type: String, enum: ["platform", "organization"], required: true },
  expiresAt: { type: Date, required: true, index: true },
  lastSentAt: { type: Date, default: Date.now },
  acceptedAt: { type: Date, default: null },
  acceptedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  revokedAt: { type: Date, default: null },
}, { timestamps: true });

OrganizationInvitationSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
OrganizationInvitationSchema.index(
  { organizationId: 1, email: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } }
);

module.exports = mongoose.model("OrganizationInvitation", OrganizationInvitationSchema);
