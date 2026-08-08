const User = require("../models/user");
const { isAfterlightServiceInvoice } = require("./serviceBilling");

const AFTERLIGHT_ISSUER = Object.freeze({
  type: "afterlight",
  name: "Afterlight Inspections",
  email: "",
});

function customerContractorInvoice(invoice = {}) {
  return invoice.fulfillmentSnapshot?.invoiceRouting === "customer_accounts_payable"
    || invoice.fulfillmentSnapshot?.source === "customer_contractor";
}

function issuerSnapshotForInvoice(invoice = {}, submitter = {}) {
  if (isAfterlightServiceInvoice(invoice)) return { ...AFTERLIGHT_ISSUER };
  if (customerContractorInvoice(invoice)) {
    return {
      type: "customer_contractor",
      name: String(
        submitter.billingProfile?.companyName
        || submitter.username
        || submitter.email
        || "Customer Contractor"
      ).trim(),
      email: String(submitter.email || "").trim().toLowerCase(),
    };
  }
  return {
    type: "customer_submitter",
    name: String(submitter.username || submitter.email || "Invoice Submitter").trim(),
    email: String(submitter.email || "").trim().toLowerCase(),
  };
}

function invoiceIssuer(invoice = {}) {
  const snapshot = invoice.issuerSnapshot || {};
  if (String(snapshot.name || "").trim()) {
    return {
      type: snapshot.type || (isAfterlightServiceInvoice(invoice) ? "afterlight" : "customer_submitter"),
      name: String(snapshot.name).trim(),
      email: String(snapshot.email || "").trim().toLowerCase(),
    };
  }
  return issuerSnapshotForInvoice(invoice, invoice.submitterId || {});
}

async function ensureInvoiceIssuerSnapshot(
  invoice,
  { UserModel = User, save = true } = {}
) {
  if (String(invoice?.issuerSnapshot?.name || "").trim()) return invoice.issuerSnapshot;
  let submitter = invoice?.submitterId || {};
  const populatedSubmitter = submitter && typeof submitter === "object"
    && (submitter.username || submitter.email || submitter.billingProfile);
  if (invoice?.submitterId && !populatedSubmitter) {
    submitter = await UserModel.findById(invoice.submitterId)
      .select("username email billingProfile")
      .lean();
  }
  invoice.issuerSnapshot = issuerSnapshotForInvoice(invoice, submitter || {});
  if (save && typeof invoice.save === "function") await invoice.save();
  return invoice.issuerSnapshot;
}

module.exports = {
  AFTERLIGHT_ISSUER,
  customerContractorInvoice,
  ensureInvoiceIssuerSnapshot,
  invoiceIssuer,
  issuerSnapshotForInvoice,
};
