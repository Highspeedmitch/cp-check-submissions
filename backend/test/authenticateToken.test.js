const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
process.env.JWT_SECRET = "test-only-authentication-secret";
const User = require("../models/user");
const ResourceProfile = require("../models/resourceProfile");
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
  const originalResourceFindOne = ResourceProfile.findOne;
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
  ResourceProfile.findOne = () => ({
    select: () => ({ lean: async () => null }),
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
    ResourceProfile.findOne = originalResourceFindOne;
  }
});

test("a dual user can fall back to organization access after resource access is removed", async () => {
  const originalFindById = User.findById;
  const originalResourceFindOne = ResourceProfile.findOne;
  User.findById = () => ({
    select: () => ({
      lean: async () => ({
        _id: "user-1",
        accountStatus: "active",
        accountScope: "organization",
        tokenVersion: 2,
        role: "user",
        organizationId: { toString: () => "org-1" },
      }),
    }),
  });
  ResourceProfile.findOne = () => ({
    select: () => ({ lean: async () => null }),
  });
  const token = jwt.sign(
    { userId: "user-1", tokenVersion: 2, accountScope: "afterlight_resource" },
    process.env.JWT_SECRET
  );
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = {
    status: () => res,
    json: (body) => assert.fail(`unexpected response: ${JSON.stringify(body)}`),
  };

  try {
    await new Promise((resolve) => authenticateToken(req, res, resolve));
    assert.equal(req.user.accountScope, "organization");
    assert.deepEqual(req.user.availableWorkspaces, ["organization"]);
  } finally {
    User.findById = originalFindById;
    ResourceProfile.findOne = originalResourceFindOne;
  }
});

test("an archived organization presence is retained on an authorized resource request", async () => {
  const originalFindById = User.findById;
  const originalResourceFindOne = ResourceProfile.findOne;
  const archivedAt = new Date("2026-08-03T12:00:00.000Z");
  User.findById = () => ({
    select: () => ({
      lean: async () => ({
        _id: "user-1",
        accountStatus: "active",
        accountScope: "organization",
        tokenVersion: 2,
        role: "user",
        organizationId: { toString: () => "org-1" },
        organizationArchivedAt: archivedAt,
      }),
    }),
  });
  ResourceProfile.findOne = () => ({
    select: () => ({ lean: async () => ({ _id: "resource-1" }) }),
  });
  const token = jwt.sign(
    { userId: "user-1", tokenVersion: 2, accountScope: "afterlight_resource" },
    process.env.JWT_SECRET
  );
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = {
    status: () => res,
    json: (body) => assert.fail(`unexpected response: ${JSON.stringify(body)}`),
  };

  try {
    await new Promise((resolve) => authenticateToken(req, res, resolve));
    assert.equal(req.user.accountScope, "afterlight_resource");
    assert.equal(req.user.organizationArchivedAt, archivedAt);
  } finally {
    User.findById = originalFindById;
    ResourceProfile.findOne = originalResourceFindOne;
  }
});
