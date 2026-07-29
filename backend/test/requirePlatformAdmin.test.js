const test = require("node:test");
const assert = require("node:assert/strict");
const requirePlatformAdmin = require("../middleware/requirePlatformAdmin");

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test("platform routes reject ordinary and assumed organization users", () => {
  for (const user of [
    { role: "admin", platformRole: null },
    { role: "admin", platformRole: "platform_admin", assumedOrganization: true },
  ]) {
    const res = response();
    requirePlatformAdmin({ user }, res, () => assert.fail("must not continue"));
    assert.equal(res.statusCode, 403);
  }
});

test("platform routes accept a platform administrator in platform context", () => {
  let continued = false;
  requirePlatformAdmin({
    user: { platformRole: "platform_admin", assumedOrganization: false },
  }, response(), () => { continued = true; });
  assert.equal(continued, true);
});
