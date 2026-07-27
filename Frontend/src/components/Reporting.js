import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";
import PageHeader from "./ui/PageHeader";

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
          <h2>Submitter Activity</h2>
          <p>Who submitted, where, and their typical submission time.</p>
        </div>
      </div>
      {submitters.length ? (
        <div className="beta-report-table-wrap">
          <table className="beta-data-table">
            <thead>
              <tr>
                <th>Submitter</th>
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
        <div className="beta-empty-state">No submitter activity matches these filters.</div>
      )}
    </section>
  );
}

function AdminReportingSection() {
  // Intentionally isolated so future organization-wide reports can be added
  // without changing or exposing the shared PM reporting components.
  return null;
}

export default function Reporting() {
  const navigate = useNavigate();
  const role = localStorage.getItem("role") || "user";
  const orgName = localStorage.getItem("orgName") || "Your Organization";
  const [months, setMonths] = useState("12");
  const [propertyId, setPropertyId] = useState("");
  const [userId, setUserId] = useState("");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
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
  }, [months, propertyId, userId]);

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
          subtitle="Property conditions, inspection activity, and submitter performance."
          actions={(
            <span className="beta-status">
              {role === "admin" ? "Admin View" : "PM View"}
            </span>
          )}
        />

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
            Submitter
            <select value={userId} onChange={(event) => setUserId(event.target.value)}>
              <option value="">All Submitters</option>
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
                label="Issues Per Inspection"
                value={report.summary.issuesPerInspection.toFixed(1)}
                context={`Based on ${report.summary.reportableIssueSubmissionCount} reportable submissions`}
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
      </main>
    </div>
  );
}
