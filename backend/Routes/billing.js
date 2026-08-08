const express = require("express");
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");
const requirePlatformAdmin = require("../middleware/requirePlatformAdmin");
const Invoice = require("../models/invoice");
const User = require("../models/user");
const Organization = require("../models/organization");
const PlatformAudit = require("../models/platformAudit");
const s3 = require("../awsConfig");
const { generateInvoicePDF } = require("../invoicePdfService");
const {
  notifyPlatformAdministrators,
  sendUserNotification,
} = require("../services/notifications");
const {
  afterlightServiceInvoicePaid,
  invoiceSubmitted,
  invoiceSubmittedForPropertyManager,
  invoiceReviewChanged,
  invoiceStatusChanged,
} = require("../services/notificationEvents");
const {
  evaluateOrganizationBillingAction,
} = require("../services/billingPolicy");
const { resolveBillingAddress } = require("../services/propertyAddresses");
const { normalizeEmailAddress } = require("../services/propertyEmails");
const {
  assignedPropertyManagers,
} = require("../services/apDeliveryNotifications");
const { emailPropertyManagersForReview } = require("../services/invoiceReview");
const { approveInvoiceAndSendToAp } = require("../services/invoiceApproval");
const {
  isAfterlightServiceInvoice,
  afterlightServiceInvoiceScope,
} = require("../services/serviceBilling");
const { billingWorkspaceAccess } = require("../services/billingAccess");
const { ensureInvoiceIssuerSnapshot } = require("../services/invoiceIssuer");

const router = express.Router();

router.get("/access", async (req, res) => {
  try {
    return res.json(await billingWorkspaceAccess(req.user));
  } catch (error) {
    console.error("Billing access check error:", error.message);
    return res.status(500).json({ error: "Unable to verify billing access." });
  }
});

router.use(async (req, res, next) => {
  try {
    const access = await billingWorkspaceAccess(req.user);
    if (!access.canAccess) {
      return res.status(403).json({
        error: "Billing is not part of this account's assigned responsibilities.",
      });
    }
    req.billingAccess = access;
    return next();
  } catch (error) {
    return res.status(500).json({ error: "Unable to verify billing access." });
  }
});

router.get("/properties", async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Only organization administrators can manage billing settings." });
    }
    const decision = await evaluateOrganizationBillingAction({
      organizationId: req.user.organizationId,
      action: "manage_property_billing",
      user: req.user,
    });
    if (!decision.allowed) return res.status(403).json({ error: decision.reason });
    const organization = decision.organization;
    if (organization.orgType !== "COM") {
      return res.status(404).json({ error: "Commercial organization not found." });
    }
    res.json(organization.properties.map((property) => ({
      _id: property._id,
      name: property.name,
      propertyCode: property.propertyCode,
      billingAddress: resolveBillingAddress(property),
      defaultInspectionAmountCents: property.defaultInspectionAmountCents,
      autoSubmitCustomerContractorInvoices: Boolean(property.autoSubmitCustomerContractorInvoices),
      apMethod: property.apMethod,
      apEmail: property.apEmail,
      apPortal: property.apPortal,
    })));
  } catch (error) {
    res.status(500).json({ error: "Unable to load property billing settings." });
  }
});

router.put("/properties/:propertyId", async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Only organization administrators can manage billing settings." });
    }
    const decision = await evaluateOrganizationBillingAction({
      organizationId: req.user.organizationId,
      action: "manage_property_billing",
      user: req.user,
      propertyId: req.params.propertyId,
    });
    if (!decision.allowed) return res.status(403).json({ error: decision.reason });
    const organization = decision.organization;
    if (organization.orgType !== "COM") {
      return res.status(404).json({ error: "Commercial organization not found." });
    }
    const property = organization.properties.id(req.params.propertyId);
    if (!property) return res.status(404).json({ error: "Property not found." });
    const {
      propertyCode,
      billingAddress,
      defaultInspectionAmountCents,
      autoSubmitCustomerContractorInvoices,
      apMethod,
      apEmail,
      apPortal,
    } = req.body;
    if (!propertyCode || !billingAddress) {
      return res.status(400).json({ error: "Property code and billing address are required." });
    }
    const previousDefaultAmountCents = property.defaultInspectionAmountCents;
    property.propertyCode = propertyCode.trim();
    property.billingAddress = billingAddress.trim();
    property.defaultInspectionAmountCents = Number.isInteger(defaultInspectionAmountCents)
      ? defaultInspectionAmountCents
      : null;
    property.autoSubmitCustomerContractorInvoices = Boolean(
      autoSubmitCustomerContractorInvoices
    );
    if (property.autoSubmitCustomerContractorInvoices
      && !(property.defaultInspectionAmountCents > 0)) {
      return res.status(400).json({
        error: "Set a positive suggested amount before enabling automatic contractor invoices.",
      });
    }
    const normalizedApMethod = apMethod || "download";
    if (!["email", "portal", "download"].includes(normalizedApMethod)) {
      return res.status(400).json({ error: "Select a valid AP delivery method." });
    }
    const normalizedApEmail = normalizedApMethod === "email"
      ? normalizeEmailAddress(apEmail, "AP email address")
      : String(apEmail || "").trim().toLowerCase();
    property.apMethod = normalizedApMethod;
    property.apEmail = normalizedApEmail;
    property.apPortal = apPortal || "";
    await organization.save();
    await Invoice.updateMany(
      {
        organizationId: organization._id,
        propertyId: property._id,
        status: "unbilled",
        amountSetBySubmitter: { $ne: true },
        "automationSnapshot.snapshottedAt": null,
        $or: [
          { amountCents: previousDefaultAmountCents },
          { amountCents: null },
        ],
      },
      {
        $set: {
          amountCents: property.defaultInspectionAmountCents,
          "propertySnapshot.propertyCode": property.propertyCode,
          "propertySnapshot.address": property.billingAddress,
          "propertySnapshot.apMethod": property.apMethod,
          "propertySnapshot.apEmail": property.apEmail,
          "propertySnapshot.apPortal": property.apPortal,
        },
      }
    );
    await Invoice.updateMany(
      {
        organizationId: organization._id,
        propertyId: property._id,
        status: { $in: ["pending_review", "failed"] },
      },
      {
        $set: {
          "propertySnapshot.apMethod": property.apMethod,
          "propertySnapshot.apEmail": property.apEmail,
          "propertySnapshot.apPortal": property.apPortal,
        },
      }
    );
    res.json(property);
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.status ? error.message : "Unable to save property billing settings.",
    });
  }
});

function invoiceScope(req, id) {
  const scope = {
    _id: id,
    organizationId: req.user.organizationId,
    billingOwner: { $ne: "afterlight_platform" },
    "fulfillmentSnapshot.invoiceRouting": { $ne: "afterlight_service_billing" },
  };
  if (req.user.role !== "admin") scope.submitterId = req.user.userId;
  return scope;
}

async function visibleInvoiceScope(req) {
  const scope = { organizationId: req.user.organizationId };
  if (req.user.role === "property_manager") {
    const organization = await Organization.findById(req.user.organizationId)
      .select("properties._id properties.propertyManagers")
      .lean();
    scope.propertyId = {
      $in: (organization?.properties || [])
        .filter((property) => property.propertyManagers?.some(
          (id) => id.toString() === req.user.userId.toString()
        ))
        .map((property) => property._id),
    };
  } else if (req.user.role !== "admin") {
    scope.submitterId = req.user.userId;
    scope.billingOwner = { $ne: "afterlight_platform" };
    scope["fulfillmentSnapshot.invoiceRouting"] = { $ne: "afterlight_service_billing" };
  }
  return scope;
}

function validId(value) {
  return !value || mongoose.Types.ObjectId.isValid(value);
}

async function notifyPropertyManagersOfSubmittedInvoice(invoice, organizationId, managers) {
  const activePropertyManagers = managers
    || await assignedPropertyManagers(invoice, organizationId);
  const event = invoiceSubmittedForPropertyManager(invoice);

  await Promise.allSettled(activePropertyManagers.map((manager) =>
    sendUserNotification({
      organizationId,
      userId: manager._id,
      ...event,
    })
  ));
}

function platformAuditDetails(req, invoice, action, metadata = {}) {
  return {
    actorUserId: req.user.userId,
    action,
    targetOrganizationId: invoice.organizationId,
    metadata: { invoiceId: invoice._id, ...metadata },
    ipAddress: req.ip || "",
    userAgent: req.get("user-agent") || "",
  };
}

function platformInvoiceResult(invoice) {
  const object = invoice.toObject ? invoice.toObject() : invoice;
  return {
    ...object,
    pdfUrl: object.pdfKey
      ? s3.getSignedUrl("getObject", {
          Bucket: process.env.S3_BUCKET_NAME,
          Key: object.pdfKey,
          Expires: 3600,
        })
      : null,
  };
}

const PLATFORM_INVOICE_STATUSES = new Set([
  "unbilled", "pending_review", "declined", "approving", "submitted", "paid", "failed", "void",
]);

router.get("/platform-service-invoices", requirePlatformAdmin, async (req, res) => {
  try {
    const status = String(req.query.status || "").trim();
    if (status && !PLATFORM_INVOICE_STATUSES.has(status)) {
      return res.status(400).json({ error: "Select a valid invoice status." });
    }
    const query = afterlightServiceInvoiceScope({ archivedAt: null });
    if (status) query.status = status;
    const invoices = await Invoice.find(query)
      .populate("organizationId", "name")
      .populate("submitterId", "username email")
      .sort({ createdAt: -1 })
      .limit(250);
    return res.json(invoices.map(platformInvoiceResult));
  } catch (error) {
    console.error("Platform service invoice list error:", error.message);
    return res.status(500).json({ error: "Unable to load Afterlight service invoices." });
  }
});

router.put("/platform-service-invoices/:id/amount", requirePlatformAdmin, async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: "Invalid invoice." });
    const amountCents = Number(req.body.amountCents);
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      return res.status(400).json({ error: "Enter a valid customer invoice amount." });
    }
    const invoice = await Invoice.findOneAndUpdate(
      afterlightServiceInvoiceScope({
        _id: req.params.id,
        status: { $in: ["unbilled", "declined"] },
      }),
      {
        $set: {
          billingOwner: "afterlight_platform",
          amountCents,
          amountSetBySubmitter: false,
          pdfKey: "",
          status: "unbilled",
          "platformPreparation.preparedBy": req.user.userId,
          "platformPreparation.preparedAt": new Date(),
          "review.requestedBy": null,
          "review.requestedAt": null,
          "review.reviewedBy": null,
          "review.reviewedAt": null,
          "review.decision": "",
          "review.declineReason": "",
          "review.emailSentAt": null,
          "review.emailError": "",
        },
        $push: { statusHistory: { status: "unbilled", changedBy: req.user.userId } },
      },
      { new: true }
    );
    if (!invoice) return res.status(404).json({ error: "Editable Afterlight service invoice not found." });
    await PlatformAudit.create(platformAuditDetails(req, invoice, "afterlight_service_invoice_amount_set", { amountCents }));
    return res.json(platformInvoiceResult(invoice));
  } catch (error) {
    console.error("Platform service invoice amount error:", error.message);
    return res.status(500).json({ error: "Unable to update the customer invoice amount." });
  }
});

router.post("/platform-service-invoices/:id/generate", requirePlatformAdmin, async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: "Invalid invoice." });
    const invoice = await Invoice.findOne(afterlightServiceInvoiceScope({
      _id: req.params.id,
      status: { $in: ["unbilled", "declined"] },
    }));
    if (!invoice) return res.status(404).json({ error: "Afterlight service invoice not found." });
    if (!invoice.amountCents) return res.status(400).json({ error: "Set the customer amount before generating the invoice." });
    if (!invoice.propertySnapshot.propertyCode) {
      return res.status(400).json({ error: "Configure the property's billing code before generating the invoice." });
    }
    if (!invoice.invoiceNumber) invoice.invoiceNumber = `${invoice.propertySnapshot.propertyCode}-${Date.now()}`;
    await ensureInvoiceIssuerSnapshot(invoice);
    const buffer = await generateInvoicePDF(invoice);
    const key = `${invoice.organizationId}/invoices/${uuidv4()}-${invoice.invoiceNumber}.pdf`;
    await s3.upload({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: "application/pdf",
      ACL: "private",
    }).promise();
    invoice.billingOwner = "afterlight_platform";
    invoice.pdfKey = key;
    invoice.status = "unbilled";
    invoice.platformPreparation.preparedBy = req.user.userId;
    invoice.platformPreparation.preparedAt = new Date();
    invoice.review.decision = "";
    invoice.review.declineReason = "";
    await invoice.save();
    await PlatformAudit.create(platformAuditDetails(req, invoice, "afterlight_service_invoice_generated", {
      invoiceNumber: invoice.invoiceNumber,
    }));
    return res.json(platformInvoiceResult(invoice));
  } catch (error) {
    console.error("Platform service invoice generation error:", error.message);
    return res.status(500).json({ error: "Unable to generate the Afterlight service invoice PDF." });
  }
});

router.post("/platform-service-invoices/:id/submit", requirePlatformAdmin, async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: "Invalid invoice." });
    const invoice = await Invoice.findOne(afterlightServiceInvoiceScope({
      _id: req.params.id,
      status: "unbilled",
    }));
    if (!invoice) return res.status(404).json({ error: "Afterlight service invoice not found." });
    if (!invoice.pdfKey) return res.status(400).json({ error: "Generate the PDF before submitting it." });
    const organizationId = invoice.organizationId.toString();
    const managers = await assignedPropertyManagers(invoice, organizationId);
    if (!managers.length) {
      return res.status(400).json({
        error: "Assign an active property manager before submitting this invoice for customer review.",
      });
    }
    invoice.billingOwner = "afterlight_platform";
    invoice.status = "pending_review";
    invoice.review.cycle = Number(invoice.review.cycle || 0) + 1;
    invoice.review.requestedBy = req.user.userId;
    invoice.review.requestedAt = new Date();
    invoice.review.reviewedBy = null;
    invoice.review.reviewedAt = null;
    invoice.review.decision = "";
    invoice.review.method = "";
    invoice.review.approverSnapshot = { name: "", email: "" };
    invoice.review.declineReason = "";
    invoice.review.emailSentAt = null;
    invoice.review.emailError = "";
    invoice.statusHistory.push({ status: "pending_review", changedBy: req.user.userId });
    await invoice.save();
    notifyPropertyManagersOfSubmittedInvoice(invoice, organizationId, managers)
      .catch((notificationError) => console.error("Platform invoice notification error:", notificationError));
    let warning = "";
    try {
      await emailPropertyManagersForReview(invoice, managers);
      invoice.review.emailSentAt = new Date();
    } catch (emailError) {
      console.error("Platform invoice review email error:", emailError);
      invoice.review.emailError = "Review email delivery failed.";
      warning = "The invoice is awaiting customer review, but the review email could not be delivered. The property manager was still notified in the app.";
    }
    await invoice.save();
    await PlatformAudit.create(platformAuditDetails(req, invoice, "afterlight_service_invoice_submitted", {
      invoiceNumber: invoice.invoiceNumber,
    }));
    return res.json({ ...platformInvoiceResult(invoice), warning });
  } catch (error) {
    console.error("Platform service invoice submission error:", error.message);
    return res.status(500).json({ error: "Unable to submit the Afterlight service invoice." });
  }
});

router.post("/platform-service-invoices/:id/mark-paid", requirePlatformAdmin, async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: "Invalid invoice." });
    const invoice = await Invoice.findOneAndUpdate(
      afterlightServiceInvoiceScope({ _id: req.params.id, status: "submitted" }),
      {
        $set: { billingOwner: "afterlight_platform", status: "paid" },
        $push: { statusHistory: { status: "paid", changedBy: req.user.userId } },
      },
      { new: true }
    );
    if (!invoice) return res.status(409).json({ error: "Only a submitted Afterlight service invoice can be marked paid." });
    await PlatformAudit.create(platformAuditDetails(req, invoice, "afterlight_service_invoice_paid", {
      invoiceNumber: invoice.invoiceNumber,
    }));
    notifyPlatformAdministrators({
      event: afterlightServiceInvoicePaid(invoice),
      contextOrganizationId: invoice.organizationId,
      excludeUserId: req.user.userId,
    }).catch((notificationError) => {
      console.error("Platform invoice payment notification error:", notificationError);
    });
    return res.json(platformInvoiceResult(invoice));
  } catch (error) {
    console.error("Platform service invoice payment error:", error.message);
    return res.status(500).json({ error: "Unable to mark the Afterlight service invoice paid." });
  }
});

router.get("/filter-options", async (req, res) => {
  try {
    if (!["admin", "property_manager"].includes(req.user.role)) {
      return res.status(403).json({ error: "Invoice filters are available to administrators and property managers." });
    }
    const scope = await visibleInvoiceScope(req);
    const [submitterIds, propertyIds, organization] = await Promise.all([
      Invoice.distinct("submitterId", scope),
      Invoice.distinct("propertyId", scope),
      Organization.findById(req.user.organizationId).select("properties._id properties.name").lean(),
    ]);
    const users = await User.find({
      _id: { $in: submitterIds },
      organizationId: req.user.organizationId,
    }).select("username email").sort({ username: 1 }).lean();
    const visiblePropertyIds = new Set(propertyIds.map((id) => id.toString()));
    const properties = (organization?.properties || [])
      .filter((property) => visiblePropertyIds.has(property._id.toString()))
      .map((property) => ({ _id: property._id, name: property.name }))
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    res.json({ users, properties });
  } catch (error) {
    res.status(500).json({ error: "Unable to load invoice filter options." });
  }
});

router.get("/", async (req, res) => {
  try {
    if (!validId(req.query.submitterId) || !validId(req.query.propertyId)) {
      return res.status(400).json({ error: "Invalid invoice filter." });
    }
    const query = await visibleInvoiceScope(req);
    query.archivedAt = req.query.archive === "archived" ? { $ne: null } : null;
    if (req.query.status) query.status = req.query.status;
    if (["admin", "property_manager"].includes(req.user.role)) {
      if (req.query.submitterId) query.submitterId = req.query.submitterId;
      if (req.query.propertyId) query.propertyId = req.query.propertyId;
    }
    const invoices = await Invoice.find(query)
      .populate("submitterId", "username email")
      .populate("archivedBy", "username email")
      .sort({ createdAt: -1 })
      .lean();
    const result = invoices.map((invoice) => ({
      ...invoice,
      pdfUrl: invoice.pdfKey
        ? s3.getSignedUrl("getObject", {
            Bucket: process.env.S3_BUCKET_NAME,
            Key: invoice.pdfKey,
            Expires: 3600,
          })
        : null,
    }));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Unable to load invoices." });
  }
});

router.put("/:id/archive", async (req, res) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({ error: "Invalid invoice." });
    }
    const scope = await visibleInvoiceScope(req);
    const invoice = await Invoice.findOneAndUpdate(
      {
        ...scope,
        _id: req.params.id,
        status: "paid",
        archivedAt: null,
      },
      {
        $set: {
          archivedAt: new Date(),
          archivedBy: req.user.userId,
        },
      },
      { new: true }
    );
    if (!invoice) {
      return res.status(400).json({ error: "Only a visible, paid invoice can be archived." });
    }
    res.json(invoice);
  } catch (error) {
    res.status(500).json({ error: "Unable to archive invoice." });
  }
});

router.put("/:id/restore", async (req, res) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({ error: "Invalid invoice." });
    }
    const scope = await visibleInvoiceScope(req);
    const invoice = await Invoice.findOneAndUpdate(
      {
        ...scope,
        _id: req.params.id,
        status: "paid",
        archivedAt: { $ne: null },
      },
      {
        $set: {
          archivedAt: null,
          archivedBy: null,
        },
      },
      { new: true }
    );
    if (!invoice) {
      return res.status(404).json({ error: "Archived invoice not found." });
    }
    res.json(invoice);
  } catch (error) {
    res.status(500).json({ error: "Unable to restore invoice." });
  }
});

router.put("/:id/amount", async (req, res) => {
  try {
    const amountCents = Number(req.body.amountCents);
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      return res.status(400).json({ error: "Enter a valid amount." });
    }
    const existingInvoice = await Invoice.findOne({
      ...invoiceScope(req, req.params.id),
      status: { $in: ["unbilled", "declined"] },
    });
    if (!existingInvoice) return res.status(404).json({ error: "Editable invoice not found." });
    const decision = await evaluateOrganizationBillingAction({
      organizationId: req.user.organizationId,
      action: "set_amount",
      user: req.user,
      invoice: existingInvoice,
    });
    if (!decision.allowed) return res.status(403).json({ error: decision.reason });

    const invoice = await Invoice.findOneAndUpdate(
      { _id: existingInvoice._id, status: { $in: ["unbilled", "declined"] } },
      {
        amountCents,
        amountSetBySubmitter: true,
        pdfKey: "",
        status: "unbilled",
        "review.decision": "",
        "review.declineReason": "",
      },
      { new: true }
    );
    if (!invoice) return res.status(404).json({ error: "Editable invoice not found." });
    res.json(invoice);
  } catch (error) {
    res.status(500).json({ error: "Unable to update invoice amount." });
  }
});

router.post("/:id/generate", async (req, res) => {
  try {
    const invoice = await Invoice.findOne({
      ...invoiceScope(req, req.params.id),
      status: { $in: ["unbilled", "declined"] },
    });
    if (!invoice) return res.status(404).json({ error: "Invoice not found." });
    const decision = await evaluateOrganizationBillingAction({
      organizationId: req.user.organizationId,
      action: "generate_invoice",
      user: req.user,
      invoice,
    });
    if (!decision.allowed) return res.status(403).json({ error: decision.reason });
    if (!invoice.amountCents) return res.status(400).json({ error: "Set an amount before generating the invoice." });
    if (!invoice.propertySnapshot.propertyCode) {
      return res.status(400).json({ error: "An admin must configure the property's billing code first." });
    }
    if (!invoice.invoiceNumber) {
      invoice.invoiceNumber = `${invoice.propertySnapshot.propertyCode}-${Date.now()}`;
    }
    await ensureInvoiceIssuerSnapshot(invoice);
    const buffer = await generateInvoicePDF(invoice);
    const key = `${req.user.organizationId}/invoices/${uuidv4()}-${invoice.invoiceNumber}.pdf`;
    await s3.upload({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: "application/pdf",
      ACL: "private",
    }).promise();
    invoice.pdfKey = key;
    invoice.status = "unbilled";
    invoice.review.decision = "";
    invoice.review.declineReason = "";
    await invoice.save();
    res.json({ invoice, pdfUrl: s3.getSignedUrl("getObject", {
      Bucket: process.env.S3_BUCKET_NAME, Key: key, Expires: 3600,
    }) });
  } catch (error) {
    console.error("Invoice generation error:", error);
    res.status(500).json({ error: "Unable to generate invoice PDF." });
  }
});

router.post("/:id/submit", async (req, res) => {
  try {
    const invoice = await Invoice.findOne({ ...invoiceScope(req, req.params.id), status: "unbilled" });
    if (!invoice) return res.status(404).json({ error: "Invoice not found." });
    const decision = await evaluateOrganizationBillingAction({
      organizationId: req.user.organizationId,
      action: "submit_invoice",
      user: req.user,
      invoice,
    });
    if (!decision.allowed) return res.status(403).json({ error: decision.reason });
    if (!invoice.pdfKey) return res.status(400).json({ error: "Generate the PDF before submitting it." });
    const managers = await assignedPropertyManagers(invoice, req.user.organizationId);
    if (!managers.length) {
      return res.status(400).json({
        error: "An active property manager must be assigned before this invoice can be submitted for review.",
      });
    }
    invoice.status = "pending_review";
    invoice.review.cycle = Number(invoice.review.cycle || 0) + 1;
    invoice.review.requestedBy = req.user.userId;
    invoice.review.requestedAt = new Date();
    invoice.review.reviewedBy = null;
    invoice.review.reviewedAt = null;
    invoice.review.decision = "";
    invoice.review.method = "";
    invoice.review.approverSnapshot = { name: "", email: "" };
    invoice.review.declineReason = "";
    invoice.review.emailSentAt = null;
    invoice.review.emailError = "";
    invoice.statusHistory.push({ status: "pending_review", changedBy: req.user.userId });
    await invoice.save();
    sendUserNotification({
      organizationId: req.user.organizationId,
      userId: invoice.submitterId,
      ...invoiceSubmitted(invoice),
    }).catch((notificationError) => {
      console.error("Invoice submission notification error:", notificationError);
    });
    notifyPropertyManagersOfSubmittedInvoice(invoice, req.user.organizationId, managers)
      .catch((notificationError) => {
      console.error("Property manager invoice notification error:", notificationError);
    });
    let warning = "";
    try {
      await emailPropertyManagersForReview(invoice, managers);
      invoice.review.emailSentAt = new Date();
    } catch (emailError) {
      console.error("Property manager invoice review email error:", emailError);
      invoice.review.emailError = "Review email delivery failed.";
      warning = "The invoice is awaiting PM review, but the review email could not be delivered. The PM was still notified in the app.";
    }
    await invoice.save();
    res.json({ ...invoice.toObject(), warning });
  } catch (error) {
    console.error("Invoice submission error:", error);
    res.status(500).json({ error: "Unable to submit invoice." });
  }
});

router.get("/:id/review", async (req, res) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({ error: "Invalid invoice." });
    }
    const invoice = await Invoice.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId,
    }).populate("submitterId", "username email");
    if (!invoice) return res.status(404).json({ error: "Invoice not found." });
    const decision = await evaluateOrganizationBillingAction({
      organizationId: req.user.organizationId,
      action: "review_invoice",
      user: req.user,
      invoice,
    });
    if (!decision.allowed) return res.status(403).json({ error: decision.reason });
    res.json({
      ...invoice.toObject(),
      pdfUrl: invoice.pdfKey
        ? s3.getSignedUrl("getObject", {
            Bucket: process.env.S3_BUCKET_NAME,
            Key: invoice.pdfKey,
            Expires: 3600,
          })
        : null,
    });
  } catch (error) {
    res.status(500).json({ error: "Unable to load the invoice review." });
  }
});

router.post("/:id/approve", async (req, res) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({ error: "Invalid invoice." });
    }
    const { invoice, deliveryResult } = await approveInvoiceAndSendToAp({
      invoiceId: req.params.id,
      organizationId: req.user.organizationId,
      actor: req.user,
      approvalMethod: "authenticated_portal",
      confirmationNumber: req.body.confirmationNumber,
    });
    console.info(JSON.stringify({
      event: deliveryResult.status === "accepted"
        ? "invoice_ap_delivery_accepted"
        : "invoice_ap_delivery_recorded",
      invoiceId: String(invoice._id),
      organizationId: String(invoice.organizationId),
      method: invoice.delivery.method,
      deliveryStatus: invoice.delivery.status,
      provider: invoice.delivery.provider,
      providerMessageId: invoice.delivery.providerMessageId,
      attemptCount: invoice.delivery.attemptCount,
    }));
    res.json({ ...invoice.toObject(), warning: deliveryResult.warning });
  } catch (error) {
    console.error(JSON.stringify({
      event: error.deliveryFailure ? "invoice_ap_delivery_failed" : "invoice_approval_rejected",
      invoiceId: error.invoice?._id ? String(error.invoice._id) : String(req.params.id),
      organizationId: error.invoice?.organizationId
        ? String(error.invoice.organizationId)
        : String(req.user.organizationId),
      errorCode: error.code || "INVOICE_APPROVAL_ERROR",
    }));
    res.status(error.status || 500).json({
      error: error.status ? error.message : "Unable to approve and send this invoice.",
      code: error.code || undefined,
    });
  }
});

router.post("/:id/decline", async (req, res) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({ error: "Invalid invoice." });
    }
    const reason = String(req.body.reason || "").trim();
    if (!reason || reason.length > 1000) {
      return res.status(400).json({ error: "Enter a decline reason of 1,000 characters or fewer." });
    }
    const existingInvoice = await Invoice.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId,
      status: "pending_review",
    });
    if (!existingInvoice) {
      return res.status(409).json({ error: "This invoice is no longer awaiting review." });
    }
    const decision = await evaluateOrganizationBillingAction({
      organizationId: req.user.organizationId,
      action: "review_invoice",
      user: req.user,
      invoice: existingInvoice,
    });
    if (!decision.allowed) return res.status(403).json({ error: decision.reason });
    const invoice = await Invoice.findOneAndUpdate(
      {
        _id: existingInvoice._id,
        organizationId: req.user.organizationId,
        status: "pending_review",
      },
      {
        $set: {
          status: "declined",
          "review.reviewedBy": req.user.userId,
          "review.reviewedAt": new Date(),
          "review.decision": "declined",
          "review.declineReason": reason,
        },
        $push: {
          statusHistory: { status: "declined", changedBy: req.user.userId },
        },
      },
      { new: true }
    );
    if (!invoice) {
      return res.status(409).json({ error: "Another reviewer has already acted on this invoice." });
    }
    if (!isAfterlightServiceInvoice(invoice)) {
      sendUserNotification({
        organizationId: req.user.organizationId,
        userId: invoice.submitterId,
        ...invoiceReviewChanged(invoice, "declined"),
      }).catch((notificationError) => {
        console.error("Invoice decline notification error:", notificationError);
      });
    }
    res.json(invoice);
  } catch (error) {
    res.status(500).json({ error: "Unable to decline the invoice." });
  }
});

router.post("/:id/mark-paid", async (req, res) => {
  try {
    const query = { _id: req.params.id, organizationId: req.user.organizationId };
    const invoice = await Invoice.findOne(query);
    if (!invoice) return res.status(404).json({ error: "Invoice not found." });
    if (isAfterlightServiceInvoice(invoice)) {
      return res.status(403).json({
        error: "Afterlight service invoice payment status is managed by platform billing.",
      });
    }
    const decision = await evaluateOrganizationBillingAction({
      organizationId: req.user.organizationId,
      action: "mark_paid",
      user: req.user,
      invoice,
    });
    if (!decision.allowed) return res.status(403).json({ error: decision.reason });
    if (invoice.status !== "submitted") return res.status(400).json({ error: "Only submitted invoices can be marked paid." });
    invoice.status = "paid";
    invoice.statusHistory.push({ status: "paid", changedBy: req.user.userId });
    await invoice.save();
    sendUserNotification({
      organizationId: req.user.organizationId,
      userId: invoice.submitterId,
      ...invoiceStatusChanged(invoice),
    }).catch((notificationError) => {
      console.error("Invoice status notification error:", notificationError);
    });
    res.json(invoice);
  } catch (error) {
    res.status(500).json({ error: "Unable to update invoice." });
  }
});

module.exports = router;
