import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

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
    setDraft(user ? { ...user } : null);
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
    <main className="main-content" style={{ maxWidth: "900px", margin: "30px auto", padding: "20px" }}>
      <header className="dashboard-header">
        <div className="subtext">Organization administration</div>
        <h1>User Management</h1>
        <button className="logout-btn" onClick={() => navigate("/dashboard")}>Back to Dashboard</button>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) 2fr", gap: "24px", marginTop: "24px" }}>
        <section>
          <h2>Users</h2>
          {data.users.map((user) => (
            <button key={user._id} onClick={() => chooseUser(user._id)}
              style={{ display: "block", width: "100%", marginBottom: "8px", textAlign: "left" }}>
              {user.username || user.email}<br />
              <small>{user.role.replace("_", " ")} · {user.accountStatus || "active"}</small>
            </button>
          ))}
        </section>

        <section>
          {!draft ? <p>Select a user to review or edit.</p> : (
            <>
              <label>Name
                <input value={draft.username || ""} onChange={(e) => setDraft({ ...draft, username: e.target.value })} />
              </label>
              <label>Email
                <input type="email" value={draft.email || ""} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
              </label>
              <label>Role
                <select value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })}>
                  <option value="user">User</option>
                  <option value="property_manager">Property Manager</option>
                  <option value="contractor">Contractor</option>
                  <option value="cleaner">Cleaner</option>
                </select>
              </label>
              <label>Status
                <select value={draft.accountStatus || "active"} onChange={(e) => setDraft({ ...draft, accountStatus: e.target.value })}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>

              {draft.role === "property_manager" && (
                <fieldset>
                  <legend>Managed Properties</legend>
                  {data.properties.map((property) => (
                    <label key={property._id} style={{ display: "block" }}>
                      <input type="checkbox" checked={propertyIds.includes(property._id)}
                        onChange={(e) => toggleProperty(property._id, e.target.checked)} />
                      {property.name}
                    </label>
                  ))}
                </fieldset>
              )}

              <div style={{ marginTop: "18px" }}>
                <button onClick={save}>Save Changes</button>
                <button onClick={sendReset}>Send Password Reset</button>
              </div>
              {message && <p>{message}</p>}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
