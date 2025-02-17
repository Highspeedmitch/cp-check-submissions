import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

function ProfitUpload() {
  const navigate = useNavigate();
  const [propertyId, setPropertyId] = useState('');
  const [monthlyProfit, setMonthlyProfit] = useState('');
  const [ytdProfit, setYtdProfit] = useState('');
  const [profitPdf, setProfitPdf] = useState(null);
  const [properties, setProperties] = useState([]);
  const [message, setMessage] = useState('');

  // Fetch properties for the current organization (you can further filter for AzRoots if needed)
  useEffect(() => {
    const token = localStorage.getItem('token');
    fetch('https://cp-check-submissions-dev-backend.onrender.com/api/properties', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => setProperties(data))
      .catch(err => console.error("Error fetching properties:", err));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!propertyId || !profitPdf || !monthlyProfit || !ytdProfit) {
      setMessage("Please fill in all fields.");
      return;
    }
    const formData = new FormData();
    formData.append('propertyId', propertyId);
    // For backward compatibility, you might rename these fields
    formData.append('monthlyProfit', monthlyProfit);
    formData.append('ytdProfit', ytdProfit);
    formData.append('profitPdf', profitPdf);

    const token = localStorage.getItem('token');
    try {
      const response = await fetch('https://cp-check-submissions-dev-backend.onrender.com/api/profits', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      const data = await response.json();
      if (response.ok) {
        setMessage("Profit data uploaded successfully!");
        // Optionally, navigate away or refresh the page.
      } else {
        setMessage(data.error || "Upload failed");
      }
    } catch (err) {
      console.error("Error uploading profit data:", err);
      setMessage("Server error during upload.");
    }
  };

  return (
    <div className="profit-upload">
      <h2>Upload Profit Statement</h2>
      {message && <p>{message}</p>}
      <form onSubmit={handleSubmit}>
        <label>
          Select Property:
          <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} required>
            <option value="">-- Select --</option>
            {properties.map((prop) => (
              <option key={prop._id} value={prop._id}>
                {prop.name}
              </option>
            ))}
          </select>
        </label>
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
      <button onClick={() => navigate("/dashboard")}>Back to Dashboard</button>
    </div>
  );
}

export default ProfitUpload;
