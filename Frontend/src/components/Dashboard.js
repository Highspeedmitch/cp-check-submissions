// Dashboard.js
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Geolocation } from '@capacitor/geolocation';
import axios from "axios";
import { format } from "date-fns";
import { logoutSession } from "../services/session";
import DashboardNavigation from "./ui/DashboardNavigation";
import PageHeader from "./ui/PageHeader";
import {
  useMarkNotificationsRead,
  useNotificationBadges,
} from "../services/notificationCenter";
import { api } from "../services/api";
import { MILEAGE_TRACKING_ENABLED } from "../featureFlags";
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

  //search queries
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarProperties, setSidebarProperties] = useState([]); // ✅ Separate from property cards
  const [regions, setRegions] = useState([]);         // Holds the list of available regions
  const [selectedRegion, setSelectedRegion] = useState(""); // Holds the currently selected region from the dropdown

  const getAuthConfig = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
  });
  // Fetch properties by search query (only for sidebar)
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
  
    try {
      setSidebarProperties([]); // ✅ Clear previous results before fetching
      const res = await axios.get(
        `https://cp-check-submissions-dev-backend.onrender.com/api/properties/search?q=${encodeURIComponent(searchQuery)}`,
        getAuthConfig()
      );
  
      if (Array.isArray(res.data)) {
        setSidebarProperties(res.data); // ✅ Only set if it's an array
        setProperties(res.data);
        setPageIndex(0);
      } else {
        console.error("❌ Unexpected response format:", res.data);
        setSidebarProperties([]); // ✅ Prevent crashes
      }
  
      setError(null);
    } catch (err) {
      console.error("Error searching properties:", err);
      setError(err.response?.data?.error || "Error searching properties");
    }
  };  

// Fetch properties by region (only for sidebar)
const handleRegionFilter = async () => {
  if (!selectedRegion.trim()) {
    fetchProperties();
    setPageIndex(0);
    return;
  }
  
  try {
    // Update the main property-cards state rather than sidebar results
    const res = await axios.get(
      `https://cp-check-submissions-dev-backend.onrender.com/api/properties/region/${encodeURIComponent(selectedRegion)}`,
      getAuthConfig()
    );
    setProperties(res.data);
    setPageIndex(0);
    setError(null);
  } catch (err) {
    console.error("Error fetching properties by region:", err);
    setError(err.response?.data?.error || "Error fetching properties by region");
  }
};
  
  // ----------- Paging -----------
  const PAGE_SIZE = 6;
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
  const isManagement = role === "admin" || role === "property_manager";
  const adminOrgType = localStorage.getItem("orgType") || "COM";
  const notificationBadges = useNotificationBadges(Boolean(token));
  useMarkNotificationsRead(["assignment_created"]);
  const [loginTime] = useState(
    () => localStorage.getItem("loginTime") || new Date().toISOString()
  );

  // ----------- "Add Property" Admin Flow -----------
  const [passkeyPromptVisible, setPasskeyPromptVisible] = useState(false);
  const [passkey, setPasskey] = useState("");
  const [verifiedAddPropertyPasskey, setVerifiedAddPropertyPasskey] = useState("");
  const [passkeyError, setPasskeyError] = useState("");
  const [passkeyVerifying, setPasskeyVerifying] = useState(false);
  const passkeyInputRef = useRef(null);
  const addPropertyFormRef = useRef(null);
  const [addPropertyFormVisible, setAddPropertyFormVisible] = useState(false);
  const [newPropName, setNewPropName] = useState("");
  const [newPropEmails, setNewPropEmails] = useState("");
  const [newPropLat, setNewPropLat] = useState("");
  const [newPropLng, setNewPropLng] = useState("");
  const [newPropAddress, setNewPropAddress] = useState("");
  const [newPropBillingAddress, setNewPropBillingAddress] = useState("");
  const [newPropCode, setNewPropCode] = useState("");
  const [newPropDefaultAmount, setNewPropDefaultAmount] = useState("");
  const [newPropApMethod, setNewPropApMethod] = useState("download");
  const [newPropApDestination, setNewPropApDestination] = useState("");
  const [propertyActionError, setPropertyActionError] = useState("");
  const [propertyActionMessage, setPropertyActionMessage] = useState("");
  const [propertyActionBusy, setPropertyActionBusy] = useState("");

  // ----------- "Remove Property" Admin Flow -----------
  // We have a single modal for removing property + passkey.
  const [removePropertyModalVisible, setRemovePropertyModalVisible] = useState(false);
  const [removePasskey, setRemovePasskey] = useState("");
  const [propertyToRemove, setPropertyToRemove] = useState("");

  // ----------- Property inspection recipients -----------
  const [emailModalProperty, setEmailModalProperty] = useState(null);
  const [propertyEmailDraft, setPropertyEmailDraft] = useState("");
  const [propertyEmailError, setPropertyEmailError] = useState("");
  const [propertyEmailMessage, setPropertyEmailMessage] = useState("");
  const [propertyEmailSaving, setPropertyEmailSaving] = useState(false);
  const propertyEmailInputRef = useRef(null);
  const propertyEmailSavingRef = useRef(false);

  // ------------ Scheduler Flow -----------
  const [assignments, setAssignments] = useState([]);

  // ------------- STR user modal -------------
  const [showModal, setShowModal] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState("");

  // ------------- Filtered Properties Modal -------------
  const handlePropertyClick = (property) => {
    setSelectedProperty(property);
  };
  
  // ------------- Profit Upload Status format -----------
  const [profitStatuses, setProfitStatuses] = useState({});
  useEffect(() => {
    async function fetchProfitStatuses() {
      if (!token || properties.length === 0) {
        setProfitStatuses({});
        return;
      }

      try {
        const response = await fetch(
          "https://cp-check-submissions-dev-backend.onrender.com/api/profits/latest-statuses",
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (!response.ok) throw new Error("Failed to fetch profit statuses");

        const data = await response.json();
        const currentMonth = format(new Date(), "yyyy-MM");
        const statuses = Object.fromEntries(
          properties.map((property) => {
            const latest = data.statuses?.[property._id];
            const isCurrentMonth = latest?.uploadedAt
              && format(new Date(latest.uploadedAt), "yyyy-MM") === currentMonth;

            return [property._id, isCurrentMonth ? "✅" : "❌"];
          })
        );

        setProfitStatuses(statuses);
      } catch (error) {
        console.error("Error fetching profit statuses:", error);
        setProfitStatuses(
          Object.fromEntries(properties.map((property) => [property._id, "❌"]))
        );
      }
    }

    fetchProfitStatuses();
  }, [properties, token]);

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
  const fetchProperties = useCallback(() => {
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
  }, [token]);

  useEffect(() => {
    if (!token || isTokenExpired(token)) {
      localStorage.clear();
      if (setUser) setUser(false);
      navigate("/login");
      return;
    }

    fetchProperties();
  }, [fetchProperties, navigate, setUser, token]);

   // 🔹 Fetch available regions on mount
useEffect(() => {
  const fetchRegions = async () => {
    // Only admins should fetch regions
    if (isManagement) {
      try {
        const res = await axios.get(
          "https://cp-check-submissions-dev-backend.onrender.com/api/properties/regions",
          getAuthConfig()
        );
        setRegions(res.data); // store the unique regions
      } catch (err) {
        console.error("Error fetching regions:", err);
        setError("Error fetching regions");
      }
    }
  };

  fetchRegions();
}, [isManagement]);

  const fetchUserAssignments = useCallback(() => {
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
  }, [token]);

  // Fetch user assignments for non-admin users
  useEffect(() => {
    if (!isManagement) {
      fetchUserAssignments();
    }
  }, [fetchUserAssignments, isManagement]);

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
  const closePasskeyPrompt = () => {
    if (passkeyVerifying) return;
    setPasskeyPromptVisible(false);
    setPasskey("");
    setVerifiedAddPropertyPasskey("");
    setPasskeyError("");
  };

  const handlePasskeySubmit = async (event) => {
    event?.preventDefault();
    if (!passkey.trim() || passkeyVerifying) return;

    setPasskeyVerifying(true);
    setPasskeyError("");

    try {
      const data = await api.post("/api/verify-passkey", { passkey });

      if (!data.valid) {
        setPasskeyError("That passkey is not valid. Please try again.");
        return;
      }

      setVerifiedAddPropertyPasskey(passkey);
      setPasskeyPromptVisible(false);
      setPasskey("");
      setAddPropertyFormVisible(true);
    } catch (err) {
      console.error("Error verifying passkey:", err);
      setPasskeyError("We could not verify the passkey. Please try again.");
    } finally {
      setPasskeyVerifying(false);
    }
  };

  useEffect(() => {
    if (!passkeyPromptVisible) return undefined;

    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    passkeyInputRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setPasskeyPromptVisible(false);
        setPasskey("");
        setVerifiedAddPropertyPasskey("");
        setPasskeyError("");
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [passkeyPromptVisible]);

  useEffect(() => {
    if (!addPropertyFormVisible) return undefined;

    const frame = window.requestAnimationFrame(() => {
      addPropertyFormRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [addPropertyFormVisible]);

  const closePropertyEmailModal = () => {
    if (propertyEmailSaving) return;
    setEmailModalProperty(null);
    setPropertyEmailDraft("");
    setPropertyEmailError("");
    setPropertyEmailMessage("");
  };

  const openPropertyEmailModal = (property) => {
    setEmailModalProperty(property);
    setPropertyEmailDraft((property.emails || []).join("\n"));
    setPropertyEmailError("");
    setPropertyEmailMessage("");
  };

  const handlePropertyEmailSave = async (event) => {
    event.preventDefault();
    if (!emailModalProperty || propertyEmailSaving) return;

    const emails = propertyEmailDraft
      .split(/[\n,;]+/)
      .map((email) => email.trim())
      .filter(Boolean);

    propertyEmailSavingRef.current = true;
    setPropertyEmailSaving(true);
    setPropertyEmailError("");
    setPropertyEmailMessage("");
    try {
      const result = await api.put(
        `/api/properties/${emailModalProperty._id}/emails`,
        { emails }
      );
      const updatedEmails = result.property.emails || [];
      const applyUpdate = (items) => items.map((property) =>
        property._id === emailModalProperty._id
          ? { ...property, emails: updatedEmails }
          : property
      );
      setProperties(applyUpdate);
      setSidebarProperties(applyUpdate);
      setEmailModalProperty((property) => ({ ...property, emails: updatedEmails }));
      setPropertyEmailDraft(updatedEmails.join("\n"));
      setPropertyEmailMessage("Inspection recipients updated.");
    } catch (err) {
      setPropertyEmailError(err.message || "Unable to update inspection recipients.");
    } finally {
      propertyEmailSavingRef.current = false;
      setPropertyEmailSaving(false);
    }
  };

  useEffect(() => {
    if (!emailModalProperty) return undefined;

    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    propertyEmailInputRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !propertyEmailSavingRef.current) {
        setEmailModalProperty(null);
        setPropertyEmailDraft("");
        setPropertyEmailError("");
        setPropertyEmailMessage("");
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [emailModalProperty]);

  // ======================
  // 5) Geocode address (Mapbox)
  // ======================
  async function handleGeocodeAddress(e) {
    e.preventDefault();
    if (!newPropAddress) {
      return alert("Please enter an address to geocode.");
    }
    const mapboxToken = process.env.REACT_APP_MAPBOX_ACCESS_TOKEN;
    if (!mapboxToken) {
      console.error("REACT_APP_MAPBOX_ACCESS_TOKEN is not configured.");
      return alert("Address lookup is temporarily unavailable.");
    }
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
    if (propertyActionBusy) return;
    setPropertyActionBusy("create");
    setPropertyActionError("");
    setPropertyActionMessage("");
    try {
      const emailsArray = newPropEmails
        .split(",")
        .map((email) => email.trim())
        .filter(Boolean);

      await api.post("/api/admin/add-property", {
        passkey: verifiedAddPropertyPasskey,
        name: newPropName,
        emails: emailsArray,
        lat: parseFloat(newPropLat) || 0,
        lng: parseFloat(newPropLng) || 0,
        ...(adminOrgType === "COM" && {
          propertyCode: newPropCode.trim(),
          physicalAddress: newPropAddress.trim(),
          billingAddress: newPropBillingAddress.trim(),
          defaultInspectionAmountCents: newPropDefaultAmount
            ? Math.round(Number(newPropDefaultAmount) * 100)
            : null,
          apMethod: newPropApMethod,
          apEmail: newPropApMethod === "email" ? newPropApDestination.trim() : "",
          apPortal: newPropApMethod === "portal" ? newPropApDestination.trim() : "",
        }),
      });
      if (adminOrgType === "STR") {
        setVerifiedAddPropertyPasskey("");
        navigate(`/admin/edit-property/${encodeURIComponent(newPropName)}`);
      } else {
        setAddPropertyFormVisible(false);
        setVerifiedAddPropertyPasskey("");
        setNewPropName("");
        setNewPropEmails("");
        setNewPropLat("");
        setNewPropLng("");
        setNewPropAddress("");
        setNewPropBillingAddress("");
        setPropertyActionMessage("Property added successfully.");
        await fetchProperties();
      }
    } catch (err) {
      console.error("Error creating property:", err);
      setPropertyActionError(err.message || "Unable to create the property.");
    } finally {
      setPropertyActionBusy("");
    }
  };

  // ======================
  // 7) Sidebar toggling, logout, etc.
  // ======================
  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => !prev);
  };

  const handleLogout = async () => {
    await logoutSession();
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

  function openProperty(prop) {
    if (isManagement) {
      navigate(`/admin/submissions/${encodeURIComponent(prop.name)}`);
      return;
    }
    if (prop.orgType === "STR") {
      setSelectedProperty(prop.name);
      setShowModal(true);
      return;
    }
    let formRoute = "/form";
    if (prop.orgType === "LTR") formRoute = "/long-term-rental-form";
    if (prop.orgType === "RES") formRoute = "/residential-form";
    navigate(`${formRoute}/${encodeURIComponent(prop.name)}`);
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
      if (!data.success) setError(data.error || "Could not start mileage tracking.");
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
    <div className="beta-dashboard">
      <DashboardNavigation
        open={sidebarCollapsed}
        onClose={() => setSidebarCollapsed(false)}
        role={role}
        orgName={orgName}
        orgType={adminOrgType}
        navigate={navigate}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onSearch={handleSearch}
        onClearSearch={() => {
          setSearchQuery("");
          setSidebarProperties([]);
          fetchProperties();
        }}
        regions={regions}
        selectedRegion={selectedRegion}
        setSelectedRegion={setSelectedRegion}
        onRegionFilter={handleRegionFilter}
        onAddProperty={() => {
          setSidebarCollapsed(false);
          setPasskeyPromptVisible(true);
          setPasskey("");
          setVerifiedAddPropertyPasskey("");
          setPasskeyError("");
          setPropertyActionError("");
          setPropertyActionMessage("");
        }}
        onRemoveProperty={() => {
          setSidebarCollapsed(false);
          setRemovePropertyModalVisible(true);
          setRemovePasskey("");
          setPropertyToRemove("");
        }}
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        mileageTracking={mileageTracking}
        mileageCount={mileageCount}
        onMileageToggle={handleMileageToggle}
        onLogout={handleLogout}
        notificationBadges={notificationBadges}
      />
      {/* Sidebar */}
      <div className={`sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
  <button className="sidebar-toggle" onClick={toggleSidebar}>
    {sidebarCollapsed ? "☰" : "×"}
  </button>
  {!sidebarCollapsed && (
    <>
      <h2>{isManagement ? "Managed Properties" : "Checklist"}</h2>
      {adminOrgType === "COM" && role !== "admin" && (
        <button
          className="Admin-tools-adtl"
          onClick={() => navigate("/billing")}
        >
          Billing
        </button>
      )}
      {role === "property_manager" && (
        <button className="Admin-tools-adtl" onClick={() => navigate("/bid-requests")}>
          Get A Bid
        </button>
      )}

      {/* ✅ Managed Properties Section (Admins Only) */}
      {isManagement && (
        <>
          <div className="search-section">
            <input
              type="text"
              placeholder="Search properties..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button className="Admin-tools-adtl" onClick={handleSearch}>
              Search
            </button>
          </div>
             {/* Clear Search Button (only shown when searchQuery has text) */}
    {searchQuery && (
      <p 
        onClick={() => {
          setSearchQuery("");
          setSidebarProperties([]); // Clear search results
        }} 
        style={{
          cursor: "pointer",
          color: "#007bff",
          textDecoration: "underline",
          fontSize: "0.9em",
          marginTop: "5px"
        }}
      >
        Clear Search
      </p>)}
          <div className="region-section">
          <label>Filter by</label>
            <select
              value={selectedRegion}
              onChange={(e) => setSelectedRegion(e.target.value)}
            >
              <option value="">Region</option>
              {regions.map((reg) => (
                <option key={reg} value={reg}>
                  {reg}
                </option>
              ))}
            </select>
            <button className="Admin-tools-adtl" onClick={handleRegionFilter}>
              Filter
            </button>
          </div>

          {error && <p className="error">{error}</p>}

         {/* ✅ Show Search Results in a Clickable Box */}
{isManagement && sidebarProperties.length > 0 ? (
  <ul className="search-results-container">
    {sidebarProperties.map((prop) => (
      <li
        key={prop._id}
        className="search-result-item"
        onClick={() => handlePropertyClick(prop)}
        style={{
          cursor: "pointer",
          padding: "10px",
          border: "1px solid #ccc",
          borderRadius: "5px",
          margin: "5px 0",
          backgroundColor: "#f9f9f9",
        }}
      >
        <strong>{prop.name}</strong> - Region: {prop.region || "Uncategorized"}
      </li>
    ))}
  </ul>
) : (
  <p style={{ fontStyle: "italic", color: "#888" }}>
    🔍 Search or filter properties.
  </p>
)}
{/* ✅ Modal for Admins to Choose Property Actions */}
{selectedProperty && (
  <div
    className="property-modal"
    onClick={(e) => {
      if (e.target.classList.contains("property-modal")) {
        setSelectedProperty(null); // Close modal when clicking outside
      }
    }}
    style={{
      position: "fixed",
      top: 0,
      left: 0,
      width: "100vw",
      height: "100vh",
      background: "rgba(0, 0, 0, 0.5)",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      zIndex: 1000,
    }}
  >
    <div className="modal-content" style={{
      background: "#fff",
      padding: "20px",
      borderRadius: "10px",
      textAlign: "center",
      boxShadow: "0px 4px 6px rgba(0,0,0,0.1)"
    }}>
      <h3>{selectedProperty.name}</h3>
      <button 
        onClick={() => navigate(`/submissions/${selectedProperty._id}`)}
        style={{
          display: "block",
          margin: "10px auto",
          padding: "8px 15px",
          background: "#007bff",
          color: "#fff",
          border: "none",
          borderRadius: "5px",
          cursor: "pointer",
        }}
      >
        📄 View Submissions
      </button>
      <button 
        onClick={() => navigate(`/access-instructions/${selectedProperty._id}`)}
        style={{
          display: "block",
          margin: "10px auto",
          padding: "8px 15px",
          background: "#28a745",
          color: "#fff",
          border: "none",
          borderRadius: "5px",
          cursor: "pointer",
        }}
      >
        🔑 View Access / Info
      </button>
      <button 
        onClick={() => setSelectedProperty(null)}
        style={{
          display: "block",
          margin: "10px auto",
          padding: "8px 15px",
          background: "#dc3545",
          color: "#fff",
          border: "none",
          borderRadius: "5px",
          cursor: "pointer",
        }}
      >
        ❌ Close
      </button>
    </div>
  </div>
)}

        </>
      )}

      {/* ✅ Checklist Section for Non-Admins */}
      {!isManagement && (
        <ul>
          {displayedProperties.map((prop) => (
            <li
              key={prop.name}
              className={completedProperties.includes(prop.name) ? "completed" : ""}
              onClick={() => {
                if (isManagement) {
                  if (adminOrgType === "STR") {
                    navigate(`/access-instructions/${encodeURIComponent(prop.name)}`);
                  } else {
                    navigate(`/admin/submissions/${encodeURIComponent(prop.name)}`);
                  }
                } else {
                  switch (prop.orgType) {
                    case "COM":
                      navigate(`/form/${encodeURIComponent(prop.name)}`);
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
                      navigate(`/form/${encodeURIComponent(prop.name)}`);
                  }
                }
              }}
            >
              {prop.name}
            </li>
          ))}
        </ul>
      )}

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

            {/* Mileage toggle (temporarily disabled by feature flag) */}
            {MILEAGE_TRACKING_ENABLED && role !== "admin" && (
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
                    setVerifiedAddPropertyPasskey("");
                    setPasskeyError("");
                    setPropertyActionError("");
                    setPropertyActionMessage("");
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
                {adminOrgType !== "COM" && (
                  <button
                    className="Admin-tools-adtl"
                    onClick={(e) => {
                      e.preventDefault();
                      navigate("/payments", { state: { token } });
                    }}
                  >
                    Payments
                  </button>
                )}
                {adminOrgType === "COM" && (
                  <button
                    className="Admin-tools-adtl"
                    onClick={() => navigate("/billing")}
                  >
                    Billing
                  </button>
                )}
                {adminOrgType === "COM" && (
                  <>
                    <button className="Admin-tools-adtl" onClick={() => navigate("/admin/users")}>
                      User Management
                    </button>
                    <button className="Admin-tools-adtl" onClick={() => navigate("/bid-requests")}>
                      Bid Requests
                    </button>
                  </>
                )}
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
                  // Redirect AzRoots users to AZRaccessinstructions instead of default AccessInstructions
                  if (orgName === "AzRoots") {
                    navigate(`/azr-access-instructions/${encodeURIComponent(selectedProperty)}`);
                  } else {
                    navigate(`/access-instructions/${encodeURIComponent(selectedProperty)}`);
                  }
                  setShowModal(false);
                }}
              >
                Access / Info
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
      <div className="beta-dashboard-main">
        <div className="beta-mobile-topbar">
          <button type="button" className="beta-menu-button" onClick={() => setSidebarCollapsed(true)} aria-label="Open menu">☰</button>
          <strong>Dashboard</strong>
          <span className="beta-avatar" aria-hidden="true">{orgName.slice(0, 1)}</span>
        </div>
        <PageHeader
          eyebrow={`Working on behalf of ${orgName}`}
          title="Dashboard"
          actions={<button type="button" className="beta-back-link" onClick={handleLogout}>Log out</button>}
        />

        {!isManagement && assignments.length > 0 && (
          <section className="beta-section">
            <div className="beta-section-heading">
              <div>
                <h2>My Assignments</h2>
                <p>Your scheduled property work.</p>
              </div>
            </div>
            <div className="beta-assignment-grid">
              {assignments.slice(0, 4).map((assignment) => {
                const property = properties.find((item) => item.name === assignment.propertyName);
                return (
                  <article className="beta-assignment-card" key={assignment._id}>
                    <div className="beta-card-header">
                      <div>
                        <h3>{assignment.propertyName}</h3>
                        <p>{new Date(assignment.startDate).toLocaleDateString()}</p>
                      </div>
                      <span className="beta-status warning">Scheduled</span>
                    </div>
                    <div className="beta-card-actions">
                      {property && <button className="beta-button" onClick={() => openProperty(property)}>Start Inspection</button>}
                      {property?.lat && property?.lng && (
                        <button className="beta-button secondary" onClick={() => openNativeMaps(property.lat, property.lng)}>Navigate</button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {loading ? (
          <p>Loading properties...</p>
        ) : error ? (
          <p className="error">{error}</p>
        ) : (
          <>
            <section className="beta-section">
              <div className="beta-section-heading">
                <div>
                  <h2>{isManagement ? "All Managed Properties" : "All Properties"}</h2>
                  <p>{isManagement ? "Review inspections and property activity." : "Select a property to begin an inspection."}</p>
                </div>
              </div>
            {/* Property Cards */}
            <div className="property-cards">
              {displayedProperties.map((prop) => {
                const isCompleted = completedProperties.includes(prop.name);

                return (
                  <div
                    key={prop.name}
                    className="beta-property-card"
                  >
                    <div className="beta-card-header">
                      <div>
                        <h3>{prop.name}</h3>
                        <p>{isManagement ? "Inspection history and property activity" : "Property inspection checklist"}</p>
                      </div>
                      <span className={`beta-status ${isCompleted ? "completed" : ""}`}>
                        {isCompleted ? "Completed" : isManagement ? "Managed" : "Ready"}
                      </span>
                    </div>
                    <div className="beta-card-actions beta-property-actions">
                      <button className="beta-button" onClick={() => openProperty(prop)}>
                        {isManagement ? "View Submissions" : "Start Inspection"}
                      </button>
                      {role === "admin" && (
                        <button
                          type="button"
                          className="beta-button secondary"
                          onClick={() => openPropertyEmailModal(prop)}
                        >
                          Manage Emails
                        </button>
                      )}
                      {isManagement && adminOrgType === "COM" && (
                        <button
                          type="button"
                          className="beta-button secondary"
                          onClick={() => navigate(`/property-form-settings/${encodeURIComponent(prop.name)}`)}
                        >
                          Manage Details
                        </button>
                      )}
                    </div>

                    {/* ✅ PROFIT STATEMENT STATUS - AzRoots Admins ONLY */}
                    {role === "admin" && orgName === "AzRoots" && (
                      <p>
                        Profit Statement for {format(new Date(), "MMM")}:{" "}
                        {profitStatuses[prop._id] || "❌"}
                      </p>
                    )}

                    {/* If STR admin => Show "Access / Info" button, but NOT "Remove" */}
                    {role === "admin" && adminOrgType === "STR" && (
                      <button
                        className="access-instructions-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const orgName = localStorage.getItem("orgName");

                          if (orgName === "AzRoots") {
                            navigate(`/azr-access-instructions/${encodeURIComponent(prop.name)}`);
                          } else {
                            navigate(`/access-instructions/${encodeURIComponent(prop.name)}`);
                          }
                        }}
                      >
                        Access / Info
                      </button>
                    )}

                    {/* If admin is NOT STR => Show "Remove" button */}
                    {role === "admin" && adminOrgType !== "STR" && (
                      <button
                        className="remove-button"
                        onClick={(e) => {
                          e.stopPropagation();
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
            </section>
            {emailModalProperty && (
              <div
                className="beta-dialog-overlay"
                onMouseDown={(event) => {
                  if (event.target === event.currentTarget) closePropertyEmailModal();
                }}
              >
                <form
                  className="beta-dialog"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="property-email-title"
                  aria-describedby="property-email-description"
                  onSubmit={handlePropertyEmailSave}
                >
                  <div className="beta-dialog-header">
                    <div>
                      <span className="beta-eyebrow">Inspection delivery</span>
                      <h2 id="property-email-title">Manage recipient emails</h2>
                    </div>
                    <button
                      type="button"
                      className="beta-dialog-close"
                      aria-label="Close recipient email dialog"
                      onClick={closePropertyEmailModal}
                      disabled={propertyEmailSaving}
                    >
                      ×
                    </button>
                  </div>
                  <p id="property-email-description" className="beta-dialog-copy">
                    Inspection reports for <strong>{emailModalProperty.name}</strong> will be
                    sent to these addresses. Enter one address per line, or separate them
                    with commas.
                  </p>
                  <label className="beta-field" htmlFor="property-recipient-emails">
                    <span>Recipient emails</span>
                    <textarea
                      ref={propertyEmailInputRef}
                      id="property-recipient-emails"
                      rows="6"
                      value={propertyEmailDraft}
                      onChange={(event) => {
                        setPropertyEmailDraft(event.target.value);
                        setPropertyEmailError("");
                        setPropertyEmailMessage("");
                      }}
                      placeholder={"manager@example.com\noperations@example.com"}
                      aria-invalid={Boolean(propertyEmailError)}
                      aria-describedby={propertyEmailError ? "property-email-error" : undefined}
                      disabled={propertyEmailSaving}
                    />
                  </label>
                  <p className="beta-dialog-note">
                    Leaving this empty removes all property-specific inspection recipients.
                  </p>
                  {propertyEmailError && (
                    <p id="property-email-error" className="beta-alert error" role="alert">
                      {propertyEmailError}
                    </p>
                  )}
                  {propertyEmailMessage && (
                    <p className="beta-alert success" role="status">
                      {propertyEmailMessage}
                    </p>
                  )}
                  <div className="beta-dialog-actions">
                    <button
                      type="button"
                      className="beta-button secondary"
                      onClick={closePropertyEmailModal}
                      disabled={propertyEmailSaving}
                    >
                      Close
                    </button>
                    <button
                      type="submit"
                      className="beta-button"
                      disabled={propertyEmailSaving}
                    >
                      {propertyEmailSaving ? "Saving…" : "Save Emails"}
                    </button>
                  </div>
                </form>
              </div>
            )}
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
          <div
            className="beta-dialog-overlay"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closePasskeyPrompt();
            }}
          >
            <form
              className="beta-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="add-property-passkey-title"
              aria-describedby="add-property-passkey-description"
              onSubmit={handlePasskeySubmit}
            >
              <div className="beta-dialog-header">
                <div>
                  <span className="beta-eyebrow">Admin verification</span>
                  <h2 id="add-property-passkey-title">Add a new property</h2>
                </div>
                <button
                  type="button"
                  className="beta-dialog-close"
                  aria-label="Close passkey dialog"
                  onClick={closePasskeyPrompt}
                  disabled={passkeyVerifying}
                >
                  ×
                </button>
              </div>
              <p id="add-property-passkey-description" className="beta-dialog-copy">
                Enter your organization passkey to continue to property setup.
              </p>
              <label className="beta-field" htmlFor="add-property-passkey">
                <span>Organization passkey</span>
                <input
                  ref={passkeyInputRef}
                  id="add-property-passkey"
                  type="password"
                  autoComplete="current-password"
                  value={passkey}
                  onChange={(event) => {
                    setPasskey(event.target.value);
                    if (passkeyError) setPasskeyError("");
                  }}
                  aria-invalid={Boolean(passkeyError)}
                  aria-describedby={passkeyError ? "passkey-error" : undefined}
                  disabled={passkeyVerifying}
                />
              </label>
              {passkeyError && (
                <p id="passkey-error" className="beta-dialog-error" role="alert">
                  {passkeyError}
                </p>
              )}
              <div className="beta-dialog-actions">
                <button
                  type="button"
                  className="beta-button secondary"
                  onClick={closePasskeyPrompt}
                  disabled={passkeyVerifying}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="beta-button"
                  disabled={!passkey.trim() || passkeyVerifying}
                >
                  {passkeyVerifying ? "Verifying…" : "Continue"}
                </button>
              </div>
            </form>
          </div>
        )}

        {propertyActionError && (
          <p className="beta-alert error" role="alert">{propertyActionError}</p>
        )}
        {propertyActionMessage && (
          <p className="beta-alert success" role="status">{propertyActionMessage}</p>
        )}

        {/* Show Add Property Form if passkey verified */}
        {addPropertyFormVisible && (
          <div className="add-property-form" ref={addPropertyFormRef}>
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
              Physical Property Address (will geocode):
              <input
                type="text"
                value={newPropAddress}
                onChange={(e) => setNewPropAddress(e.target.value)}
              />
            </label>
            {adminOrgType === "COM" && (
              <>
                <label>
                  Invoice Billing Address:
                  <input
                    type="text"
                    required
                    value={newPropBillingAddress}
                    onChange={(e) => setNewPropBillingAddress(e.target.value)}
                  />
                </label>
                <label>
                  Brokerage Property Code:
                  <input
                    type="text"
                    required
                    value={newPropCode}
                    onChange={(e) => setNewPropCode(e.target.value)}
                  />
                </label>
                <label>
                  Default Check Amount (optional):
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newPropDefaultAmount}
                    onChange={(e) => setNewPropDefaultAmount(e.target.value)}
                  />
                </label>
                <label>
                  AP Delivery:
                  <select
                    value={newPropApMethod}
                    onChange={(e) => setNewPropApMethod(e.target.value)}
                  >
                    <option value="download">Manual download</option>
                    <option value="email">Email</option>
                    <option value="portal">AP portal</option>
                  </select>
                </label>
                {newPropApMethod !== "download" && (
                  <label>
                    {newPropApMethod === "email" ? "AP Email:" : "AP Portal / Instructions:"}
                    <input
                      type={newPropApMethod === "email" ? "email" : "text"}
                      value={newPropApDestination}
                      onChange={(e) => setNewPropApDestination(e.target.value)}
                    />
                  </label>
                )}
              </>
            )}
            <button onClick={handleGeocodeAddress} style={{ marginBottom: "1rem" }}>
              Geocode
            </button>
            <div style={{ marginBottom: "1rem" }}>
              <small>Lat: {newPropLat || "N/A"}</small>
              <br />
              <small>Lng: {newPropLng || "N/A"}</small>
            </div>
            <button
              onClick={handleCreateProperty}
              disabled={propertyActionBusy === "create"}
            >
              {propertyActionBusy === "create" ? "Creating…" : "Create"}
            </button>
            <button
              disabled={propertyActionBusy === "create"}
              onClick={() => {
                setAddPropertyFormVisible(false);
                setVerifiedAddPropertyPasskey("");
                setPropertyActionError("");
              }}
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
