// Dashboard.js
import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";

function Dashboard() {
  // We include useParams() even though it’s not used directly here.
  const { property } = useParams();
  const navigate = useNavigate();

  // List of properties assigned to the organization (strings)
  const [properties, setProperties] = useState([]);
  // List of normalized property names that have been completed in the current session
  const [completedProperties, setCompletedProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const token = localStorage.getItem("token");
  const orgName = localStorage.getItem("orgName") || "Your Organization";
  const role = localStorage.getItem("role") || "user";

  // Initialize loginTime only once so it remains stable during the session.
  const [loginTime] = useState(() => {
    return localStorage.getItem("loginTime") || new Date().toISOString();
  });

  useEffect(() => {
    if (!token) {
      navigate("/login");
      return;
    }

    // Fetch properties for the organization
    fetch("https://cp-check-submissions-dev.onrender.com/api/properties", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setProperties(data);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching properties:", err);
        setError("Failed to load properties");
        setLoading(false);
      });

    // Fetch recent submissions and filter by the current session's login time
    fetch("https://cp-check-submissions-dev.onrender.com/api/recent-submissions", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        // Normalize each submission's property name (trim and toLowerCase)
        const completed = Array.from(
          new Set(
            data
              .filter((sub) => new Date(sub.submittedAt) >= new Date(loginTime))
              .map((sub) => sub.property.trim().toLowerCase())
          )
        );
        setCompletedProperties(completed);
        console.log("Completed properties (normalized):", completed);
      })
      .catch((err) => console.error("Error fetching submissions:", err));
  }, [navigate, token, loginTime]);

  // Toggle the sidebar collapse/expand
  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => !prev);
  };

  // Logout: clear stored session data and redirect to login
  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("orgName");
    localStorage.removeItem("loginTime");
    localStorage.removeItem("role");
    navigate("/login");
  };

  // Determine if all properties have been completed
  const allCompleted =
    properties.length > 0 &&
    properties.every(
      (prop) => completedProperties.includes(prop.trim().toLowerCase())
    );

  return (
    <div className="dashboard-container">
      {/* Sidebar / Left Pane */}
      <div className={`sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
        <button className="sidebar-toggle" onClick={toggleSidebar}>
          {sidebarCollapsed ? "☰" : "×"}
        </button>
        <h2>{role === "admin" ? "Managed Properties" : "Checklist"}</h2>
        <ul>
          {properties.map((prop) => {
            const normalizedProp = prop.trim().toLowerCase();
            return (
              <li
                key={prop}
                className={completedProperties.includes(normalizedProp) ? "completed" : ""}
              >
                {prop}
              </li>
            );
          })}
        </ul>
      </div>

      {/* Main Content Area */}
      <div className="main-content">
        <header className="dashboard-header">
          <div className="subtext">Working on behalf of {orgName}</div>
          <h1>Dashboard</h1>
          <button className="logout-btn" onClick={handleLogout}>
            Logout
          </button>
        </header>

        {allCompleted && (
          <div className="all-completed-banner">
            <h2>All inspections completed!</h2>
            <button className="logout-btn" onClick={handleLogout}>
              Sign Out
            </button>
          </div>
        )}

        {loading ? (
          <p>Loading properties...</p>
        ) : error ? (
          <p className="error">{error}</p>
        ) : (
          <div className="property-cards">
            {properties.map((prop) => {
              const normalizedProp = prop.trim().toLowerCase();
              const isCompleted = completedProperties.includes(normalizedProp);
              return (
                <div
                  key={prop}
                  className={`property-card ${isCompleted ? "completed-tile" : ""}`}
                  onClick={() => {
                    if (role === "admin") {
                      navigate(`/admin/submissions/${encodeURIComponent(prop)}`);
                    } else {
                      navigate(`/form/${encodeURIComponent(prop)}`);
                    }
                  }}
                >
                  <h3>{prop}</h3>
                  <p>
                    {role === "admin"
                      ? "Click to view recent submissions"
                      : isCompleted
                      ? "Completed"
                      : "Click to complete checklist"}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
