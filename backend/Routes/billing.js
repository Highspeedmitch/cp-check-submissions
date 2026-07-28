const express = require("express");
const mongoose = require("mongoose");
const nodemailer = require("nodemailer");
const { v4: uuidv4 } = require("uuid");
const Invoice = require("../models/invoice");
const User = require("../models/user");
const Organization = require("../models/organization");
const s3 = require("../awsConfig");
const { generateInvoicePDF } = require("../invoicePdfService");
const { sendUserNotification } = require("../services/notifications");
const {
  invoiceSubmitted,
  invoiceSubmittedForPropertyManager,
  invoiceStatusChanged,
} = require("../services/notificationEvents");
const {
  evaluateOrganizationBillingAction,
} = require("../services/billingPolicy");
const { resolveBillingAddress } = require("../services/propertyAddresses");

const router = express.Router();

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
    const { propertyCode, billingAddress, defaultInspectionAmountCents, apMethod, apEmail, apPortal } = req.body;
    if (!propertyCode || !billingAddress) {
      return res.status(400).json({ error: "Property code and billing address are required." });
    }
    const previousDefaultAmountCents = property.defaultInspectionAmountCents;
    property.propertyCode = propertyCode.trim();
    property.billingAddress = billingAddress.trim();
    property.defaultInspectionAmountCents = Number.isInteger(defaultInspectionAmountCents)
      ? defaultInspectionAmountCents
      : null;
    property.apMethod = apMethod || "download";
    property.apEmail = apEmail || "";
    property.apPortal = apPortal || "";
    await organization.save();
    await Invoice.updateMany(
      {
        organizationId: organization._id,
        propertyId: property._id,
        status: "unbilled",
        amountSetBySubmitter: { $ne: true },
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
    res.json(property);
  } catch (error) {
    res.status(500).json({ error: "Unable to save property billing settings." });
  }
});

function invoiceScope(req, id) {
  const scope = { _id: id, organizationId: req.user.organizationId };
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
  }
  return scope;
}

function validId(value) {
  return !value || mongoose.Types.ObjectId.isValid(value);
}

async function notifyPropertyManagersOfSubmittedInvoice(invoice, organizationId) {
  const organization = await Organization.findById(organizationId)
    .select("properties._id properties.propertyManagers")
    .lean();
  const property = (organization?.properties || []).find(
    (item) => item._id.toString() === invoice.propertyId.toString()
  );
  const assignedIds = [...new Set(
    (property?.propertyManagers || []).map((id) => id.toString())
  )];
  if (!assignedIds.length) return;

  const activePropertyManagers = await User.find({
    _id: { $in: assignedIds },
    organizationId,
    role: "property_manager",
    accountStatus: { $ne: "inactive" },
  }).select("_id").lean();
  const event = invoiceSubmittedForPropertyManager(invoice);

  await Promise.allSettled(activePropertyManagers.map((manager) =>
    sendUserNotification({
      organizationId,
      userId: manager._id,
      ...event,
    })
  ));
}

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
      status: "unbilled",
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
      { _id: existingInvoice._id, status: "unbilled" },
      { amountCents, amountSetBySubmitter: true, pdfKey: "" },
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
    const invoice = await Invoice.findOne({ ...invoiceScope(req, req.params.id), status: "unbilled" });
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
    const submitter = await User.findById(req.user.userId).select("username email").lean();
    const buffer = await generateInvoicePDF(invoice, submitter);
    const key = `${req.user.organizationId}/invoices/${uuidv4()}-${invoice.invoiceNumber}.pdf`;
    await s3.upload({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: "application/pdf",
      ACL: "private",
    }).promise();
    invoice.pdfKey = key;
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
    const method = invoice.propertySnapshot.apMethod || "download";
    if (method === "email") {
      const destination = invoice.propertySnapshot.apEmail;
      if (!destination) return res.status(400).json({ error: "The property has no AP email configured." });
      const file = await s3.getObject({ Bucket: process.env.S3_BUCKET_NAME, Key: invoice.pdfKey }).promise();
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: "highspeedmitch@gmail.com", pass: process.env.EMAIL_PASS },
      });
      await transporter.sendMail({
        from: "highspeedmitch@gmail.com",
        to: destination,
        subject: `Property inspection invoice ${invoice.invoiceNumber}`,
        text: `Attached is invoice ${invoice.invoiceNumber} for ${invoice.propertySnapshot.name}.`,
        attachments: [{ filename: `${invoice.invoiceNumber}.pdf`, content: file.Body }],
      });
      invoice.delivery.destination = destination;
    } else {
      invoice.delivery.destination = invoice.propertySnapshot.apPortal || "Manual AP submission";
      invoice.delivery.confirmationNumber = req.body.confirmationNumber || "";
    }
    invoice.delivery.method = method;
    invoice.delivery.sentAt = new Date();
    invoice.status = "submitted";
    invoice.statusHistory.push({ status: "submitted", changedBy: req.user.userId });
    await invoice.save();
    sendUserNotification({
      organizationId: req.user.organizationId,
      userId: invoice.submitterId,
      ...invoiceSubmitted(invoice),
    }).catch((notificationError) => {
      console.error("Invoice submission notification error:", notificationError);
    });
    notifyPropertyManagersOfSubmittedInvoice(
      invoice,
      req.user.organizationId
    ).catch((notificationError) => {
      console.error("Property manager invoice notification error:", notificationError);
    });
    res.json(invoice);
  } catch (error) {
    console.error("Invoice submission error:", error);
    res.status(500).json({ error: "Unable to submit invoice." });
  }
});

router.post("/:id/mark-paid", async (req, res) => {
  try {
    const query = { _id: req.params.id, organizationId: req.user.organizationId };
    const invoice = await Invoice.findOne(query);
    if (!invoice) return res.status(404).json({ error: "Invoice not found." });
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
