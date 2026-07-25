// AdminSubmissions.js
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

function AdminSubmissions() {
  const { property } = useParams();
  const navigate = useNavigate();
  const [submissions, setSubmissions] = useState([]);
  const [months, setMonths] = useState(12);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const token = localStorage.getItem("token");

  useEffect(() => {
    if (!token) {
      navigate("/login");
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError("");

    fetch(`https://cp-check-submissions-dev-backend.onrender.com/api/admin/submissions/${encodeURIComponent(property)}?months=${months}`, {
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
    <div className="container">
      <h1>{property} - Submissions</h1>
      <div className="submission-range-filter">
        <label htmlFor="submission-months">Show submissions from the last</label>
        <select
          id="submission-months"
          value={months}
          onChange={(event) => setMonths(Number(event.target.value))}
        >
          {Array.from({ length: 18 }, (_, index) => index + 1).map((month) => (
            <option key={month} value={month}>
              {month} {month === 1 ? "month" : "months"}
            </option>
          ))}
        </select>
      </div>
      {loading ? (
        <p>Loading submissions...</p>
      ) : error ? (
        <p className="error">{error}</p>
      ) : submissions.length === 0 ? (
        <p>No submissions found for the last {months} {months === 1 ? "month" : "months"}.</p>
      ) : (
        <ul>
          {submissions.map((sub) => (
            <li key={sub._id}>
              <a href={sub.signedPdfUrl} target="_blank" rel="noopener noreferrer">
                {new Date(sub.submittedAt).toLocaleString()} - Download PDF
              </a>
            </li>
          ))}
        </ul>
      )}
      <button onClick={() => navigate("/dashboard")}>Return to Dashboard</button>
    </div>
  );
}

export default AdminSubmissions;
