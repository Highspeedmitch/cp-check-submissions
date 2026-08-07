const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const User = require("../models/user");
const Organization = require("../models/organization");
const PlatformSession = require("../models/platformSession");
const PlatformAudit = require("../models/platformAudit");
const OrganizationInvitation = require("../models/organizationInvitation");
const InvoiceEmailAuthorization = require("../models/invoiceEmailAuthorization");
const ProspectTemplate = require("../models/prospectTemplate");
const ProspectAssessment = require("../models/prospectAssessment");
const authenticateToken = require("../middleware/authenticateToken");
const requirePlatformAdmin = require("../middleware/requirePlatformAdmin");
const s3 = require("../awsConfig");
const { generateProspectAssessmentPDF } = require("../prospectPdfService");
const {
  defaultProspectFields,
  validateProspectFields,
  withGeneralObservations,
} = require("../services/prospectTemplateFields");
const { purgeExpiredProspectAssessments } = require("../services/prospectRetention");
const { extractPhotoFieldName } = require("../utils/photoFieldName");
const { isAllowedTemplatePhotoField } = require("../services/inspectionPhotoAccess");
const { authResponse } = require("../services/authSessions");
const {
  ASSUMED_ACCESS_MS,
  createAssumedAccessResponse,
  hasRecentStepUpAuthentication,
} = require("../services/platformAccess");
const { getPlatformOrganizationMetrics } = require("../services/platformMetrics");
const { getJwtSecret } = require("../config/security");
const { workspaceAuthentication } = require("../services/workspaceAccess");
const { uploadLimiter } = require("../middleware/rateLimits");
const { imageFileFilter, rejectInvalidSignatures } = require("../utils/uploadSecurity");
const {
  MAX_PHOTOS,
  normalizePhotoRequests,
} = require("../services/inspectionJobs");
const {
  normalizeOrganizationSetup,
  caseInsensitiveExact,
} = require("../services/organizationProvisioning");
const {
  normalizeInvitationEmail,
  createInvitation,
  resendInvitation,
} = require("../services/organizationInvitations");

const router = express.Router();
const PROSPECT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const prospectUpload = multer({
  storage: multer.memoryStorage(),
  limits: { files: MAX_PHOTOS, fileSize: 8 * 1024 * 1024 },
  fileFilter: imageFileFilter,
});

function uploadProspectPhotos(req, res, next) {
  prospectUpload.array("photos", MAX_PHOTOS)(req, res, (error) => {
    if (!error) return next();
    const tooManyPhotos = error instanceof multer.MulterError
      && ["LIMIT_FILE_COUNT", "LIMIT_UNEXPECTED_FILE"].includes(error.code);
    if (tooManyPhotos) {
      return res.status(400).json({
        error: `Complimentary reports support up to ${MAX_PHOTOS} photos.`,
      });
    }
    return next(error);
  });
}

async function getProspectTemplate() {
  const template = await ProspectTemplate.findOneAndUpdate(
    { key: "default" },
    { $setOnInsert: { fields: defaultProspectFields() } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  const currentFields = template.fields.map((field) => field.toObject());
  const normalizedFields = withGeneralObservations(currentFields);
  if (JSON.stringify(currentFields) !== JSON.stringify(normalizedFields)) {
    template.fields = normalizedFields;
    template.version += 1;
    await template.save();
  }
  return template;
}

router.get("/organizations", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    return res.json(await getPlatformOrganizationMetrics());
  } catch (error) {
    console.error("Platform metrics error:", error);
    return res.status(500).json({ error: "Unable to load platform metrics." });
  }
});

router.post("/organizations", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const setup = normalizeOrganizationSetup(req.body);
    const initialAdminEmail = normalizeInvitationEmail(req.body.initialAdminEmail);
    const [existing, existingUser] = await Promise.all([
      Organization.findOne({ name: caseInsensitiveExact(setup.name) }).select("_id").lean(),
      User.findOne({ email: initialAdminEmail }).select("_id").lean(),
    ]);
    if (existing) return res.status(409).json({ error: "An organization with that name already exists." });
    if (existingUser) return res.status(409).json({ error: "The administrator email already belongs to an Afterlight account." });

    const organization = await Organization.create(setup);
    const invitation = await createInvitation({
      organization,
      email: initialAdminEmail,
      role: "admin",
      invitedBy: req.user.userId,
      inviterScope: "platform",
    });
    await PlatformAudit.create({
      actorUserId: req.user.userId,
      action: "organization_created",
      targetOrganizationId: organization._id,
      metadata: {
        name: organization.name,
        orgType: organization.orgType,
        initialAdminEmail,
        invitationId: invitation.invitation._id,
        invitationDelivered: invitation.delivered,
      },
      ipAddress: req.ip || "",
      userAgent: req.get("user-agent") || "",
    });
    return res.status(201).json({
      organizationId: organization._id,
      name: organization.name,
      orgType: organization.orgType,
      reportingTimezone: organization.reportingTimezone,
      initialAdminEmail,
      invitationDelivered: invitation.delivered,
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ error: "An organization with that name already exists." });
    }
    if (/Organization name|organization type|reporting timezone|valid invitation email/i.test(error.message || "")) {
      return res.status(400).json({ error: error.message });
    }
    console.error("Organization creation error:", error.message);
    return res.status(500).json({ error: "Unable to create the organization." });
  }
});

router.post("/organizations/:organizationId/admin-invitations/:invitationId/resend",
  authenticateToken, requirePlatformAdmin, async (req, res) => {
    try {
      const [organization, invitation] = await Promise.all([
        Organization.findById(req.params.organizationId),
        OrganizationInvitation.findOne({
          _id: req.params.invitationId,
          organizationId: req.params.organizationId,
          role: "admin",
          inviterScope: "platform",
          status: { $in: ["pending", "expired"] },
        }).select("+tokenHash"),
      ]);
      if (!organization || !invitation) {
        return res.status(404).json({ error: "Pending administrator invitation not found." });
      }
      await resendInvitation({ invitation, organization });
      await PlatformAudit.create({
        actorUserId: req.user.userId,
        action: "platform_admin_invitation_resent",
        targetOrganizationId: organization._id,
        metadata: { invitationId: invitation._id, email: invitation.email },
        ipAddress: req.ip || "",
        userAgent: req.get("user-agent") || "",
      });
      return res.json({ message: `Administrator invitation resent to ${invitation.email}.` });
    } catch (error) {
      console.error("Administrator invitation resend error:", error.message);
      return res.status(500).json({ error: "Unable to resend the administrator invitation." });
    }
  });

router.put("/organizations/:organizationId/billing-capabilities",
  authenticateToken, requirePlatformAdmin, async (req, res) => {
    try {
      if (!hasRecentStepUpAuthentication(req.user.mfaAuthenticatedAt)) {
        return res.status(428).json({
          code: "STEP_UP_REQUIRED",
          error: "Confirm your identity to change organization billing capabilities.",
        });
      }
      const invoiceApprovalExperience = String(
        req.body.invoiceApprovalExperience || ""
      ).trim();
      if (!["authenticated_portal", "secure_email_link"].includes(invoiceApprovalExperience)) {
        return res.status(400).json({ error: "Select a supported invoice approval experience." });
      }
      const reason = String(req.body.reason || "").trim();
      if (!reason) return res.status(400).json({ error: "A reason is required." });
      if (reason.length > 500) {
        return res.status(400).json({ error: "Reason must be 500 characters or fewer." });
      }

      const organization = await Organization.findById(req.params.organizationId);
      if (!organization) return res.status(404).json({ error: "Organization not found." });
      if (invoiceApprovalExperience === "secure_email_link"
        && !["managed", "hybrid"].includes(organization.serviceModel || "managed")) {
        return res.status(409).json({
          error: "Secure email approval is currently limited to Managed service and Hybrid organizations.",
        });
      }

      const previousExperience = organization.billingCapabilities?.invoiceApprovalExperience
        || "authenticated_portal";
      organization.billingCapabilities = {
        invoiceApprovalExperience,
        emailApprovalTokenHours: 24,
        updatedBy: req.user.userId,
        updatedAt: new Date(),
      };
      await organization.save();

      if (invoiceApprovalExperience !== "secure_email_link") {
        await InvoiceEmailAuthorization.updateMany(
          { organizationId: organization._id, status: "active" },
          { $set: { status: "revoked", revokedAt: new Date() } }
        );
      }
      await PlatformAudit.create({
        actorUserId: req.user.userId,
        action: "organization_invoice_approval_experience_changed",
        targetOrganizationId: organization._id,
        metadata: {
          previousExperience,
          invoiceApprovalExperience,
          emailApprovalTokenHours: 24,
          reason,
        },
        ipAddress: req.ip || "",
        userAgent: req.get("user-agent") || "",
      });

      const emailReadyProperties = organization.properties.filter(
        (property) => property.apMethod === "email" && String(property.apEmail || "").trim()
      ).length;
      return res.json({
        organizationId: String(organization._id),
        invoiceApprovalExperience,
        emailApprovalTokenHours: 24,
        emailApPropertyCount: emailReadyProperties,
        propertyCount: organization.properties.length,
      });
    } catch (error) {
      console.error("Organization billing capability update error:", error.message);
      return res.status(500).json({ error: "Unable to update organization billing capabilities." });
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
    const fields = validateProspectFields(req.body.fields || []);
    for (const identityKey of ["businessName", "propertyAddress"]) {
      const identityField = fields.find((field) => field.key === identityKey);
      if (!identityField) {
        return res.status(400).json({ error: "Business name and property address fields cannot be removed." });
      }
      identityField.locked = true;
      if (identityKey === "propertyAddress") identityField.required = true;
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
  uploadLimiter, uploadProspectPhotos, async (req, res) => {
    try {
      rejectInvalidSignatures(req.files);
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
      if (!propertyAddress) {
        return res.status(400).json({ error: "Property address is required." });
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
      const submittedPhotos = (req.files || []).map((file) => ({
        file,
        fieldName: extractPhotoFieldName(file.originalname),
      }));
      normalizePhotoRequests(
        submittedPhotos.map(({ file, fieldName }) => ({
          fieldName,
          fileName: file.originalname,
        })),
        (fieldName) => isAllowedTemplatePhotoField(snapshot.fields, fieldName)
      );
      const photoBuffers = submittedPhotos.map(({ file, fieldName }) => ({
        fieldName,
        imageBuffer: file.buffer,
      }));
      const assessmentData = { businessName, propertyAddress, responses, templateSnapshot: snapshot, createdAt };
      const pdfBuffer = await generateProspectAssessmentPDF({ assessment: assessmentData, photoBuffers });
      const safeName = (businessName || propertyAddress)
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 60) || "property";
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
      const status = error.status || 500;
      return res.status(status).json({
        error: status === 500
          ? "Unable to generate the prospect assessment."
          : error.message,
      });
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
    if (!hasRecentStepUpAuthentication(req.user.mfaAuthenticatedAt)) {
      return res.status(428).json({
        code: "STEP_UP_REQUIRED",
        error: "Confirm your identity to open Admin View.",
      });
    }
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
      secretKey: getJwtSecret(),
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
    const workspace = await workspaceAuthentication(user);
    return res.json(authResponse(user, getJwtSecret(), workspace));
  } catch (error) {
    console.error("Organization assumption exit error:", error);
    return res.status(500).json({ error: "Unable to exit the organization." });
  }
});

module.exports = router;
