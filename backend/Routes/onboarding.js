const express = require("express");
const Organization = require("../models/organization");
const OrganizationInvitation = require("../models/organizationInvitation");
const Submission = require("../models/submission");
const User = require("../models/user");
const UserAudit = require("../models/userAudit");
const { serializeOrganizationOnboarding } = require("../services/organizationOnboarding");

const router = express.Router();

router.use((req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Organization administrator access required." });
  }
  return next();
});

async function loadOnboarding(organizationId) {
  const [organization, activeUserCount, pendingInvitationCount, completedSubmissionCount] = await Promise.all([
    Organization.findById(organizationId),
    User.countDocuments({
      organizationId,
      accountStatus: { $ne: "inactive" },
      organizationArchivedAt: null,
    }),
    OrganizationInvitation.countDocuments({
      organizationId,
      role: { $ne: "admin" },
      status: "pending",
      expiresAt: { $gt: new Date() },
    }),
    Submission.countDocuments({ organizationId }),
  ]);
  if (!organization) return null;
  const metrics = {
    activeUserCount,
    pendingInvitationCount,
    completedSubmissionCount,
  };
  return {
    organization,
    metrics,
    snapshot: serializeOrganizationOnboarding({
      organization,
      ...metrics,
    }),
  };
}

router.get("/", async (req, res) => {
  try {
    const loaded = await loadOnboarding(req.user.organizationId);
    if (!loaded) return res.status(404).json({ error: "Organization not found." });
    return res.json(loaded.snapshot);
  } catch (error) {
    console.error("Organization onboarding load error:", error.message);
    return res.status(500).json({ error: "Unable to load the setup guide." });
  }
});

router.post("/complete", async (req, res) => {
  try {
    const loaded = await loadOnboarding(req.user.organizationId);
    if (!loaded) return res.status(404).json({ error: "Organization not found." });
    if (!loaded.snapshot.guided) {
      return res.status(409).json({ error: "This established organization does not have an active onboarding plan." });
    }
    if (loaded.snapshot.status === "completed") return res.json(loaded.snapshot);
    if (!loaded.snapshot.canComplete) {
      return res.status(409).json({ error: "Complete every required setup item before finishing onboarding." });
    }

    const completedAt = new Date();
    loaded.organization.onboarding.status = "completed";
    loaded.organization.onboarding.completedAt = completedAt;
    await Promise.all([
      loaded.organization.save(),
      UserAudit.create({
        organizationId: loaded.organization._id,
        targetUserId: req.user.userId,
        changedBy: req.user.userId,
        action: "organization_onboarding_completed",
        changes: { completedAt },
      }),
    ]);
    return res.json(serializeOrganizationOnboarding({
      organization: loaded.organization,
      ...loaded.metrics,
    }));
  } catch (error) {
    console.error("Organization onboarding completion error:", error.message);
    return res.status(500).json({ error: "Unable to complete organization onboarding." });
  }
});

module.exports = router;
