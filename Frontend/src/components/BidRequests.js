import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const API = "https://cp-check-submissions-dev-backend.onrender.com/api/bid-requests";

export default function BidRequests() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");
  const [requests, setRequests] = useState([]);
  const [activeRequests, setActiveRequests] = useState([]);
  const [archivedRequests, setArchivedRequests] = useState([]);
  const [tab, setTab] = useState("active");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    grossSquareFeet: "", propertyType: "free_standing", address: "",
    serviceFrequency: "monthly", knownIssues: "", attachment: null,
  });

  const load = useCallback(async () => {
    const auth = { headers: { Authorization: `Bearer ${token}` } };
    if (role === "admin") {
      const [activeResponse, archivedResponse] = await Promise.all([
        fetch(`${API}?archive=active`, auth),
        fetch(`${API}?archive=archived`, auth),
      ]);
      const [active, archived] = await Promise.all([activeResponse.json(), archivedResponse.json()]);
      if (activeResponse.ok) setActiveRequests(active);
      if (archivedResponse.ok) setArchivedRequests(archived);
    } else {
      const response = await fetch(API, auth);
      const data = await response.json();
      if (response.ok) setRequests(data);
    }
  }, [role, token]);

  useEffect(() => { load(); }, [load]);

  async function submit(event) {
    event.preventDefault();
    const body = new FormData();
    Object.entries(form).forEach(([key, value]) => value != null && body.append(key, value));
    const response = await fetch(API, {
      method: "POST", headers: { Authorization: `Bearer ${token}` }, body,
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

  async function archive(request) {
    if (request.status === "pending"
      && !window.confirm("This bid has not been reviewed. Archive it anyway?")) return;
    await fetch(`${API}/${request._id}/archive`, {
      method: "PUT", headers: { Authorization: `Bearer ${token}` },
    });
    load();
  }

  async function restore(id) {
    await fetch(`${API}/${id}/restore`, {
      method: "PUT", headers: { Authorization: `Bearer ${token}` },
    });
    load();
  }

  const visibleRequests = (role === "admin"
    ? (tab === "archived" ? archivedRequests : activeRequests)
    : requests
  ).filter((request) => [
    request.address, request.status, request.requestedBy?.username, request.requestedBy?.email,
  ].filter(Boolean).join(" ").toLowerCase().includes(search.toLowerCase()));

  return (
    <main className="main-content" style={{ maxWidth: "900px", margin: "30px auto" }}>
      <header className="dashboard-header">
        <h1>{role === "admin" ? "Bid Requests" : "Get A Bid"}</h1>
        <button className="logout-btn" onClick={() => navigate("/dashboard")}>Back to Dashboard</button>
      </header>

      {role === "property_manager" && (
        <form onSubmit={submit} style={{ display: "grid", gap: "12px", padding: "20px" }}>
          <input type="number" min="1" required placeholder="Gross square footage"
            onChange={(event) => setForm({ ...form, grossSquareFeet: event.target.value })} />
          <select value={form.propertyType} onChange={(event) => setForm({ ...form, propertyType: event.target.value })}>
            <option value="free_standing">Free standing</option>
            <option value="strip_mall">Strip mall</option>
            <option value="individual_suite">Individual suite</option>
          </select>
          <input required placeholder="Property address"
            onChange={(event) => setForm({ ...form, address: event.target.value })} />
          <select value={form.serviceFrequency} onChange={(event) => setForm({ ...form, serviceFrequency: event.target.value })}>
            <option value="monthly">Monthly</option>
            <option value="weekly">Weekly</option>
            <option value="ad_hoc">Ad-hoc</option>
          </select>
          <textarea placeholder="Known issues"
            onChange={(event) => setForm({ ...form, knownIssues: event.target.value })} />
          <label>Lot dimensions with perimeter lines (PDF, JPG, or PNG)
            <input type="file" required accept=".pdf,image/jpeg,image/png"
              onChange={(event) => setForm({ ...form, attachment: event.target.files[0] })} />
          </label>
          <button type="submit">Submit Bid Request</button>
          {message && <p>{message}</p>}
        </form>
      )}

      <section style={{ padding: "20px" }}>
        <h2>{role === "admin" ? "Bid Management" : "My Requests"}</h2>
        {role === "admin" && (
          <div style={{ display: "flex", gap: "8px", marginBottom: "14px" }}>
            <button onClick={() => setTab("active")} disabled={tab === "active"}>
              Active Bids ({activeRequests.length})
            </button>
            <button onClick={() => setTab("archived")} disabled={tab === "archived"}>
              Archived Bids ({archivedRequests.length})
            </button>
          </div>
        )}
        <input type="search" placeholder="Search by address, requester, or status"
          value={search} onChange={(event) => setSearch(event.target.value)}
          style={{ width: "100%", marginBottom: "16px" }} />

        {visibleRequests.map((request) => (
          <article key={request._id} style={{ border: "1px solid #ccc", padding: "14px", marginBottom: "12px" }}>
            <strong>{request.address}</strong> — {request.grossSquareFeet.toLocaleString()} sq ft
            <p>{request.propertyType.replaceAll("_", " ")} · {request.serviceFrequency.replace("_", "-")}</p>
            {request.requestedBy && <p>Requested by: {request.requestedBy.username || request.requestedBy.email}</p>}
            <p>Known issues: {request.knownIssues || "None provided"}</p>
            <a href={request.attachmentUrl} target="_blank" rel="noreferrer">View lot attachment</a>
            <p>Status: <strong>{request.status}</strong></p>
            {request.archivedAt && (
              <p>Archived {new Date(request.archivedAt).toLocaleDateString()}
                {request.archivedBy && ` by ${request.archivedBy.username || request.archivedBy.email}`}</p>
            )}
            {role === "admin" && tab === "active" && request.status === "pending" && (
              <>
                <button onClick={() => review(request._id, "approved")}>Approve</button>
                <button onClick={() => review(request._id, "declined")}>Decline</button>
              </>
            )}
            {role === "admin" && tab === "active"
              && <button onClick={() => archive(request)}>Archive Bid</button>}
            {role === "admin" && tab === "archived"
              && <button onClick={() => restore(request._id)}>Restore Bid</button>}
          </article>
        ))}
        {!visibleRequests.length && <p>No bids match this view.</p>}
      </section>
    </main>
  );
}
