const AFTERLIGHT_SERVICE_ROUTING = "afterlight_service_billing";

function customerChargeSnapshotForAssignment({ fulfillment = {}, property = {}, snapshottedAt = new Date() } = {}) {
  if (fulfillment.invoiceRouting !== AFTERLIGHT_SERVICE_ROUTING) return null;
  const configuredAmount = property.defaultInspectionAmountCents;
  return {
    billingOwner: "afterlight_platform",
    rateType: "per_assignment",
    amountCents: Number.isInteger(configuredAmount) && configuredAmount > 0
      ? configuredAmount
      : null,
    currency: "USD",
    source: "property_default",
    snapshottedAt,
  };
}

function billingOwnerForFulfillment(fulfillment = {}) {
  return fulfillment.invoiceRouting === AFTERLIGHT_SERVICE_ROUTING
    ? "afterlight_platform"
    : "customer_submitter";
}

function isAfterlightServiceInvoice(invoice = {}) {
  return invoice.billingOwner === "afterlight_platform"
    || invoice.fulfillmentSnapshot?.invoiceRouting === AFTERLIGHT_SERVICE_ROUTING;
}

function afterlightServiceInvoiceScope(extra = {}) {
  return {
    ...extra,
    $or: [
      { billingOwner: "afterlight_platform" },
      { "fulfillmentSnapshot.invoiceRouting": AFTERLIGHT_SERVICE_ROUTING },
    ],
  };
}

module.exports = {
  AFTERLIGHT_SERVICE_ROUTING,
  billingOwnerForFulfillment,
  customerChargeSnapshotForAssignment,
  isAfterlightServiceInvoice,
  afterlightServiceInvoiceScope,
};
