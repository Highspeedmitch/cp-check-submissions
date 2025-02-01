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
  
  // Initialize loginTime once using the function form to keep it stable
  const [loginTime] = useState(() => {
    // Retrieve from localStorage if present; otherwise, use current time
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
    fetch("https://cp-check-submissions-dev-backend.onrender.com/api/recent-submissions", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        // Filter submissions that occurred after the stored loginTime
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
  }, [navigate, token, loginTime]); // loginTime is stable now

  // Toggle the sidebar collapse/expand
  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => !prev);
  };

  // Logout: clear stored session data and redirect to login
  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("orgName");
    localStorage.removeItem("loginTime");
    navigate("/login");
  };

  // Determine if all properties have been completed
  const allCompleted = properties.length > 0 && properties.length === completedProperties.length;

  return (
    <div className="dashboard-container">
      {/* Sidebar / Checklist */}
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
        <header className="dashboard-header">
          <div className="subtext">Working on behalf of {orgName}</div>
          <h1>Dashboard</h1>
          <button className="logout-btn" onClick={handleLogout}>
            Logout
          </button>
        </header>

        {/* If all properties are completed, display a banner */}
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
          // In your Dashboard.js, inside the map over properties:
            <div
            key={prop}
            className="property-card"
            onClick={() => {
                const role = localStorage.getItem("role");
                if (role === "admin") {
                navigate(`/admin/submissions/${encodeURIComponent(prop)}`);
                } else {
                navigate(`/form/${encodeURIComponent(prop)}`);
                }
            }}
            >
            <h3>{prop}</h3>
            <p>
                {localStorage.getItem("role") === "admin" 
                ? "Click to view recent submissions" 
                : (completedProperties.includes(prop) ? "Completed" : "Click to complete checklist")}
            </p>
            </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
