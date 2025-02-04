import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";

function Dashboard({ setUser }) {
  const { property } = useParams();
  const navigate = useNavigate();

  const [properties, setProperties] = useState([]); // List of properties
  const [completedProperties, setCompletedProperties] = useState([]); // Track completed properties
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const token = localStorage.getItem("token");

  const orgName = localStorage.getItem("orgName") || "Your Organization";
  const role = localStorage.getItem("role") || "user";
  const [loginTime] = useState(() => localStorage.getItem("loginTime") || new Date().toISOString());

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

    // Fetch recent submissions to mark properties as completed for the session
    if (role === "user") {
      fetch("https://cp-check-submissions-dev-backend.onrender.com/api/recent-submissions", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.json())
        .then((data) => {
          // Filter and update completed properties based on the session's login time
          const completed = Array.from(
            new Set(
              data
                .filter((sub) => new Date(sub.submittedAt) >= new Date(loginTime))
                .map((sub) => sub.property)
            )
          );
          setCompletedProperties(completed); // Update completed properties
        })
        .catch((err) => console.error("Error fetching submissions:", err));
    }
  }, [navigate, token, loginTime, role]);

  // Toggle the sidebar collapse/expand
  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => !prev);
  };

  // Logout: clear stored session data and redirect to login
  const handleLogout = () => {
    console.log("🔹 Logging out... Clearing session data.");
    localStorage.removeItem("token");
    localStorage.removeItem("orgName");
    localStorage.removeItem("loginTime");
    localStorage.removeItem("role");
  
    if (setUser) setUser(false); // Ensure it's only called if it exists
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
