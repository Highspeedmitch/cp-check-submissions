import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "./ui/PageHeader";
import { api } from "../services/api";

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
      setStatus(updated);
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
          ? "Okta MFA is now required for every organization user."
          : "Okta MFA remains required for administrators and is optional for other users."
      );
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setMfaSaving(false);
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
        <section className="beta-section">
          <div className="beta-section-heading">
            <div>
              <h2>Okta multi-factor authentication</h2>
              <p>
                Organization and platform administrators always use Okta MFA. You can also
                require it for property managers, submitters, and other organization users.
              </p>
            </div>
          </div>
          {status && (
            <>
              <p className="beta-dialog-note">
                {status.oktaConfigured
                  ? status.requireMfaForAllUsers
                    ? "Required for all organization users"
                    : "Required for administrators; optional for other users"
                  : "Okta has not been configured for this deployment"}
              </p>
              <form className="add-property-form" onSubmit={saveMfaPolicy}>
                <label>
                  Confirm your account password:
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={mfaPassword}
                    onChange={(event) => setMfaPassword(event.target.value)}
                    required
                    disabled={!status.oktaConfigured}
                  />
                </label>
                <button
                  className="beta-button"
                  type="submit"
                  disabled={mfaSaving || !status.oktaConfigured}
                >
                  {mfaSaving
                    ? "Saving…"
                    : status.requireMfaForAllUsers
                      ? "Make MFA optional for non-admins"
                      : "Require MFA for all users"}
                </button>
              </form>
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
            {error && <p className="beta-alert error" role="alert">{error}</p>}
            {message && <p className="beta-alert success" role="status">{message}</p>}
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
