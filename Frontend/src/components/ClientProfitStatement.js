import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";

function ClientProfitStatement() {
  const { propertyId } = useParams();
  const navigate = useNavigate();

  const [profitData, setProfitData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showNoProfitModal, setShowNoProfitModal] = useState(false); // Controls modal visibility

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
          setShowNoProfitModal(true); // Show modal if no data is found
        }
      } catch (err) {
        console.error("Error fetching profit data:", err);
        setError("Server error while fetching profit data");
        setShowNoProfitModal(true);
      } finally {
        setLoading(false);
      }
    };

    fetchProfitData();
  }, [propertyId]);

  if (loading) return <div className="loading-text">Loading profit data...</div>;

  return (
    <div className="profit-statement-container">
      <h1 className="profit-header">💰 Profit Statement</h1>

      {profitData ? (
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
            <strong>Uploaded at:</strong> {new Date(profitData.uploadedAt).toLocaleString()}
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
          <button
        className="secondary-button"
        onClick={() => navigate("/dashboard")}
        style={{ marginTop: "1rem" }}
      >
        Back to Dashboard
      </button>
        </div>
      ) : (
        // Show the modal if there's no profit data
        showNoProfitModal && (
          <div className="modal-overlay">
            <div className="modal">
              <h2>🤔 Hmm... Looks like you don't have a profit statement yet.</h2>
              <p>Come back later or reach out to your property manager.</p>
              <div className="modal-buttons">
                <button className="back-button" onClick={() => navigate("/dashboard")}>
                  ← Back to Dashboard
                </button>
                <button
                  className="contact-pm-button"
                  onClick={() => {
                    // Replace with a proper contact method (email or form)
                    window.location.href = "mailto:propertymanager@example.com";
                  }}
                >
                  📩 Contact PM
                </button>
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
}

export default ClientProfitStatement;
