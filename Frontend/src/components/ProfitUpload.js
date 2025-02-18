import React, { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

function ProfitUpload() {
  const navigate = useNavigate();
  const { property } = useParams(); // ✅ Get propertyId from URL instead of dropdown
  const [monthlyProfit, setMonthlyProfit] = useState("");
  const [profitPdf, setProfitPdf] = useState(null);
  const [message, setMessage] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!profitPdf || !monthlyProfit || !propertyId) {
      setMessage("Missing required data. Please try again.");
      return;
    }    

    const formData = new FormData();
    formData.append("monthlyProfit", monthlyProfit);
    formData.append("profitPdf", profitPdf);

    const token = localStorage.getItem("token");

    try {
      const response = await fetch(
        `https://cp-check-submissions-dev-backend.onrender.com/api/profits/${property}`, // ✅ Uses URL param
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        }
      );

      const data = await response.json();
      if (response.ok) {
        setMessage("Profit data uploaded successfully!");
      } else {
        setMessage(data.error || "Upload failed");
      }
    } catch (err) {
      console.error("Error uploading profit data:", err);
      setMessage("Server error during upload.");
    }
  };

  return (
    <div className="profit-upload-container">
      <h2>Upload Profit Statement for {propertyId}</h2>
      {message && <p className="upload-message">{message}</p>}

      <form onSubmit={handleSubmit} className="profit-upload-form">
        <label>
          This Month's Profit:
          <input
            type="number"
            value={monthlyProfit}
            onChange={(e) => setMonthlyProfit(e.target.value)}
            required
          />
        </label>

        <label>
          Profit PDF:
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => setProfitPdf(e.target.files[0])}
            required
          />
        </label>

        <button type="submit">Upload Profit Data</button>
      </form>

      <button className="back-button" onClick={() => navigate("/dashboard")}>
        Back to Dashboard
      </button>
    </div>
  );
}

export default ProfitUpload;
