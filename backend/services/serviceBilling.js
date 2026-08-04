const AFTERLIGHT_SERVICE_ROUTING = "afterlight_service_billing";

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
  isAfterlightServiceInvoice,
  afterlightServiceInvoiceScope,
};
