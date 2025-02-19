import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";

function ClientProfitStatement() {
  // Get propertyName from the URL and decode it
  const { propertyName } = useParams();
  const decodedPropertyName = decodeURIComponent(propertyName).trim();

  const [profitData, setProfitData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchProfitData = async () => {
      try {
        const token = localStorage.getItem("token");
        // NOTE: Your backend must accept a propertyName string and look up the corresponding profit record.
        const response = await fetch(
          `https://cp-check-submissions-dev-backend.onrender.com/api/profits/${encodeURIComponent(decodedPropertyName)}`,
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
  }, [decodedPropertyName]);

  if (loading) return <div>Loading profit data...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!profitData) return <div>No profit data available for {decodedPropertyName}.</div>;

  return (
    <div className="client-profit-statement">
      <h2>Profit Statement for {decodedPropertyName}</h2>
      <div>
        <p>
          <strong>Current Month Profit:</strong> ${profitData.monthlyProfit.toFixed(2)}
        </p>
        <p>
          <strong>Year-to-Date Profit:</strong> ${profitData.ytdProfit.toFixed(2)}
        </p>
        <p>
          <strong>Uploaded at:</strong> {new Date(profitData.uploadedAt).toLocaleString()}
        </p>
        {profitData.pdfUrl && (
          <p>
            <a href={profitData.pdfUrl} target="_blank" rel="noopener noreferrer">
              View PDF Statement
            </a>
          </p>
        )}
      </div>
    </div>
  );
}

export default ClientProfitStatement;
