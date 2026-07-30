const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const User = require("../models/user");
const Organization = require("../models/organization");
const PlatformSession = require("../models/platformSession");
const ProspectTemplate = require("../models/prospectTemplate");
const ProspectAssessment = require("../models/prospectAssessment");
const authenticateToken = require("../middleware/authenticateToken");
const requirePlatformAdmin = require("../middleware/requirePlatformAdmin");
const s3 = require("../awsConfig");
const { generateProspectAssessmentPDF } = require("../prospectPdfService");
const { DEFAULT_COM_FIELDS, validateFields } = require("../services/inspectionTemplates");
const { purgeExpiredProspectAssessments } = require("../services/prospectRetention");
const { authResponse } = require("../services/authSessions");
const {
  ASSUMED_ACCESS_MS,
  createAssumedAccessResponse,
} = require("../services/platformAccess");
const { getPlatformOrganizationMetrics } = require("../services/platformMetrics");

const router = express.Router();
const SECRET_KEY = process.env.JWT_SECRET || "supersecuresecret";
const PROSPECT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const prospectUpload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 10, fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, callback) =>
    callback(file.mimetype.startsWith("image/") ? null : new Error("Only images are supported."),
      file.mimetype.startsWith("image/")),
});

async function getProspectTemplate() {
  return ProspectTemplate.findOneAndUpdate(
    { key: "default" },
    { $setOnInsert: { fields: DEFAULT_COM_FIELDS } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
}

router.get("/organizations", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    return res.json(await getPlatformOrganizationMetrics());
  } catch (error) {
    console.error("Platform metrics error:", error);
    return res.status(500).json({ error: "Unable to load platform metrics." });
  }
});

router.get("/prospect-template", authenticateToken, requirePlatformAdmin, async (_req, res) => {
  try {
    return res.json(await getProspectTemplate());
  } catch (error) {
    console.error("Prospect template error:", error);
    return res.status(500).json({ error: "Unable to load the prospect template." });
  }
});

router.put("/prospect-template", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const title = String(req.body.title || "").trim();
    if (!name || !title) return res.status(400).json({ error: "Template name and title are required." });
    const fields = validateFields(req.body.fields || []);
    for (const identityKey of ["businessName", "propertyAddress"]) {
      const identityField = fields.find((field) => field.key === identityKey);
      if (!identityField) {
        return res.status(400).json({ error: "Business name and property address fields cannot be removed." });
      }
      identityField.required = true;
      identityField.locked = true;
    }
    const template = await getProspectTemplate();
    template.name = name;
    template.title = title;
    template.fields = fields;
    template.version += 1;
    template.updatedBy = req.user.userId;
    await template.save();
    return res.json(template);
  } catch (error) {
    return res.status(400).json({ error: error.message || "Unable to update the prospect template." });
  }
});

router.get("/prospect-assessments", authenticateToken, requirePlatformAdmin, async (_req, res) => {
  try {
    await purgeExpiredProspectAssessments();
    const assessments = await ProspectAssessment.find({ expiresAt: { $gt: new Date() } })
      .select("businessName propertyAddress pdfFileName createdAt expiresAt")
      .sort({ createdAt: -1 })
      .lean();
    return res.json(assessments);
  } catch (error) {
    console.error("Prospect repository error:", error);
    return res.status(500).json({ error: "Unable to load prospect assessments." });
  }
});

router.post("/prospect-assessments", authenticateToken, requirePlatformAdmin,
  prospectUpload.array("photos", 10), async (req, res) => {
    try {
      const template = await getProspectTemplate();
      const submitted = JSON.parse(req.body.responses || "{}");
      const responses = {};
      template.fields.forEach((field) => {
        responses[field.key] = String(submitted[field.key] || "").trim();
        if (field.type === "yes_no_issue") {
          responses[`${field.key}Description`] = String(submitted[`${field.key}Description`] || "").trim();
        }
      });
      const businessName = String(responses.businessName || req.body.businessName || "").trim();
      const propertyAddress = String(responses.propertyAddress || req.body.propertyAddress || "").trim();
      if (!businessName || !propertyAddress) {
        return res.status(400).json({ error: "Business name and property address are required." });
      }
      const missing = template.fields.find((field) => field.required && !responses[field.key]);
      if (missing) return res.status(400).json({ error: `${missing.label} is required.` });
      const invalid = template.fields.find((field) => field.type === "yes_no_issue"
        && responses[field.key] && !["yes", "no"].includes(responses[field.key].toLowerCase()));
      if (invalid) return res.status(400).json({ error: `Invalid response for ${invalid.label}.` });

      const createdAt = new Date();
      const expiresAt = new Date(createdAt.getTime() + PROSPECT_RETENTION_MS);
      const snapshot = {
        templateId: template._id,
        version: template.version,
        name: template.name,
        title: template.title,
        fields: template.fields.map((field) => field.toObject()),
      };
      const photoBuffers = (req.files || []).map((file) => ({
        fieldName: file.originalname.split("-")[0],
        imageBuffer: file.buffer,
      })).filter((photo) => snapshot.fields.some((field) =>
        field.key === photo.fieldName && field.allowPhotos
      ));
      const assessmentData = { businessName, propertyAddress, responses, templateSnapshot: snapshot, createdAt };
      const pdfBuffer = await generateProspectAssessmentPDF({ assessment: assessmentData, photoBuffers });
      const safeName = businessName.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 60) || "property";
      const pdfFileName = `${safeName}-exterior-assessment.pdf`;
      const pdfKey = `platform/prospect-assessments/${crypto.randomUUID()}-${pdfFileName}`;
      await s3.upload({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: pdfKey,
        Body: pdfBuffer,
        ContentType: "application/pdf",
        ContentDisposition: `attachment; filename="${pdfFileName}"`,
        ACL: "private",
      }).promise();
      const assessment = await ProspectAssessment.create({
        ...assessmentData,
        createdBy: req.user.userId,
        pdfKey,
        pdfFileName,
        expiresAt,
      });
      return res.status(201).json(assessment);
    } catch (error) {
      console.error("Prospect assessment creation error:", error);
      return res.status(500).json({ error: "Unable to generate the prospect assessment." });
    }
  });

router.get("/prospect-assessments/:id/download", authenticateToken, requirePlatformAdmin, async (req, res) => {
  const assessment = await ProspectAssessment.findOne({ _id: req.params.id, expiresAt: { $gt: new Date() } });
  if (!assessment) return res.status(404).json({ error: "Assessment not found or expired." });
  return res.json({ url: s3.getSignedUrl("getObject", {
    Bucket: process.env.S3_BUCKET_NAME,
    Key: assessment.pdfKey,
    Expires: 300,
    ResponseContentDisposition: `attachment; filename="${assessment.pdfFileName}"`,
  }) });
});

router.delete("/prospect-assessments/:id", authenticateToken, requirePlatformAdmin, async (req, res) => {
  const assessment = await ProspectAssessment.findById(req.params.id);
  if (!assessment) return res.status(404).json({ error: "Assessment not found." });
  await s3.deleteObject({ Bucket: process.env.S3_BUCKET_NAME, Key: assessment.pdfKey }).promise();
  await assessment.deleteOne();
  return res.status(204).end();
});

router.post("/organizations/:organizationId/assume", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const reason = String(req.body.reason || "").trim();
    if (!reason) return res.status(400).json({ error: "A reason is required." });
    if (reason.length > 200) return res.status(400).json({ error: "Reason must be 200 characters or fewer." });

    const [user, organization] = await Promise.all([
      User.findById(req.user.userId),
      Organization.findById(req.params.organizationId).select("name orgType"),
    ]);
    if (!user || user.platformRole !== "platform_admin") {
      return res.status(403).json({ error: "Platform administrator access required." });
    }
    if (!organization) return res.status(404).json({ error: "Organization not found." });

    const expiresAt = new Date(Date.now() + ASSUMED_ACCESS_MS);
    const platformSession = await PlatformSession.create({
      platformAdminId: user._id,
      organizationId: organization._id,
      reason,
      expiresAt,
      ipAddress: req.ip || "",
      userAgent: req.get("user-agent") || "",
    });
    return res.json(createAssumedAccessResponse({
      user,
      organization,
      platformSessionId: platformSession._id,
      secretKey: SECRET_KEY,
    }));
  } catch (error) {
    console.error("Organization assumption error:", error);
    return res.status(500).json({ error: "Unable to enter the organization." });
  }
});

router.post("/exit", authenticateToken, async (req, res) => {
  if (!req.user.assumedOrganization || req.user.platformRole !== "platform_admin") {
    return res.status(400).json({ error: "No assumed organization session is active." });
  }
  try {
    await PlatformSession.updateOne(
      {
        _id: req.user.platformSessionId,
        platformAdminId: req.user.userId,
        endedAt: null,
      },
      { $set: { endedAt: new Date() } }
    );
    const user = await User.findById(req.user.userId).populate("organizationId");
    if (!user?.organizationId) {
      return res.status(500).json({ error: "Unable to restore the platform account." });
    }
    return res.json(authResponse(user, SECRET_KEY));
  } catch (error) {
    console.error("Organization assumption exit error:", error);
    return res.status(500).json({ error: "Unable to exit the organization." });
  }
});

module.exports = router;
