const OktaJwtVerifier = require("@okta/jwt-verifier");

function oktaConfig(env = process.env) {
  const issuer = String(env.OKTA_ISSUER || "").replace(/\/$/, "");
  const clientIds = String(env.OKTA_CLIENT_IDS || env.OKTA_CLIENT_ID || "")
    .split(",").map((value) => value.trim()).filter(Boolean);
  return { issuer, clientIds, configured: Boolean(issuer && clientIds.length) };
}

function requiresOkta(user, organization, env = process.env) {
  if (!oktaConfig(env).configured) return false;
  return user.platformRole === "platform_admin"
    || user.role === "admin"
    || Boolean(organization?.security?.requireMfaForAllUsers);
}

async function verifyOktaIdentity({ idToken, expectedNonce, env = process.env }) {
  const config = oktaConfig(env);
  if (!config.configured) throw new Error("Okta authentication is not configured.");
  if (!expectedNonce) throw new Error("Okta authentication challenge is missing or expired.");
  const verifier = new OktaJwtVerifier({ issuer: config.issuer });
  let lastError;
  for (const clientId of config.clientIds) {
    try {
      const jwt = await verifier.verifyIdToken(idToken, clientId, expectedNonce);
      return jwt.claims;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Unable to verify Okta identity.");
}

module.exports = { oktaConfig, requiresOkta, verifyOktaIdentity };
