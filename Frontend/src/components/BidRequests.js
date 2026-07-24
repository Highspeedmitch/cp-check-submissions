import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const API = "https://cp-check-submissions-dev-backend.onrender.com/api/bid-requests";

export default function BidRequests() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");
  const [requests, setRequests] = useState([]);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    grossSquareFeet: "", propertyType: "free_standing", address: "",
    serviceFrequency: "monthly", knownIssues: "", attachment: null,
  });

  const load = useCallback(async () => {
    const response = await fetch(API, { headers: { Authorization: `Bearer ${token}` } });
    const data = await response.json();
    if (response.ok) setRequests(data);
  }, [token]);
  useEffect(() => { load(); }, [load]);

  async function submit(event) {
    event.preventDefault();
    const body = new FormData();
    Object.entries(form).forEach(([key, value]) => value != null && body.append(key, value));
    const response = await fetch(API, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body,
    });
    const data = await response.json();
    setMessage(response.ok ? "Bid request sent to the organization admin." : data.error);
    if (response.ok) load();
  }

  async function review(id, status) {
    await fetch(`${API}/${id}/review`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status }),
    });
    load();
  }

  return (
    <main className="main-content" style={{ maxWidth: "900px", margin: "30px auto" }}>
      <header className="dashboard-header">
        <h1>{role === "admin" ? "Bid Requests" : "Get A Bid"}</h1>
        <button className="logout-btn" onClick={() => navigate("/dashboard")}>Back to Dashboard</button>
      </header>
      {role === "property_manager" && (
        <form onSubmit={submit} style={{ display: "grid", gap: "12px", padding: "20px" }}>
          <input type="number" min="1" required placeholder="Gross square footage"
            onChange={(e) => setForm({ ...form, grossSquareFeet: e.target.value })} />
          <select value={form.propertyType} onChange={(e) => setForm({ ...form, propertyType: e.target.value })}>
            <option value="free_standing">Free standing</option>
            <option value="strip_mall">Strip mall</option>
            <option value="individual_suite">Individual suite</option>
          </select>
          <input required placeholder="Property address"
            onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <select value={form.serviceFrequency} onChange={(e) => setForm({ ...form, serviceFrequency: e.target.value })}>
            <option value="monthly">Monthly</option><option value="weekly">Weekly</option>
            <option value="ad_hoc">Ad-hoc</option>
          </select>
          <textarea placeholder="Known issues" onChange={(e) => setForm({ ...form, knownIssues: e.target.value })} />
          <label>Lot dimensions with perimeter lines (PDF, JPG, or PNG)
            <input type="file" required accept=".pdf,image/jpeg,image/png"
              onChange={(e) => setForm({ ...form, attachment: e.target.files[0] })} />
          </label>
          <button type="submit">Submit Bid Request</button>
          {message && <p>{message}</p>}
        </form>
      )}
      <section style={{ padding: "20px" }}>
        <h2>{role === "admin" ? "Requests for Review" : "My Requests"}</h2>
        {requests.map((request) => (
          <article key={request._id} style={{ border: "1px solid #ccc", padding: "14px", marginBottom: "12px" }}>
            <strong>{request.address}</strong> — {request.grossSquareFeet.toLocaleString()} sq ft
            <p>{request.propertyType.replaceAll("_", " ")} · {request.serviceFrequency.replace("_", "-")}</p>
            <p>Known issues: {request.knownIssues || "None provided"}</p>
            <a href={request.attachmentUrl} target="_blank" rel="noreferrer">View lot attachment</a>
            <p>Status: <strong>{request.status}</strong></p>
            {role === "admin" && request.status === "pending" && (
              <><button onClick={() => review(request._id, "approved")}>Approve</button>
              <button onClick={() => review(request._id, "declined")}>Decline</button></>
            )}
          </article>
        ))}
      </section>
    </main>
  );
}
