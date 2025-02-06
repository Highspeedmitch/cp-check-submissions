// Dashboard.js
import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";

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

// Helper function to open Apple Maps on iOS, or Google Maps elsewhere
function openNativeMaps(lat, lng) {
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  if (isIOS) {
    window.open(`maps://maps.apple.com/?daddr=${lat},${lng}`, "_blank");
  } else {
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
      "_blank"
    );
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
  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem("darkMode") === "true"
  );

  // -- Other session data
  const token = localStorage.getItem("token");
  const orgName = localStorage.getItem("orgName") || "Your Organization";
  const role = localStorage.getItem("role") || "user";
  const [loginTime] = useState(
    () => localStorage.getItem("loginTime") || new Date().toISOString()
  );

  // -- For the "Add Property" admin flow
  const [passkeyPromptVisible, setPasskeyPromptVisible] = useState(false);
  const [passkey, setPasskey] = useState("");
  const [addPropertyFormVisible, setAddPropertyFormVisible] = useState(false);
  const [newPropName, setNewPropName] = useState("");
  const [newPropEmails, setNewPropEmails] = useState("");

  // We'll store lat/lng behind the scenes. The admin won't edit these manually.
  const [newPropLat, setNewPropLat] = useState("");
  const [newPropLng, setNewPropLng] = useState("");

  // We'll give them an "Address" field
  const [newPropAddress, setNewPropAddress] = useState("");

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

    // Fetch properties (objects like { name, lat, lng, ... })
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

    // For "user" role, fetch recent submissions to mark completed props
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

  // ======================
  //   ADD PROPERTY LOGIC
  // ======================
  const handlePasskeySubmit = () => {
    // We'll verify passkey on the server
    fetch("https://cp-check-submissions-dev-backend.onrender.com/api/verify-passkey", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passkey }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.valid) {
          setAddPropertyFormVisible(true);
        } else {
          alert("Invalid passkey. Cannot add property.");
        }
        setPasskeyPromptVisible(false);
      })
      .catch((err) => console.error("Error verifying passkey:", err));
  };

  // 1) We'll geocode the admin's typed address to lat/lng using Mapbox
  async function handleGeocodeAddress(e) {
    e.preventDefault();

    if (!newPropAddress) {
      return alert("Please enter an address to geocode.");
    }

    // Replace with your own Mapbox token or store it in .env
    const mapboxToken = "YOUR_MAPBOX_TOKEN_HERE";
    const baseUrl = "https://api.mapbox.com/geocoding/v5/mapbox.places/";
    const url = `${baseUrl}${encodeURIComponent(newPropAddress)}.json?access_token=${mapboxToken}`;

    try {
      const res = await fetch(url);
      const data = await res.json();

      if (data.features && data.features.length > 0) {
        // Take the first match
        const [lng, lat] = data.features[0].center;
        setNewPropLat(lat.toString());
        setNewPropLng(lng.toString());
        alert(`Geocoded to: ${lat}, ${lng}`);
      } else {
        alert("No geocoding results found. Please refine the address.");
      }
    } catch (error) {
      console.error("Geocoding error:", error);
      alert("Error geocoding address. Check console.");
    }
  }

  // 2) Once lat/lng are set, the user can click "Create" to post to the server
  const handleCreateProperty = async () => {
    try {
      const emailsArray = newPropEmails
        .split(",")
        .map((email) => email.trim())
        .filter(Boolean);

      const response = await fetch("https://cp-check-submissions-dev-backend.onrender.com/api/admin/add-property", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          passkey,
          name: newPropName,
          emails: emailsArray,
          lat: parseFloat(newPropLat) || 0,
          lng: parseFloat(newPropLng) || 0,
        }),
      });

      const data = await response.json();
      if (data.error) {
        alert(data.error);
      } else {
        alert("Property added successfully!");
        // Optionally re-fetch property list
        setAddPropertyFormVisible(false);
        setNewPropName("");
        setNewPropEmails("");
        setNewPropLat("");
        setNewPropLng("");
        setNewPropAddress("");
        // ...
      }
    } catch (error) {
      console.error("Error creating property:", error);
    }
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
              {properties.map((prop) => (
                <li
                  key={prop.name}
                  className={completedProperties.includes(prop.name) ? "completed" : ""}
                  onClick={() => {
                    if (role === "admin") {
                      navigate(`/admin/submissions/${encodeURIComponent(prop.name)}`);
                    } else {
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

            {/* Tools Section for Admin */}
            {role === "admin" && (
              <div className="tools-section" style={{ marginTop: "20px" }}>
                <h3>Tools</h3>
                <button
                  className="Add-Prop"
                  onClick={() => {
                    setPasskeyPromptVisible(true);
                    setPasskey("");
                  }}
                >
                  Add Property
                </button>
              </div>
            )}
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
                className={`property-card ${
                  completedProperties.includes(prop.name) ? "completed-tile" : ""
                }`}
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

                {/* If user (not admin), show a 'Navigate' button */}
                {role !== "admin" && prop.lat && prop.lng && (
                  <button
                    className="navigate-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openNativeMaps(prop.lat, prop.lng);
                    }}
                  >
                    Navigate
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Prompt for passkey if needed */}
        {passkeyPromptVisible && (
          <div className="passkey-modal">
            <h3>Enter passkey to add property</h3>
            <input
              type="password"
              value={passkey}
              onChange={(e) => setPasskey(e.target.value)}
            />
            <button onClick={handlePasskeySubmit}>Submit</button>
            <button onClick={() => setPasskeyPromptVisible(false)}>Cancel</button>
          </div>
        )}

        {/* Show Add Property Form if passkey verified */}
        {addPropertyFormVisible && (
          <div className="add-property-form">
            <h3>Add New Property</h3>
            <label>
              Property Name:
              <input
                type="text"
                value={newPropName}
                onChange={(e) => setNewPropName(e.target.value)}
              />
            </label>
            <label>
              Emails (comma-separated):
              <textarea
                value={newPropEmails}
                onChange={(e) => setNewPropEmails(e.target.value)}
              />
            </label>

            {/* Instead of direct lat/lng input, let's have them type an address */}
            <label>
              Address (will geocode):
              <input
                type="text"
                value={newPropAddress}
                onChange={(e) => setNewPropAddress(e.target.value)}
              />
            </label>
            <button onClick={handleGeocodeAddress} style={{ marginBottom: "1rem" }}>
              Geocode
            </button>

            {/* We'll store the lat/lng but won't force them to edit it manually. */}
            {/* If you want, you can show them read-only. */}
            <div style={{ marginBottom: "1rem" }}>
              <small>Lat: {newPropLat || "N/A"}</small><br/>
              <small>Lng: {newPropLng || "N/A"}</small>
            </div>

            <button onClick={handleCreateProperty}>Create</button>
            <button onClick={() => setAddPropertyFormVisible(false)}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
