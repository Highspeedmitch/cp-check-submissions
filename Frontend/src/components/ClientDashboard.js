import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

function ClientDashboard() {
  const navigate = useNavigate();
  const [properties, setProperties] = useState([]);
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [orgAdmins, setOrgAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Retrieve essential details from localStorage
  const role = localStorage.getItem("role");
  const orgType = localStorage.getItem("orgType");
  const orgName = localStorage.getItem("orgName");
  const clientId = localStorage.getItem("userId"); // Current client ID

  // On mount, validate user type and fetch data
  useEffect(() => {
    if (role !== "client" || orgType !== "STR" || orgName !== "AzRoots") {
      // Redirect if not allowed
      navigate("/dashboard");
      return;
    }
    fetchClientProperties();
    fetchOrgAdmins();
  }, [role, orgType, orgName, navigate]);

  // Fetch properties and filter for the current client only
  const fetchClientProperties = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch("https://cp-check-submissions-dev-backend.onrender.com/api/properties", {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      
      // Filter properties to only those where the client is an owner.
      // Adjust this logic if your clientOwners are stored differently.
      const clientProps = data.filter(p => 
        p.clientOwners && p.clientOwners.map(String).includes(clientId)
      );
      
      setProperties(clientProps);
      if (clientProps.length > 0) setSelectedProperty(clientProps[0]);
    } catch (err) {
      setError("Error fetching properties.");
    } finally {
      setLoading(false);
    }
  };

  // Fetch organization admin emails
  const fetchOrgAdmins = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch("https://cp-check-submissions-dev-backend.onrender.com/api/users", {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      const admins = data.filter(user => user.role === "admin");
      setOrgAdmins(admins);
    } catch (err) {
      console.error("Error fetching organization admins:", err);
    }
  };

  const handlePropertyClick = (property) => {
    setSelectedProperty(property);
  };

  const handleViewInfo = () => {
    // Open the access instructions page (read-only) for the selected property.
    if (selectedProperty) {
      navigate(`/access-instructions/${encodeURIComponent(selectedProperty.name)}`);
    }
  };

  const handleProfitStatement = () => {
    // Navigate to a profit statement page for the selected property.
    // Make sure you have a route defined like: /client/profit-statement/:propertyName
    if (selectedProperty) {
      navigate(`/client/profit-statement/${encodeURIComponent(selectedProperty.name)}`);
    }
  };

  const handleConsult = () => {
    // Navigate to a consultation scheduling page or open a scheduling modal.
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
                  fontWeight: selectedProperty?.name === prop.name ? "bold" : "normal"
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
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {selectedProperty ? (
          <div className="property-card">
            <h2>{selectedProperty.name}</h2>
            <p>Click below to view info about this property.</p>
            <button onClick={handleViewInfo}>View Info</button>
            <button onClick={handleProfitStatement}>Profit Statement</button>
          </div>
        ) : (
          <p>Please select a property.</p>
        )}
      </main>
    </div>
  );
}

export default ClientDashboard;
