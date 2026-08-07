// AdminSubmissions.js
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import PageHeader from "./ui/PageHeader";
import { useMarkNotificationsRead } from "../services/notificationCenter";
import { apiUrl } from "../services/api";
import ContextualHelpLink from "./help/ContextualHelpLink";

const FULFILLMENT_LABELS = {
  direct_submission: "Direct submission",
  customer_employee: "Customer employee",
  customer_contractor: "Customer contractor",
  afterlight_staff: "Afterlight staff",
  afterlight_contractor: "Afterlight contractor",
  legacy: "Legacy submission",
};

const EMPTY_FILTERS = {
  submitter: "",
  assigner: "",
  fulfillment: "",
};

const EMPTY_FILTER_OPTIONS = {
  submitters: [],
  assigners: [],
  includeUnassignedAssigner: false,
  fulfillmentTypes: [],
};

function userOptionLabel(user) {
  if (!user) return "Unknown user";
  return user.email && user.email !== user.name
    ? `${user.name} (${user.email})`
    : user.name;
}

function activityDate(value) {
  if (!value) return "Not recorded";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "Not recorded"
    : parsed.toLocaleDateString();
}

function AdminSubmissions() {
  const { property } = useParams();
  const navigate = useNavigate();
  const [submissions, setSubmissions] = useState([]);
  const [months, setMonths] = useState(12);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [filterOptions, setFilterOptions] = useState(EMPTY_FILTER_OPTIONS);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const token = localStorage.getItem("token");
  useMarkNotificationsRead(
    ["inspection_submitted", "assignment_completed"],
    `/admin/submissions/${encodeURIComponent(property)}`
  );

  useEffect(() => {
    if (!token) {
      navigate("/login");
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError("");
    const query = new URLSearchParams({
      months: String(months),
      page: String(page),
    });
    Object.entries(filters).forEach(([key, value]) => {
      if (value) query.set(key, value);
    });

    fetch(apiUrl(`/api/admin/submissions/${encodeURIComponent(property)}?${query}`), {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error("Failed to fetch submissions");
        }
        return res.json();
      })
      .then((data) => {
        const items = Array.isArray(data) ? data : data.items || [];
        setSubmissions(items);
        setPagination(Array.isArray(data) ? {
          page: 1,
          pageSize: items.length,
          total: items.length,
          totalPages: 1,
        } : data.pagination);
        if (!Array.isArray(data)) {
          setFilterOptions(data.filters || EMPTY_FILTER_OPTIONS);
        }
        setLoading(false);
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        console.error("Error fetching admin submissions:", err);
        setError("Failed to load submissions");
        setLoading(false);
      });
    return () => controller.abort();
  }, [property, months, page, filters, token, navigate]);

  const updateFilter = (name, value) => {
    setFilters((current) => ({ ...current, [name]: value }));
    setPage(1);
  };
  const hasActiveFilters = months !== 12 || Object.values(filters).some(Boolean);
  const firstRecord = pagination.total ? ((pagination.page - 1) * pagination.pageSize) + 1 : 0;
  const lastRecord = Math.min(pagination.page * pagination.pageSize, pagination.total);

  return (
    <div className="beta-page">
    <main className="beta-page-shell">
      <PageHeader
        onBack={() => navigate("/dashboard")}
        eyebrow="Property activity"
        title={property}
        subtitle="Inspection submissions"
        actions={<ContextualHelpLink slug="review-property-submissions" />}
      />
      <div className="beta-toolbar">
        <div><h2>Submission history</h2><p>{pagination.total} {hasActiveFilters ? "matching" : "total"} {pagination.total === 1 ? "record" : "records"}</p></div>
      </div>
      <section className="beta-submission-filters" aria-label="Submission history filters">
        <label className="beta-form-field" htmlFor="submission-months">Date range
          <select
            id="submission-months"
            value={months}
            onChange={(event) => {
              setMonths(Number(event.target.value));
              setPage(1);
            }}
          >
            {[1, 3, 6, 12, 18].map((month) => (
              <option key={month} value={month}>
                Last {month} {month === 1 ? "month" : "months"}
              </option>
            ))}
          </select>
        </label>
        <label className="beta-form-field" htmlFor="submission-submitter">Submitted by
          <select id="submission-submitter" value={filters.submitter} onChange={(event) => updateFilter("submitter", event.target.value)}>
            <option value="">All submitters</option>
            {filterOptions.submitters.map((user) => <option key={user._id} value={user._id}>{userOptionLabel(user)}</option>)}
          </select>
        </label>
        <label className="beta-form-field" htmlFor="submission-assigner">Assigned by
          <select id="submission-assigner" value={filters.assigner} onChange={(event) => updateFilter("assigner", event.target.value)}>
            <option value="">All assigners</option>
            {filterOptions.assigners.map((user) => <option key={user._id} value={user._id}>{userOptionLabel(user)}</option>)}
            {filterOptions.includeUnassignedAssigner && <option value="unassigned">Not recorded / direct</option>}
          </select>
        </label>
        <label className="beta-form-field" htmlFor="submission-fulfillment">Fulfillment
          <select id="submission-fulfillment" value={filters.fulfillment} onChange={(event) => updateFilter("fulfillment", event.target.value)}>
            <option value="">All fulfillment types</option>
            {filterOptions.fulfillmentTypes.map((value) => <option key={value} value={value}>{FULFILLMENT_LABELS[value] || value}</option>)}
          </select>
        </label>
        <button
          type="button"
          className="beta-button secondary beta-submission-clear-filters"
          disabled={!hasActiveFilters}
          onClick={() => {
            setMonths(12);
            setFilters(EMPTY_FILTERS);
            setPage(1);
          }}
        >
          Clear filters
        </button>
      </section>
      {loading ? (
        <div className="beta-empty-state">Loading submissions...</div>
      ) : error ? (
        <p className="beta-alert error">{error}</p>
      ) : submissions.length === 0 ? (
        <div className="beta-empty-state">No submissions match the selected filters.</div>
      ) : (
        <section className="beta-panel beta-submission-list">
          {submissions.map((sub) => (
            <article key={sub._id}>
              <div className="beta-submission-summary">
                <div className="beta-submission-date"><strong>{new Date(sub.submittedAt).toLocaleDateString()}</strong>
                  <small>{new Date(sub.submittedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</small>
                </div>
                <dl className="beta-submission-metadata">
                  <div><dt>Submitted by</dt><dd>{sub.submittedBy?.name || "Unknown user"}</dd></div>
                  <div><dt>Date assigned</dt><dd>{activityDate(sub.assignment?.scheduledAt)}</dd></div>
                  <div><dt>Assigned by</dt><dd>{sub.assignment?.assignedBy?.name || "Not recorded"}</dd></div>
                  <div><dt>Fulfillment</dt><dd>{FULFILLMENT_LABELS[sub.assignment?.fulfillmentType] || "Direct submission"}</dd></div>
                </dl>
              </div>
              <a className="beta-button secondary beta-submission-action" href={sub.signedPdfUrl} target="_blank" rel="noopener noreferrer">View PDF</a>
            </article>
          ))}
        </section>
      )}
      {!loading && !error && pagination.totalPages > 1 && (
        <nav className="beta-submission-pagination" aria-label="Submission history pages">
          <button type="button" className="beta-button secondary" disabled={pagination.page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</button>
          <span>Showing {firstRecord}-{lastRecord} of {pagination.total} {"\u00b7"} Page {pagination.page} of {pagination.totalPages}</span>
          <button type="button" className="beta-button secondary" disabled={pagination.page >= pagination.totalPages} onClick={() => setPage((current) => current + 1)}>Next</button>
        </nav>
      )}
    </main>
    </div>
  );
}

export default AdminSubmissions;
