import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "./ui/PageHeader";

const API = "https://cp-check-submissions-dev-backend.onrender.com/api/admin-users";

export default function UserManagement() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const [data, setData] = useState({ users: [], properties: [] });
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState(null);
  const [propertyIds, setPropertyIds] = useState([]);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const response = await fetch(API, { headers: { Authorization: `Bearer ${token}` } });
    const body = await response.json();
    if (response.ok) setData(body);
  }, [token]);
  useEffect(() => { load(); }, [load]);

  function chooseUser(userId) {
    const user = data.users.find((item) => item._id === userId);
    setSelectedId(userId);
    setDraft(user ? { ...user, accountStatus: user.accountStatus || "active" } : null);
    setPropertyIds(user ? data.properties
      .filter((property) => property.propertyManagers.some((id) => id === userId))
      .map((property) => property._id) : []);
    setMessage("");
  }

  async function save() {
    const response = await fetch(`${API}/${selectedId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...draft, propertyIds }),
    });
    const body = await response.json();
    if (!response.ok) return setMessage(body.error || "Unable to save user.");
    setMessage("User updated. Their existing sessions have been invalidated.");
    await load();
  }

  async function sendReset() {
    const response = await fetch(`${API}/${selectedId}/send-password-reset`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await response.json();
    setMessage(response.ok ? body.message : body.error);
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
                <button className="beta-button" onClick={save}>Save Changes</button>
                <button className="beta-button secondary" onClick={sendReset}>Send Password Reset</button>
              </div>
              {message && <p className="beta-alert success">{message}</p>}
            </>
          )}
        </section>
      </div>
    </main>
    </div>
  );
}
