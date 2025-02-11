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
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, "_blank");
  }
}

function Dashboard({ setUser }) {
  const navigate = useNavigate();

  // Retrieve admin's org type from localStorage
  const adminOrgType = localStorage.getItem("orgType") || "COM";

  // 🚗 Mileage tracking states
  const [mileageTracking, setMileageTracking] = useState(false);
  const [mileageCount, setMileageCount] = useState(null);
  const [lastLocation, setLastLocation] = useState(null);

  // Paging
  const PAGE_SIZE = 3;
  const [pageIndex, setPageIndex] = useState(0);

  // Properties & assignments
  const [properties, setProperties] = useState([]);
  const [completedProperties, setCompletedProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Dark mode
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("darkMode") === "true");

  // Auth / Org Info
  const token = localStorage.getItem("token");
  const orgName = localStorage.getItem("orgName") || "Your Organization";
  const role = localStorage.getItem("role") || "user";
  const [loginTime] = useState(() => localStorage.getItem("loginTime") || new Date().toISOString());

  // Admin property management states
  const [passkeyPromptVisible, setPasskeyPromptVisible] = useState(false);
  const [passkey, setPasskey] = useState("");
  const [addPropertyFormVisible, setAddPropertyFormVisible] = useState(false);
  const [newPropName, setNewPropName] = useState("");
  const [newPropEmails, setNewPropEmails] = useState("");
  const [newPropLat, setNewPropLat] = useState("");
  const [newPropLng, setNewPropLng] = useState("");
  const [newPropAddress, setNewPropAddress] = useState("");

  // Remove property modal (for admin non-STR only)
  const [removePropertyModalVisible, setRemovePropertyModalVisible] = useState(false);
  const [removePasskey, setRemovePasskey] = useState("");
  const [propertyToRemove, setPropertyToRemove] = useState("");

  // Scheduler assignments (for non-admin users)
  const [viewScheduler, setViewScheduler] = useState(false);
  const [assignments, setAssignments] = useState([]);

  // Modal for STR non-admin users (for Submit Form / Access Instructions)
  const [showModal, setShowModal] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState("");

  // Current week state
  const [currentWeek, setCurrentWeek] = useState("");

  // ======================
  // Current Week Calculation
  useEffect(() => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - dayOfWeek);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    const formatDate = (date) =>
      `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
    setCurrentWeek(`${formatDate(startOfWeek)} - ${formatDate(endOfWeek)}`);
  }, []);

  // ======================
  // Apply Dark Mode on Load
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) root.classList.add("dark-mode");
    else root.classList.remove("dark-mode");
    localStorage.setItem("darkMode", darkMode);
  }, [darkMode]);

  // ======================
  // Fetch Properties
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
        if (data.error) setError(data.error);
        else setProperties(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching properties:", err);
        setError("Failed to load properties");
        setLoading(false);
      });
  }

  // ======================
  // Fetch Assignments for Non-Admin Users
  useEffect(() => {
    if (role !== "admin") fetchUserAssignments();
  }, [role, token]);

  function fetchUserAssignments() {
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
        if (!Array.isArray(data)) {
          console.error("❌ Invalid API response. Expected an array.");
          return;
        }
        const userAssignments = data.filter((assignment) => assignment.userId === userId);
        setAssignments(userAssignments);
      })
      .catch((err) => console.error("Error fetching assignments:", err));
  }

  // ======================
  // Fetch Submissions for Non-Admin Users
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
  // Remove Property Logic (handled via admin sidebar modal)
  async function handleRemoveProperty() {
    if (!propertyToRemove) return;
    try {
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
    setRemovePropertyModalVisible(false);
    setPropertyToRemove("");
    setRemovePasskey("");
  }

  // ======================
  // Add Property Logic (unchanged)
  const handlePasskeySubmit = () => {
    fetch("https://cp-check-submissions-dev-backend.onrender.com/api/verify-passkey", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passkey }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.valid) setAddPropertyFormVisible(true);
        else alert("Invalid passkey. Cannot add property.");
        setPasskeyPromptVisible(false);
      })
      .catch((err) => console.error("Error verifying passkey:", err));
  };

  // ======================
  // Geocode Address using Mapbox (unchanged)
  async function handleGeocodeAddress(e) {
    e.preventDefault();
    if (!newPropAddress) {
      return alert("Please enter an address to geocode.");
    }
    const mapboxToken = "pk.eyJ1IjoiaGlnaHNwZWVkbWl0Y2giLCJhIjoiY202c24xNjV5MDl3NTJqcHBtZHM2NjBoZyJ9.CfvYSFKwel_Zt8aU2N_WVA";
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
  // Submit New Property Logic (unchanged)
  const handleCreateProperty = async () => {
    try {
      const emailsArray = newPropEmails.split(",").map((email) => email.trim()).filter(Boolean);
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
        if (adminOrgType === "STR") {
          navigate(`/admin/edit-property/${encodeURIComponent(newPropName)}`);
        } else {
          setAddPropertyFormVisible(false);
          setNewPropName("");
          setNewPropEmails("");
          setNewPropLat("");
          setNewPropLng("");
          setNewPropAddress("");
          fetchProperties();
        }
      }
    } catch (error) {
      console.error("Error creating property:", error);
    }
  };

  // ======================
  // Sidebar Toggling, Logout, etc.
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
  // Sorted Properties & Paging Logic
  const assignedPropertyNames = assignments
    .filter(a => a.userId === localStorage.getItem("userId"))
    .map(a => a.propertyName);
  const sortedProperties = properties.slice().sort((a, b) => {
    const aAssigned = assignedPropertyNames.includes(a.name);
    const bAssigned = assignedPropertyNames.includes(b.name);
    if (aAssigned === bAssigned) return 0;
    return aAssigned ? -1 : 1;
  });
  const totalPages = Math.ceil(sortedProperties.length / PAGE_SIZE);
  const displayedProperties = sortedProperties.slice(pageIndex * PAGE_SIZE, pageIndex * PAGE_SIZE + PAGE_SIZE);
  const canGoPrev = pageIndex > 0;
  const canGoNext = pageIndex < totalPages - 1;
  function handleNextPage() {
    if (canGoNext) setPageIndex((prev) => prev + 1);
  }
  function handlePrevPage() {
    if (canGoPrev) setPageIndex((prev) => prev - 1);
  }

  // ======================
  // Track Mileage (unchanged)
  useEffect(() => {
    let interval;
    if (mileageTracking) {
      interval = setInterval(() => {
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              const { latitude, longitude } = position.coords;
              if (lastLocation) {
                const distance = calculateDistance(
                  lastLocation.latitude,
                  lastLocation.longitude,
                  latitude,
                  longitude
                );
                if (distance > 0.05) {
                  setMileageCount((prev) => (prev !== null ? prev + distance : distance));
                  fetch("https://cp-check-submissions-dev-backend.onrender.com/api/mileage/update", {
                    method: "POST",
                    headers: { 
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${localStorage.getItem("token")}`
                    },
                    body: JSON.stringify({ miles: distance }),
                  });
                }
              }
              setLastLocation({ latitude, longitude });
            },
            (error) => console.error("GPS error:", error),
            { enableHighAccuracy: true, maximumAge: 10000 }
          );
        }
      }, 30000);
    }
    return () => clearInterval(interval);
  }, [mileageTracking, lastLocation]);

  function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 3958.8;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  useEffect(() => {
    setMileageTracking(false);
    setMileageCount(null);
  }, []);

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
                    // Sidebar nav click (for admin)
                    if (role === "admin") {
                      if (adminOrgType === "STR") {
                        // For STR admin, simply navigate to the property page (no subtext)
                        navigate(`/access-instructions/${encodeURIComponent(prop.name)}`);
                      } else {
                        // For non-STR admin, show subtext "view recent submissions"
                        navigate(`/admin/submissions/${encodeURIComponent(prop.name)}`);
                      }
                    } else {
                      // For regular users, do nothing here or follow existing logic
                      // (Regular users typically use the main property cards)
                    }
                  }}
                >
                  <h3>{prop.name}</h3>
                  {role === "admin" ? (
                    // For admin sidebar: if STR, no subtext; else show "view recent submissions"
                    adminOrgType === "STR" ? null : <p>view recent submissions</p>
                  ) : (
                    <p>
                      {completedProperties.includes(prop.name)
                        ? "Completed"
                        : "Click to complete checklist"}
                    </p>
                  )}
                </li>
              ))}
            </ul>
            {role !== "admin" && (
              <div className="assignments-section">
                <h3>My assignments</h3>
                {assignments.length === 0 ? (
                  <p>No assignments yet.</p>
                ) : (
                  <ul>
                    {assignments.map((assignment) => (
                      <li key={assignment._id}>
                        {assignment.propertyName} - {new Date(assignment.startDate).toLocaleDateString()}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {role !== "admin" && (
              <div className="mileage-tracking-toggle">
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={mileageTracking}
                    onChange={() => setMileageTracking((prev) => !prev)}
                  />
                  <span className="slider"></span>
                </label>
                <span className="toggle-label">
                  {mileageTracking ? `🚗 ${mileageCount ? mileageCount.toFixed(1) : "0"} mi` : "🚦 Off"}
                </span>
              </div>
            )}
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
                  className="Admin-tools-primary"
                  onClick={() => {
                    setRemovePropertyModalVisible(true);
                  }}
                >
                  - Property
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
                <button
                  className="Admin-tools-adtl"
                  onClick={(e) => {
                    e.preventDefault();
                    navigate("/payments", { state: { token } });
                  }}
                >
                  Payments
                </button>
              </div>
            )}
          </>
        )}
        {removePropertyModalVisible && (
          <div className="modal-overlay">
            <div className="modal">
              <h2>Remove Property</h2>
              <p>Select the property you wish to remove:</p>
              <select
                value={propertyToRemove}
                onChange={(e) => setPropertyToRemove(e.target.value)}
              >
                <option value="">-- Select Property --</option>
                {properties.map((prop) => (
                  <option key={prop.name} value={prop.name}>
                    {prop.name}
                  </option>
                ))}
              </select>
              <br />
              <label>
                Enter Removal Passkey:
                <input
                  type="password"
                  value={removePasskey}
                  onChange={(e) => setRemovePasskey(e.target.value)}
                />
              </label>
              <div style={{ marginTop: "10px" }}>
                <button onClick={handleRemoveProperty} className="payments-button">
                  Confirm Removal
                </button>
                <button
                  onClick={() => setRemovePropertyModalVisible(false)}
                  className="payments-button"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
        {showModal && (
          <div className="modal-overlay">
            <div className="modal">
              <h2>Select an Action</h2>
              <p>
                What would you like to do for <strong>{selectedProperty}</strong>?
              </p>
              <button
                className="modal-btn"
                onClick={() => {
                  navigate(`/access-instructions/${encodeURIComponent(selectedProperty)}`);
                  setShowModal(false);
                }}
              >
                Access Instructions
              </button>
              <button
                className="modal-btn"
                onClick={() => {
                  navigate(`/short-term-rental-form/${encodeURIComponent(selectedProperty)}`);
                  setShowModal(false);
                }}
              >
                Submit Form
              </button>
              <button className="modal-close" onClick={() => setShowModal(false)}>
                Cancel
              </button>
            </div>
          </div>
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
            <div className="property-cards">
              {displayedProperties.map((prop) => {
                const orgType = prop.orgType || "COM";
                let formRoute = "/form";
                if (orgType === "LTR") {
                  formRoute = "/long-term-rental";
                } else if (orgType === "RES") {
                  formRoute = "/residential";
                } else if (orgType === "STR") {
                  formRoute = "/short-term-rental";
                }
                return (
                  <div
                    key={prop.name}
                    className={`property-card ${completedProperties.includes(prop.name) ? "completed-tile" : ""}`}
                    onClick={() => {
                      if (role === "admin") {
                        // For admin main cards:
                        if (adminOrgType === "STR") {
                          // For STR admins, display "view submissions"
                          navigate(`/admin/submissions/${encodeURIComponent(prop.name)}`);
                        } else {
                          // For non-STR admins, display the removal logic remains on the sidebar,
                          // so we navigate to recent submissions.
                          navigate(`/admin/submissions/${encodeURIComponent(prop.name)}`);
                        }
                      } else {
                        // For regular users
                        switch (prop.orgType) {
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
                            setSelectedProperty(prop.name);
                            setShowModal(true);
                            break;
                          default:
                            navigate(`/commercial-form/${encodeURIComponent(prop.name)}`);
                        }
                      }
                    }}
                  >
                    <h3>{prop.name}</h3>
                    <p>
                      {role === "admin"
                        ? (adminOrgType === "STR" ? "view submissions" : "view recent submissions")
                        : (completedProperties.includes(prop.name)
                          ? "Completed"
                          : "Click to complete checklist")}
                    </p>
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
                    {/* For non-STR admins, you might want a Remove button on the card.
                        For STR admins, show a button for Access Instructions */}
                    {role === "admin" && (
                      adminOrgType === "STR" ? (
                        <button
                          className="access-button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/access-instructions/${encodeURIComponent(prop.name)}`);
                          }}
                        >
                          Access Instructions
                        </button>
                      ) : (
                        <button
                          className="remove-button"
                          onClick={(e) => {
                            e.stopPropagation();
                            initiateRemoveProperty(prop.name);
                          }}
                        >
                          Remove
                        </button>
                      )
                    )}
                  </div>
                );
              })}
            </div>
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
