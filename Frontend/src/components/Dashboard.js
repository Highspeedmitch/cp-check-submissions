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

  // ----------- Paging -----------  
  const PAGE_SIZE = 3;
  const [pageIndex, setPageIndex] = useState(0);

  // ----------- States for properties, loading, etc. ----------
  const [properties, setProperties] = useState([]);
  const [completedProperties, setCompletedProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // ----------- Dark Mode -----------
  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem("darkMode") === "true"
  );

  // ----------- Auth / Org Info -----------
  const token = localStorage.getItem("token");
  const orgName = localStorage.getItem("orgName") || "Your Organization";
  const role = localStorage.getItem("role") || "user";
  const [loginTime] = useState(
    () => localStorage.getItem("loginTime") || new Date().toISOString()
  );

  // ----------- States for "Add Property" Admin Flow -----------
  const [passkeyPromptVisible, setPasskeyPromptVisible] = useState(false);
  const [passkey, setPasskey] = useState("");
  const [addPropertyFormVisible, setAddPropertyFormVisible] = useState(false);
  const [newPropName, setNewPropName] = useState("");
  const [newPropEmails, setNewPropEmails] = useState("");
  const [newPropLat, setNewPropLat] = useState("");
  const [newPropLng, setNewPropLng] = useState("");
  const [newPropAddress, setNewPropAddress] = useState("");

  // ----------- States for "Remove Property" Admin Flow -----------
  const [removePasskeyPromptVisible, setRemovePasskeyPromptVisible] = useState(false);
  const [removePasskey, setRemovePasskey] = useState("");
  const [propertyToRemove, setPropertyToRemove] = useState(null);

  // ------------ State for 'setViewScheduler' Admin Flow -----------
  const [viewScheduler, setViewScheduler] = useState(false);
  const [assignments, setAssignments] = useState([]);

  // ======================
  // 1) Apply dark mode on load
  // ======================
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add("dark-mode");
    } else {
      root.classList.remove("dark-mode");
    }
    localStorage.setItem("darkMode", darkMode);
  }, [darkMode]);

  // ======================
  // 2) Fetch properties & submissions
  // ======================
  useEffect(() => {
    if (!token || isTokenExpired(token)) {
      localStorage.clear();
      if (setUser) setUser(false);
      navigate("/login");
      return;
    }
    fetchProperties();
  }, [navigate, token, loginTime, role, setUser]);

  function fetchProperties() {
    setLoading(true);
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
  }

  // Fetch user assignments for non-admin users
  useEffect(() => {
    if (role !== "admin") {
      fetchUserAssignments();
    }
  }, [role, token]);  

  function fetchUserAssignments() {
    if (!token) return;
    
    const userId = localStorage.getItem("userId");
    if (!userId) {
      console.error("⚠️ No userId found in localStorage!");
      return;
    }
  
    fetch("https://cp-check-submissions-dev-backend.onrender.com/api/assignments", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        console.log("📌 API Response:", data);
  
        if (!Array.isArray(data)) {
          console.error("❌ Invalid API response. Expected an array.");
          return;
        }
  
        const userAssignments = data.filter((assignment) => assignment.userId === userId);
        
        if (userAssignments.length === 0) {
          console.warn("⚠️ No assignments found for user:", userId);
        }
  
        setAssignments(userAssignments);
      })
      .catch((err) => console.error("Error fetching assignments:", err));
  }

  // Fetch submissions to mark completed properties (for user role)
  useEffect(() => {
    if (role === "user" && token && !isTokenExpired(token)) {
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
  }, [role, token, loginTime]);

  // ======================
  // 3) Remove Property Logic (admin only)
  // ======================
  function initiateRemoveProperty(propertyName) {
    setPropertyToRemove(propertyName);
    setRemovePasskeyPromptVisible(true);
  }

  async function handleRemoveProperty() {
    if (!propertyToRemove) return;

    try {
      // Verify the passkey for removal
      const verifyResponse = await fetch(
        "https://cp-check-submissions-dev-backend.onrender.com/api/verify-remove-passkey",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ removePasskey }),
        }
      );

      const verifyData = await verifyResponse.json();
      if (!verifyData.valid) {
        alert("❌ Invalid passkey. Cannot remove property.");
        return;
      }

      // If passkey is valid, proceed with deletion
      const deleteResponse = await fetch(
        `https://cp-check-submissions-dev-backend.onrender.com/api/admin/property/${encodeURIComponent(propertyToRemove)}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const deleteData = await deleteResponse.json();
      if (deleteResponse.ok) {
        alert(`✅ Property "${propertyToRemove}" removed successfully!`);
        fetchProperties();
      } else {
        alert(deleteData.error || "❌ Error removing property.");
      }
    } catch (error) {
      console.error("Error removing property:", error);
      alert("❌ Server error removing property.");
    }

    setRemovePasskeyPromptVisible(false);
    setPropertyToRemove(null);
    setRemovePasskey("");
  }

  // ======================
  // 4) Add Property Logic
  // ======================
  const handlePasskeySubmit = () => {
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

  // If viewScheduler flag is set, fetch assignments (for admin scheduler view)
  useEffect(() => {
    if (viewScheduler) {
      fetch("https://cp-check-submissions-dev-backend.onrender.com/api/assignments", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.json())
        .then((data) => {
          setAssignments(data);
        })
        .catch((err) => console.error("Error fetching assignments:", err));
    }
  }, [viewScheduler, token]);

  // ======================
  // 5) Geocode address -> lat/lng using Mapbox (for adding property)
  // ======================
  async function handleGeocodeAddress(e) {
    e.preventDefault();
    if (!newPropAddress) {
      return alert("Please enter an address to geocode.");
    }

    // Replace with your actual Mapbox token
    const mapboxToken =
      "pk.eyJ1IjoiaGlnaHNwZWVkbWl0Y2giLCJhIjoiY202c24xNjV5MDl3NTJqcHBtZHM2NjBoZyJ9.CfvYSFKwel_Zt8aU2N_WVA";
    const baseUrl = "https://api.mapbox.com/geocoding/v5/mapbox.places/";
    const url = `${baseUrl}${encodeURIComponent(newPropAddress)}.json?access_token=${mapboxToken}`;

    try {
      const res = await fetch(url);
      const data = await res.json();

      if (data.features && data.features.length > 0) {
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

  // ======================
  // 6) Submit new property to the server (admin only)
  // ======================
  const handleCreateProperty = async () => {
    try {
      const emailsArray = newPropEmails
        .split(",")
        .map((email) => email.trim())
        .filter(Boolean);

      const response = await fetch(
        "https://cp-check-submissions-dev-backend.onrender.com/api/admin/add-property",
        {
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
        }
      );

      const data = await response.json();
      if (data.error) {
        alert(data.error);
      } else {
        alert("Property added successfully!");
        // Re-fetch to update UI
        setAddPropertyFormVisible(false);
        setNewPropName("");
        setNewPropEmails("");
        setNewPropLat("");
        setNewPropLng("");
        setNewPropAddress("");
        fetchProperties();
      }
    } catch (error) {
      console.error("Error creating property:", error);
    }
  };

  // ======================
  // 7) Sidebar toggling, logout, etc.
  // ======================
  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => !prev);
  };

  const handleLogout = () => {
    console.log("🔹 Logging out... Clearing session data.");
    localStorage.clear();
    if (setUser) setUser(false);
    navigate("/login");
  };

  // ======================
  // 8) Sorted Properties & Paging Logic
  // ======================
  // Compute sortedProperties:
  const assignedPropertyNames = assignments
    .filter(a => a.userId === localStorage.getItem("userId"))
    .map(a => a.propertyName);

  // Sort properties so that those with assignments come first.
  const sortedProperties = properties.slice().sort((a, b) => {
    const aAssigned = assignedPropertyNames.includes(a.name);
    const bAssigned = assignedPropertyNames.includes(b.name);
    if (aAssigned === bAssigned) return 0;
    return aAssigned ? -1 : 1;
  });

  const totalPages = Math.ceil(sortedProperties.length / PAGE_SIZE);
  const displayedProperties = sortedProperties.slice(
    pageIndex * PAGE_SIZE,
    pageIndex * PAGE_SIZE + PAGE_SIZE
  );

  const canGoPrev = pageIndex > 0;
  const canGoNext = pageIndex < totalPages - 1;

  function handleNextPage() {
    if (canGoNext) setPageIndex((prev) => prev + 1);
  }

  function handlePrevPage() {
    if (canGoPrev) setPageIndex((prev) => prev - 1);
  }

  // ======================
  // 9) Fetch user assignments function (defined above)
  // ======================
  // (Already defined in fetchUserAssignments)

  // ======================
  // RENDER
  // ======================
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
              {displayedProperties.map((prop) => (
                <li
                  key={prop.name}
                  className={completedProperties.includes(prop.name) ? "completed" : ""}
                  onClick={() => {
                    const orgType = localStorage.getItem("orgType") || "COM"; // Default to Commercial
                    if (role === "admin") {
                      navigate(`/admin/submissions/${encodeURIComponent(prop.name)}`);
                    } else {
                      switch (orgType) {
                        case "COM":
                          navigate(`/commercial-form/${encodeURIComponent(prop.name)}`);
                          break;
                        case "RES":
                          navigate(`/residential-form/${encodeURIComponent(prop.name)}`);
                          break;
                        case "LTR":
                          navigate(`/long-term-rental-form/${encodeURIComponent(prop.name)}`);
                          break;
                        case "STR":
                          navigate(`/short-term-rental-form/${encodeURIComponent(prop.name)}`);
                          break;
                        default:
                          navigate(`/commercial-form/${encodeURIComponent(prop.name)}`); // Default fallback
                      }
                    }
                  }}                  
                >
                  {prop.name}
                </li>
              ))}
            </ul>

            {/* New section for My assignments */}
            {role !== "admin" && (
              <div className="assignments-section">
                <h3>My assignments</h3>
                {assignments.length === 0 ? (
                  <p>No assignments yet.</p>
                ) : (
                  <ul>
                    {assignments.map((assignment) => (
                      <li
                        key={assignment._id}
                        onClick={() => {
                          // For example, you might add a click handler to show assignment details.
                        }}
                      >
                        {assignment.propertyName} -{" "}
                        {new Date(assignment.startDate).toLocaleDateString()}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

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

            {/* Tools for Admin */}
            {role === "admin" && (
              <div className="tools-section" style={{ marginBottom: "-10px" }}>
                <h3>Admin Tools</h3>
                <button
                  className="Admin-tools-primary"
                  onClick={() => {
                    setPasskeyPromptVisible(true);
                    setPasskey("");
                  }}
                >
                  + Property
                </button>
                <button
                  className="Admin-tools-adtl"
                  onClick={(e) => {
                    e.preventDefault();
                    navigate("/scheduler", { state: { token } });
                  }}
                >
                  Scheduler
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
          <>
            {/* Property Cards */}
            <div className="property-cards">
              {displayedProperties.map((prop) => (
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

                  {/* If admin, show "Remove" button */}
                  {role === "admin" && (
                    <button
                      className="remove-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        initiateRemoveProperty(prop.name);
                      }}
                    >
                      Remove
                    </button>
                  )}

                  {/* If user, show "Navigate" button (assuming lat/lng exist) */}
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

            {/* Pagination Controls */}
            <div className="pagination-controls" style={{ marginTop: "1rem" }}>
              {canGoPrev && (
                <button onClick={handlePrevPage} style={{ marginRight: "10px" }}>
                  Previous
                </button>
              )}
              {canGoNext && <button onClick={handleNextPage}>Next</button>}
            </div>
          </>
        )}

        {/* Passkey prompt for adding property */}
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

        {/* Passkey prompt for removing property */}
        {removePasskeyPromptVisible && (
          <div className="passkey-modal">
            <h3>Enter passkey to remove property</h3>
            <input
              type="password"
              value={removePasskey}
              onChange={(e) => setRemovePasskey(e.target.value)}
            />
            <button onClick={handleRemoveProperty}>Confirm Removal</button>
            <button onClick={() => setRemovePasskeyPromptVisible(false)}>Cancel</button>
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

            {/* Instead of direct lat/lng input, let them type an address */}
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

            {/* Show geocoded lat/lng, but keep them read-only for the admin */}
            <div style={{ marginBottom: "1rem" }}>
              <small>Lat: {newPropLat || "N/A"}</small>
              <br />
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
