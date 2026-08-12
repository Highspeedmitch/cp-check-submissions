import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../services/api";

const STATUS_PRESENTATION = {
  complete: { label: "Complete", tone: "success" },
  on_track: { label: "On Track", tone: "success" },
  at_risk: { label: "At Risk", tone: "warning" },
  behind: { label: "Behind", tone: "declined" },
};

const SERVICE_MODEL_LABELS = {
  managed: "Managed Service",
  hybrid: "Hybrid",
};

function plural(count, singular, pluralLabel = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralLabel}`;
}

function WarRoomOrganizationCard({ organization, busy, onOpenOrganization }) {
  const presentation = STATUS_PRESENTATION[organization.status] || STATUS_PRESENTATION.at_risk;
  const hybridProgress = organization.hybridCoverage
    ? Math.min(100, organization.hybridCoverage.minimumPercent > 0
      ? (organization.hybridCoverage.actualPercent / organization.hybridCoverage.minimumPercent) * 100
      : 0)
    : 0;
  return (
    <article className={`platform-war-room-card status-${organization.status}`}>
      <header className="platform-war-room-card-header">
        <div>
          <span className="beta-eyebrow">{SERVICE_MODEL_LABELS[organization.serviceModel]}</span>
          <h3>{organization.name}</h3>
        </div>
        <span className={`beta-status ${presentation.tone}`}>{presentation.label}</span>
      </header>

      <div className="platform-war-room-metrics">
        <div><span>Monthly coverage</span><strong>{organization.month.coveredPropertyCount}/{organization.month.requiredPropertyCount}</strong><small>properties scheduled</small></div>
        <div><span>Completed</span><strong>{organization.month.completedPropertyCount}/{organization.month.requiredPropertyCount}</strong><small>monthly requirements</small></div>
        <div><span>This week</span><strong>{organization.week.completedAssignmentCount}/{organization.week.dueAssignmentCount}</strong><small>{plural(organization.week.remainingAssignmentCount, "assignment")} remaining</small></div>
        <div><span>Exceptions</span><strong>{organization.month.unscheduledPropertyCount + organization.month.missedPropertyCount}</strong><small>{organization.month.missedPropertyCount} missed · {organization.month.unscheduledPropertyCount} unscheduled</small></div>
      </div>

      {organization.hybridCoverage && (
        <section className={`platform-war-room-hybrid${organization.hybridCoverage.meetsMinimum ? " met" : " short"}`}
          aria-label={`${organization.name} Afterlight portfolio coverage`}>
          <div>
            <span>Afterlight portfolio coverage</span>
            <strong>{organization.hybridCoverage.actualPercent}% / {organization.hybridCoverage.minimumPercent}% required</strong>
          </div>
          <div className="platform-war-room-progress" role="progressbar"
            aria-label="Hybrid Afterlight minimum progress"
            aria-valuemin="0" aria-valuemax={organization.hybridCoverage.minimumPercent}
            aria-valuenow={Math.min(organization.hybridCoverage.actualPercent, organization.hybridCoverage.minimumPercent)}>
            <span style={{ width: `${hybridProgress}%` }} />
          </div>
          <small>{organization.hybridCoverage.assignedPropertyCount} of {organization.hybridCoverage.totalPropertyCount} properties assigned to Afterlight; {organization.hybridCoverage.requiredAssignedPropertyCount} required.</small>
        </section>
      )}

      {organization.statusReasons.length > 0 ? (
        <ul className="platform-war-room-reasons">
          {organization.statusReasons.map((reason) => <li key={reason}>{reason}</li>)}
        </ul>
      ) : (
        <p className="platform-war-room-clear">No current scheduling exceptions.</p>
      )}

      <footer className="platform-war-room-card-footer">
        <span>{organization.month.daysRemaining} days remain in {organization.month.label}</span>
        <button type="button" className="beta-button secondary compact" disabled={Boolean(busy)}
          onClick={() => onOpenOrganization(organization)}>
          {busy === organization.organizationId ? "Entering..." : "Open Admin View"}
        </button>
      </footer>
    </article>
  );
}

export default function PlatformWarRoom({ busy = "", onOpenOrganization }) {
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [serviceModel, setServiceModel] = useState("all");
  const [status, setStatus] = useState("all");

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setReport(await api.get("/api/platform/war-room"));
      setError("");
    } catch (requestError) {
      setError(requestError.message || "Unable to load the Weekly War Room.");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const refreshWhenVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => document.removeEventListener("visibilitychange", refreshWhenVisible);
  }, [load]);

  const organizations = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (report?.organizations || []).filter((organization) => {
      if (query && !organization.name.toLowerCase().includes(query)) return false;
      if (serviceModel !== "all" && organization.serviceModel !== serviceModel) return false;
      if (status === "attention" && !["at_risk", "behind"].includes(organization.status)) return false;
      if (!["all", "attention"].includes(status) && organization.status !== status) return false;
      return true;
    });
  }, [report, search, serviceModel, status]);

  if (!report && !error) return <div className="beta-empty-state">Loading Weekly War Room...</div>;

  const summary = report?.summary;
  return (
    <div className="platform-war-room">
      {error && <p className="beta-alert error" role="alert">{error}</p>}
      {report && <>
        <section className="platform-metric-board platform-war-room-summary" aria-label="War Room summary">
          <div><span>Active portfolios</span><strong>{summary.organizationCount}</strong></div>
          <div><span>On track</span><strong>{summary.onTrackCount + summary.completeCount}</strong></div>
          <div><span>At risk</span><strong>{summary.atRiskCount}</strong></div>
          <div><span>Behind</span><strong>{summary.behindCount}</strong></div>
          <div><span>Monthly coverage</span><strong>{summary.coveredPropertyCount}/{summary.requiredPropertyCount}</strong></div>
          <div><span>This week remaining</span><strong>{summary.remainingThisWeekCount}/{summary.dueThisWeekCount}</strong></div>
        </section>

        <section className="platform-war-room-directory" aria-labelledby="war-room-portfolios-title">
          <div className="beta-section-heading platform-war-room-heading">
            <div>
              <h2 id="war-room-portfolios-title">Portfolio operations</h2>
              <p>{report.period.weekLabel} · {report.period.monthLabel}. Exceptions appear first.</p>
            </div>
            <button type="button" className="beta-button secondary compact" onClick={load} disabled={refreshing}>
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
          <div className="platform-war-room-filters" aria-label="War Room filters">
            <label><span>Search</span><input type="search" placeholder="Organization name" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
            <label><span>Service model</span><select value={serviceModel} onChange={(event) => setServiceModel(event.target.value)}><option value="all">Managed and Hybrid</option><option value="managed">Managed Service</option><option value="hybrid">Hybrid</option></select></label>
            <label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option><option value="attention">Needs attention</option><option value="behind">Behind</option><option value="at_risk">At Risk</option><option value="on_track">On Track</option><option value="complete">Complete</option></select></label>
          </div>
          {organizations.length ? (
            <div className="platform-war-room-grid">
              {organizations.map((organization) => <WarRoomOrganizationCard key={organization.organizationId}
                organization={organization} busy={busy} onOpenOrganization={onOpenOrganization} />)}
            </div>
          ) : <div className="beta-empty-state">No active portfolios match these filters.</div>}
        </section>
      </>}
    </div>
  );
}
