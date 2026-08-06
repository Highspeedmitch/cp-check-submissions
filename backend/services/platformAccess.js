const jwt = require("jsonwebtoken");

const ASSUMED_ACCESS_LIFETIME = "30m";
const ASSUMED_ACCESS_MS = 30 * 60 * 1000;
const STEP_UP_AUTHENTICATION_MS = 15 * 60 * 1000;
const AUTHENTICATION_CLOCK_SKEW_MS = 60 * 1000;

function hasRecentStepUpAuthentication(authenticatedAt, now = Date.now()) {
  const authenticationTime = new Date(authenticatedAt || 0).getTime();
  return Boolean(
    authenticationTime
    && authenticationTime <= now + AUTHENTICATION_CLOCK_SKEW_MS
    && now - authenticationTime <= STEP_UP_AUTHENTICATION_MS
  );
}

function assumedAccessPayload({ user, organization, platformSessionId }) {
  return {
    email: user.email,
    userId: user._id,
    tokenVersion: user.tokenVersion || 0,
    role: "admin",
    organizationId: organization._id,
    orgType: organization.orgType,
    platformRole: "platform_admin",
    accountScope: "organization",
    availableWorkspaces: ["organization"],
    assumedOrganization: true,
    platformSessionId,
  };
}

function createAssumedAccessResponse({ user, organization, platformSessionId, secretKey }) {
  const payload = assumedAccessPayload({ user, organization, platformSessionId });
  return {
    token: jwt.sign(payload, secretKey, { expiresIn: ASSUMED_ACCESS_LIFETIME }),
    organizationId: organization._id,
    orgName: organization.name,
    orgType: organization.orgType,
    role: "admin",
    platformRole: "platform_admin",
    accountScope: "organization",
    availableWorkspaces: ["organization"],
    assumedOrganization: true,
    platformSessionId,
  };
}

module.exports = {
  ASSUMED_ACCESS_LIFETIME,
  ASSUMED_ACCESS_MS,
  STEP_UP_AUTHENTICATION_MS,
  hasRecentStepUpAuthentication,
  assumedAccessPayload,
  createAssumedAccessResponse,
};
