import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

function ClientDashboard() {
  const navigate = useNavigate();
  const [properties, setProperties] = useState([]);
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [orgAdmins, setOrgAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Retrieve user details from localStorage
  const role = localStorage.getItem("role");
  const orgType = localStorage.getItem("orgType");
  const orgName = localStorage.getItem("orgName");

  // Redirect unauthorized users
  useEffect(() => {
    if (role !== "client" || orgType !== "STR") {
      navigate("/dashboard");
      return;
    }
    fetchClientProperties();
    fetchOrgAdmins();
  }, [role, orgType, navigate]);

  // ✅ Fetch only the properties assigned to this client from the new API route
  const fetchClientProperties = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch("https://cp-check-submissions-dev-backend.onrender.com/api/client/client-properties", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} - ${response.statusText}`);
      }

      const data = await response.json();
      console.log("📜 Assigned Properties from API:", data);

      setProperties(data);
      if (data.length > 0) setSelectedProperty(data[0]);
    } catch (err) {
      console.error("Error fetching client properties:", err);
      setError("Error fetching client properties.");
    } finally {
      setLoading(false);
    }
  };

  // ✅ Fetch organization admin emails
  const fetchOrgAdmins = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch("https://cp-check-submissions-dev-backend.onrender.com/api/org-admins", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} - ${response.statusText}`);
      }

      const data = await response.json();
      setOrgAdmins(data);
    } catch (err) {
      console.error("Error fetching organization admins:", err);
      setOrgAdmins([]);
    }
  };

  // Logout Function
  const handleLogout = () => {
    localStorage.clear();
    navigate("/login");
  };

  const handlePropertyClick = (property) => {
    setSelectedProperty(property);
  };

  const handleViewInfo = () => {
    if (selectedProperty) {
      navigate(`/access-instructions/${encodeURIComponent(selectedProperty.name)}`);
    }
  };

  const handleProfitStatement = () => {
    if (selectedProperty && selectedProperty._id) {
      navigate(`/client/profit-statement/${selectedProperty._id.toString()}`);
    } else {
      console.error("Error: selectedProperty._id is missing or invalid.");
    }
  };  

  const handleConsult = () => {
    navigate("/client/schedule-consultation");
  };

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="dashboard-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <h2>My Properties</h2>
        {properties.length ? (
          <ul>
            {properties.map((prop, index) => (
              <li
                key={index}
                onClick={() => handlePropertyClick(prop)}
                style={{
                  cursor: "pointer",
                  fontWeight: "normal",
                }}
              >
                {prop.name}
              </li>
            ))}
          </ul>
        ) : (
          <p>No properties assigned to you.</p>
        )}
{/* Dark mode */}
<div className="dark-mode-toggle">
              <label className="switch">
                <input
                  type="checkbox"
                  checked={darkMode}
                  onChange={() => setDarkMode((prev) => !prev)}
                />
                <span className="slider"></span>
              </label>
              <span className="toggle-label">{darkMode ? "🌙" : "☀️"}</span>
            </div>
        <h2>Property Managers</h2>
        {orgAdmins.length ? (
          <ul>
            {orgAdmins.map((admin, index) => (
              <li key={index}>{admin.email}</li>
            ))}
          </ul>
        ) : (
          <p>No admins found.</p>
        )}

        <button onClick={handleConsult}>Schedule Consult</button>
        <button className="logout-btn" onClick={handleLogout}>Logout</button>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <header className="dashboard-header">
          <div className="subtext">Working with {orgName}</div>
          <h1>Dashboard</h1>
        </header>

        {selectedProperty ? (
          <div className="property-cards">
            {properties.map((prop, index) => (
              <div
                key={index}
                className="property-card"
                onClick={() => handlePropertyClick(prop)}
              >
                <h3>{prop.name}</h3>
                <p>Click to view info about this property.</p>
                <button onClick={handleViewInfo}>View Info</button>
                <button onClick={handleProfitStatement}>Profit Statement</button>
              </div>
            ))}
          </div>
        ) : (
          <p>Please select a property.</p>
        )}
      </main>
    </div>
  );
}

export default ClientDashboard;
