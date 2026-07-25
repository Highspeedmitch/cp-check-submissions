const express = require("express");
const nodemailer = require("nodemailer");
const { v4: uuidv4 } = require("uuid");
const Invoice = require("../models/invoice");
const User = require("../models/user");
const Organization = require("../models/organization");
const s3 = require("../awsConfig");
const { generateInvoicePDF } = require("../invoicePdfService");

const router = express.Router();

router.get("/properties", async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admins only." });
  const organization = await Organization.findById(req.user.organizationId).lean();
  if (!organization || organization.orgType !== "COM") {
    return res.status(404).json({ error: "Commercial organization not found." });
  }
  res.json(organization.properties.map((property) => ({
    _id: property._id,
    name: property.name,
    propertyCode: property.propertyCode,
    streetAddress: property.streetAddress,
    defaultInspectionAmountCents: property.defaultInspectionAmountCents,
    apMethod: property.apMethod,
    apEmail: property.apEmail,
    apPortal: property.apPortal,
  })));
});

router.put("/properties/:propertyId", async (req, res) => {
  try {
    if (req.user.role !== "admin") return res.status(403).json({ error: "Admins only." });
    const organization = await Organization.findById(req.user.organizationId);
    if (!organization || organization.orgType !== "COM") {
      return res.status(404).json({ error: "Commercial organization not found." });
    }
    const property = organization.properties.id(req.params.propertyId);
    if (!property) return res.status(404).json({ error: "Property not found." });
    const { propertyCode, streetAddress, defaultInspectionAmountCents, apMethod, apEmail, apPortal } = req.body;
    if (!propertyCode || !streetAddress) {
      return res.status(400).json({ error: "Property code and billing address are required." });
    }
    const previousDefaultAmountCents = property.defaultInspectionAmountCents;
    property.propertyCode = propertyCode.trim();
    property.streetAddress = streetAddress.trim();
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
          "propertySnapshot.address": property.streetAddress,
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

router.get("/", async (req, res) => {
  try {
    const query = { organizationId: req.user.organizationId };
    if (req.user.role === "property_manager") {
      const organization = await Organization.findById(req.user.organizationId).lean();
      query.propertyId = {
        $in: organization.properties
          .filter((property) => property.propertyManagers?.some(
            (id) => id.toString() === req.user.userId.toString()
          ))
          .map((property) => property._id),
      };
    } else if (req.user.role !== "admin") {
      query.submitterId = req.user.userId;
    }
    if (req.query.status) query.status = req.query.status;
    const invoices = await Invoice.find(query)
      .populate("submitterId", "username email")
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

router.put("/:id/amount", async (req, res) => {
  try {
    if (req.user.role === "admin") return res.status(403).json({ error: "The submitter sets the invoice amount." });
    const amountCents = Number(req.body.amountCents);
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      return res.status(400).json({ error: "Enter a valid amount." });
    }
    const invoice = await Invoice.findOneAndUpdate(
      { ...invoiceScope(req, req.params.id), status: "unbilled" },
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
    if (req.user.role === "admin") return res.status(403).json({ error: "Only the submitter can generate this invoice." });
    const invoice = await Invoice.findOne({ ...invoiceScope(req, req.params.id), status: "unbilled" });
    if (!invoice) return res.status(404).json({ error: "Invoice not found." });
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
    if (req.user.role === "admin") return res.status(403).json({ error: "Only the submitter can send this invoice." });
    const invoice = await Invoice.findOne({ ...invoiceScope(req, req.params.id), status: "unbilled" });
    if (!invoice || !invoice.pdfKey) return res.status(400).json({ error: "Generate the PDF before submitting it." });
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
    res.json(invoice);
  } catch (error) {
    console.error("Invoice submission error:", error);
    res.status(500).json({ error: "Unable to submit invoice." });
  }
});

router.post("/:id/mark-paid", async (req, res) => {
  try {
    const invoice = await Invoice.findOne(invoiceScope(req, req.params.id));
    if (!invoice) return res.status(404).json({ error: "Invoice not found." });
    if (invoice.status !== "submitted") return res.status(400).json({ error: "Only submitted invoices can be marked paid." });
    invoice.status = "paid";
    invoice.statusHistory.push({ status: "paid", changedBy: req.user.userId });
    await invoice.save();
    res.json(invoice);
  } catch (error) {
    res.status(500).json({ error: "Unable to update invoice." });
  }
});

module.exports = router;
