const express = require("express");
const Organization = require("../models/organization");
const {
  commitBulkOnboarding,
  previewBulkOnboarding,
} = require("../services/bulkOnboarding");
const { licensedCapacityErrorBody } = require("../services/licensedCapacityOperations");
const { requestBulkOnboardingAssistance } = require("../services/bulkOnboardingAssistance");

const router = express.Router();

router.use((req, res, next) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admins only." });
  if (req.user.assumedOrganization) {
    return res.status(403).json({ error: "Bulk onboarding cannot be performed through assumed access." });
  }
  return next();
});

router.post("/preview", async (req, res) => {
  try {
    const organization = await Organization.findById(req.user.organizationId);
    if (!organization) return res.status(404).json({ error: "Organization not found." });
    const preview = await previewBulkOnboarding({
      organization,
      type: String(req.body.type || ""),
      csv: req.body.csv,
    });
    return res.json(preview);
  } catch (error) {
    return res.status(error.status || 500).json(
      licensedCapacityErrorBody(error, "Unable to preview this import.")
    );
  }
});

router.post("/commit", async (req, res) => {
  try {
    const result = await commitBulkOnboarding({
      organizationId: req.user.organizationId,
      type: String(req.body.type || ""),
      csv: req.body.csv,
      actorUserId: req.user.userId,
      adminActionGrant: req.body.adminActionGrant,
      ipAddress: req.ip || "",
      userAgent: req.get("user-agent") || "",
    });
    return res.status(201).json({
      ...result,
      message: result.type === "properties"
        ? `${result.imported} properties imported.`
        : `${result.imported} user invitations created.`,
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      ...licensedCapacityErrorBody(error, "Unable to complete this import."),
      ...(error.preview ? { preview: error.preview } : {}),
    });
  }
});

router.post("/assistance-requests", async (req, res) => {
  try {
    const result = await requestBulkOnboardingAssistance({
      organizationId: req.user.organizationId,
      actorUserId: req.user.userId,
      input: req.body,
      ipAddress: req.ip || "",
      userAgent: req.get("user-agent") || "",
    });
    return res.status(201).json(result);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        error: error.message,
        ...(error.code ? { code: error.code } : {}),
      });
    }
    console.error("Bulk onboarding assistance request error:", error.message);
    return res.status(500).json({ error: "Unable to request onboarding assistance." });
  }
});

module.exports = router;
