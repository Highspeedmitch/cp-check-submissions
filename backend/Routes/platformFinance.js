const express = require("express");
const mongoose = require("mongoose");
const authenticateToken = require("../middleware/authenticateToken");
const requirePlatformAdmin = require("../middleware/requirePlatformAdmin");
const Assignment = require("../models/assignment");
const Organization = require("../models/organization");
const Submission = require("../models/submission");
const Invoice = require("../models/invoice");
const ContractorEarning = require("../models/contractorEarning");
const PlatformOperatingCost = require("../models/platformOperatingCost");
const PlatformAudit = require("../models/platformAudit");
const {
  validFinancialMonth,
  financialMonthRange,
  buildPlatformFinancialOverview,
} = require("../services/platformFinance");

const router = express.Router();
router.use(authenticateToken, requirePlatformAdmin);

const COST_CATEGORIES = new Set(["aws", "ai", "hosting", "software", "payroll", "other"]);
const COST_RECURRENCES = new Set(["one_time", "monthly"]);
const COST_CLASSIFICATIONS = new Set(["estimated", "actual"]);

function currentMonth(now = new Date()) {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function validId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

function previousMonth(month) {
  const range = financialMonthRange(month);
  const previous = new Date(range.start.getTime() - 1);
  return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, "0")}`;
}

function auditDetails(req, action, metadata = {}) {
  return {
    actorUserId: req.user.userId,
    action,
    metadata,
    ipAddress: req.ip || "",
    userAgent: typeof req.get === "function" ? req.get("user-agent") || "" : "",
  };
}

function normalizedCostInput(body = {}, { partial = false } = {}) {
  const input = {};
  if (!partial || Object.prototype.hasOwnProperty.call(body, "name")) {
    const name = String(body.name || "").trim();
    if (!name || name.length > 120) {
      const error = new Error("Enter a cost name up to 120 characters.");
      error.status = 400;
      throw error;
    }
    input.name = name;
  }
  if (!partial || Object.prototype.hasOwnProperty.call(body, "amountCents")) {
    const amountCents = Number(body.amountCents);
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      const error = new Error("Enter a positive cost amount.");
      error.status = 400;
      throw error;
    }
    input.amountCents = amountCents;
  }
  if (!partial || Object.prototype.hasOwnProperty.call(body, "startMonth")) {
    const startMonth = String(body.startMonth || "");
    if (!validFinancialMonth(startMonth)) {
      const error = new Error("Select a valid cost month.");
      error.status = 400;
      throw error;
    }
    input.startMonth = startMonth;
  }

  const enumFields = [
    ["category", COST_CATEGORIES, "cost category", "other"],
    ["recurrence", COST_RECURRENCES, "recurrence", "one_time"],
    ["classification", COST_CLASSIFICATIONS, "cost classification", "estimated"],
  ];
  enumFields.forEach(([field, allowed, label, defaultValue]) => {
    if (partial && !Object.prototype.hasOwnProperty.call(body, field)) return;
    const value = String(body[field] || defaultValue);
    if (!allowed.has(value)) {
      const error = new Error(`Select a valid ${label}.`);
      error.status = 400;
      throw error;
    }
    input[field] = value;
  });
  return input;
}

router.get("/overview", async (req, res) => {
  try {
    const month = String(req.query.month || currentMonth());
    const range = financialMonthRange(month);
    const assignments = await Assignment.find({
      startDate: { $gte: range.start, $lt: range.end },
      status: { $in: ["scheduled", "completed"] },
    }).lean();
    const assignmentIds = assignments.map((assignment) => assignment._id);
    const organizationIds = [...new Set(assignments.map((assignment) => String(assignment.organizationId)))];
    const [organizations, submissions, earnings, costs] = await Promise.all([
      Organization.find({ _id: { $in: organizationIds } })
        .select("name properties.name properties.defaultInspectionAmountCents")
        .lean(),
      assignmentIds.length
        ? Submission.find({ assignmentId: { $in: assignmentIds } }).select("assignmentId").lean()
        : [],
      assignmentIds.length
        ? ContractorEarning.find({ assignmentId: { $in: assignmentIds } }).lean()
        : [],
      PlatformOperatingCost.find({ archivedAt: null, startMonth: { $lte: month } }).lean(),
    ]);
    const submissionIds = submissions.map((submission) => submission._id);
    const invoices = submissionIds.length
      ? await Invoice.find({ submissionId: { $in: submissionIds } })
        .select("submissionId amountCents status")
        .lean()
      : [];
    const assignmentBySubmissionId = new Map(
      submissions.map((submission) => [String(submission._id), submission.assignmentId])
    );
    const attributedInvoices = invoices.map((invoice) => ({
      ...invoice,
      assignmentId: assignmentBySubmissionId.get(String(invoice.submissionId)),
    }));
    return res.json(buildPlatformFinancialOverview({
      month,
      assignments,
      organizations,
      invoices: attributedInvoices,
      earnings,
      costs,
    }));
  } catch (error) {
    console.error("Platform financial overview error:", error.message);
    return res.status(error.status || 500).json({
      error: error.status ? error.message : "Unable to load the financial overview.",
    });
  }
});

router.post("/costs", async (req, res) => {
  try {
    const input = normalizedCostInput(req.body);
    const cost = await PlatformOperatingCost.create({
      ...input,
      createdBy: req.user.userId,
      updatedBy: req.user.userId,
    });
    await PlatformAudit.create(auditDetails(req, "platform_operating_cost_created", {
      operatingCostId: cost._id,
      name: cost.name,
      amountCents: cost.amountCents,
      startMonth: cost.startMonth,
      recurrence: cost.recurrence,
    }));
    return res.status(201).json(cost);
  } catch (error) {
    console.error("Platform operating cost creation error:", error.message);
    return res.status(error.status || 500).json({
      error: error.status ? error.message : "Unable to add the operating cost.",
    });
  }
});

router.put("/costs/:id", async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: "Invalid operating cost." });
    const changes = normalizedCostInput(req.body, { partial: true });
    if (!Object.keys(changes).length) {
      return res.status(400).json({ error: "Choose an operating cost field to update." });
    }
    const cost = await PlatformOperatingCost.findOneAndUpdate(
      { _id: req.params.id, archivedAt: null },
      { $set: { ...changes, updatedBy: req.user.userId } },
      { new: true, runValidators: true }
    );
    if (!cost) return res.status(404).json({ error: "Operating cost not found." });
    await PlatformAudit.create(auditDetails(req, "platform_operating_cost_updated", {
      operatingCostId: cost._id,
      changedFields: Object.keys(changes),
    }));
    return res.json(cost);
  } catch (error) {
    console.error("Platform operating cost update error:", error.message);
    return res.status(error.status || 500).json({
      error: error.status ? error.message : "Unable to update the operating cost.",
    });
  }
});

router.delete("/costs/:id", async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: "Invalid operating cost." });
    const month = String(req.query.month || "");
    if (!validFinancialMonth(month)) return res.status(400).json({ error: "Select a valid cost month." });
    const existing = await PlatformOperatingCost.findOne({ _id: req.params.id, archivedAt: null });
    if (!existing) return res.status(404).json({ error: "Operating cost not found." });
    const endsRecurringCost = existing.recurrence === "monthly" && existing.startMonth < month;
    const changes = endsRecurringCost
      ? { endMonth: previousMonth(month), updatedBy: req.user.userId }
      : { archivedAt: new Date(), archivedBy: req.user.userId, updatedBy: req.user.userId };
    const cost = await PlatformOperatingCost.findOneAndUpdate(
      { _id: req.params.id, archivedAt: null },
      { $set: changes },
      { new: true }
    );
    if (!cost) return res.status(404).json({ error: "Operating cost not found." });
    await PlatformAudit.create(auditDetails(
      req,
      endsRecurringCost ? "platform_operating_cost_ended" : "platform_operating_cost_archived",
      {
      operatingCostId: cost._id,
      name: cost.name,
      effectiveMonth: month,
      endMonth: cost.endMonth || "",
    }));
    return res.json({
      message: endsRecurringCost
        ? "Recurring operating cost ended before the selected month."
        : "Operating cost removed.",
    });
  } catch (error) {
    console.error("Platform operating cost archive error:", error.message);
    return res.status(500).json({ error: "Unable to remove the operating cost." });
  }
});

module.exports = router;
module.exports.currentMonth = currentMonth;
module.exports.previousMonth = previousMonth;
module.exports.normalizedCostInput = normalizedCostInput;
