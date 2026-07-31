import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "./ui/PageHeader";
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

  return (
    <div className="beta-page">
      <main className="beta-page-shell">
        <PageHeader
          eyebrow="Organization settings"
          title="Security"
          actions={
            <button className="beta-back-link" onClick={() => navigate("/dashboard")}>
              Back to dashboard
            </button>
          }
        />
        {error && <p className="beta-alert error" role="alert">{error}</p>}
        {message && <p className="beta-alert success" role="status">{message}</p>}
        <section className="beta-section">
          <div className="beta-section-heading">
            <div>
              <h2>Multi-factor authentication</h2>
              <p>
                Organization and platform administrators always use an authenticator app.
                You can also require MFA for property managers, submitters, and other users.
              </p>
            </div>
          </div>
          {status && (
            <>
              <p className="beta-dialog-note">
                {status.totpConfigured
                  ? status.requireMfaForAllUsers
                    ? "Required for all organization users"
                    : "Required for administrators; optional for other users"
                  : "Afterlight MFA has not been enabled for this deployment"}
              </p>
              {status.totpConfigured && (
                <p className="beta-dialog-note">
                  Your authenticator: {status.totpEnabled ? "enrolled" : "enrollment required at next login"}
                  {status.totpEnabled ? ` · ${status.recoveryCodesRemaining} recovery codes remaining` : ""}
                </p>
              )}
              <form className="add-property-form" onSubmit={saveMfaPolicy}>
                <label>
                  Confirm your account password:
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={mfaPassword}
                    onChange={(event) => setMfaPassword(event.target.value)}
                    required
                    disabled={!status.totpConfigured}
                  />
                </label>
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
              </form>
              {status.totpConfigured && status.totpEnabled && (
                <form className="add-property-form" onSubmit={regenerateRecoveryCodes}>
                  <h3>Replace recovery codes</h3>
                  <p>
                    Generate a new set if your codes were lost or exposed. Existing recovery
                    codes will stop working immediately.
                  </p>
                  <label>
                    Confirm your account password:
                    <input
                      type="password"
                      autoComplete="current-password"
                      value={recoveryPassword}
                      onChange={(event) => setRecoveryPassword(event.target.value)}
                      required
                    />
                  </label>
                  <label>
                    Current authenticator code (or recovery code when resetting):
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={authenticatorCode}
                      onChange={(event) => setAuthenticatorCode(event.target.value)}
                      required
                    />
                  </label>
                  <button className="beta-button" type="submit" disabled={recoverySaving}>
                    {recoverySaving ? "Generating..." : "Generate new recovery codes"}
                  </button>
                  <button
                    className="beta-button secondary"
                    type="button"
                    disabled={resettingMfa || !recoveryPassword || !authenticatorCode}
                    onClick={resetAuthenticator}
                  >
                    {resettingMfa ? "Resetting..." : "Reset authenticator and sign out"}
                  </button>
                  {recoveryCodes.length > 0 && (
                    <div className="beta-dialog-note">
                      <p>Save these now. They will not be shown again.</p>
                      {recoveryCodes.map((code) => <div key={code}><code>{code}</code></div>)}
                      <button className="beta-button" type="button" onClick={downloadRecoveryCodes}>
                        Download codes
                      </button>
                    </div>
                  )}
                </form>
              )}
            </>
          )}
        </section>
        <section className="beta-section">
          <div className="beta-section-heading">
            <div>
              <h2>Administrative action passkey</h2>
              <p>
                This passkey protects sensitive actions such as adding and removing properties.
                The current value cannot be viewed.
              </p>
            </div>
          </div>
          {status && (
            <p className="beta-dialog-note">
              {status.configured ? "Organization passkey configured" : "Using temporary platform passkeys"}
              {status.rotatedAt
                ? ` · Last rotated ${new Date(status.rotatedAt).toLocaleString()}`
                : ""}
            </p>
          )}
          <form className="add-property-form" onSubmit={rotatePasskey}>
            <label>
              Confirm your account password:
              <input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
              />
            </label>
            <label>
              New administrative passkey:
              <input
                type="password"
                autoComplete="new-password"
                minLength="12"
                value={newPasskey}
                onChange={(event) => setNewPasskey(event.target.value)}
                required
              />
            </label>
            <label>
              Confirm new passkey:
              <input
                type="password"
                autoComplete="new-password"
                minLength="12"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                required
              />
            </label>
            <button className="beta-button" type="submit" disabled={saving}>
              {saving ? "Rotating…" : "Rotate passkey"}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}

export default OrganizationSecurity;
