const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const {
  REFRESH_SESSION_DAYS,
  hashToken,
  cookieSettings,
  authResponse,
  createRefreshSession,
  updateRefreshSessionMfa,
} = require("../services/authSessions");

function userFixture() {
  return {
    _id: "507f1f77bcf86cd799439011",
    email: "user@example.com",
    role: "user",
    tokenVersion: 3,
    organizationId: {
      _id: "507f191e810c19729de860ea",
      name: "PICOR",
      orgType: "COM",
    },
  };
}

test("access tokens expire in approximately two hours", () => {
  const response = authResponse(userFixture(), "test-secret");
  const payload = jwt.verify(response.token, "test-secret");
  assert.equal(payload.tokenVersion, 3);
  assert.ok(payload.exp - payload.iat >= 7199);
  assert.ok(payload.exp - payload.iat <= 7200);
  assert.deepEqual(response.availableWorkspaces, ["organization"]);
});

test("authentication can issue a resource token while retaining both workspace choices", () => {
  const response = authResponse(userFixture(), "test-secret", {
    accountScope: "afterlight_resource",
    availableWorkspaces: ["organization", "afterlight_resource"],
  });
  const payload = jwt.verify(response.token, "test-secret");
  assert.equal(payload.accountScope, "afterlight_resource");
  assert.deepEqual(payload.availableWorkspaces, ["organization", "afterlight_resource"]);
  assert.deepEqual(response.availableWorkspaces, ["organization", "afterlight_resource"]);
});

test("normal authentication retains platform privilege without assuming an organization", () => {
  const user = { ...userFixture(), platformRole: "platform_admin" };
  const response = authResponse(user, "test-secret");
  const payload = jwt.verify(response.token, "test-secret");
  assert.equal(response.platformRole, "platform_admin");
  assert.equal(response.assumedOrganization, false);
  assert.equal(payload.platformRole, "platform_admin");
  assert.equal(payload.assumedOrganization, undefined);
});

test("MFA authentication time is carried in access tokens and refresh sessions", async () => {
  const mfaAuthenticatedAt = new Date("2026-07-30T12:00:00.000Z");
  const response = authResponse(userFixture(), "test-secret", { mfaAuthenticatedAt });
  const payload = jwt.verify(response.token, "test-secret");
  assert.equal(payload.mfaAuthenticatedAt, mfaAuthenticatedAt.toISOString());

  let saved;
  await createRefreshSession({
    user: userFixture(),
    req: { get: () => "test-agent", ip: "127.0.0.1" },
    res: { cookie: () => {} },
    mfaAuthenticatedAt,
    accountScope: "afterlight_resource",
    model: { create: async (record) => { saved = record; } },
  });
  assert.equal(saved.mfaAuthenticatedAt, mfaAuthenticatedAt);
  assert.equal(saved.accountScope, "afterlight_resource");
});

test("refresh cookies are HTTP-only and use production cross-site protections", () => {
  const previousRender = process.env.RENDER;
  process.env.RENDER = "true";
  const settings = cookieSettings(new Date(Date.now() + 1000));
  assert.equal(settings.httpOnly, true);
  assert.equal(settings.secure, true);
  assert.equal(settings.sameSite, "none");
  assert.equal(settings.path, "/api");
  if (previousRender === undefined) delete process.env.RENDER;
  else process.env.RENDER = previousRender;
});

test("new refresh sessions use a hashed token and a 90-day absolute expiry", async () => {
  let saved;
  let cookie;
  const startedAt = Date.now();
  await createRefreshSession({
    user: userFixture(),
    req: { get: () => "test-agent", ip: "127.0.0.1" },
    res: { cookie: (name, value, settings) => { cookie = { name, value, settings }; } },
    model: { create: async (record) => { saved = record; } },
  });
  const expectedMs = REFRESH_SESSION_DAYS * 24 * 60 * 60 * 1000;
  assert.equal(saved.tokenHash, hashToken(cookie.value));
  assert.notEqual(saved.tokenHash, cookie.value);
  assert.ok(saved.expiresAt.getTime() - startedAt >= expectedMs - 1000);
  assert.ok(saved.expiresAt.getTime() - startedAt <= expectedMs + 1000);
  assert.equal(cookie.settings.httpOnly, true);
});

test("step-up verification renews MFA freshness on the active refresh session", async () => {
  let operation;
  const now = new Date("2026-08-04T18:00:00.000Z");
  const mfaAuthenticatedAt = new Date("2026-08-04T17:59:58.000Z");
  const result = await updateRefreshSessionMfa({
    refreshToken: "active-refresh-token",
    userId: userFixture()._id,
    tokenVersion: 3,
    mfaAuthenticatedAt,
    now,
    model: {
      findOneAndUpdate: async (filter, update, options) => {
        operation = { filter, update, options };
        return { _id: "session-1", ...update.$set };
      },
    },
  });

  assert.equal(operation.filter.tokenHash, hashToken("active-refresh-token"));
  assert.equal(operation.filter.userId, userFixture()._id);
  assert.equal(operation.filter.tokenVersion, 3);
  assert.equal(operation.filter.revokedAt, null);
  assert.deepEqual(operation.filter.expiresAt, { $gt: now });
  assert.deepEqual(operation.update, { $set: { mfaAuthenticatedAt, lastUsedAt: now } });
  assert.deepEqual(operation.options, { new: true });
  assert.equal(result.mfaAuthenticatedAt, mfaAuthenticatedAt);
});

test("MFA freshness cannot be renewed without a refresh cookie", async () => {
  const result = await updateRefreshSessionMfa({
    refreshToken: "",
    userId: userFixture()._id,
    tokenVersion: 3,
    mfaAuthenticatedAt: new Date(),
    model: { findOneAndUpdate: async () => { throw new Error("should not run"); } },
  });
  assert.equal(result, null);
});
