// Dashboard.js
import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";

function Dashboard() {
  // We include useParams() even though it’s not used directly here.
  const { property } = useParams();
  const navigate = useNavigate();

  // List of properties assigned to the organization (strings)
  const [properties, setProperties] = useState([]);
  // List of properties that have been completed in the current session
  const [completedProperties, setCompletedProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const token = localStorage.getItem("token");

  // Use stored organization name; if not set, fallback to "Your Organization"
  const orgName = localStorage.getItem("orgName") || "Your Organization";
  // Get the user role (default to "user" if not defined)
  const role = localStorage.getItem("role") || "user";

  // Initialize loginTime once using the function form to keep it stable
  const [loginTime] = useState(() => {
    return localStorage.getItem("loginTime") || new Date().toISOString();
  });

  useEffect(() => {
    if (!token) {
      navigate("/login");
      return;
    }

    // Fetch properties for the organization
    fetch("https://cp-check-submissions-dev-backend.onrender.com/api/properties", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) {
          return res.text().then(text => {
            throw new Error(`Error fetching properties: ${text}`);
          });
        }
        return res.json();
      })
      .then((data) => {
        setProperties(data);
      })
      .catch((err) => {
        console.error("Error fetching properties:", err);
        setError(err.message);
        setLoading(false);
      });

    // Fetch recent submissions and filter by the current session's login time
    fetch("https://cp-check-submissions-dev-backend.onrender.com/api/recent-submissions", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) {
          return res.text().then(text => {
            throw new Error(`Error fetching submissions: ${text}`);
          });
        }
        return res.json();
      })
      .then((data) => {
        const completed = Array.from(
          new Set(
            data
              .filter((sub) => new Date(sub.submittedAt) >= new Date(loginTime))
              .map((sub) => sub.property)
          )
        );
        setCompletedProperties(completed);
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
  const allCompleted = properties.length > 0 && properties.length === completedProperties.length;

  return (
    <div className="dashboard-container">
      {/* Sidebar / Left Pane */}
      <div className={`sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
        <button className="sidebar-toggle" onClick={toggleSidebar}>
          {sidebarCollapsed ? "☰" : "×"}
        </button>
        <h2>{role === "admin" ? "Managed Properties" : "Checklist"}</h2>
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
            <button className="logout-btn" onClick={handleLogout}>Sign Out</button>
          </div>
        )}

        {loading ? (
          <p>Loading properties...</p>
        ) : error ? (
          <p className="error">{error}</p>
        ) : (
          <div className="property-cards">
            {properties.map((prop) => (
              <div
                key={prop}
                className={`property-card ${completedProperties.includes(prop) ? "completed-tile" : ""}`}
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
                    : (completedProperties.includes(prop)
                        ? "Completed"
                        : "Click to complete checklist")}
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