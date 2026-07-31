const crypto = require("crypto");
const OTPAuth = require("otpauth");
const QRCode = require("qrcode");

const CHALLENGE_LIFETIME_MS = 10 * 60 * 1000;
const RECOVERY_CODE_COUNT = 10;

function config(env = process.env) {
  const enabled = String(env.TOTP_MFA_ENABLED || "false").toLowerCase() === "true";
  const encodedKey = String(env.MFA_ENCRYPTION_KEY || "").trim();
  let encryptionKey = null;
  if (encodedKey) {
    if (!/^[A-Za-z0-9+/]{43}=$/.test(encodedKey)) {
      throw new Error("MFA_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
    }
    encryptionKey = Buffer.from(encodedKey, "base64");
    if (encryptionKey.length !== 32) {
      throw new Error("MFA_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
    }
  }
  if (enabled && !encryptionKey) {
    throw new Error("MFA_ENCRYPTION_KEY is required when TOTP_MFA_ENABLED=true.");
  }
  return { enabled, encryptionKey };
}

function requiresTotp(user, organization, env = process.env) {
  if (!config(env).enabled) return false;
  return user.platformRole === "platform_admin"
    || user.role === "admin"
    || Boolean(organization?.security?.requireMfaForAllUsers);
}

function encrypt(value, env = process.env) {
  const { encryptionKey } = config(env);
  if (!encryptionKey) throw new Error("MFA encryption is unavailable.");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((part) => part.toString("base64url")).join(".");
}

function decrypt(value, env = process.env) {
  const { encryptionKey } = config(env);
  if (!encryptionKey) throw new Error("MFA encryption is unavailable.");
  const [iv, tag, ciphertext] = String(value || "").split(".").map((part) =>
    Buffer.from(part || "", "base64url")
  );
  if (iv.length !== 12 || tag.length !== 16 || !ciphertext.length) {
    throw new Error("Invalid encrypted MFA value.");
  }
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

function normalizeCode(value) {
  return String(value || "").replace(/[\s-]/g, "").toUpperCase();
}

function createTotp(email, secret) {
  return new OTPAuth.TOTP({
    issuer: "Afterlight",
    label: String(email || "user").toLowerCase(),
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret,
  });
}

function newTotpEnrollment(email) {
  const secret = new OTPAuth.Secret({ size: 20 });
  const totp = createTotp(email, secret);
  return { secret: secret.base32, uri: totp.toString() };
}

async function enrollmentQrDataUrl(uri) {
  return QRCode.toDataURL(uri, { errorCorrectionLevel: "M", margin: 2, width: 280 });
}

function verifyTotp(
  { encryptedSecret, code, lastUsedCounter = null, now = Date.now() },
  env = process.env
) {
  const token = normalizeCode(code);
  if (!/^\d{6}$/.test(token)) return { valid: false };
  const totp = createTotp("user", decrypt(encryptedSecret, env));
  const delta = totp.validate({ token, timestamp: now, window: 1 });
  if (delta === null) return { valid: false };
  const counter = totp.counter({ timestamp: now }) + delta;
  if (lastUsedCounter !== null && counter <= lastUsedCounter) {
    return { valid: false, replayed: true };
  }
  return { valid: true, counter };
}

function randomChallengeToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function hashChallengeToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function formatRecoveryCode(buffer) {
  const value = buffer.toString("hex").toUpperCase();
  return `AL-${value.slice(0, 5)}-${value.slice(5, 10)}-${value.slice(10, 15)}`;
}

function hashRecoveryCode(code) {
  return crypto.createHash("sha256").update(normalizeCode(code)).digest("hex");
}

function generateRecoveryCodes() {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () =>
    formatRecoveryCode(crypto.randomBytes(8))
  );
  return { codes, hashes: codes.map(hashRecoveryCode) };
}

module.exports = {
  CHALLENGE_LIFETIME_MS,
  config,
  requiresTotp,
  encrypt,
  decrypt,
  normalizeCode,
  newTotpEnrollment,
  enrollmentQrDataUrl,
  verifyTotp,
  randomChallengeToken,
  hashChallengeToken,
  hashRecoveryCode,
  generateRecoveryCodes,
};
