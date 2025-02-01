// AdminSubmissions.js
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

function AdminSubmissions() {
  const { property } = useParams();
  const navigate = useNavigate();
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const token = localStorage.getItem("token");

  useEffect(() => {
    if (!token) {
      navigate("/login");
      return;
    }

    // Fetch admin submissions for the specified property
    fetch(`https://cp-check-submissions-dev-backend.onrender.com/api/admin/submissions/${encodeURIComponent(property)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
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
        console.error("Error fetching admin submissions:", err);
        setError("Failed to load submissions");
        setLoading(false);
      });
  }, [property, token, navigate]);

  return (
    <div className="container">
      <h1>{property} - Submissions (Last 3 Months)</h1>
      {loading ? (
        <p>Loading submissions...</p>
      ) : error ? (
        <p className="error">{error}</p>
      ) : submissions.length === 0 ? (
        <p>No submissions found for the last 3 months.</p>
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
