function resolveBillingAddress(property = {}) {
  const billingAddress = String(property.billingAddress || "").trim();
  if (billingAddress) return billingAddress;

  return [
    property.streetAddress,
    property.suite,
    property.city,
    property.state,
    property.zip,
  ].map((part) => String(part || "").trim()).filter(Boolean).join(", ");
}

function resolvePhysicalAddress(property = {}) {
  return String(property.physicalAddress || "").trim();
}

module.exports = { resolveBillingAddress, resolvePhysicalAddress };
