const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const RefreshSession = require("../models/refreshSession");

const ACCESS_TOKEN_LIFETIME = "2h";
const REFRESH_SESSION_DAYS = 90;
const REFRESH_COOKIE = "ig_refresh";

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function newRefreshToken() {
  return crypto.randomBytes(48).toString("base64url");
}

function cookieSettings(expiresAt) {
  const secure = process.env.NODE_ENV === "production" || Boolean(process.env.RENDER);
  return {
    httpOnly: true,
    secure,
    sameSite: secure ? "none" : "lax",
    path: "/api",
    expires: expiresAt,
  };
}

function clearRefreshCookie(res) {
  const settings = cookieSettings(new Date(0));
  delete settings.expires;
  res.clearCookie(REFRESH_COOKIE, settings);
}

function accessTokenPayload(user, authentication = {}) {
  const organization = user.organizationId;
  const accountScope = authentication.accountScope || user.accountScope || "organization";
  return {
    email: user.email,
    organizationId: organization._id,
    role: user.role,
    platformRole: user.platformRole || null,
    userId: user._id,
    tokenVersion: user.tokenVersion || 0,
    orgType: organization.orgType,
    accountScope,
    availableWorkspaces: authentication.availableWorkspaces || [accountScope],
    ...(authentication.mfaAuthenticatedAt
      ? { mfaAuthenticatedAt: authentication.mfaAuthenticatedAt }
      : {}),
  };
}

function authResponse(user, secretKey, authentication = {}) {
  const payload = accessTokenPayload(user, authentication);
  return {
    token: jwt.sign(payload, secretKey, { expiresIn: ACCESS_TOKEN_LIFETIME }),
    organizationId: payload.organizationId,
    orgName: user.organizationId.name,
    orgType: payload.orgType,
    role: payload.role,
    platformRole: payload.platformRole,
    accountScope: payload.accountScope,
    availableWorkspaces: payload.availableWorkspaces,
    assumedOrganization: false,
  };
}

async function createRefreshSession({
  user, req, res, expiresAt, mfaAuthenticatedAt, accountScope, model = RefreshSession,
}) {
  const token = newRefreshToken();
  const absoluteExpiry = expiresAt || new Date(
    Date.now() + REFRESH_SESSION_DAYS * 24 * 60 * 60 * 1000
  );
  await model.create({
    userId: user._id,
    organizationId: user.organizationId._id,
    tokenHash: hashToken(token),
    tokenVersion: user.tokenVersion || 0,
    accountScope: accountScope || user.accountScope || "organization",
    expiresAt: absoluteExpiry,
    userAgent: req.get?.("user-agent") || "",
    ipAddress: req.ip || "",
    mfaAuthenticatedAt: mfaAuthenticatedAt || null,
  });
  res.cookie(REFRESH_COOKIE, token, cookieSettings(absoluteExpiry));
  return absoluteExpiry;
}

async function revokeRefreshToken(token, model = RefreshSession) {
  if (!token) return;
  await model.updateOne(
    { tokenHash: hashToken(token), revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
}

async function revokeUserSessions(userId, model = RefreshSession) {
  await model.updateMany(
    { userId, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
}

module.exports = {
  ACCESS_TOKEN_LIFETIME,
  REFRESH_SESSION_DAYS,
  REFRESH_COOKIE,
  hashToken,
  cookieSettings,
  clearRefreshCookie,
  authResponse,
  createRefreshSession,
  revokeRefreshToken,
  revokeUserSessions,
};
