import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "./ui/PageHeader";
import { api } from "../services/api";

export default function UserManagement() {
  const navigate = useNavigate();
  const [data, setData] = useState({ users: [], properties: [] });
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState(null);
  const [propertyIds, setPropertyIds] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState("");

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
    setPropertyIds(user ? data.properties
      .filter((property) => property.propertyManagers.some((id) => id === userId))
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

  return (
    <div className="beta-page">
    <main className="beta-page-shell">
      <PageHeader
        onBack={() => navigate("/dashboard")}
        eyebrow="Organization administration"
        title="User Management"
        subtitle="Manage roles, account access, and property assignments"
      />

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

              {draft.role === "property_manager" && (
                <fieldset className="beta-property-access">
                  <legend>Managed Properties</legend>
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
              {message && <p className="beta-alert success">{message}</p>}
              {error && <p className="beta-alert error">{error}</p>}
            </>
          )}
        </section>
      </div>
    </main>
    </div>
  );
}
