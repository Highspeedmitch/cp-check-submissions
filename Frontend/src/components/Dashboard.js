// Dashboard.js
import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import SidebarMap from "./SidebarMap"; // or "./MapWithDirections.js"

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

  // -- State for properties, etc.
  const [properties, setProperties] = useState([]);
  const [completedProperties, setCompletedProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // -- Dark Mode
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("darkMode") === "true");

  // -- For Directions
  const [selectedCoords, setSelectedCoords] = useState(null);

  // -- Other session data
  const token = localStorage.getItem("token");
  const orgName = localStorage.getItem("orgName") || "Your Organization";
  const role = localStorage.getItem("role") || "user";
  const [loginTime] = useState(() => localStorage.getItem("loginTime") || new Date().toISOString());

  // -- Mapbox Token (replace with your own)
  const mapboxToken = "pk.eyJ1IjoiaGlnaHNwZWVkbWl0Y2giLCJhIjoiY202c24xNjV5MDl3NTJqcHBtZHM2NjBoZyJ9.CfvYSFKwel_Zt8aU2N_WVA";

  // -- Apply dark mode to the root document element
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add("dark-mode");
    } else {
      root.classList.remove("dark-mode");
    }
    localStorage.setItem("darkMode", darkMode);
  }, [darkMode]);

  // -- Validate token, fetch properties, track completed
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

    // 1. Fetch properties (now returning objects like { name, lat, lng, ... })
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

    // 2. For "user" role, fetch recent submissions to mark completed props
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

  // -- Collapse/Expand Sidebar
  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => !prev);
  };

  // -- Logout
  const handleLogout = () => {
    console.log("🔹 Logging out... Clearing session data.");
    localStorage.removeItem("token");
    localStorage.removeItem("orgName");
    localStorage.removeItem("loginTime");
    localStorage.removeItem("role");
    if (setUser) setUser(false);
    navigate("/login");
  };

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
              {/* 
                For each property, show name; if user clicks, 
                store coords and possibly navigate or do something else
              */}
              {properties.map((prop) => (
                <li
                  key={prop.name}
                  className={completedProperties.includes(prop.name) ? "completed" : ""}
                  onClick={() => {
                    if (role === "admin") {
                      navigate(`/admin/submissions/${encodeURIComponent(prop.name)}`);
                    } else {
                      // Set the selected coords for directions
                      setSelectedCoords({ lat: prop.lat, lng: prop.lng });
                      // Also navigate to the form if needed
                      navigate(`/form/${encodeURIComponent(prop.name)}`);
                    }
                  }}
                >
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

            {/* Map Under the Toggle */}
            <SidebarMap
              mapboxToken={mapboxToken}
              selectedCoords={selectedCoords} // pass coords to the map
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
            {/* For each property card, same approach as the <li> above */}
            {properties.map((prop) => (
              <div
                key={prop.name}
                className={`property-card ${
                  completedProperties.includes(prop.name) ? "completed-tile" : ""
                }`}
                onClick={() => {
                  if (role === "admin") {
                    navigate(`/admin/submissions/${encodeURIComponent(prop.name)}`);
                  } else {
                    setSelectedCoords({ lat: prop.lat, lng: prop.lng });
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
