const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
process.env.JWT_SECRET = "test-only-authentication-secret";
const User = require("../models/user");
const authenticateToken = require("../middleware/authenticateToken");

test("rejects a request without an authorization token", () => {
  const req = { headers: {} };
  let response;
  const res = {
    status(statusCode) {
      response = { statusCode };
      return this;
    },
    json(body) {
      response.body = body;
      return this;
    },
  };

  authenticateToken(req, res, () => assert.fail("next should not be called"));

  assert.deepEqual(response, {
    statusCode: 401,
    body: { message: "Access denied. No token provided." },
  });
});

test("accepts an active user when the token version matches", async () => {
  const originalFindById = User.findById;
  User.findById = () => ({
    select: () => ({
      lean: async () => ({
        accountStatus: "active",
        tokenVersion: 2,
        role: "property_manager",
        organizationId: { toString: () => "org-1" },
      }),
    }),
  });
  const token = jwt.sign(
    { userId: "user-1", tokenVersion: 2 },
    process.env.JWT_SECRET
  );
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = {
    status: () => res,
    json: (body) => assert.fail(`unexpected response: ${JSON.stringify(body)}`),
  };

  try {
    await new Promise((resolve) => authenticateToken(req, res, resolve));
    assert.equal(req.user.role, "property_manager");
    assert.equal(req.user.organizationId, "org-1");
  } finally {
    User.findById = originalFindById;
  }
});
