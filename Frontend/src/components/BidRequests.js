import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "./ui/PageHeader";
import { NOTIFICATION_SECTIONS, useMarkNotificationsRead } from "../services/notificationCenter";

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
  useMarkNotificationsRead(NOTIFICATION_SECTIONS.bids);

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
    <div className="beta-page">
    <main className="beta-page-shell">
      <PageHeader
        onBack={() => navigate("/dashboard")}
        title={role === "admin" ? "Bid Requests" : "Get A Bid"}
        subtitle={role === "admin" ? "Review and manage property service requests" : "Request service pricing for a new property"}
      />

      {role === "property_manager" && (
        <form onSubmit={submit} className="beta-panel beta-form-grid">
          <label className="beta-form-field">Gross square footage
          <input type="number" min="1" required
            onChange={(event) => setForm({ ...form, grossSquareFeet: event.target.value })} /></label>
          <label className="beta-form-field">Property type
          <select value={form.propertyType} onChange={(event) => setForm({ ...form, propertyType: event.target.value })}>
            <option value="free_standing">Free standing</option>
            <option value="strip_mall">Strip mall</option>
            <option value="individual_suite">Individual suite</option>
          </select></label>
          <label className="beta-form-field full">Property address
          <input required onChange={(event) => setForm({ ...form, address: event.target.value })} /></label>
          <label className="beta-form-field">Service frequency
          <select value={form.serviceFrequency} onChange={(event) => setForm({ ...form, serviceFrequency: event.target.value })}>
            <option value="monthly">Monthly</option>
            <option value="weekly">Weekly</option>
            <option value="ad_hoc">Ad-hoc</option>
          </select></label>
          <label className="beta-form-field full">Known issues
          <textarea placeholder="Optional notes about the property"
            onChange={(event) => setForm({ ...form, knownIssues: event.target.value })} /></label>
          <label className="beta-form-field full">Lot dimensions with perimeter lines (PDF, JPG, or PNG)
            <input type="file" required accept=".pdf,image/jpeg,image/png"
              onChange={(event) => setForm({ ...form, attachment: event.target.files[0] })} />
          </label>
          <div className="beta-card-actions full">
            <button className="beta-button" type="submit">Submit Bid Request</button>
          </div>
          {message && <p className="beta-alert success full">{message}</p>}
        </form>
      )}

      <section className="beta-section">
        <div className="beta-section-heading">
          <div><h2>{role === "admin" ? "Bid Management" : "My Requests"}</h2>
          <p>{visibleRequests.length} requests in this view</p></div>
        </div>
        {role === "admin" && (
          <div className="beta-tabs">
            <button className={tab === "active" ? "active" : ""} onClick={() => setTab("active")}>
              Active Bids ({activeRequests.length})
            </button>
            <button className={tab === "archived" ? "active" : ""} onClick={() => setTab("archived")}>
              Archived Bids ({archivedRequests.length})
            </button>
          </div>
        )}
        <input className="beta-search-input" type="search" placeholder="Search by address, requester, or status"
          value={search} onChange={(event) => setSearch(event.target.value)}
        />

        <div className="beta-card-grid">
        {visibleRequests.map((request) => (
          <article className="beta-card" key={request._id}>
            <div className="beta-card-header">
              <div><h3>{request.address}</h3><p>{request.grossSquareFeet.toLocaleString()} sq ft</p></div>
              <span className={`beta-status ${request.status}`}>{request.status}</span>
            </div>
            <p>{request.propertyType.replaceAll("_", " ")} · {request.serviceFrequency.replace("_", "-")}</p>
            {request.requestedBy && <p>Requested by: {request.requestedBy.username || request.requestedBy.email}</p>}
            <p>Known issues: {request.knownIssues || "None provided"}</p>
            <a className="beta-link-button" href={request.attachmentUrl} target="_blank" rel="noreferrer">View lot attachment</a>
            {request.archivedAt && (
              <p>Archived {new Date(request.archivedAt).toLocaleDateString()}
                {request.archivedBy && ` by ${request.archivedBy.username || request.archivedBy.email}`}</p>
            )}
            <div className="beta-card-actions">
            {role === "admin" && tab === "active" && request.status === "pending" && (
              <>
                <button className="beta-button" onClick={() => review(request._id, "approved")}>Approve</button>
                <button className="beta-button danger" onClick={() => review(request._id, "declined")}>Decline</button>
              </>
            )}
            {role === "admin" && tab === "active"
              && <button className="beta-button secondary" onClick={() => archive(request)}>Archive</button>}
            {role === "admin" && tab === "archived"
              && <button className="beta-button secondary" onClick={() => restore(request._id)}>Restore</button>}
            </div>
          </article>
        ))}
        </div>
        {!visibleRequests.length && <div className="beta-empty-state">No bids match this view.</div>}
      </section>
    </main>
    </div>
  );
}
