import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "./ui/PageHeader";
import { api } from "../services/api";

export default function UserManagement() {
  const navigate = useNavigate();
  const [data, setData] = useState({ users: [], properties: [], invitations: [] });
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState(null);
  const [propertyIds, setPropertyIds] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteDraft, setInviteDraft] = useState({ email: "", role: "user", propertyIds: [] });

  const load = useCallback(async () => {
    try {
      setData(await api.get("/api/admin-users"));
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  function chooseUser(userId) {
    const user = data.users.find((item) => item._id === userId);
    setSelectedId(userId);
    setDraft(user ? { ...user, accountStatus: user.accountStatus || "active" } : null);
    const assignmentField = user?.role === "client" ? "clientOwners" : "propertyManagers";
    setPropertyIds(user ? data.properties
      .filter((property) => (property[assignmentField] || []).some((id) => id === userId))
      .map((property) => property._id) : []);
    setMessage("");
    setError("");
  }

  async function save() {
    if (!draft || busyAction) return;
    setBusyAction("save");
    setMessage("");
    setError("");
    try {
      await api.put(`/api/admin-users/${selectedId}`, { ...draft, propertyIds });
      setMessage("User updated. Their existing sessions have been invalidated.");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyAction("");
    }
  }

  async function sendReset() {
    if (busyAction) return;
    setBusyAction("reset");
    setMessage("");
    setError("");
    try {
      const body = await api.post(`/api/admin-users/${selectedId}/send-password-reset`);
      setMessage(body.message || "Password reset sent.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyAction("");
    }
  }

  function toggleProperty(propertyId, checked) {
    setPropertyIds(checked
      ? [...propertyIds, propertyId]
      : propertyIds.filter((id) => id !== propertyId));
  }

  function toggleInvitationProperty(propertyId, checked) {
    setInviteDraft((current) => ({
      ...current,
      propertyIds: checked
        ? [...current.propertyIds, propertyId]
        : current.propertyIds.filter((id) => id !== propertyId),
    }));
  }

  async function sendInvitation(event) {
    event.preventDefault();
    if (busyAction) return;
    setBusyAction("invite");
    setMessage("");
    setError("");
    try {
      const result = await api.post("/api/admin-users/invitations", inviteDraft);
      setMessage(result.message || "Invitation sent.");
      setInviteDraft({ email: "", role: "user", propertyIds: [] });
      setInviteOpen(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyAction("");
    }
  }

  async function resendInvitation(invitationId) {
    if (busyAction) return;
    setBusyAction(`resend-${invitationId}`);
    setMessage("");
    setError("");
    try {
      const result = await api.post(`/api/admin-users/invitations/${invitationId}/resend`);
      setMessage(result.message || "Invitation resent.");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyAction("");
    }
  }

  async function revokeInvitation(invitationId) {
    if (busyAction || !window.confirm("Revoke this invitation? Its current link will stop working.")) return;
    setBusyAction(`revoke-${invitationId}`);
    setMessage("");
    setError("");
    try {
      await api.delete(`/api/admin-users/invitations/${invitationId}`);
      setMessage("Invitation revoked.");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyAction("");
    }
  }

  return (
    <div className="beta-page">
    <main className="beta-page-shell">
      <PageHeader
        onBack={() => navigate("/dashboard")}
        eyebrow="Organization administration"
        title="User Management"
        subtitle="Manage roles, account access, and property assignments"
      />
      {message && <p className="beta-alert success" role="status">{message}</p>}
      {error && <p className="beta-alert error" role="alert">{error}</p>}

      <section className="beta-panel beta-invitation-panel">
        <div className="beta-section-heading">
          <div><h2>Invitations</h2><p>Invite users with their organization and role already assigned.</p></div>
          <button className="beta-button compact" type="button" onClick={() => setInviteOpen((open) => !open)}>
            {inviteOpen ? "Close" : "Invite User"}
          </button>
        </div>
        {inviteOpen && (
          <form className="beta-invitation-form" onSubmit={sendInvitation}>
            <div className="beta-form-grid">
              <label className="beta-form-field">Email address
                <input type="email" autoComplete="email" value={inviteDraft.email}
                  onChange={(event) => setInviteDraft({ ...inviteDraft, email: event.target.value })} required />
              </label>
              <label className="beta-form-field">Role
                <select value={inviteDraft.role} onChange={(event) => setInviteDraft({ ...inviteDraft, role: event.target.value, propertyIds: [] })}>
                  <option value="user">Submitter</option>
                  <option value="property_manager">Property Manager</option>
                  <option value="client">Property Owner</option>
                  <option value="contractor">Contractor</option>
                  <option value="cleaner">Cleaner</option>
                </select>
              </label>
            </div>
            {["property_manager", "client"].includes(inviteDraft.role) && (
              <fieldset className="beta-property-access">
                <legend>{inviteDraft.role === "client" ? "Owned properties" : "Managed properties"}</legend>
                {data.properties.length ? data.properties.map((property) => (
                  <label key={property._id}>
                    <input type="checkbox" checked={inviteDraft.propertyIds.includes(property._id)}
                      onChange={(event) => toggleInvitationProperty(property._id, event.target.checked)} />
                    {property.name}
                  </label>
                )) : <small>No properties have been configured yet.</small>}
              </fieldset>
            )}
            <button className="beta-button" type="submit" disabled={Boolean(busyAction)}>
              {busyAction === "invite" ? "Sending..." : "Send Invitation"}
            </button>
          </form>
        )}
        {data.invitations.length > 0 && (
          <div className="beta-pending-invitations">
            {data.invitations.map((invitation) => (
              <article key={invitation._id} className="beta-invitation-row">
                <div><strong>{invitation.email}</strong><small>{invitation.role.replaceAll("_", " ")} · {invitation.status}</small></div>
                <div className="beta-card-actions">
                  {invitation.status === "pending" && (
                    <button className="beta-button secondary compact" type="button" disabled={Boolean(busyAction)} onClick={() => resendInvitation(invitation._id)}>
                      {busyAction === `resend-${invitation._id}` ? "Sending..." : "Resend"}
                    </button>
                  )}
                  <button className="beta-button danger compact" type="button" disabled={Boolean(busyAction)} onClick={() => revokeInvitation(invitation._id)}>
                    {busyAction === `revoke-${invitation._id}` ? "Revoking..." : "Revoke"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="beta-user-layout">
        <section className="beta-panel beta-user-list">
          <h2>Users</h2>
          {loading && <div className="beta-empty-state">Loading users…</div>}
          {error && !data.users.length && <p className="beta-alert error">{error}</p>}
          {data.users.map((user) => (
            <button key={user._id} onClick={() => chooseUser(user._id)}
              className={`beta-user-row${selectedId === user._id ? " active" : ""}`}>
              <span>{user.username || user.email}</span>
              <small>{user.role.replace("_", " ")} · {user.accountStatus || "active"}</small>
            </button>
          ))}
        </section>

        <section className="beta-panel beta-user-editor">
          {!draft ? <div className="beta-empty-state">Select a user to review or edit.</div> : (
            <>
              <div className="beta-section-heading"><div><h2>{draft.username || draft.email}</h2><p>Edit account details and access.</p></div>
                <span className={`beta-status ${draft.accountStatus === "active" ? "success" : "declined"}`}>{draft.accountStatus || "active"}</span>
              </div>
              <div className="beta-form-grid">
              <label className="beta-form-field">Name
                <input value={draft.username || ""} onChange={(e) => setDraft({ ...draft, username: e.target.value })} />
              </label>
              <label className="beta-form-field">Email
                <input type="email" value={draft.email || ""} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
              </label>
              <label className="beta-form-field">Role
                <select value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })}>
                  <option value="user">User</option>
                  <option value="property_manager">Property Manager</option>
                  <option value="contractor">Contractor</option>
                  <option value="cleaner">Cleaner</option>
                </select>
              </label>
              <label className="beta-form-field">Status
                <select value={draft.accountStatus || "active"} onChange={(e) => setDraft({ ...draft, accountStatus: e.target.value })}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>
              </div>

              {["property_manager", "client"].includes(draft.role) && (
                <fieldset className="beta-property-access">
                  <legend>{draft.role === "client" ? "Owned Properties" : "Managed Properties"}</legend>
                  {data.properties.map((property) => (
                    <label key={property._id}>
                      <input type="checkbox" checked={propertyIds.includes(property._id)}
                        onChange={(e) => toggleProperty(property._id, e.target.checked)} />
                      {property.name}
                    </label>
                  ))}
                </fieldset>
              )}

              <div className="beta-card-actions">
                <button className="beta-button" disabled={Boolean(busyAction)} onClick={save}>
                  {busyAction === "save" ? "Saving…" : "Save Changes"}
                </button>
                <button className="beta-button secondary" disabled={Boolean(busyAction)} onClick={sendReset}>
                  {busyAction === "reset" ? "Sending…" : "Send Password Reset"}
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
    </div>
  );
}
