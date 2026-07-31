const test = require("node:test");
const assert = require("node:assert/strict");
const OTPAuth = require("otpauth");
const {
  config,
  requiresTotp,
  encrypt,
  decrypt,
  newTotpEnrollment,
  verifyTotp,
  generateRecoveryCodes,
  hashRecoveryCode,
} = require("../services/totpMfa");

const mfaEnv = {
  TOTP_MFA_ENABLED: "true",
  MFA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
};

test("TOTP MFA requires a valid encryption key when enabled", () => {
  assert.throws(
    () => config({ TOTP_MFA_ENABLED: "true" }),
    /MFA_ENCRYPTION_KEY is required/
  );
  assert.throws(
    () => config({ TOTP_MFA_ENABLED: "true", MFA_ENCRYPTION_KEY: "invalid" }),
    /base64-encoded 32-byte key/
  );
});

test("MFA secrets are encrypted and authenticated", () => {
  const encrypted = encrypt("JBSWY3DPEHPK3PXP", mfaEnv);
  assert.notEqual(encrypted, "JBSWY3DPEHPK3PXP");
  assert.equal(decrypt(encrypted, mfaEnv), "JBSWY3DPEHPK3PXP");
  const parts = encrypted.split(".");
  parts[2] = `${parts[2][0] === "A" ? "B" : "A"}${parts[2].slice(1)}`;
  assert.throws(() => decrypt(parts.join("."), mfaEnv));
});

test("administrators always require TOTP while organization policy controls other users", () => {
  assert.equal(requiresTotp({ role: "admin" }, {}, mfaEnv), true);
  assert.equal(requiresTotp({ platformRole: "platform_admin", role: "user" }, {}, mfaEnv), true);
  assert.equal(requiresTotp(
    { role: "property_manager" },
    { security: { requireMfaForAllUsers: true } },
    mfaEnv
  ), true);
  assert.equal(requiresTotp(
    { role: "property_manager" },
    { security: { requireMfaForAllUsers: true } },
    { ...mfaEnv, TOTP_MFA_ENABLED: "false" }
  ), false);
});

test("valid TOTP codes verify once within their time step", () => {
  const now = 1_800_000_000_000;
  const enrollment = newTotpEnrollment("admin@example.com");
  const totp = new OTPAuth.TOTP({
    issuer: "Afterlight",
    label: "admin@example.com",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: enrollment.secret,
  });
  const encryptedSecret = encrypt(enrollment.secret, mfaEnv);
  const code = totp.generate({ timestamp: now });
  const first = verifyTotp({ encryptedSecret, code, now }, mfaEnv);
  assert.equal(first.valid, true);
  const replay = verifyTotp({ encryptedSecret, code, now, lastUsedCounter: first.counter }, mfaEnv);
  assert.equal(replay.valid, false);
  assert.equal(replay.replayed, true);
});

test("recovery codes are unique, formatted, and normalized before hashing", () => {
  const recovery = generateRecoveryCodes();
  assert.equal(recovery.codes.length, 10);
  assert.equal(new Set(recovery.codes).size, 10);
  assert.match(recovery.codes[0], /^AL-[A-F0-9]{5}-[A-F0-9]{5}-[A-F0-9]{5}$/);
  assert.equal(
    hashRecoveryCode(recovery.codes[0]),
    hashRecoveryCode(recovery.codes[0].toLowerCase().replaceAll("-", " "))
  );
});
