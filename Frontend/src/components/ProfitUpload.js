import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { apiUrl } from "../services/api";

function ProfitUpload() {
  const { propertyName } = useParams();
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  const [profitAmount, setProfitAmount] = useState("");
  const [pdfFile, setPdfFile] = useState(null);
  const [profitHistory, setProfitHistory] = useState([]); // Stores last 12 months of data
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchProfitHistory() {
      try {
        const response = await fetch(
          apiUrl(`/api/profits/${propertyName}/history`),
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (!response.ok) throw new Error("Failed to fetch profit history");

        const data = await response.json();
        setProfitHistory(data); // Expecting an array of past profits
      } catch (err) {
        console.error("Error fetching profit history:", err);
        setError("Could not load past profit data.");
      } finally {
        setLoading(false);
      }
    }

    fetchProfitHistory();
  }, [propertyName, token]);

  async function handleUpload() {
    if (!profitAmount || !pdfFile) {
      alert("Please enter a profit amount and select a PDF file.");
      return;
    }

    const formData = new FormData();
    formData.append("monthlyProfit", profitAmount);
    formData.append("profitPdf", pdfFile);

    try {
      const response = await fetch(
        apiUrl(`/api/profits/${propertyName}/upload`),
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        }
      );

      if (!response.ok) throw new Error("Failed to upload profit statement");

      alert("Profit statement uploaded successfully!");
      navigate("/dashboard"); // Redirect after upload
    } catch (err) {
      console.error("Upload error:", err);
      alert("Error uploading profit statement.");
    }
  }

  return (
    <div className="profit-upload-container">
      <h1 className="profit-upload-header">💰 Upload Profit Statement for {propertyName}</h1>

      <div className="upload-section">
        <label>This Month's Profit:</label>
        <input
          type="number"
          value={profitAmount}
          onChange={(e) => setProfitAmount(e.target.value)}
          placeholder="Enter profit amount"
        />

        <label>Profit PDF:</label>
        <input type="file" accept="application/pdf" onChange={(e) => setPdfFile(e.target.files[0])} />

        <button className="upload-button" onClick={handleUpload}>
          Upload Profit Data
        </button>

        <button className="back-button" onClick={() => navigate("/dashboard")}>
          Back to Dashboard
        </button>
      </div>

      <hr />

      <h2 className="history-header">📊 Profit History (Last 12 Months)</h2>

      {loading ? (
        <p>Loading past profit statements...</p>
      ) : error ? (
        <p className="error-text">{error}</p>
      ) : (
        <table className="profit-history-table">
          <thead>
            <tr>
              <th>Month</th>
              <th>Uploaded Date</th>
              <th>Profit Amount</th>
              <th>YTD $</th>
            </tr>
          </thead>
          <tbody>
            {profitHistory.length > 0 ? (
              profitHistory.map((profit) => (
                <tr key={profit._id}>
                  <td>{format(new Date(profit.uploadedAt), "MMMM yyyy")}</td>
                  <td>{format(new Date(profit.uploadedAt), "PPpp")}</td>
                  <td>${profit.monthlyProfit.toFixed(2)}</td>
                  <td>${profit.ytdProfit.toFixed(2)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="3">No profit data found for past 12 months.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default ProfitUpload;
