const test = require("node:test");
const assert = require("node:assert/strict");
const {
  resolveBillingAddress,
  resolvePhysicalAddress,
} = require("../services/propertyAddresses");

test("billing reads retain the legacy commercial address fallback", () => {
  assert.equal(resolveBillingAddress({
    streetAddress: "5151 E Broadway Blvd",
    suite: "#115",
    city: "Tucson",
    state: "AZ",
    zip: "85711",
  }), "5151 E Broadway Blvd, #115, Tucson, AZ, 85711");
});

test("an explicit billing address takes priority over the legacy address", () => {
  assert.equal(resolveBillingAddress({
    billingAddress: "Central AP Office",
    streetAddress: "Legacy AP Office",
  }), "Central AP Office");
});

test("physical address never falls back to billing or legacy address data", () => {
  assert.equal(resolvePhysicalAddress({
    billingAddress: "Central AP Office",
    streetAddress: "Legacy AP Office",
  }), "");
  assert.equal(resolvePhysicalAddress({
    physicalAddress: "Subject Property",
    billingAddress: "Central AP Office",
  }), "Subject Property");
});
