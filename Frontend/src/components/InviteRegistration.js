import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../services/api";

function readInvitationToken() {
  try {
    return decodeURIComponent(window.location.hash.replace(/^#/, ""));
  } catch (error) {
    return "";
  }
}

export default function InviteRegistration() {
  const navigate = useNavigate();
  const [token] = useState(readInvitationToken);
  const [invitation, setInvitation] = useState(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(Boolean(token));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(null);
  const isResourceInvitation = invitation?.accountScope === "afterlight_resource";

  useEffect(() => {
    if (!token) return;
    window.history.replaceState(null, "", "/join");
    api.post("/api/invitations/resolve", { token }, { auth: false })
      .then(setInvitation)
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, [token]);

  async function acceptInvitation(event) {
    event.preventDefault();
    setError("");
    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await api.post("/api/invitations/accept", { token, username, password }, { auth: false });
      setCreated(result);
      setPassword("");
      setConfirmation("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="beta-page beta-auth-page">
      <main className="beta-page-shell beta-register-shell">
        <div className="beta-register-layout beta-invite-registration-layout">
          <aside className="beta-register-intro">
            <img src="/apple-touch-icon.png" alt="" className="beta-register-logo" />
            <p className="beta-eyebrow">Your Afterlight workspace</p>
            <h2>{isResourceInvitation ? "One identity for every approved deployment." : "Join with the right access from the start."}</h2>
            <p>{isResourceInvitation ? "Your Afterlight Resource Network account remains independent from customer organizations." : "Your organization and role are secured by your invitation, so account setup stays simple."}</p>
            <ul>{isResourceInvitation ? <><li>One shared Afterlight login</li><li>Deployment-based property access</li><li>Relationship-appropriate work and earnings</li></> : <><li>Organization-bound membership</li><li>Role-based workspace access</li><li>Multi-factor protection where required</li></>}</ul>
          </aside>

          <section className="beta-panel beta-register-card beta-invite-registration-card">
            {loading ? <div className="beta-empty-state">Validating your invitation...</div> : created ? (
              <div className="beta-invite-complete">
                <span className="beta-invite-complete-icon" aria-hidden="true">✓</span>
                <p className="beta-eyebrow">Account created</p>
                <h1>Welcome to {created.organizationName}</h1>
                <p>Your account is ready. Sign in with {created.email} to continue.</p>
                <button className="beta-button" type="button" onClick={() => navigate(`/login?email=${encodeURIComponent(created.email)}`)}>
                  Continue to Sign In
                </button>
              </div>
            ) : !token || !invitation ? (
              <div className="beta-invite-required">
                <p className="beta-eyebrow">Invitation required</p>
                <h1>{error ? "This link cannot be used" : "Create an invited account"}</h1>
                <p>{error || "Afterlight accounts are created from secure invitations sent by a platform or organization administrator."}</p>
                <Link className="beta-text-button" to="/help/resource-account-setup">Resource account setup help</Link>
                <Link className="beta-button secondary" to="/login">Return to Sign In</Link>
              </div>
            ) : (
              <>
                <p className="beta-eyebrow">You're invited</p>
                <h1>Join {invitation.organizationName}</h1>
                <p className="beta-page-subtitle">Complete your profile to activate your Afterlight account.</p>
                <div className="beta-invite-summary">
                  <div><span>Organization</span><strong>{invitation.organizationName}</strong></div>
                  <div><span>Role</span><strong>{invitation.roleLabel}</strong></div>
                  <div><span>Email</span><strong>{invitation.email}</strong></div>
                </div>
                {error && <p className="beta-alert error" role="alert">{error}</p>}
                <form onSubmit={acceptInvitation}>
                  <div className="beta-form-grid">
                    <label className="beta-form-field full">Your name
                      <input value={username} minLength="2" maxLength="100" autoComplete="name"
                        onChange={(event) => setUsername(event.target.value)} required autoFocus />
                    </label>
                    <label className="beta-form-field">Password
                      <input type="password" value={password} minLength="10" maxLength="128" autoComplete="new-password"
                        onChange={(event) => setPassword(event.target.value)} required />
                    </label>
                    <label className="beta-form-field">Confirm password
                      <input type="password" value={confirmation} minLength="10" maxLength="128" autoComplete="new-password"
                        onChange={(event) => setConfirmation(event.target.value)} required />
                    </label>
                  </div>
                  <p className="beta-dialog-note">Use at least 10 characters. Administrators will enroll an authenticator during their first sign-in.</p>
                  <button className="beta-button beta-register-submit" type="submit" disabled={submitting}>
                    {submitting ? "Creating account..." : "Accept Invitation and Create Account"}
                  </button>
                  <p className="beta-register-signin">Already registered? <button type="button" onClick={() => navigate("/login")}>Sign in</button></p>
                  {isResourceInvitation && <p className="beta-register-signin"><Link to="/help/resource-account-setup" target="_blank" rel="noreferrer">Need help setting up your resource account?</Link></p>}
                </form>
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
