import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiUrl } from "../services/api";

function ClientProfitStatement() {
  const { propertyId } = useParams();
  const navigate = useNavigate();

  const [profitData, setProfitData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showNoProfitModal, setShowNoProfitModal] = useState(false);

  useEffect(() => {
    const fetchProfitData = async () => {
      try {
        const token = localStorage.getItem("token");
        const response = await fetch(apiUrl(`/api/profits/${propertyId}`), {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();
        if (response.ok) {
          setProfitData(data);
        } else {
          setError(data.error || "Error fetching profit data");
          setShowNoProfitModal(true);
        }
      } catch (fetchError) {
        console.error("Error fetching profit data:", fetchError);
        setError("Server error while fetching profit data");
        setShowNoProfitModal(true);
      } finally {
        setLoading(false);
      }
    };

    fetchProfitData();
  }, [propertyId]);

  if (loading) return <div className="beta-empty-state">Loading profit data...</div>;

  return (
    <div className="profit-statement-container">
      <h1 className="profit-header">Profit Statement</h1>
      {error && <p className="beta-alert error" role="alert">{error}</p>}

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
              <a className="pdf-link" href={profitData.pdfUrl} target="_blank" rel="noopener noreferrer">
                View PDF Statement
              </a>
            </p>
          )}
          <button className="beta-button secondary" onClick={() => navigate("/dashboard")}>
            Back to Dashboard
          </button>
        </div>
      ) : (
        showNoProfitModal && (
          <div className="beta-dialog-overlay">
            <section className="beta-dialog" role="dialog" aria-modal="true" aria-labelledby="missing-profit-title">
              <div className="beta-dialog-header">
                <div>
                  <span className="beta-eyebrow">Profit statement</span>
                  <h2 id="missing-profit-title">Nothing here yet</h2>
                </div>
              </div>
              <p className="beta-dialog-copy">Come back later or reach out to your property manager.</p>
              <div className="beta-dialog-actions">
                <button className="beta-button secondary" onClick={() => navigate("/dashboard")}>
                  Back to Dashboard
                </button>
                <button
                  className="beta-button"
                  onClick={() => {
                    window.location.href = "mailto:propertymanager@example.com";
                  }}
                >
                  Contact PM
                </button>
              </div>
            </section>
          </div>
        )
      )}
    </div>
  );
}

export default ClientProfitStatement;
