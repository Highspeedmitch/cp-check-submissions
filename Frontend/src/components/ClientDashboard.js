import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

function ClientDashboard() {
  const navigate = useNavigate();
  const [profitStatement, setProfitStatement] = useState(null);
  const [communications, setCommunications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { propertyId } =  useParams();

  // Retrieve essential details from localStorage
  const role = localStorage.getItem("role");
  const orgType = localStorage.getItem("orgType");
  const orgName = localStorage.getItem("orgName");

  // On mount, validate user type and fetch data
  useEffect(() => {
    // Ensure only "client" users for AzRoots STR organization can access this dashboard
    if (role !== "client" || orgType !== "STR" || orgName !== "AzRoots") {
      // Redirect or show an error if the user isn’t allowed here
      navigate("/dashboard");
      return;
    }
    // Fetch profit statement and communications
    fetchProfitStatement();
    fetchCommunications();
  }, [role, orgType, orgName, navigate]);

  const fetchProfitStatement = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`https://cp-check-submissions-dev-backend.onrender.com/api/profits/${propertyId}`,
        {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok) {
        setProfitStatement(data);
      } else {
        setError(data.message || "Error fetching profit statement");
      }
    } catch (err) {
      setError("Error fetching profit statement");
    } finally {
      setLoading(false);
    }
  };

  const fetchCommunications = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`https://cp-check-submissions-dev-backend.onrender.com/api/client/communications/${propertyId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} - ${response.statusText}`);
      }

      let data;
      try {
        data = await response.json();
      } catch (jsonError) {
        throw new Error("Invalid JSON response from server.");
      }

      setCommunications(Array.isArray(data) ? data : []); // ✅ Always set an array
    } catch (err) {
      console.error("Error fetching communications:", err);
      setCommunications([]); // ✅ Prevent UI crash by ensuring it's always an array
    }
};

  const handleScheduleConsultation = () => {
    // Navigate to a consultation scheduling page or open a scheduling modal
    navigate("/client/schedule-consultation");
  };

  if (loading) {
    return <div>Loading...</div>;
  }
  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <div className="client-dashboard">
      <header>
        <h1>Client Dashboard</h1>
        <p>Welcome, Property Owner</p>
      </header>

      <section className="profit-statement">
        <h2>Profit Statement</h2>
        {profitStatement ? (
          <div>
            <p>Total Profit: ${profitStatement.profitValue.toFixed(2)}</p>
            <p>Uploaded at: {new Date(profitStatement.uploadedAt).toLocaleString()}</p>
            {profitStatement.pdfUrl && (
              <a href={profitStatement.pdfUrl} target="_blank" rel="noopener noreferrer">
                View PDF
              </a>
            )}
          </div>
        ) : (
          <p>No profit statement available.</p>
        )}
      </section>

      <section className="communications">
        <h2>Communications from Property Managers</h2>
        {communications.length > 0 ? (
          <ul>
            {communications.map((comm, index) => (
              <li key={index}>
                <p>{comm.message}</p>
                <small>{new Date(comm.date).toLocaleString()}</small>
              </li>
            ))}
          </ul>
        ) : (
          <p>No communications available.</p>
        )}
      </section>

      <section className="schedule-consultation">
        <h2>Schedule a Consultation</h2>
        <button onClick={handleScheduleConsultation}>Schedule Now</button>
      </section>
    </div>
  );
}

export default ClientDashboard;
