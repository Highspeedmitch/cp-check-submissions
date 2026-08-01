// AdminSubmissions.js
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import PageHeader from "./ui/PageHeader";
import { useMarkNotificationsRead } from "../services/notificationCenter";
import { apiUrl } from "../services/api";
import ContextualHelpLink from "./help/ContextualHelpLink";

function AdminSubmissions() {
  const { property } = useParams();
  const navigate = useNavigate();
  const [submissions, setSubmissions] = useState([]);
  const [months, setMonths] = useState(12);
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

    fetch(apiUrl(`/api/admin/submissions/${encodeURIComponent(property)}?months=${months}`), {
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
        setSubmissions(data);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        console.error("Error fetching admin submissions:", err);
        setError("Failed to load submissions");
        setLoading(false);
      });
    return () => controller.abort();
  }, [property, months, token, navigate]);

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
        <div><h2>Submission history</h2><p>{submissions.length} records in this view</p></div>
      <div className="submission-range-filter">
        <label htmlFor="submission-months">Show submissions from the last</label>
        <select
          id="submission-months"
          value={months}
          onChange={(event) => setMonths(Number(event.target.value))}
        >
          {[1, 3, 6, 12, 18].map((month) => (
            <option key={month} value={month}>
              {month} {month === 1 ? "month" : "months"}
            </option>
          ))}
        </select>
      </div>
      </div>
      {loading ? (
        <div className="beta-empty-state">Loading submissions...</div>
      ) : error ? (
        <p className="beta-alert error">{error}</p>
      ) : submissions.length === 0 ? (
        <div className="beta-empty-state">No submissions found for the last {months} {months === 1 ? "month" : "months"}.</div>
      ) : (
        <section className="beta-panel beta-submission-list">
          {submissions.map((sub) => (
            <article key={sub._id}>
              <div><strong>{new Date(sub.submittedAt).toLocaleDateString()}</strong>
                <small>{new Date(sub.submittedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</small>
              </div>
              <a className="beta-button secondary" href={sub.signedPdfUrl} target="_blank" rel="noopener noreferrer">View PDF</a>
            </article>
          ))}
        </section>
      )}
    </main>
    </div>
  );
}

export default AdminSubmissions;
