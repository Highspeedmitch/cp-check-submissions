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
  const clientId = localStorage.getItem("userId");

  // Redirect unauthorized users
  useEffect(() => {
    if (role !== "client" || orgType !== "STR" || !clientId) {
      navigate("/dashboard");
      return;
    }
    fetchClientProperties();
    fetchOrgAdmins();
  }, [role, orgType, clientId, navigate]);

  // Fetch only the properties assigned to this client
  const fetchClientProperties = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch("https://cp-check-submissions-dev-backend.onrender.com/api/properties", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();

      // ✅ Filter only properties where the client is an owner
      const clientProps = data.filter((p) =>
        p.clientOwners?.some(ownerId => ownerId.toString() === clientId)
      );      

      setProperties(clientProps);
      if (clientProps.length > 0) setSelectedProperty(clientProps[0]);
    } catch (err) {
      console.error("Error fetching properties:", err);
      setError("Error fetching properties.");
    } finally {
      setLoading(false);
    }
  };

  // Fetch organization admin emails
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
  
      // ✅ Ensure we only process an array
      if (!Array.isArray(data)) {
        throw new Error("Invalid response format: Expected an array");
      }
  
      setOrgAdmins(data);
    } catch (err) {
      console.error("Error fetching organization admins:", err);
      setOrgAdmins([]); // Avoid breaking the UI if this fails
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
    if (selectedProperty) {
      navigate(`/client/profit-statement/${encodeURIComponent(selectedProperty.name)}`);
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
                  fontWeight: selectedProperty?.name === prop.name ? "bold" : "normal",
                }}
              >
                {prop.name}
              </li>
            ))}
          </ul>
        ) : (
          <p>No properties assigned to you.</p>
        )}

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

        <button onClick={handleConsult}>Consult</button>
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
