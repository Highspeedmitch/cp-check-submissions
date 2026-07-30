const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const AdminActionGrant = require("../models/adminActionGrant");

const GRANT_LIFETIME_MS = 5 * 60 * 1000;

function hashGrant(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function passkeyMatches(organization, passkey, purpose) {
  const hash = organization.security?.adminActionPasskeyHash;
  if (hash) return bcrypt.compare(passkey, hash);

  const legacy = purpose === "remove_property"
    ? process.env.REMOVE_PROPERTY_PASSKEY
    : process.env.ADD_PROPERTY_PASSKEY;
  if (!legacy) return false;
  const supplied = Buffer.from(String(passkey));
  const expected = Buffer.from(String(legacy));
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

async function issueGrant({
  organization,
  userId,
  purpose,
  passkey,
  GrantModel = AdminActionGrant,
}) {
  if (!await passkeyMatches(organization, passkey, purpose)) return null;
  const token = crypto.randomBytes(48).toString("base64url");
  await GrantModel.create({
    organizationId: organization._id,
    userId,
    tokenHash: hashGrant(token),
    purpose,
    passkeyVersion: organization.security?.adminActionPasskeyVersion || 0,
    expiresAt: new Date(Date.now() + GRANT_LIFETIME_MS),
  });
  return token;
}

async function consumeGrant({
  organization,
  userId,
  purpose,
  token,
  GrantModel = AdminActionGrant,
}) {
  if (!token) return false;
  const grant = await GrantModel.findOneAndUpdate({
    organizationId: organization._id,
    userId,
    purpose,
    tokenHash: hashGrant(token),
    passkeyVersion: organization.security?.adminActionPasskeyVersion || 0,
    consumedAt: null,
    expiresAt: { $gt: new Date() },
  }, { $set: { consumedAt: new Date() } }, { new: true });
  return Boolean(grant);
}

module.exports = { GRANT_LIFETIME_MS, issueGrant, consumeGrant };
