// Dashboard.js
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

function Dashboard() {
  const navigate = useNavigate();
  const [properties, setProperties] = useState([]); // Array of property names (strings)
  const [completedProperties, setCompletedProperties] = useState([]); // Properties that are submitted
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const token = localStorage.getItem("token");

  useEffect(() => {
    if (!token) {
      navigate("/login");
      return;
    }

    // Fetch the properties for the organization
    fetch("https://cp-check-submissions-dev-backend.onrender.com/api/properties", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setProperties(data); // expecting an array of strings
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching properties:", err);
        setError("Failed to load properties");
        setLoading(false);
      });

    // Fetch completed submissions (simulate: each submission contains a property field)
    fetch("https://cp-check-submissions-dev-backend.onrender.com/api/recent-submissions", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        // Assume data is an array of submission objects containing a "property" field.
        const completed = Array.from(new Set(data.map((sub) => sub.property)));
        setCompletedProperties(completed);
      })
      .catch((err) => console.error("Error fetching submissions:", err));
  }, [navigate, token]);

  // Collapse/Expand sidebar toggle
  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => !prev);
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    navigate("/login");
  };

  // If all properties are completed, redirect the user to a "completed" page after a delay.
  useEffect(() => {
    if (properties.length > 0 && properties.length === completedProperties.length) {
      // Redirect after a 2-second delay
      setTimeout(() => {
        navigate("/completed"); // You'll need to create a Completed component/page
      }, 2000);
    }
  }, [properties, completedProperties, navigate]);

  return (
    <div className="dashboard-container">
      {/* Sidebar / Left Pane */}
      <div className={`sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
        <button className="sidebar-toggle" onClick={toggleSidebar}>
          {sidebarCollapsed ? "☰" : "×"}
        </button>
        <h2>Checklist</h2>
        <ul>
          {properties.map((prop) => (
            <li key={prop} className={completedProperties.includes(prop) ? "completed" : ""}>
              {prop}
            </li>
          ))}
        </ul>
      </div>

      {/* Main Content Area */}
      <div className="main-content">
        <header>
          <h1>Dashboard</h1>
          <button className="logout-btn" onClick={handleLogout}>
            Logout
          </button>
        </header>
        {loading ? (
          <p>Loading properties...</p>
        ) : error ? (
          <p className="error">{error}</p>
        ) : (
          <div className="property-cards">
            {properties.map((prop) => (
              <div
                key={prop}
                className="property-card"
                onClick={() => navigate(`/form/${encodeURIComponent(prop)}`)}
              >
                <h3>{prop}</h3>
                <p>
                  {completedProperties.includes(prop)
                    ? "Completed"
                    : "Click to complete checklist"}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
