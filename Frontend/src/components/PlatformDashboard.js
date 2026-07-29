import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";
import { storeAuthentication, logoutSession } from "../services/session";
import PageHeader from "./ui/PageHeader";

export default function PlatformDashboard() {
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/api/platform/organizations")
      .then(setReport)
      .catch((requestError) => setError(requestError.message));
  }, []);

  const organizations = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (report?.organizations || []).filter((organization) =>
      !query || `${organization.name} ${organization.orgType}`.toLowerCase().includes(query)
    );
  }, [report, search]);

  async function enterOrganization(organization) {
    const reason = window.prompt(
      `Why are you entering ${organization.name}?`,
      "Development and support"
    );
    if (!reason?.trim() || busy) return;
    setBusy(organization.organizationId);
    setError("");
    try {
      const authentication = await api.post(
        `/api/platform/organizations/${organization.organizationId}/assume`,
        { reason: reason.trim() }
      );
      storeAuthentication(authentication);
      window.location.assign("/dashboard");
    } catch (requestError) {
      setError(requestError.message);
      setBusy("");
    }
  }

  async function logout() {
    await logoutSession();
    navigate("/");
  }

  return (
    <div className="beta-page">
      <main className="beta-page-shell">
        <PageHeader
          eyebrow="Platform administration"
          title="Organization overview"
          subtitle="Cross-organization operational health and support access."
          actions={<button className="beta-back-link" type="button" onClick={logout}>Log out</button>}
        />
        {error && <p className="beta-alert error">{error}</p>}
        {!report ? <div className="beta-empty-state">Loading platform metrics...</div> : (
          <>
            <section className="beta-card-grid">
              {[
                ["Organizations", report.summary.organizationCount],
                ["Active users", report.summary.activeUserCount],
                ["Properties", report.summary.propertyCount],
                ["30-day submissions", report.summary.recentSubmissionCount],
                ["Pending bids", report.summary.pendingBidCount],
                ["Invoice attention", report.summary.pendingInvoiceCount],
              ].map(([label, value]) => (
                <article className="beta-card" key={label}>
                  <small>{label}</small>
                  <h2>{value.toLocaleString()}</h2>
                </article>
              ))}
            </section>
            <section className="beta-section">
              <div className="beta-section-heading">
                <div>
                  <h2>Organizations</h2>
                  <p>Select an organization to open a temporary audited admin session.</p>
                </div>
              </div>
              <input
                className="beta-search-input"
                type="search"
                placeholder="Search organizations"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <div className="beta-card-grid">
                {organizations.map((organization) => (
                  <article className="beta-card" key={organization.organizationId}>
                    <div className="beta-card-header">
                      <div>
                        <h3>{organization.name}</h3>
                        <p>{organization.orgType}</p>
                      </div>
                    </div>
                    <p>{organization.propertyCount} properties · {organization.activeUserCount} active users</p>
                    <p>{organization.recentSubmissionCount} submissions in 30 days</p>
                    <p>{organization.pendingBidCount} pending bids · {organization.pendingInvoiceCount} invoice items</p>
                    <button
                      className="beta-button"
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() => enterOrganization(organization)}
                    >
                      {busy === organization.organizationId ? "Entering..." : "Enter organization"}
                    </button>
                  </article>
                ))}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
