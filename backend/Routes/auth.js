const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { getJwtSecret } = require("../config/security");
const Organization = require("../models/organization");
const User = require("../models/user");
const UserAudit = require("../models/userAudit");
const RefreshSession = require("../models/refreshSession");
const MfaChallenge = require("../models/mfaChallenge");
const authenticateToken = require("../middleware/authenticateToken");
const { sendSystemEmail } = require("../services/systemEmail");
const {
  loginLimiter,
  mfaLimiter,
  accountRecoveryLimiter,
  registrationLimiter,
} = require("../middleware/rateLimits");
const {
  REFRESH_COOKIE,
  hashToken,
  cookieSettings,
  clearRefreshCookie,
  authResponse,
  createRefreshSession,
  updateRefreshSessionMfa,
  revokeRefreshToken,
  revokeUserSessions,
} = require("../services/authSessions");
const {
  getAllowedFrontendOrigins,
  buildFrontendUrl,
} = require("../utils/frontendUrls");
const { oktaConfig, requiresOkta, verifyOktaIdentity } = require("../services/oktaAuth");
const { workspaceAuthentication } = require("../services/workspaceAccess");
const {
  CHALLENGE_LIFETIME_MS,
  requiresTotp,
  encrypt: encryptMfaValue,
  newTotpEnrollment,
  enrollmentQrDataUrl,
  verifyTotp,
  randomChallengeToken,
  hashChallengeToken,
  hashRecoveryCode,
  generateRecoveryCodes,
} = require("../services/totpMfa");

const router = express.Router();
const OKTA_NONCE_COOKIE = "ig_okta_nonce";
const INVALID_LOGIN_MESSAGE = "The email or password you entered is incorrect.";
const PASSWORD_RESET_REQUEST_MESSAGE = "If the email matches an account, password reset instructions will be sent.";
const INVALID_LOGIN_PASSWORD_HASH = "$2a$10$3fudv7Bzqvmo7wcDwXrYhuI/mmyj8y1PA4aZEb7YcPfcgxhSUUYW6";
const allowedOrigins = getAllowedFrontendOrigins();

function requireTrustedSessionOrigin(req, res, next) {
  const origin = req.get("origin");
  if (origin && !allowedOrigins.includes(origin)) {
    return res.status(403).json({ message: "Untrusted session origin." });
  }
  return next();
}

function oktaNonceCookieSettings() {
  const secure = process.env.NODE_ENV === "production" || Boolean(process.env.RENDER);
  return {
    httpOnly: true,
    secure,
    sameSite: secure ? "none" : "lax",
    path: "/api/auth/okta",
    maxAge: 10 * 60 * 1000,
  };
}

function clearOktaNonceCookie(res) {
  const settings = oktaNonceCookieSettings();
  delete settings.maxAge;
  res.clearCookie(OKTA_NONCE_COOKIE, settings);
}

async function activeMfaChallenge(challengeToken, purpose) {
  return MfaChallenge.findOne({
    tokenHash: hashChallengeToken(challengeToken),
    purpose,
    consumedAt: null,
    expiresAt: { $gt: new Date() },
    attempts: { $lt: 8 },
  }).select("+pendingSecretEncrypted");
}

async function finishMfaLogin({ user, req, res }) {
  const mfaAuthenticatedAt = new Date();
  const workspace = await workspaceAuthentication(user);
  await createRefreshSession({
    user,
    req,
    res,
    mfaAuthenticatedAt,
    accountScope: workspace.accountScope,
  });
  return res.json({
    message: "Login successful",
    ...authResponse(user, getJwtSecret(), { mfaAuthenticatedAt, ...workspace }),
  });
}

router.post("/register", registrationLimiter, async (req, res) => {
  if (String(process.env.INVITE_ONLY_REGISTRATION || "true").toLowerCase() !== "false") {
    return res.status(410).json({
      code: "INVITATION_REQUIRED",
      message: "Registration requires an invitation from an Afterlight administrator.",
    });
  }
  try {
    const { organizationName, username, email, password, adminPasskey } = req.body;
    const hashedPassword = bcrypt.hashSync(password, 10);
    const org = await Organization.findOne({ name: organizationName });
    if (!org) {
      return res.status(400).json({
        message: "Organization name not recognized. Please check the spelling of your Organization and register again.",
      });
    }
    if (!org.orgType) {
      return res.status(500).json({ message: "Organization type not found for this organization." });
    }
    let role = "user";
    if (adminPasskey) {
      if (adminPasskey === process.env.ADMIN_PASSKEY) role = "admin";
      else return res.status(400).json({ message: "Invalid admin passkey." });
    }
    await User.create({
      username,
      email,
      password: hashedPassword,
      organizationId: org._id,
      role,
    });
    return res.status(201).json({
      message: "User registered under organization successfully!",
      organizationId: org._id,
      orgName: org.name,
      orgType: org.orgType,
      role,
    });
  } catch (error) {
    console.error("Error registering organization/user:", error);
    return res.status(500).json({ message: "Error registering organization/user." });
  }
});

router.post("/login", loginLimiter, requireTrustedSessionOrigin, async (req, res) => {
  try {
    const normalizedEmail = String(req.body.email || "").trim().toLowerCase();
    const suppliedPassword = String(req.body.password || "");
    const user = await User.findOne({ email: normalizedEmail }).populate("organizationId");
    if (!user) {
      await bcrypt.compare(suppliedPassword, INVALID_LOGIN_PASSWORD_HASH);
      return res.status(401).json({ message: INVALID_LOGIN_MESSAGE });
    }
    if (!await bcrypt.compare(suppliedPassword, user.password)) {
      return res.status(401).json({ message: INVALID_LOGIN_MESSAGE });
    }
    if (user.accountStatus === "inactive") {
      return res.status(403).json({
        message: "This account is currently unavailable. Contact your organization administrator.",
      });
    }
    if (!user.organizationId) {
      return res.status(500).json({ message: "Organization not found for user" });
    }
    if (!user.organizationId.orgType) {
      return res.status(500).json({ message: "Organization type not found for this organization." });
    }
    const workspace = await workspaceAuthentication(user);
    if (requiresTotp(user, user.organizationId)) {
      const challengeToken = randomChallengeToken();
      const enrollmentRequired = !user.mfa?.totpEnabled;
      await MfaChallenge.create({
        userId: user._id,
        organizationId: user.organizationId._id,
        tokenHash: hashChallengeToken(challengeToken),
        purpose: enrollmentRequired ? "enrollment" : "login",
        expiresAt: new Date(Date.now() + CHALLENGE_LIFETIME_MS),
      });
      return res.status(202).json({
        code: enrollmentRequired ? "MFA_ENROLLMENT_REQUIRED" : "MFA_REQUIRED",
        message: enrollmentRequired
          ? "Set up an authenticator to continue."
          : "Enter the code from your authenticator app.",
        challengeToken,
        expiresInSeconds: Math.floor(CHALLENGE_LIFETIME_MS / 1000),
      });
    }
    if (requiresOkta(user, user.organizationId)) {
      const config = oktaConfig();
      return res.status(428).json({
        code: "OKTA_REQUIRED",
        message: "Complete secure sign-in with Okta.",
        okta: { issuer: config.issuer, clientId: config.clientIds[0] },
      });
    }
    const authentication = authResponse(user, getJwtSecret(), workspace);
    await createRefreshSession({ user, req, res, accountScope: workspace.accountScope });
    return res.json({ message: "Login successful", ...authentication });
  } catch (error) {
    console.error("Login processing error:", error?.code || error?.name || "unknown_error");
    if (error.status === 403) {
      return res.status(403).json({
        message: "This account does not currently have an available workspace. Contact an administrator.",
      });
    }
    return res.status(500).json({ message: "Unable to sign in right now. Please try again." });
  }
});

router.post("/auth/mfa/enrollment/start", mfaLimiter, requireTrustedSessionOrigin, async (req, res) => {
  try {
    const challenge = await activeMfaChallenge(String(req.body.challengeToken || ""), "enrollment");
    if (!challenge) return res.status(401).json({ message: "MFA enrollment expired. Sign in again." });
    const user = await User.findById(challenge.userId).select("email accountStatus");
    if (!user || user.accountStatus === "inactive") {
      return res.status(403).json({ message: "Account is unavailable." });
    }
    const enrollment = newTotpEnrollment(user.email);
    challenge.pendingSecretEncrypted = encryptMfaValue(enrollment.secret);
    await challenge.save();
    return res.json({
      qrCodeDataUrl: await enrollmentQrDataUrl(enrollment.uri),
      manualKey: enrollment.secret.match(/.{1,4}/g).join(" "),
      issuer: "Afterlight",
      accountName: user.email,
    });
  } catch (error) {
    console.error("MFA enrollment start error:", error.message);
    return res.status(500).json({ message: "Unable to start MFA enrollment." });
  }
});

router.post("/auth/mfa/enrollment/confirm", mfaLimiter, requireTrustedSessionOrigin, async (req, res) => {
  try {
    const challenge = await activeMfaChallenge(String(req.body.challengeToken || ""), "enrollment");
    if (!challenge?.pendingSecretEncrypted) {
      return res.status(401).json({ message: "MFA enrollment expired. Sign in again." });
    }
    const verification = verifyTotp({
      encryptedSecret: challenge.pendingSecretEncrypted,
      code: req.body.code,
    });
    if (!verification.valid) {
      challenge.attempts += 1;
      await challenge.save();
      return res.status(401).json({ message: "Invalid authenticator code." });
    }
    const consumed = await MfaChallenge.findOneAndUpdate(
      { _id: challenge._id, consumedAt: null },
      { $set: { consumedAt: new Date() } },
      { new: true }
    );
    if (!consumed) return res.status(401).json({ message: "MFA enrollment was already completed." });
    const recovery = generateRecoveryCodes();
    const user = await User.findOneAndUpdate(
      { _id: challenge.userId, accountStatus: { $ne: "inactive" } },
      { $set: {
        "mfa.totpEnabled": true,
        "mfa.totpSecretEncrypted": challenge.pendingSecretEncrypted,
        "mfa.enrolledAt": new Date(),
        "mfa.lastVerifiedAt": new Date(),
        "mfa.lastUsedCounter": verification.counter,
        "mfa.recoveryCodeHashes": recovery.hashes,
      } },
      { new: true }
    ).populate("organizationId");
    if (!user?.organizationId) return res.status(403).json({ message: "Account is unavailable." });
    await UserAudit.create({
      organizationId: user.organizationId._id,
      targetUserId: user._id,
      changedBy: user._id,
      action: "totp_mfa_enrolled",
      changes: { recoveryCodeCount: recovery.codes.length },
    });
    const mfaAuthenticatedAt = new Date();
    const workspace = await workspaceAuthentication(user);
    await createRefreshSession({
      user,
      req,
      res,
      mfaAuthenticatedAt,
      accountScope: workspace.accountScope,
    });
    return res.json({
      message: "MFA enrollment complete.",
      recoveryCodes: recovery.codes,
      ...authResponse(user, getJwtSecret(), { mfaAuthenticatedAt, ...workspace }),
    });
  } catch (error) {
    console.error("MFA enrollment confirmation error:", error.message);
    return res.status(500).json({ message: "Unable to complete MFA enrollment." });
  }
});

router.post("/auth/mfa/verify", mfaLimiter, requireTrustedSessionOrigin, async (req, res) => {
  try {
    const challenge = await activeMfaChallenge(String(req.body.challengeToken || ""), "login");
    if (!challenge) return res.status(401).json({ message: "MFA verification expired. Sign in again." });
    const user = await User.findOne({
      _id: challenge.userId,
      accountStatus: { $ne: "inactive" },
    }).select("+mfa.totpSecretEncrypted +mfa.recoveryCodeHashes").populate("organizationId");
    if (!user?.organizationId || !user.mfa?.totpEnabled) {
      return res.status(403).json({ message: "MFA is not available for this account." });
    }
    const supplied = String(req.body.code || "");
    const recoveryHash = hashRecoveryCode(supplied);
    const recoveryIndex = user.mfa.recoveryCodeHashes.indexOf(recoveryHash);
    let update;
    const userFilter = { _id: user._id };
    let usedRecoveryCode = false;
    if (recoveryIndex >= 0) {
      usedRecoveryCode = true;
      userFilter["mfa.recoveryCodeHashes"] = recoveryHash;
      update = {
        $pull: { "mfa.recoveryCodeHashes": recoveryHash },
        $set: { "mfa.lastVerifiedAt": new Date() },
      };
    } else {
      const verification = verifyTotp({
        encryptedSecret: user.mfa.totpSecretEncrypted,
        code: supplied,
        lastUsedCounter: user.mfa.lastUsedCounter,
      });
      if (!verification.valid) {
        challenge.attempts += 1;
        await challenge.save();
        return res.status(401).json({ message: "Invalid authenticator or recovery code." });
      }
      update = { $set: {
        "mfa.lastVerifiedAt": new Date(),
        "mfa.lastUsedCounter": verification.counter,
      } };
      userFilter.$or = [
        { "mfa.lastUsedCounter": null },
        { "mfa.lastUsedCounter": { $lt: verification.counter } },
      ];
    }
    const userUpdate = await User.updateOne(userFilter, update);
    if (!userUpdate.modifiedCount) {
      return res.status(401).json({ message: "That MFA code was already used." });
    }
    const consumed = await MfaChallenge.findOneAndUpdate(
      { _id: challenge._id, consumedAt: null },
      { $set: { consumedAt: new Date() } },
      { new: true }
    );
    if (!consumed) return res.status(401).json({ message: "MFA challenge was already used." });
    if (usedRecoveryCode) {
      await UserAudit.create({
        organizationId: user.organizationId._id,
        targetUserId: user._id,
        changedBy: user._id,
        action: "totp_recovery_code_used",
        changes: { remaining: user.mfa.recoveryCodeHashes.length - 1 },
      });
    }
    return finishMfaLogin({ user, req, res });
  } catch (error) {
    console.error("MFA verification error:", error.message);
    return res.status(500).json({ message: "Unable to verify MFA." });
  }
});

router.post(
  "/auth/mfa/step-up/challenge",
  mfaLimiter,
  requireTrustedSessionOrigin,
  authenticateToken,
  async (req, res) => {
    try {
      const user = await User.findOne({
        _id: req.user.userId,
        accountStatus: { $ne: "inactive" },
      }).populate("organizationId");
      if (!user?.organizationId) {
        return res.status(403).json({ message: "This account is unavailable." });
      }
      if (requiresTotp(user, user.organizationId)) {
        if (!user.mfa?.totpEnabled) {
          return res.status(409).json({
            code: "MFA_ENROLLMENT_REQUIRED",
            message: "Authenticator setup is required. Sign out and sign in again to continue.",
          });
        }
        const challengeToken = randomChallengeToken();
        await MfaChallenge.create({
          userId: user._id,
          organizationId: user.organizationId._id,
          tokenHash: hashChallengeToken(challengeToken),
          purpose: "step_up",
          expiresAt: new Date(Date.now() + CHALLENGE_LIFETIME_MS),
        });
        return res.json({
          code: "MFA_REQUIRED",
          provider: "totp",
          message: "Enter the six-digit code from your authenticator app.",
          challengeToken,
          expiresInSeconds: Math.floor(CHALLENGE_LIFETIME_MS / 1000),
        });
      }
      if (requiresOkta(user, user.organizationId)) {
        return res.json({
          code: "OKTA_REQUIRED",
          provider: "okta",
          message: "Continue with Okta to confirm your identity.",
        });
      }
      return res.status(503).json({
        code: "STEP_UP_UNAVAILABLE",
        message: "Identity confirmation is not configured. Sign out and sign in again to continue.",
      });
    } catch (error) {
      console.error("MFA step-up challenge error:", error.message);
      return res.status(500).json({ message: "Unable to start identity confirmation." });
    }
  }
);

router.post(
  "/auth/mfa/step-up/verify",
  mfaLimiter,
  requireTrustedSessionOrigin,
  authenticateToken,
  async (req, res) => {
    try {
      const challenge = await activeMfaChallenge(
        String(req.body.challengeToken || ""),
        "step_up"
      );
      if (!challenge || String(challenge.userId) !== String(req.user.userId)) {
        return res.status(401).json({ message: "Identity confirmation expired. Try again." });
      }
      const user = await User.findOne({
        _id: challenge.userId,
        accountStatus: { $ne: "inactive" },
      }).select("+mfa.totpSecretEncrypted").populate("organizationId");
      if (
        !user?.organizationId
        || !user.mfa?.totpEnabled
        || !requiresTotp(user, user.organizationId)
      ) {
        return res.status(403).json({ message: "Authenticator verification is not available for this account." });
      }
      const verification = verifyTotp({
        encryptedSecret: user.mfa.totpSecretEncrypted,
        code: req.body.code,
        lastUsedCounter: user.mfa.lastUsedCounter,
      });
      if (!verification.valid) {
        challenge.attempts += 1;
        await challenge.save();
        return res.status(401).json({ message: "Invalid authenticator code." });
      }
      const mfaAuthenticatedAt = new Date();
      const userUpdate = await User.updateOne(
        {
          _id: user._id,
          $or: [
            { "mfa.lastUsedCounter": null },
            { "mfa.lastUsedCounter": { $lt: verification.counter } },
          ],
        },
        { $set: {
          "mfa.lastVerifiedAt": mfaAuthenticatedAt,
          "mfa.lastUsedCounter": verification.counter,
        } }
      );
      if (!userUpdate.modifiedCount) {
        return res.status(401).json({ message: "That MFA code was already used." });
      }
      const consumed = await MfaChallenge.findOneAndUpdate(
        { _id: challenge._id, consumedAt: null },
        { $set: { consumedAt: mfaAuthenticatedAt } },
        { new: true }
      );
      if (!consumed) {
        return res.status(401).json({ message: "Identity confirmation was already completed." });
      }
      const refreshSession = await updateRefreshSessionMfa({
        refreshToken: req.cookies[REFRESH_COOKIE],
        userId: user._id,
        tokenVersion: user.tokenVersion,
        mfaAuthenticatedAt,
      });
      if (!refreshSession) {
        return res.status(401).json({ message: "Session expired. Sign in again to continue." });
      }
      const workspace = await workspaceAuthentication(user, req.user.accountScope);
      return res.json({
        message: "Identity confirmed.",
        ...authResponse(user, getJwtSecret(), { mfaAuthenticatedAt, ...workspace }),
      });
    } catch (error) {
      console.error("MFA step-up verification error:", error.message);
      return res.status(500).json({ message: "Unable to confirm your identity." });
    }
  }
);

router.post("/auth/okta/challenge", loginLimiter, requireTrustedSessionOrigin, (req, res) => {
  if (!oktaConfig().configured) {
    return res.status(503).json({ message: "Okta authentication is not configured." });
  }
  const nonce = crypto.randomBytes(32).toString("base64url");
  res.cookie(OKTA_NONCE_COOKIE, nonce, oktaNonceCookieSettings());
  return res.json({ nonce });
});

router.post("/auth/okta", loginLimiter, requireTrustedSessionOrigin, async (req, res) => {
  try {
    const expectedNonce = String(req.cookies[OKTA_NONCE_COOKIE] || "");
    const claims = await verifyOktaIdentity({
      idToken: String(req.body.idToken || ""),
      expectedNonce,
    });
    clearOktaNonceCookie(res);
    const email = String(claims.email || claims.preferred_username || "").trim().toLowerCase();
    const subject = String(claims.sub || "");
    if (!email || !subject) {
      return res.status(401).json({ message: "Okta did not provide a usable identity." });
    }
    const user = await User.findOne({ email }).populate("organizationId");
    if (!user || !user.organizationId || user.accountStatus === "inactive") {
      return res.status(403).json({ message: "This Okta identity is not authorized for Afterlight." });
    }
    if (user.oktaSubject && user.oktaSubject !== subject) {
      return res.status(403).json({ message: "This account is linked to a different Okta identity." });
    }
    if (!user.oktaSubject) {
      user.oktaSubject = subject;
      await user.save();
    }
    const mfaAuthenticatedAt = new Date(
      Number(claims.auth_time || Math.floor(Date.now() / 1000)) * 1000
    );
    const workspace = await workspaceAuthentication(user);
    await createRefreshSession({
      user,
      req,
      res,
      mfaAuthenticatedAt,
      accountScope: workspace.accountScope,
    });
    return res.json({
      message: "Login successful",
      ...authResponse(user, getJwtSecret(), { mfaAuthenticatedAt, ...workspace }),
    });
  } catch (error) {
    clearOktaNonceCookie(res);
    console.error("Okta authentication failed:", error.message);
    return res.status(401).json({ message: "Secure sign-in could not be verified." });
  }
});

router.post("/auth/refresh", requireTrustedSessionOrigin, async (req, res) => {
  const refreshToken = req.cookies[REFRESH_COOKIE];
  if (!refreshToken) {
    clearRefreshCookie(res);
    return res.status(401).json({ message: "No active session." });
  }
  try {
    const session = await RefreshSession.findOne({
      tokenHash: hashToken(refreshToken),
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    });
    if (!session) {
      clearRefreshCookie(res);
      return res.status(401).json({ message: "Session expired. Please sign in again." });
    }
    const user = await User.findById(session.userId).populate("organizationId");
    if (
      !user
      || !user.organizationId
      || user.accountStatus === "inactive"
      || (user.tokenVersion || 0) !== session.tokenVersion
    ) {
      session.revokedAt = new Date();
      await session.save();
      clearRefreshCookie(res);
      return res.status(401).json({ message: "Session expired. Please sign in again." });
    }
    const workspace = await workspaceAuthentication(
      user,
      session.accountScope || undefined
    );
    const replacementToken = crypto.randomBytes(48).toString("base64url");
    const replacementHash = hashToken(replacementToken);
    session.revokedAt = new Date();
    session.replacedByHash = replacementHash;
    session.lastUsedAt = new Date();
    await Promise.all([
      session.save(),
      RefreshSession.create({
        userId: user._id,
        organizationId: user.organizationId._id,
        tokenHash: replacementHash,
        tokenVersion: user.tokenVersion || 0,
        accountScope: workspace.accountScope,
        expiresAt: session.expiresAt,
        userAgent: req.get("user-agent") || "",
        ipAddress: req.ip || "",
        mfaAuthenticatedAt: session.mfaAuthenticatedAt || null,
      }),
    ]);
    res.cookie(REFRESH_COOKIE, replacementToken, cookieSettings(session.expiresAt));
    return res.json(authResponse(user, getJwtSecret(), {
      mfaAuthenticatedAt: session.mfaAuthenticatedAt || undefined,
      ...workspace,
    }));
  } catch (error) {
    console.error("Refresh session error:", error);
    if (error.status === 403) {
      clearRefreshCookie(res);
      return res.status(403).json({ message: error.message });
    }
    return res.status(500).json({ message: "Unable to refresh session." });
  }
});

router.post("/auth/workspace", requireTrustedSessionOrigin, authenticateToken, async (req, res) => {
  const refreshToken = req.cookies[REFRESH_COOKIE];
  if (!refreshToken) {
    return res.status(401).json({
      code: "SESSION_REFRESH_UNAVAILABLE",
      message: "Your secure session is unavailable on this device. Reload the page and try again.",
    });
  }
  try {
    const user = await User.findById(req.user.userId).populate("organizationId");
    if (!user?.organizationId || user.accountStatus === "inactive") {
      return res.status(403).json({ message: "This account is unavailable." });
    }
    const workspace = await workspaceAuthentication(user, req.body.accountScope);
    const session = await RefreshSession.findOne({
      userId: user._id,
      tokenHash: hashToken(refreshToken),
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    });
    if (!session) {
      return res.status(401).json({ message: "Session expired. Sign in again before switching workspaces." });
    }
    session.accountScope = workspace.accountScope;
    session.lastUsedAt = new Date();
    await session.save();
    return res.json(authResponse(user, getJwtSecret(), {
      mfaAuthenticatedAt: req.user.mfaAuthenticatedAt || undefined,
      ...workspace,
    }));
  } catch (error) {
    if (error.status === 403) return res.status(403).json({ message: error.message });
    console.error("Workspace switch error:", error.message);
    return res.status(500).json({ message: "Unable to switch workspaces." });
  }
});

router.post("/auth/logout", requireTrustedSessionOrigin, async (req, res) => {
  try {
    await revokeRefreshToken(req.cookies[REFRESH_COOKIE]);
  } catch (error) {
    console.error("Logout session revocation error:", error);
  }
  clearRefreshCookie(res);
  return res.json({ success: true });
});

router.post("/forgot-password", accountRecoveryLimiter, async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const user = await User.findOne({ email });
    if (!user || user.accountStatus === "inactive") {
      return res.json({ message: PASSWORD_RESET_REQUEST_MESSAGE });
    }
    const resetToken = crypto.randomBytes(32).toString("hex");
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 3600000;
    await user.save();
    sendSystemEmail({
      to: user.email,
      subject: "Password Reset Request",
      text: `Click the link to reset your password: ${buildFrontendUrl(`/reset-password?token=${encodeURIComponent(resetToken)}`)}`,
    }).catch((error) => {
      console.error("Password reset email delivery failed:", error?.code || error?.name || "unknown_error");
    });
    return res.json({ message: PASSWORD_RESET_REQUEST_MESSAGE });
  } catch (error) {
    console.error("Password reset request failed:", error?.code || error?.name || "unknown_error");
    return res.json({ message: PASSWORD_RESET_REQUEST_MESSAGE });
  }
});

router.post("/reset-password", accountRecoveryLimiter, async (req, res) => {
  try {
    const user = await User.findOne({
      resetPasswordToken: req.body.token,
      resetPasswordExpires: { $gt: Date.now() },
    });
    if (!user) {
      return res.status(400).json({ message: "Invalid or expired reset link." });
    }
    user.password = bcrypt.hashSync(req.body.newPassword, 10);
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();
    await revokeUserSessions(user._id);
    return res.json({ message: "Password reset successful. You can now log in." });
  } catch (error) {
    console.error("Reset password error:", error);
    return res.status(500).json({ message: "Error processing password reset." });
  }
});

module.exports = router;
module.exports.requireTrustedSessionOrigin = requireTrustedSessionOrigin;
