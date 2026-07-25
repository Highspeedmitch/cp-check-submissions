import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "./ui/PageHeader";
import { NOTIFICATION_SECTIONS, useMarkNotificationsRead } from "../services/notificationCenter";
import { api } from "../services/api";

export default function BidRequests() {
  const navigate = useNavigate();
  const role = localStorage.getItem("role");
  const [requests, setRequests] = useState([]);
  const [activeRequests, setActiveRequests] = useState([]);
  const [archivedRequests, setArchivedRequests] = useState([]);
  const [tab, setTab] = useState("active");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState("");
  const [formVersion, setFormVersion] = useState(0);
  const [form, setForm] = useState({
    grossSquareFeet: "", propertyType: "free_standing", address: "",
    serviceFrequency: "monthly", knownIssues: "", attachment: null,
  });
  useMarkNotificationsRead(NOTIFICATION_SECTIONS.bids);

  const load = useCallback(async () => {
    try {
      if (role === "admin") {
        const [active, archived] = await Promise.all([
          api.get("/api/bid-requests?archive=active"),
          api.get("/api/bid-requests?archive=archived"),
        ]);
        setActiveRequests(active);
        setArchivedRequests(archived);
      } else {
        setRequests(await api.get("/api/bid-requests"));
      }
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => { load(); }, [load]);

  async function submit(event) {
    event.preventDefault();
    if (busyAction) return;
    const body = new FormData();
    Object.entries(form).forEach(([key, value]) => value != null && body.append(key, value));
    setBusyAction("submit");
    setMessage("");
    setError("");
    try {
      await api.post("/api/bid-requests", body);
      setMessage("Bid request sent to the organization admin.");
      setForm({
        grossSquareFeet: "", propertyType: "free_standing", address: "",
        serviceFrequency: "monthly", knownIssues: "", attachment: null,
      });
      setFormVersion((version) => version + 1);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyAction("");
    }
  }

  async function review(id, status) {
    await runAction(`${id}:review`, () => api.put(`/api/bid-requests/${id}/review`, { status }),
      `Bid ${status === "approved" ? "approved" : "declined"}.`);
  }

  async function archive(request) {
    if (request.status === "pending"
      && !window.confirm("This bid has not been reviewed. Archive it anyway?")) return;
    await runAction(`${request._id}:archive`,
      () => api.put(`/api/bid-requests/${request._id}/archive`),
      "Bid archived.");
  }

  async function restore(id) {
    await runAction(`${id}:restore`,
      () => api.put(`/api/bid-requests/${id}/restore`),
      "Bid restored.");
  }

  async function runAction(key, request, successMessage) {
    if (busyAction) return;
    setBusyAction(key);
    setMessage("");
    setError("");
    try {
      await request();
      setMessage(successMessage);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyAction("");
    }
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
        <form key={formVersion} onSubmit={submit} className="beta-panel beta-form-grid">
          <label className="beta-form-field">Gross square footage
          <input type="number" min="1" required value={form.grossSquareFeet}
            onChange={(event) => setForm({ ...form, grossSquareFeet: event.target.value })} /></label>
          <label className="beta-form-field">Property type
          <select value={form.propertyType} onChange={(event) => setForm({ ...form, propertyType: event.target.value })}>
            <option value="free_standing">Free standing</option>
            <option value="strip_mall">Strip mall</option>
            <option value="individual_suite">Individual suite</option>
          </select></label>
          <label className="beta-form-field full">Property address
          <input required value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} /></label>
          <label className="beta-form-field">Service frequency
          <select value={form.serviceFrequency} onChange={(event) => setForm({ ...form, serviceFrequency: event.target.value })}>
            <option value="monthly">Monthly</option>
            <option value="weekly">Weekly</option>
            <option value="ad_hoc">Ad-hoc</option>
          </select></label>
          <label className="beta-form-field full">Known issues
          <textarea placeholder="Optional notes about the property" value={form.knownIssues}
            onChange={(event) => setForm({ ...form, knownIssues: event.target.value })} /></label>
          <label className="beta-form-field full">Lot dimensions with perimeter lines (PDF, JPG, or PNG)
            <input type="file" required accept=".pdf,image/jpeg,image/png"
              onChange={(event) => setForm({ ...form, attachment: event.target.files[0] })} />
          </label>
          <div className="beta-card-actions full">
            <button className="beta-button" type="submit" disabled={busyAction === "submit"}>
              {busyAction === "submit" ? "Sending…" : "Submit Bid Request"}
            </button>
          </div>
        </form>
      )}

      <section className="beta-section">
        {error && <p className="beta-alert error">{error}</p>}
        {message && <p className="beta-alert success">{message}</p>}
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

        {loading ? <div className="beta-empty-state">Loading bids…</div> : <div className="beta-card-grid">
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
                <button className="beta-button" disabled={Boolean(busyAction)} onClick={() => review(request._id, "approved")}>
                  {busyAction === `${request._id}:review` ? "Updating…" : "Approve"}
                </button>
                <button className="beta-button danger" disabled={Boolean(busyAction)} onClick={() => review(request._id, "declined")}>Decline</button>
              </>
            )}
            {role === "admin" && tab === "active"
              && <button className="beta-button secondary" disabled={Boolean(busyAction)} onClick={() => archive(request)}>
                {busyAction === `${request._id}:archive` ? "Archiving…" : "Archive"}
              </button>}
            {role === "admin" && tab === "archived"
              && <button className="beta-button secondary" disabled={Boolean(busyAction)} onClick={() => restore(request._id)}>
                {busyAction === `${request._id}:restore` ? "Restoring…" : "Restore"}
              </button>}
            </div>
          </article>
        ))}
        </div>}
        {!loading && !visibleRequests.length && <div className="beta-empty-state">No bids match this view.</div>}
      </section>
    </main>
    </div>
  );
}
