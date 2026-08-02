const express = require("express");
const mongoose = require("mongoose");
const authenticateToken = require("../middleware/authenticateToken");
const requirePlatformAdmin = require("../middleware/requirePlatformAdmin");
const Organization = require("../models/organization");
const User = require("../models/user");
const ResourceProfile = require("../models/resourceProfile");
const ResourceDeployment = require("../models/resourceDeployment");
const ContractorEarning = require("../models/contractorEarning");
const ContractorPayoutBatch = require("../models/contractorPayoutBatch");
const PlatformAudit = require("../models/platformAudit");
const { createInvitation, normalizeInvitationEmail } = require("../services/organizationInvitations");
const { ensureWorkforceOrganization } = require("../services/workforceOrganization");
const { buildPayoutLines, newBatchNumber } = require("../services/contractorPayouts");

const router = express.Router();
router.use(authenticateToken, requirePlatformAdmin);

const PROFILE_STATUSES = new Set(["invited", "onboarding", "active", "suspended"]);
const ONBOARDING_STATUSES = new Set([
  "not_started",
  "self_onboarding_invited",
  "self_onboarding_started",
  "self_onboarding_review",
  "onboarding_completed",
]);

function cleanList(value, limit = 20) {
  return [...new Set(
    (Array.isArray(value) ? value : String(value || "").split(","))
      .map((item) => String(item).trim())
      .filter(Boolean)
  )].slice(0, limit);
}

function validCents(value, { optional = false } = {}) {
  if (optional && (value === null || value === "" || value === undefined)) return null;
  const cents = Number(value);
  if (!Number.isInteger(cents) || cents < 0) {
    const error = new Error("Rates must be entered as a non-negative number of cents.");
    error.status = 400;
    throw error;
  }
  return cents;
}

function auditDetails(req) {
  return {
    actorUserId: req.user.userId,
    ipAddress: req.ip || "",
    userAgent: req.get("user-agent") || "",
  };
}

router.get("/dashboard", async (_req, res) => {
  try {
    const [resources, deployments, organizations, earnings, payoutBatches] = await Promise.all([
      ResourceProfile.find().populate("userId", "username email accountStatus").sort({ displayName: 1 }).lean(),
      ResourceDeployment.find().populate("organizationId", "name serviceModel properties._id properties.name").sort({ createdAt: -1 }).lean(),
      Organization.find({
        workspaceType: { $ne: "afterlight_workforce" },
        serviceModel: { $in: ["managed", "hybrid"] },
      }).select("name serviceModel properties._id properties.name").sort({ name: 1 }).lean(),
      ContractorEarning.find().populate("resourceProfileId", "displayName email gusto")
        .populate("organizationId", "name").sort({ earnedAt: -1 }).limit(250).lean(),
      ContractorPayoutBatch.find().sort({ createdAt: -1 }).limit(100).lean(),
    ]);
    return res.json({ resources, deployments, organizations, earnings, payoutBatches });
  } catch (error) {
    console.error("Resource dashboard error:", error.message);
    return res.status(500).json({ error: "Unable to load Afterlight resources." });
  }
});

router.post("/resources", async (req, res) => {
  let profile;
  try {
    const email = normalizeInvitationEmail(req.body.email);
    const displayName = String(req.body.displayName || "").trim().replace(/\s+/g, " ");
    if (displayName.length < 2 || displayName.length > 100) {
      return res.status(400).json({ error: "Resource name must be between 2 and 100 characters." });
    }
    const [existingProfile, existingUser, workforce] = await Promise.all([
      ResourceProfile.findOne({ email }).select("_id").lean(),
      User.findOne({ email }).select("_id").lean(),
      ensureWorkforceOrganization(),
    ]);
    if (existingProfile || existingUser) {
      return res.status(409).json({ error: "That email already belongs to an Afterlight account or resource." });
    }
    profile = await ResourceProfile.create({
      email,
      displayName,
      skills: cleanList(req.body.skills),
      regions: cleanList(req.body.regions),
      defaultRateCents: validCents(req.body.defaultRateCents),
      createdBy: req.user.userId,
    });
    const invitation = await createInvitation({
      organization: workforce,
      email,
      role: "contractor",
      invitedBy: req.user.userId,
      inviterScope: "platform",
      accountScope: "afterlight_resource",
    });
    profile.invitationId = invitation.invitation._id;
    await profile.save();
    await PlatformAudit.create({
      ...auditDetails(req),
      action: "afterlight_resource_invited",
      metadata: {
        resourceProfileId: profile._id,
        email,
        invitationDelivered: invitation.delivered,
      },
    });
    return res.status(201).json({ profile, invitationDelivered: invitation.delivered });
  } catch (error) {
    if (profile && !profile.invitationId) await profile.deleteOne().catch(() => {});
    if (error?.code === 11000) return res.status(409).json({ error: "That resource already exists." });
    const validation = error.status || /valid invitation|rates|name/i.test(error.message || "");
    if (validation) return res.status(error.status || 400).json({ error: error.message });
    console.error("Resource invitation error:", error.message);
    return res.status(500).json({ error: "Unable to invite the resource." });
  }
});

router.put("/resources/:resourceId", async (req, res) => {
  try {
    const profile = await ResourceProfile.findById(req.params.resourceId);
    if (!profile) return res.status(404).json({ error: "Resource not found." });
    if (req.body.displayName !== undefined) {
      const name = String(req.body.displayName).trim().replace(/\s+/g, " ");
      if (name.length < 2 || name.length > 100) return res.status(400).json({ error: "Enter a valid resource name." });
      profile.displayName = name;
    }
    if (req.body.skills !== undefined) profile.skills = cleanList(req.body.skills);
    if (req.body.regions !== undefined) profile.regions = cleanList(req.body.regions);
    if (req.body.defaultRateCents !== undefined) profile.defaultRateCents = validCents(req.body.defaultRateCents);
    if (req.body.availabilityStatus !== undefined) {
      if (!["available", "unavailable"].includes(req.body.availabilityStatus)) {
        return res.status(400).json({ error: "Select a valid availability status." });
      }
      profile.availabilityStatus = req.body.availabilityStatus;
    }
    if (req.body.gustoContractorUuid !== undefined) {
      profile.gusto.contractorUuid = String(req.body.gustoContractorUuid || "").trim().slice(0, 100);
      profile.gusto.lastSyncedAt = new Date();
    }
    if (req.body.gustoOnboardingStatus !== undefined) {
      if (!ONBOARDING_STATUSES.has(req.body.gustoOnboardingStatus)) {
        return res.status(400).json({ error: "Select a valid Gusto onboarding status." });
      }
      profile.gusto.onboardingStatus = req.body.gustoOnboardingStatus;
      profile.gusto.lastSyncedAt = new Date();
    }
    if (req.body.status !== undefined) {
      if (!PROFILE_STATUSES.has(req.body.status)) {
        return res.status(400).json({ error: "Select a valid resource status." });
      }
      if (req.body.status === "active" && (
        !profile.userId
        || !profile.gusto.contractorUuid
        || profile.gusto.onboardingStatus !== "onboarding_completed"
      )) {
        return res.status(400).json({
          error: "The Afterlight account and Gusto onboarding must be complete before activation.",
        });
      }
      profile.status = req.body.status;
    }
    profile.updatedBy = req.user.userId;
    await profile.save();
    await PlatformAudit.create({
      ...auditDetails(req),
      action: "afterlight_resource_updated",
      metadata: { resourceProfileId: profile._id, status: profile.status },
    });
    return res.json(profile);
  } catch (error) {
    if (error?.name === "CastError") return res.status(404).json({ error: "Resource not found." });
    return res.status(error.status || 500).json({ error: error.status ? error.message : "Unable to update the resource." });
  }
});

router.post("/resources/:resourceId/deployments", async (req, res) => {
  try {
    const [resource, organization] = await Promise.all([
      ResourceProfile.findById(req.params.resourceId),
      Organization.findOne({
        _id: req.body.organizationId,
        workspaceType: { $ne: "afterlight_workforce" },
        serviceModel: { $in: ["managed", "hybrid"] },
      }),
    ]);
    if (!resource) return res.status(404).json({ error: "Resource not found." });
    if (resource.status !== "active") return res.status(400).json({ error: "Only active resources can be deployed." });
    if (!organization) return res.status(400).json({ error: "Select an eligible managed or hybrid organization." });
    const requestedIds = cleanList(req.body.propertyIds, 500);
    const validIds = new Set((organization.properties || []).map((property) => String(property._id)));
    if (requestedIds.some((id) => !validIds.has(id))) {
      return res.status(400).json({ error: "One or more selected properties do not belong to this organization." });
    }
    const rateOverrideCents = validCents(req.body.rateOverrideCents, { optional: true });
    if ((rateOverrideCents ?? resource.defaultRateCents) <= 0) {
      return res.status(400).json({ error: "Configure a positive default or deployment rate." });
    }
    const startsAt = req.body.startsAt ? new Date(req.body.startsAt) : new Date();
    const endsAt = req.body.endsAt ? new Date(req.body.endsAt) : null;
    if (Number.isNaN(startsAt.getTime()) || (endsAt && (Number.isNaN(endsAt.getTime()) || endsAt < startsAt))) {
      return res.status(400).json({ error: "Enter a valid deployment date range." });
    }
    const deployment = await ResourceDeployment.findOneAndUpdate(
      { resourceProfileId: resource._id, organizationId: organization._id },
      {
        $set: {
          propertyIds: requestedIds,
          status: "active",
          rateOverrideCents,
          startsAt,
          endsAt,
          updatedBy: req.user.userId,
        },
        $setOnInsert: { createdBy: req.user.userId },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    await PlatformAudit.create({
      ...auditDetails(req),
      action: "afterlight_resource_deployed",
      targetOrganizationId: organization._id,
      metadata: {
        resourceProfileId: resource._id,
        deploymentId: deployment._id,
        propertyIds: requestedIds,
      },
    });
    return res.status(201).json(deployment);
  } catch (error) {
    if (error?.name === "CastError") return res.status(400).json({ error: "Select valid resource and organization records." });
    return res.status(error.status || 500).json({ error: error.status ? error.message : "Unable to deploy the resource." });
  }
});

router.put("/deployments/:deploymentId", async (req, res) => {
  const status = String(req.body.status || "");
  if (!["active", "paused", "ended"].includes(status)) {
    return res.status(400).json({ error: "Select a valid deployment status." });
  }
  try {
    const deployment = await ResourceDeployment.findByIdAndUpdate(
      req.params.deploymentId,
      {
        $set: {
          status,
          endsAt: status === "ended" ? new Date() : req.body.endsAt || null,
          updatedBy: req.user.userId,
        },
      },
      { new: true, runValidators: true }
    );
    if (!deployment) return res.status(404).json({ error: "Deployment not found." });
    await PlatformAudit.create({
      ...auditDetails(req),
      action: "afterlight_resource_deployment_updated",
      targetOrganizationId: deployment.organizationId,
      metadata: { deploymentId: deployment._id, resourceProfileId: deployment.resourceProfileId, status },
    });
    return res.json(deployment);
  } catch (error) {
    return res.status(500).json({ error: "Unable to update the deployment." });
  }
});

router.post("/earnings/:earningId/approve", async (req, res) => {
  try {
    const earning = await ContractorEarning.findOneAndUpdate(
      { _id: req.params.earningId, status: "pending_approval" },
      { $set: { status: "approved", approvedAt: new Date(), approvedBy: req.user.userId } },
      { new: true }
    );
    if (!earning) return res.status(409).json({ error: "That earning is no longer awaiting approval." });
    await PlatformAudit.create({
      ...auditDetails(req),
      action: "contractor_earning_approved",
      targetOrganizationId: earning.organizationId,
      metadata: { earningId: earning._id, resourceProfileId: earning.resourceProfileId, amountCents: earning.grossAmountCents },
    });
    return res.json(earning);
  } catch (error) {
    return res.status(500).json({ error: "Unable to approve the earning." });
  }
});

router.post("/earnings/:earningId/void", async (req, res) => {
  const reason = String(req.body.reason || "").trim();
  if (!reason || reason.length > 500) return res.status(400).json({ error: "Enter a void reason of 500 characters or fewer." });
  try {
    const earning = await ContractorEarning.findOneAndUpdate(
      { _id: req.params.earningId, status: { $in: ["pending_approval", "approved"] } },
      { $set: { status: "void", voidedAt: new Date(), voidedBy: req.user.userId, voidReason: reason } },
      { new: true }
    );
    if (!earning) return res.status(409).json({ error: "That earning can no longer be voided." });
    await PlatformAudit.create({
      ...auditDetails(req),
      action: "contractor_earning_voided",
      targetOrganizationId: earning.organizationId,
      metadata: { earningId: earning._id, reason },
    });
    return res.json(earning);
  } catch (error) {
    return res.status(500).json({ error: "Unable to void the earning." });
  }
});

router.post("/payout-batches", async (req, res) => {
  const earningIds = cleanList(req.body.earningIds, 200);
  if (!earningIds.length || earningIds.some((id) => !mongoose.isValidObjectId(id))) {
    return res.status(400).json({ error: "Select one or more approved earnings." });
  }
  const checkDate = new Date(`${String(req.body.checkDate || "")}T12:00:00Z`);
  if (Number.isNaN(checkDate.getTime())) return res.status(400).json({ error: "Select a valid Gusto check date." });
  const session = await mongoose.startSession();
  try {
    let batch;
    await session.withTransaction(async () => {
      const earnings = await ContractorEarning.find({
        _id: { $in: earningIds },
        status: "approved",
        payoutBatchId: null,
      }).populate("resourceProfileId", "displayName gusto").session(session);
      if (earnings.length !== earningIds.length) {
        const error = new Error("One or more earnings are no longer available for payout.");
        error.status = 409;
        throw error;
      }
      if (earnings.some((earning) => earning.resourceProfileId?.gusto?.onboardingStatus !== "onboarding_completed")) {
        const error = new Error("Every contractor in the batch must have completed Gusto onboarding.");
        error.status = 400;
        throw error;
      }
      const lines = buildPayoutLines(earnings);
      const totalAmountCents = lines.reduce((sum, line) => sum + line.totalAmountCents, 0);
      [batch] = await ContractorPayoutBatch.create([{
        batchNumber: newBatchNumber(),
        earningIds,
        lines,
        totalAmountCents,
        checkDate,
        createdBy: req.user.userId,
      }], { session });
      const update = await ContractorEarning.updateMany(
        { _id: { $in: earningIds }, status: "approved", payoutBatchId: null },
        { $set: { status: "payout_pending", payoutBatchId: batch._id } },
        { session }
      );
      if (update.modifiedCount !== earningIds.length) {
        const error = new Error("The earnings changed while the payout batch was being created.");
        error.status = 409;
        throw error;
      }
    });
    await PlatformAudit.create({
      ...auditDetails(req),
      action: "gusto_payout_batch_created",
      metadata: { payoutBatchId: batch._id, batchNumber: batch.batchNumber, totalAmountCents: batch.totalAmountCents },
    });
    return res.status(201).json(batch);
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.status ? error.message : "Unable to create the payout batch." });
  } finally {
    await session.endSession();
  }
});

router.post("/payout-batches/:batchId/record-submission", async (req, res) => {
  const gustoPaymentGroupUuid = String(req.body.gustoPaymentGroupUuid || "").trim();
  if (!gustoPaymentGroupUuid || gustoPaymentGroupUuid.length > 100) {
    return res.status(400).json({ error: "Enter the Gusto contractor payment group UUID." });
  }
  try {
    const batch = await ContractorPayoutBatch.findOneAndUpdate(
      { _id: req.params.batchId, status: "ready" },
      {
        $set: {
          status: "submitted",
          gustoPaymentGroupUuid,
          submittedAt: new Date(),
          updatedBy: req.user.userId,
        },
      },
      { new: true }
    );
    if (!batch) return res.status(409).json({ error: "That payout batch is no longer ready for submission." });
    await PlatformAudit.create({
      ...auditDetails(req),
      action: "gusto_payout_batch_submission_recorded",
      metadata: { payoutBatchId: batch._id, gustoPaymentGroupUuid },
    });
    return res.json(batch);
  } catch (error) {
    return res.status(500).json({ error: "Unable to record the Gusto submission." });
  }
});

router.post("/payout-batches/:batchId/mark-paid", async (req, res) => {
  const session = await mongoose.startSession();
  try {
    let batch;
    await session.withTransaction(async () => {
      batch = await ContractorPayoutBatch.findOneAndUpdate(
        { _id: req.params.batchId, status: "submitted", gustoPaymentGroupUuid: { $ne: "" } },
        { $set: { status: "paid", paidAt: new Date(), updatedBy: req.user.userId } },
        { new: true, session }
      );
      if (!batch) {
        const error = new Error("Only a submitted Gusto batch can be marked paid.");
        error.status = 409;
        throw error;
      }
      const earningUpdate = await ContractorEarning.updateMany(
        { payoutBatchId: batch._id, status: "payout_pending" },
        { $set: { status: "paid", paidAt: batch.paidAt } },
        { session }
      );
      if (earningUpdate.modifiedCount !== batch.earningIds.length) {
        const error = new Error("The batch earnings changed before payment confirmation.");
        error.status = 409;
        throw error;
      }
    });
    await PlatformAudit.create({
      ...auditDetails(req),
      action: "gusto_payout_batch_paid",
      metadata: { payoutBatchId: batch._id, gustoPaymentGroupUuid: batch.gustoPaymentGroupUuid },
    });
    return res.json(batch);
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.status ? error.message : "Unable to mark the payout batch paid." });
  } finally {
    await session.endSession();
  }
});

module.exports = router;
