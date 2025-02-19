import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";

function ClientProfitStatement() {
  const { propertyId } = useParams();
  const navigate = useNavigate();

  const [profitData, setProfitData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchProfitData = async () => {
      try {
        const token = localStorage.getItem("token");
        const response = await fetch(
          `https://cp-check-submissions-dev-backend.onrender.com/api/profits/${propertyId}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        const data = await response.json();
        if (response.ok) {
          setProfitData(data);
        } else {
          setError(data.error || "Error fetching profit data");
        }
      } catch (err) {
        console.error("Error fetching profit data:", err);
        setError("Server error while fetching profit data");
      } finally {
        setLoading(false);
      }
    };

    fetchProfitData();
  }, [propertyId]);

  if (loading) return <div className="loading-text">Loading profit data...</div>;
  if (error) return <div className="error-text">Error: {error}</div>;
  if (!profitData) return <div className="info-text">No profit data available.</div>;

  return (
    <div className="profit-statement-container">
      <h1 className="profit-header">💰 Profit Statement</h1>
      
      <div className="profit-card">
        <p>
          <strong>Current Month Profit:</strong>{" "}
          <span className="profit-value">${profitData.monthlyProfit.toFixed(2)}</span>
        </p>
        <p>
          <strong>Year-to-Date Profit:</strong>{" "}
          <span className="profit-value">${profitData.ytdProfit.toFixed(2)}</span>
        </p>
        <p>
          <strong>Uploaded at:</strong>{" "}
          {new Date(profitData.uploadedAt).toLocaleString()}
        </p>
        {profitData.pdfUrl && (
          <p>
            <a
              className="pdf-link"
              href={profitData.pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              View PDF Statement
            </a>
          </p>
        )}
      </div>

      <button className="back-button" onClick={() => navigate("/dashboard")}>
        ← Back to Dashboard
      </button>
    </div>
  );
}

export default ClientProfitStatement;
