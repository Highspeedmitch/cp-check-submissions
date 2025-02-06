// Dashboard.js
import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import SidebarMap from "./SidebarMap";
// Utility: Check if JWT token is expired
function isTokenExpired(token) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp * 1000 < Date.now();
  } catch (error) {
    console.error("❌ Invalid token format:", error);
    return true;
  }
}

function Dashboard({ setUser }) {
  const { property } = useParams();
  const navigate = useNavigate();

  // States for properties, sidebar, etc.
  const [properties, setProperties] = useState([]);
  const [completedProperties, setCompletedProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // ---- DARK MODE STATE ----
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("darkMode") === "true");

  // Update the <html> element class and localStorage when darkMode changes
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add("dark-mode");
    } else {
      root.classList.remove("dark-mode");
    }
    localStorage.setItem("darkMode", darkMode);
  }, [darkMode]);
  // -------------------------

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => !prev);
  };

  const token = localStorage.getItem("token");
  const orgName = localStorage.getItem("orgName") || "Your Organization";
  const role = localStorage.getItem("role") || "user";
  const [loginTime] = useState(() => localStorage.getItem("loginTime") || new Date().toISOString());

  // Check token validity and fetch properties/submissions
  useEffect(() => {
    if (!token || isTokenExpired(token)) {
      localStorage.removeItem("token");
      localStorage.removeItem("orgName");
      localStorage.removeItem("loginTime");
      localStorage.removeItem("role");
      if (setUser) setUser(false);
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

    // For users, fetch recent submissions to mark completed properties
    if (role === "user") {
      fetch("https://cp-check-submissions-dev-backend.onrender.com/api/recent-submissions", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.json())
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
    }
  }, [navigate, token, loginTime, role, setUser]);

  const handleLogout = () => {
    console.log("🔹 Logging out... Clearing session data.");
    localStorage.removeItem("token");
    localStorage.removeItem("orgName");
    localStorage.removeItem("loginTime");
    localStorage.removeItem("role");
    if (setUser) setUser(false);
    navigate("/login");
  };

  const mapboxToken = "pk.eyJ1IjoiaGlnaHNwZWVkbWl0Y2giLCJhIjoiY202c24xNjV5MDl3NTJqcHBtZHM2NjBoZyJ9.CfvYSFKwel_Zt8aU2N_WVA";

  return (
    <div className={`dashboard-container ${sidebarCollapsed ? "collapsed" : ""}`}>
      {/* Sidebar */}
      <div className={`sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
        <button className="sidebar-toggle" onClick={toggleSidebar}>
          {sidebarCollapsed ? "☰" : "×"}
        </button>

        {!sidebarCollapsed && (
          <>
            <h2>{role === "admin" ? "Managed Properties" : "Checklist"}</h2>
            <ul>
              {properties.map((prop) => (
                <li key={prop.name} className={completedProperties.includes(prop.name) ? "completed" : ""}>
                  {prop.name}
                </li>
              ))}
            </ul>

            {/* Dark Mode Toggle */}
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

            {/* Map under the toggle */}
            <SidebarMap
              mapboxToken={mapboxToken}
              properties={properties}
            />
          </>
        )}
      </div>

      {/* Main Content */}
      <div className="main-content">
        <header className="dashboard-header">
          <div className="subtext">Working on behalf of {orgName}</div>
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
                key={prop.name}
                className={`property-card ${completedProperties.includes(prop.name) ? "completed-tile" : ""}`}
                onClick={() => {
                  if (role === "admin") {
                    navigate(`/admin/submissions/${encodeURIComponent(prop.name)}`);
                  } else {
                    navigate(`/form/${encodeURIComponent(prop.name)}`);
                  }
                }}
              >
                <h3>{prop.name}</h3>
                <p>
                  {role === "admin"
                    ? "Click to view recent submissions"
                    : completedProperties.includes(prop.name)
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
