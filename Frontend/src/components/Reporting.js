import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  formatInspectionIssuePercent,
  inspectionIssueCoverageLabel,
} from "../services/reportingPresentation";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, apiUrl } from "../services/api";
import ContextualHelpLink from "./help/ContextualHelpLink";
import PageHeader from "./ui/PageHeader";
import { useMarkNotificationsRead } from "../services/notificationCenter";

function formatMinuteOfDay(value) {
  if (!Number.isFinite(value)) return "N/A";
  const hours = Math.floor(value / 60) % 24;
  const minutes = value % 60;
  const suffix = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 || 12;
  return `${displayHour}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function MetricCard({ label, value, context }) {
  return (
    <article className="beta-card beta-report-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{context}</small>
    </article>
  );
}

function SubmissionActivity({ activity }) {
  const max = Math.max(...activity.map((item) => item.submissions), 1);
  return (
    <section className="beta-panel beta-report-panel">
      <div className="beta-section-heading">
        <div>
          <h2>Submission Activity</h2>
          <p>Completed inspections by month.</p>
        </div>
      </div>
      <div className="beta-report-chart" role="img" aria-label="Monthly inspection submission activity">
        {activity.map((item) => (
          <div className="beta-report-chart-column" key={item.label}>
            <span>{item.submissions}</span>
            <div className="beta-report-chart-track">
              <div
                className="beta-report-chart-bar"
                style={{ height: `${Math.max((item.submissions / max) * 100, item.submissions ? 8 : 0)}%` }}
              />
            </div>
            <small>{item.label.replace(" ", "\n")}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function IssueBreakdown({ issues, reportableCount, submissionCount }) {
  const max = Math.max(...issues.map((issue) => issue.occurrences), 1);
  return (
    <section className="beta-panel beta-report-panel">
      <div className="beta-section-heading">
        <div>
          <h2>Most Common Issues</h2>
          <p>
            Checklist fields marked with an issue · Based on {reportableCount} of {submissionCount} submissions.
          </p>
        </div>
      </div>
      {issues.length ? (
        <div className="beta-report-issues">
          {issues.slice(0, 8).map((issue) => (
            <div className="beta-report-issue-row" key={issue.key}>
              <span>{issue.label}</span>
              <div className="beta-report-issue-track" aria-hidden="true">
                <div
                  className="beta-report-issue-bar"
                  style={{ width: `${(issue.occurrences / max) * 100}%` }}
                />
              </div>
              <strong>{issue.occurrences}</strong>
            </div>
          ))}
        </div>
      ) : (
        <div className="beta-empty-state">No issue responses were recorded in this reporting period.</div>
      )}
    </section>
  );
}

function SubmitterActivity({ submitters }) {
  return (
    <section className="beta-panel beta-report-panel">
      <div className="beta-section-heading">
        <div>
          <h2>Field Operator Activity</h2>
          <p>Who submitted, where, and their typical submission time.</p>
        </div>
      </div>
      {submitters.length ? (
        <div className="beta-report-table-wrap">
          <table className="beta-data-table">
            <thead>
              <tr>
                <th>Field Operator</th>
                <th>Properties Serviced</th>
                <th>Submissions</th>
                <th>Average Time</th>
                <th>Most Recent Property</th>
              </tr>
            </thead>
            <tbody>
              {submitters.map((submitter) => (
                <tr key={submitter.userId}>
                  <td><strong>{submitter.name}</strong></td>
                  <td>{submitter.propertyCount}</td>
                  <td>{submitter.submissionCount}</td>
                  <td>{formatMinuteOfDay(submitter.averageSubmissionMinute)}</td>
                  <td>{submitter.mostRecentProperty || "N/A"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="beta-empty-state">No field operator activity matches these filters.</div>
      )}
    </section>
  );
}

function AdminReportingSection() {
  // Intentionally isolated so future organization-wide reports can be added
  // without changing or exposing the shared PM reporting components.
  return null;
}

function monthlyStatusLabel(status) {
  return ({
    queued: "Queued",
    processing: "Preparing",
    completed: "Ready",
    failed: "Needs attention",
  })[status] || status;
}

function monthDelta(value, label) {
  const amount = Number(value || 0);
  if (!amount) return `No monthly change in ${label}`;
  return `${amount > 0 ? "+" : ""}${amount} ${label} from prior month`;
}

async function downloadMonthlySummary(report) {
  const response = await fetch(apiUrl(report.downloadUrl), {
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Unable to download the monthly portfolio summary.");
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = `${report.periodLabel} Portfolio Summary.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

function MonthlySummaryCard({ report, showRecipient, onDownload, busy }) {
  const metrics = report.metrics;
  return (
    <article className="beta-card beta-monthly-summary-card">
      <div className="beta-monthly-summary-heading">
        <div>
          <p className="beta-eyebrow">{report.periodLabel}</p>
          <h3>Executive Portfolio Summary</h3>
          {showRecipient && <p>Prepared for {report.recipient?.name || report.recipient?.email}</p>}
        </div>
        <span className={`beta-status beta-monthly-status ${report.status}`}>{monthlyStatusLabel(report.status)}</span>
      </div>

      {report.status === "failed" && (
        <p className="beta-alert error">{report.lastError || "This summary could not be prepared."}</p>
      )}
      {report.status !== "completed" && report.status !== "failed" && (
        <p className="beta-monthly-progress">Afterlight is aggregating the reporting snapshot and preparing the PDF.</p>
      )}
      {report.status === "completed" && metrics && (
        <>
          <div className="beta-monthly-metrics" aria-label={`${report.periodLabel} portfolio metrics`}>
            <div><span>Reports</span><strong>{metrics.submissionCount}</strong><small>{monthDelta(report.comparison?.submissionCountDelta, "reports")}</small></div>
            <div><span>Coverage</span><strong>{metrics.propertiesWithSubmissionsCount}/{metrics.managedPropertyCount}</strong><small>Managed properties with reports</small></div>
            <div><span>With issues</span><strong>{metrics.inspectionsWithIssuesPercent}%</strong><small>{metrics.inspectionsWithIssuesCount} of {metrics.reportableSubmissionCount} reportable</small></div>
            <div><span>Issue records</span><strong>{metrics.totalIssueOccurrences}</strong><small>{monthDelta(report.comparison?.totalIssueOccurrencesDelta, "records")}</small></div>
          </div>
          <p className="beta-monthly-narrative">{report.narrative?.executiveSummary}</p>
          <div className="beta-monthly-summary-footer">
            <div>
              <strong>{report.propertyCount} managed {report.propertyCount === 1 ? "property" : "properties"}</strong>
              <small>
                {report.emailSentAt
                  ? `Emailed ${new Date(report.emailSentAt).toLocaleDateString()}`
                  : report.mode === "preview" ? "DEV preview - email not sent" : "Available in Afterlight"}
              </small>
            </div>
            <button
              type="button"
              className="beta-button compact"
              disabled={busy}
              onClick={() => onDownload(report)}
            >
              Download PDF
            </button>
          </div>
        </>
      )}
    </article>
  );
}

function MonthlySummaries({ role }) {
  const [data, setData] = useState({ feature: { mode: "off", enabled: false }, items: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const result = await api.get("/api/reporting/monthly-summaries");
      setData(result);
      setError("");
    } catch (requestError) {
      if (!quiet) setError(requestError.message || "Unable to load monthly summaries.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!data.items.some((item) => ["queued", "processing"].includes(item.status))) return undefined;
    const timer = window.setInterval(() => load({ quiet: true }), 5000);
    return () => window.clearInterval(timer);
  }, [data.items, load]);

  const generate = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const report = await api.post("/api/reporting/monthly-summaries", {});
      setMessage(`${report.periodLabel} was queued for preparation.`);
      await load({ quiet: true });
    } catch (requestError) {
      setError(requestError.message || "Unable to prepare the monthly summary.");
    } finally {
      setBusy(false);
    }
  };

  const download = async (report) => {
    setBusy(true);
    setError("");
    try {
      await downloadMonthlySummary(report);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="beta-monthly-summaries">
      <div className="beta-section-heading beta-monthly-intro">
        <div>
          <p className="beta-eyebrow">Monthly archive</p>
          <h2>Executive Portfolio Summaries</h2>
          <p>
            Each snapshot covers the prior calendar month and the properties assigned to its recipient.
            Reports are for property-management review and are not automatically shared with owners.
          </p>
        </div>
        {!loading && data.feature.enabled && (
          <button type="button" className="beta-button compact" disabled={busy} onClick={generate}>
            {busy ? "Working..." : "Prepare previous month"}
          </button>
        )}
      </div>

      {!loading && data.feature.mode === "preview" && (
        <p className="beta-alert notice">DEV preview is active. Reports are generated and stored, but monthly email delivery is disabled.</p>
      )}
      {!loading && !data.feature.enabled && (
        <p className="beta-alert notice">Monthly portfolio summaries are not enabled for this deployment.</p>
      )}
      {message && <p className="beta-alert success" role="status">{message}</p>}
      {error && <p className="beta-alert error" role="alert">{error}</p>}
      {loading && <div className="beta-empty-state" role="status">Loading monthly summaries...</div>}
      {!loading && !data.items.length && (
        <div className="beta-empty-state">
          No monthly portfolio summaries are available yet. The first automatic report is created after an enabled month closes.
        </div>
      )}
      {!loading && data.items.length > 0 && (
        <div className="beta-monthly-summary-list">
          {data.items.map((report) => (
            <MonthlySummaryCard
              key={report._id}
              report={report}
              showRecipient={role === "admin"}
              onDownload={download}
              busy={busy}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default function Reporting() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const role = localStorage.getItem("role") || "user";
  const orgName = localStorage.getItem("orgName") || "Your Organization";
  const [months, setMonths] = useState("12");
  const [propertyId, setPropertyId] = useState("");
  const [userId, setUserId] = useState("");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const activeView = searchParams.get("view") === "monthly" ? "monthly" : "live";
  useMarkNotificationsRead(
    activeView === "monthly" ? ["monthly_portfolio_summary_ready"] : [],
    "/reporting?view=monthly"
  );

  useEffect(() => {
    if (activeView !== "live") {
      setLoading(false);
      return undefined;
    }
    let active = true;
    const params = new URLSearchParams({ months });
    if (propertyId) params.set("propertyId", propertyId);
    if (userId) params.set("userId", userId);
    setLoading(true);
    setError("");
    api.get(`/api/reporting/summary?${params.toString()}`)
      .then((data) => {
        if (active) setReport(data);
      })
      .catch((requestError) => {
        if (active) setError(requestError.message || "Unable to load reporting data.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [activeView, months, propertyId, userId]);

  const propertyOptions = report?.filterOptions?.properties || [];
  const userOptions = report?.filterOptions?.users || [];
  const propertyContext = useMemo(() => {
    if (!propertyId) return `${propertyOptions.length} managed ${propertyOptions.length === 1 ? "property" : "properties"}`;
    return "For the selected property";
  }, [propertyId, propertyOptions.length]);

  return (
    <div className="beta-page">
      <main className="beta-page-shell beta-reporting-page">
        <PageHeader
          onBack={() => navigate("/dashboard")}
          eyebrow={`Working on behalf of ${orgName}`}
          title="Reporting"
          subtitle="Property conditions, inspection activity, and field operator performance."
          actions={<>
            <span className="beta-status">{role === "admin" ? "Admin View" : "PM View"}</span>
            <ContextualHelpLink slug="review-portfolio-reporting" />
          </>}
        />

        <div className="beta-report-view-tabs" role="tablist" aria-label="Reporting views">
          <button
            type="button"
            role="tab"
            aria-selected={activeView === "live"}
            className={activeView === "live" ? "active" : ""}
            onClick={() => setSearchParams({})}
          >
            Live Reporting
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeView === "monthly"}
            className={activeView === "monthly" ? "active" : ""}
            onClick={() => setSearchParams({ view: "monthly" })}
          >
            Monthly Summaries
          </button>
        </div>

        {activeView === "monthly" ? <MonthlySummaries role={role} /> : <>
        <div className="beta-toolbar beta-report-filters">
          <label className="beta-form-field">
            Date Range
            <select
              value={months}
              onChange={(event) => {
                setMonths(event.target.value);
                setUserId("");
              }}
            >
              <option value="3">Last 3 Months</option>
              <option value="6">Last 6 Months</option>
              <option value="12">Last 12 Months</option>
              <option value="18">Last 18 Months</option>
            </select>
          </label>
          <label className="beta-form-field">
            Property
            <select value={propertyId} onChange={(event) => setPropertyId(event.target.value)}>
              <option value="">All Managed Properties</option>
              {propertyOptions.map((property) => (
                <option value={property._id} key={property._id}>{property.name}</option>
              ))}
            </select>
          </label>
          <label className="beta-form-field">
            Field Operator
            <select value={userId} onChange={(event) => setUserId(event.target.value)}>
              <option value="">All Field Operators</option>
              {userOptions.map((user) => (
                <option value={user._id} key={user._id}>{user.name}</option>
              ))}
            </select>
          </label>
        </div>

        {error && <p className="beta-alert error" role="alert">{error}</p>}
        {loading && <div className="beta-empty-state" role="status">Loading reporting data…</div>}

        {!loading && report && (
          <>
            {report.summary.unreportableIssueSubmissionCount > 0 && (
              <p className="beta-alert beta-report-coverage" role="status">
                Issue analysis covers {report.summary.reportableIssueSubmissionCount} of{" "}
                {report.summary.submissionCount} submissions. Older submissions created
                before checklist response tracking are included in activity totals but
                cannot be included in issue-level reporting.
              </p>
            )}
            <section className="beta-report-metrics" aria-label="Reporting summary">
              <MetricCard
                label="Submissions"
                value={report.summary.submissionCount}
                context={propertyContext}
              />
              <MetricCard
                label="Average Submission Time"
                value={formatMinuteOfDay(report.summary.averageSubmissionMinute)}
                context={`Local time · ${report.scope.timezone}`}
              />
              <MetricCard
                label="Inspections With Issues"
                value={formatInspectionIssuePercent(report.summary)}
                context={inspectionIssueCoverageLabel(report.summary)}
              />
              <MetricCard
                label="Issue Types Observed"
                value={report.summary.distinctIssueTypes}
                context={`Across ${report.summary.reportableIssueSubmissionCount} reportable submissions`}
              />
            </section>

            {role === "admin" && <AdminReportingSection />}

            <div className="beta-report-visuals">
              <SubmissionActivity activity={report.monthlyActivity} />
              <IssueBreakdown
                issues={report.issues}
                reportableCount={report.summary.reportableIssueSubmissionCount}
                submissionCount={report.summary.submissionCount}
              />
            </div>
            <SubmitterActivity submitters={report.submitters} />
          </>
        )}
        </>}
      </main>
    </div>
  );
}
