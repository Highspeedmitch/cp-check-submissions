import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "./ui/PageHeader";
import ContextualHelpLink from "./help/ContextualHelpLink";
import { api } from "../services/api";
import { logoutSession } from "../services/session";

function OrganizationSecurity() {
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPasskey, setNewPasskey] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [mfaPassword, setMfaPassword] = useState("");
  const [mfaSaving, setMfaSaving] = useState(false);
  const [authenticatorCode, setAuthenticatorCode] = useState("");
  const [recoveryPassword, setRecoveryPassword] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [recoverySaving, setRecoverySaving] = useState(false);
  const [resettingMfa, setResettingMfa] = useState(false);

  useEffect(() => {
    api.get("/api/organization-security")
      .then(setStatus)
      .catch((loadError) => setError(loadError.message));
  }, []);

  const rotatePasskey = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    if (newPasskey !== confirmation) {
      setError("The new passkey and confirmation do not match.");
      return;
    }
    setSaving(true);
    try {
      const updated = await api.put("/api/organization-security/passkey", {
        currentPassword,
        newPasskey,
      });
      setStatus((current) => ({ ...current, ...updated }));
      setCurrentPassword("");
      setNewPasskey("");
      setConfirmation("");
      setMessage("Administrative action passkey rotated successfully.");
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  const saveMfaPolicy = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setMfaSaving(true);
    try {
      const updated = await api.put("/api/organization-security/mfa-policy", {
        currentPassword: mfaPassword,
        requireMfaForAllUsers: !status.requireMfaForAllUsers,
      });
      setStatus((current) => ({ ...current, ...updated }));
      setMfaPassword("");
      setMessage(
        updated.requireMfaForAllUsers
          ? "MFA is now required for every organization user."
          : "MFA remains required for administrators and is optional for other users."
      );
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setMfaSaving(false);
    }
  };

  const regenerateRecoveryCodes = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setRecoveryCodes([]);
    setRecoverySaving(true);
    try {
      const updated = await api.post("/api/organization-security/totp/recovery-codes", {
        currentPassword: recoveryPassword,
        code: authenticatorCode,
      });
      setRecoveryCodes(updated.recoveryCodes || []);
      setStatus((current) => ({
        ...current,
        recoveryCodesRemaining: updated.recoveryCodesRemaining,
      }));
      setRecoveryPassword("");
      setAuthenticatorCode("");
      setMessage("New recovery codes generated. Your previous codes no longer work.");
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setRecoverySaving(false);
    }
  };

  const downloadRecoveryCodes = () => {
    const blob = new Blob([
      `Afterlight recovery codes\n\n${recoveryCodes.join("\n")}\n\nEach code can be used once. Store these somewhere safe.\n`,
    ], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "afterlight-recovery-codes.txt";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const resetAuthenticator = async () => {
    if (!window.confirm("Reset your authenticator and sign out? You will enroll again at your next login.")) {
      return;
    }
    setError("");
    setMessage("");
    setResettingMfa(true);
    try {
      await api.post("/api/organization-security/totp/reset", {
        currentPassword: recoveryPassword,
        code: authenticatorCode,
      });
      await logoutSession();
      navigate("/login", { replace: true });
    } catch (resetError) {
      setError(resetError.message);
      setResettingMfa(false);
    }
  };

  const organizationMfaLabel = !status?.totpConfigured
    ? "Unavailable"
    : status.requireMfaForAllUsers
      ? "Required for everyone"
      : "Required for administrators";

  const authenticatorLabel = !status?.totpConfigured
    ? "Not configured"
    : status.totpEnabled
      ? "Enrolled"
      : "Enrollment required";

  return (
    <div className="beta-page">
      <main className="beta-page-shell beta-security-page">
        <PageHeader
          onBack={() => navigate("/dashboard")}
          backLabel="Dashboard"
          eyebrow="Organization settings"
          title="Security"
          subtitle="Manage sign-in protection, account recovery, and sensitive administrative access."
          actions={<ContextualHelpLink slug="authenticator-verification" />}
        />
        {error && <p className="beta-alert error" role="alert">{error}</p>}
        {message && <p className="beta-alert success" role="status">{message}</p>}
        {!status && !error && (
          <div className="beta-empty-state beta-security-loading">Loading security settings...</div>
        )}

        {status && (
          <section className="beta-security-overview" aria-label="Security overview">
            <div>
              <span>Administrator MFA</span>
              <strong>Always required</strong>
              <small>Organization and platform administrators</small>
            </div>
            <div>
              <span>Organization policy</span>
              <strong>{organizationMfaLabel}</strong>
              <small>
                {!status.totpConfigured
                  ? "Deployment configuration is required"
                  : status.requireMfaForAllUsers
                    ? "Every organization user verifies sign-in"
                    : "Other users may enroll optionally"}
              </small>
            </div>
            <div>
              <span>Your authenticator</span>
              <strong>{authenticatorLabel}</strong>
              <small>
                {!status.totpConfigured
                  ? "Authenticator enrollment is unavailable"
                  : status.totpEnabled
                  ? `${status.recoveryCodesRemaining} recovery codes remaining`
                  : "Enrollment will be requested at sign-in"}
              </small>
            </div>
          </section>
        )}

        <div className="beta-security-grid">
        <section className="beta-panel beta-security-card">
          <div className="beta-section-heading">
            <div>
              <p className="beta-eyebrow">Organization policy</p>
              <h2>Multi-factor authentication</h2>
              <p>
                Organization and platform administrators always use an authenticator app.
                You can also require MFA for property managers, field operators, and other users.
              </p>
            </div>
            {status && (
              <span className={`beta-status ${status.requireMfaForAllUsers ? "success" : "warning"}`}>
                {status.requireMfaForAllUsers ? "All users" : "Admins only"}
              </span>
            )}
          </div>
          {status && (
            <>
              {!status.totpConfigured && (
                <p className="beta-dialog-note">Afterlight MFA has not been enabled for this deployment.</p>
              )}
              <form className="beta-security-form" onSubmit={saveMfaPolicy}>
                <label className="beta-form-field">
                  Confirm your account password
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={mfaPassword}
                    onChange={(event) => setMfaPassword(event.target.value)}
                    required
                    disabled={!status.totpConfigured}
                  />
                </label>
                <div className="beta-security-actions">
                  <button
                    className="beta-button"
                    type="submit"
                    disabled={mfaSaving || !status.totpConfigured}
                  >
                    {mfaSaving
                      ? "Saving…"
                      : status.requireMfaForAllUsers
                        ? "Make MFA optional for non-admins"
                        : "Require MFA for all users"}
                  </button>
                </div>
              </form>
              {status.totpConfigured && status.totpEnabled && (
                <form className="beta-security-form beta-security-recovery-form" onSubmit={regenerateRecoveryCodes}>
                  <h3>Replace recovery codes</h3>
                  <p>
                    Generate a new set if your codes were lost or exposed. Existing recovery
                    codes will stop working immediately.
                  </p>
                  <label className="beta-form-field">
                    Confirm your account password
                    <input
                      type="password"
                      autoComplete="current-password"
                      value={recoveryPassword}
                      onChange={(event) => setRecoveryPassword(event.target.value)}
                      required
                    />
                  </label>
                  <label className="beta-form-field">
                    Authenticator or recovery code
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={authenticatorCode}
                      onChange={(event) => setAuthenticatorCode(event.target.value)}
                      required
                    />
                  </label>
                  <div className="beta-security-actions">
                    <button className="beta-button" type="submit" disabled={recoverySaving}>
                      {recoverySaving ? "Generating..." : "Generate new recovery codes"}
                    </button>
                    <button
                      className="beta-button danger"
                      type="button"
                      disabled={resettingMfa || !recoveryPassword || !authenticatorCode}
                      onClick={resetAuthenticator}
                    >
                      {resettingMfa ? "Resetting..." : "Reset authenticator and sign out"}
                    </button>
                  </div>
                  {recoveryCodes.length > 0 && (
                    <div className="beta-recovery-code-panel" role="status">
                      <p>Save these now. They will not be shown again.</p>
                      <div className="beta-recovery-code-grid">
                        {recoveryCodes.map((code) => <code key={code}>{code}</code>)}
                      </div>
                      <button className="beta-button secondary" type="button" onClick={downloadRecoveryCodes}>
                        Download codes
                      </button>
                    </div>
                  )}
                </form>
              )}
            </>
          )}
        </section>
        <section className="beta-panel beta-security-card">
          <div className="beta-section-heading">
            <div>
              <p className="beta-eyebrow">Sensitive actions</p>
              <h2>Administrative action passkey</h2>
              <p>
                This passkey protects sensitive actions such as adding and removing properties.
                The current value cannot be viewed.
              </p>
            </div>
            {status && (
              <span className={`beta-status ${status.configured ? "success" : "warning"}`}>
                {status.configured ? "Configured" : "Temporary passkey"}
              </span>
            )}
          </div>
          {status && (
            <p className="beta-dialog-note">
              {status.configured ? "Organization passkey configured" : "Using temporary platform passkeys"}
              {status.rotatedAt
                ? ` · Last rotated ${new Date(status.rotatedAt).toLocaleString()}`
                : ""}
            </p>
          )}
          <form className="beta-security-form beta-security-passkey-form" onSubmit={rotatePasskey}>
            <label className="beta-form-field">
              Confirm your account password
              <input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
              />
            </label>
            <label className="beta-form-field">
              New administrative passkey
              <input
                type="password"
                autoComplete="new-password"
                minLength="12"
                value={newPasskey}
                onChange={(event) => setNewPasskey(event.target.value)}
                required
              />
            </label>
            <label className="beta-form-field">
              Confirm new passkey
              <input
                type="password"
                autoComplete="new-password"
                minLength="12"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                required
              />
            </label>
            <div className="beta-security-actions">
              <button className="beta-button" type="submit" disabled={saving}>
                {saving ? "Rotating…" : "Rotate passkey"}
              </button>
            </div>
          </form>
        </section>
        </div>
      </main>
    </div>
  );
}

export default OrganizationSecurity;
