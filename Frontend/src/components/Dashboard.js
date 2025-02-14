// Dashboard.js
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Geolocation } from '@capacitor/geolocation';
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
  const navigate = useNavigate();

  // 🚗 Mileage states
  const [mileageTracking, setMileageTracking] = useState(false);
  const [mileageCount, setMileageCount] = useState(null);
  const [lastLocation, setLastLocation] = useState(null);
  const organizationId = localStorage.getItem("organizationId");
  const userId = localStorage.getItem("userId");

  // ----------- Paging -----------
  const PAGE_SIZE = 3;
  const [pageIndex, setPageIndex] = useState(0);

  // ----------- States for properties, loading, etc. -----------
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
  const adminOrgType = localStorage.getItem("orgType") || "COM";
  const [loginTime] = useState(
    () => localStorage.getItem("loginTime") || new Date().toISOString()
  );

  // ----------- "Add Property" Admin Flow -----------
  const [passkeyPromptVisible, setPasskeyPromptVisible] = useState(false);
  const [passkey, setPasskey] = useState("");
  const [addPropertyFormVisible, setAddPropertyFormVisible] = useState(false);
  const [newPropName, setNewPropName] = useState("");
  const [newPropEmails, setNewPropEmails] = useState("");
  const [newPropLat, setNewPropLat] = useState("");
  const [newPropLng, setNewPropLng] = useState("");
  const [newPropAddress, setNewPropAddress] = useState("");

  // ----------- "Remove Property" Admin Flow -----------
  // We have a single modal for removing property + passkey.
  const [removePropertyModalVisible, setRemovePropertyModalVisible] = useState(false);
  const [removePasskey, setRemovePasskey] = useState("");
  const [propertyToRemove, setPropertyToRemove] = useState("");

  // ------------ Scheduler Flow -----------
  const [viewScheduler, setViewScheduler] = useState(false);
  const [assignments, setAssignments] = useState([]);

  // ------------- STR user modal -------------
  const [showModal, setShowModal] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState("");

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
    fetch(
      "https://cp-check-submissions-dev-backend.onrender.com/api/properties",
      {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      }
    )
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
        if (!Array.isArray(data)) {
          console.error("❌ Invalid API response. Expected an array.");
          return;
        }
        const userAssignments = data.filter(
          (assignment) => assignment.userId === userId
        );
        setAssignments(userAssignments);
      })
      .catch((err) => console.error("Error fetching assignments:", err));
  }

  // Fetch submissions to mark completed properties (for user role)
  useEffect(() => {
    if (role === "user" && token && !isTokenExpired(token)) {
      fetch(
        "https://cp-check-submissions-dev-backend.onrender.com/api/recent-submissions",
        {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        }
      )
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
  // Instead of two modals, we combine property selection + passkey in one.
  async function handleRemoveProperty() {
    if (!propertyToRemove) {
      alert("Please select a property to remove.");
      return;
    }
    try {
      // Verify removal passkey
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

      // Passkey is valid, proceed with deletion
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
        fetchProperties(); // Refresh list
      } else {
        alert(deleteData.error || "❌ Error removing property.");
      }
    } catch (error) {
      console.error("Error removing property:", error);
      alert("❌ Server error removing property.");
    }

    // Close modal & reset
    setRemovePropertyModalVisible(false);
    setRemovePasskey("");
    setPropertyToRemove("");
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
  // 5) Geocode address (Mapbox)
  // ======================
  async function handleGeocodeAddress(e) {
    e.preventDefault();
    if (!newPropAddress) {
      return alert("Please enter an address to geocode.");
    }
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
  // 6) Submit new property (admin only)
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
        // If STR org, navigate to edit-property route
        if (adminOrgType === "STR") {
          navigate(`/admin/edit-property/${encodeURIComponent(newPropName)}`);
        } else {
          // Otherwise, just refresh & close
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
  // 7) Sidebar toggling, logout, etc.
  // ======================
  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => !prev);
  };

  const handleLogout = () => {
    localStorage.clear();
    if (setUser) setUser(false);
    navigate("/login");
  };

  // ======================
  // 8) Sorted Properties & Paging
  // ======================
  const assignedPropertyNames = assignments
    .filter((a) => a.userId === localStorage.getItem("userId"))
    .map((a) => a.propertyName);

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
  async function startMileageTracking() {
    if (!userId) {
      console.error("⚠️ No userId found in localStorage. Cannot track mileage.");
      return;
    }

    // We only call this if there's no existing doc, or
    // we just want to ensure a doc exists in DB
    try {
      const res = await fetch(
        "https://cp-check-submissions-dev-backend.onrender.com/api/mileage/start",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            userId,          // CHANGED: include userId
            organizationId   // optional if your route requires it
          })
        }
      );
      const data = await res.json();
      if (!data.success) {
        console.warn("⚠️ Could not start mileage tracking:", data.error);
      } else {
        console.log("✅ Mileage tracking started:", data.mileageRecord);
      }
    } catch (error) {
      console.error("Error starting mileage tracking:", error);
    }
  }
  // ======================
  // 9) Mileage Tracking
  // ======================
  function handleMileageToggle() {
    // If toggling from OFF to ON, call start
    if (!mileageTracking) {
      startMileageTracking();
    }
    setMileageTracking(!mileageTracking);
  }
 
  useEffect(() => {
    let watchId;
    if (mileageTracking) {
      // Use Capacitor Geolocation's watchPosition for continuous tracking
      watchId = Geolocation.watchPosition(
        { enableHighAccuracy: true, background: true, maximumAge: 10000, timeout: 10000 },
        (position, err) => {
          if (err) {
            console.error("GPS error:", err);
            return;
          }
          if (position) {
            const { latitude, longitude } = position.coords;
            if (lastLocation) {
              const distance = calculateDistance(
                lastLocation.latitude,
                lastLocation.longitude,
                latitude,
                longitude
              );
              if (distance > 0.05) {
                setMileageCount((prev) =>
                  prev !== null ? prev + distance : distance
                );
                fetch(
                  "https://cp-check-submissions-dev-backend.onrender.com/api/mileage/update",
                  {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({
                      userId,
                      miles: distance
                    })
                  }
                ).catch((err) =>
                  console.error("Mileage update error:", err)
                );
              }
            }
            setLastLocation({ latitude, longitude });
          }
        }
      );
    }
    return () => {
      if (watchId !== undefined) {
        Geolocation.clearWatch({ id: watchId });
      }
    };
  }, [mileageTracking, lastLocation, token, userId]);

  // Helper to calculate distance
  function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 3958.8; // miles
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * (Math.PI / 180)) *
        Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // On mount, reset states
  useEffect(() => {
    setMileageTracking(false);
    setMileageCount(null);
  }, []);

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
            <h2>{localStorage.getItem("role") === "admin" ? "Managed Properties" : "Checklist"}</h2>
            <ul>
              {displayedProperties.map((prop) => (
                <li
                  key={prop.name}
                  className={
                    completedProperties.includes(prop.name) ? "completed" : ""
                  }
                  onClick={() => {
                    if (role === "admin") {
                      // For STR admin => Access Instructions
                      // For non-STR => Submissions
                      if (adminOrgType === "STR") {
                        navigate(
                          `/access-instructions/${encodeURIComponent(prop.name)}`
                        );
                      } else {
                        navigate(
                          `/admin/submissions/${encodeURIComponent(prop.name)}`
                        );
                      }
                    } else {
                      // For non-admin user => forms or STR modal
                      switch (prop.orgType) {
                        case "COM":
                          navigate(
                            `/form/${encodeURIComponent(prop.name)}`
                          );
                          break;
                        case "RES":
                          navigate(
                            `/residential-form/${encodeURIComponent(prop.name)}`
                          );
                          break;
                        case "LTR":
                          navigate(
                            `/long-term-rental-form/${encodeURIComponent(
                              prop.name
                            )}`
                          );
                          break;
                        case "STR":
                          // Show the STR modal (with read-only Access Instructions)
                          setSelectedProperty(prop.name);
                          setShowModal(true);
                          break;
                        default:
                          navigate(
                            `/form/${encodeURIComponent(prop.name)}`
                          );
                      }
                    }
                  }}
                >
                  {prop.name}
                </li>
              ))}
            </ul>

            {/* My assignments (non-admin users) */}
            {role !== "admin" && (
              <div className="assignments-section">
                <h3>My assignments</h3>
                {assignments.length === 0 ? (
                  <p>No assignments yet.</p>
                ) : (
                  <ul>
                    {assignments.map((assignment) => (
                      <li key={assignment._id}>
                        {assignment.propertyName} -{" "}
                        {new Date(assignment.startDate).toLocaleDateString()}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Mileage toggle (non-admin) */}
            {role !== "admin" && (
              <div className="mileage-tracking-toggle">
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={mileageTracking}
                    onChange={handleMileageToggle}
                  />
                  <span className="slider"></span>
                </label>
                <span className="toggle-label">
                  {mileageTracking
                    ? `🚗 ${mileageCount ? mileageCount.toFixed(1) : "0"} mi`
                    : "🚦 Off"}
                </span>
              </div>
            )}

            {/* Dark mode */}
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

            {/* Admin Tools */}
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

                {adminOrgType === "STR" && (
                  <button
                    className="Admin-tools-primary"
                    onClick={() => {
                      // Show the single remove-property modal
                      setRemovePropertyModalVisible(true);
                      setRemovePasskey("");
                      setPropertyToRemove("");
                    }}
                  >
                    - Property
                  </button>
                )}

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

        {/* STR user modal (read-only access instructions) */}
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
                  // For normal user in STR org => read-only instructions
                  navigate(
                    `/access-instructions/${encodeURIComponent(selectedProperty)}`
                  );
                  setShowModal(false);
                }}
              >
                Access Instructions
              </button>
              <button
                className="modal-btn"
                onClick={() => {
                  navigate(
                    `/short-term-rental-form/${encodeURIComponent(selectedProperty)}`
                  );
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
            {/* Property Cards */}
            <div className="property-cards">
              {displayedProperties.map((prop) => {
                const orgType = prop.orgType || "COM";
                const isCompleted = completedProperties.includes(prop.name);

                return (
                  <div
                    key={prop.name}
                    className={`property-card ${
                      isCompleted ? "completed-tile" : ""
                    }`}
                    onClick={() => {
                      if (role === "admin") {
                        // For all admins, property-card click => "view recent submissions"
                        navigate(
                          `/admin/submissions/${encodeURIComponent(prop.name)}`
                        );
                      } else {
                        // For regular users => forms or STR modal
                        if (orgType === "STR") {
                          setSelectedProperty(prop.name);
                          setShowModal(true);
                        } else {
                          let formRoute = "/form";
                          if (orgType === "LTR") formRoute = "/long-term-rental-form";
                          if (orgType === "RES") formRoute = "/residential-form";
                          navigate(`${formRoute}/${encodeURIComponent(prop.name)}`);
                        }
                      }
                    }}
                  >
                    <h3>{prop.name}</h3>

                    <p>
                      {role === "admin"
                        ? "Click to view recent submissions"
                        : isCompleted
                        ? "Completed"
                        : "Click to complete checklist"}
                    </p>

                    {/* If STR admin => Show "Access Instructions" button, but NOT "Remove" */}
                    {role === "admin" && adminOrgType === "STR" && (
                      <button
                        className="access-instructions-button"
                        onClick={(e) => {
                          e.stopPropagation(); // prevent card click
                          navigate(
                            `/access-instructions/${encodeURIComponent(prop.name)}`
                          );
                        }}
                      >
                        Access Instructions
                      </button>
                    )}

                    {/* If admin is NOT STR => Show "Remove" button */}
                    {role === "admin" && adminOrgType !== "STR" && (
                      <button
                        className="remove-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          // directly remove passkey prompt for non-STR admins
                          setPropertyToRemove(prop.name);
                          setRemovePropertyModalVisible(true);
                        }}
                      >
                        Remove
                      </button>
                    )}

                    {/* If user => show "Navigate" if lat/lng exist */}
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
                );
              })}
            </div>

            {/* Remove Property Modal (one combined) */}
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

                  <label style={{ marginTop: "1rem", display: "block" }}>
                    Enter Removal Passkey:
                    <input
                      type="password"
                      value={removePasskey}
                      onChange={(e) => setRemovePasskey(e.target.value)}
                    />
                  </label>

                  <div style={{ marginTop: "10px" }}>
                    <button
                      onClick={handleRemoveProperty}
                      className="payments-button"
                    >
                      Confirm Removal
                    </button>
                    <button
                      onClick={() => {
                        setRemovePropertyModalVisible(false);
                        setRemovePasskey("");
                        setPropertyToRemove("");
                      }}
                      className="payments-button"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

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
