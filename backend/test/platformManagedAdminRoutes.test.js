const test = require("node:test");
const assert = require("node:assert/strict");
const organizationSecurity = require("../Routes/organizationSecurity");
const bulkOnboarding = require("../Routes/bulkOnboarding");

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function platformUser(administrationMode) {
  return {
    role: "admin",
    platformRole: "platform_admin",
    assumedOrganization: true,
    organizationAdministrationMode: administrationMode,
  };
}

test("only platform-managed Admin View reaches the delegated grant endpoint", () => {
  const middleware = organizationSecurity.stack[0].handle;
  let continued = false;
  middleware({
    method: "POST",
    path: "/grants",
    user: platformUser("platform_managed"),
  }, responseRecorder(), () => { continued = true; });
  assert.equal(continued, true);

  const res = responseRecorder();
  middleware({
    method: "POST",
    path: "/grants",
    user: platformUser("customer_managed"),
  }, res, () => assert.fail("customer-managed assumed access must stay blocked"));
  assert.equal(res.statusCode, 403);
});

test("bulk onboarding remains blocked in customer-managed assumed access", () => {
  const middleware = bulkOnboarding.stack[0].handle;
  let continued = false;
  middleware({ user: platformUser("platform_managed") }, responseRecorder(), () => {
    continued = true;
  });
  assert.equal(continued, true);

  const res = responseRecorder();
  middleware({ user: platformUser("customer_managed") }, res, () => {
    assert.fail("customer-managed assumed access must stay blocked");
  });
  assert.equal(res.statusCode, 403);
});
