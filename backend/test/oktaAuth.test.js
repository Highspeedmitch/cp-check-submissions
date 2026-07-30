const test = require("node:test");
const assert = require("node:assert/strict");
const { oktaConfig, requiresOkta } = require("../services/oktaAuth");

const configured = {
  OKTA_ISSUER: "https://example.okta.com/oauth2/default/",
  OKTA_CLIENT_IDS: "web-client, native-client",
};

test("Okta configuration normalizes the issuer and client list", () => {
  assert.deepEqual(oktaConfig(configured), {
    issuer: "https://example.okta.com/oauth2/default",
    clientIds: ["web-client", "native-client"],
    configured: true,
  });
});

test("platform and organization administrators always require Okta when configured", () => {
  assert.equal(requiresOkta({ platformRole: "platform_admin", role: "user" }, {}, configured), true);
  assert.equal(requiresOkta({ role: "admin" }, {}, configured), true);
});

test("organization policy controls non-admin Okta enforcement", () => {
  assert.equal(requiresOkta({ role: "property_manager" }, {
    security: { requireMfaForAllUsers: true },
  }, configured), true);
  assert.equal(requiresOkta({ role: "property_manager" }, {
    security: { requireMfaForAllUsers: false },
  }, configured), false);
});

test("Okta enforcement remains off until deployment configuration is complete", () => {
  assert.equal(requiresOkta({ role: "admin" }, {}, {}), false);
});
