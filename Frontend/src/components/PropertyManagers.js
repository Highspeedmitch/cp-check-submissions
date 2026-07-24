import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const API = "https://cp-check-submissions-dev-backend.onrender.com/api/property-managers";

export default function PropertyManagers() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const [data, setData] = useState({ users: [], properties: [] });
  const [selectedUser, setSelectedUser] = useState("");
  const [selectedProperties, setSelectedProperties] = useState([]);

  useEffect(() => {
    fetch(API, { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => response.json()).then(setData);
  }, [token]);

  function chooseUser(userId) {
    setSelectedUser(userId);
    setSelectedProperties(data.properties
      .filter((property) => property.propertyManagers.some((id) => id === userId))
      .map((property) => property._id));
  }

  async function save() {
    await fetch(`${API}/${selectedUser}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ propertyIds: selectedProperties }),
    });
    navigate("/dashboard");
  }

  return (
    <main className="main-content" style={{ maxWidth: "700px", margin: "30px auto", padding: "20px" }}>
      <h1>Property Manager Access</h1>
      <select value={selectedUser} onChange={(e) => chooseUser(e.target.value)}>
        <option value="">Select a user</option>
        {data.users.map((user) => <option key={user._id} value={user._id}>{user.username || user.email} ({user.role})</option>)}
      </select>
      {selectedUser && data.properties.map((property) => (
        <label key={property._id} style={{ display: "block", margin: "12px 0" }}>
          <input type="checkbox" checked={selectedProperties.includes(property._id)}
            onChange={(e) => setSelectedProperties(e.target.checked
              ? [...selectedProperties, property._id]
              : selectedProperties.filter((id) => id !== property._id))} />
          {property.name}
        </label>
      ))}
      <button disabled={!selectedUser} onClick={save}>Save Access</button>
      <button onClick={() => navigate("/dashboard")}>Cancel</button>
    </main>
  );
}
