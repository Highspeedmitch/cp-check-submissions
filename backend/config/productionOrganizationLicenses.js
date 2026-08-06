const CONFIGURATION_VERSION = "2026-08-06-production-license-dispositions-v1";
const HISTORICAL_ACCESS_RETIREMENT_VERSION = "2026-08-06-historical-access-retirement-v2";

const organizations = Object.freeze([
  Object.freeze({
    name: "Picor",
    disposition: "licensed",
    serviceModel: "managed",
    tier: null,
  }),
  Object.freeze({ name: "AzRoots", disposition: "historical" }),
  Object.freeze({ name: "HSLD", disposition: "historical" }),
  Object.freeze({ name: "Breezykeyzy", disposition: "historical" }),
]);

module.exports = Object.freeze({
  version: CONFIGURATION_VERSION,
  historicalAccessRetirementVersion: HISTORICAL_ACCESS_RETIREMENT_VERSION,
  organizations,
});
