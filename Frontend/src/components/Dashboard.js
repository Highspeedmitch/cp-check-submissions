// Dashboard.js
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { logoutSession } from "../services/session";
import DashboardNavigation from "./ui/DashboardNavigation";
import PageHeader from "./ui/PageHeader";
import AssignmentSection from "./dashboard/AssignmentSection";
import DashboardPagination from "./dashboard/DashboardPagination";
import PropertySection from "./dashboard/PropertySection";
import InspectionLauncherDialog from "./dashboard/dialogs/InspectionLauncherDialog";
import RemovePropertyDialog from "./dashboard/dialogs/RemovePropertyDialog";
import AdminVerificationDialog from "./dashboard/dialogs/AdminVerificationDialog";
import PropertyRecipientsDialog from "./dashboard/dialogs/PropertyRecipientsDialog";
import PropertyAdditionChoiceDialog from "./dashboard/dialogs/PropertyAdditionChoiceDialog";
import AddPropertyForm from "./dashboard/AddPropertyForm";
import ContextualHelpLink from "./help/ContextualHelpLink";
import WorkspaceSwitcher from "./WorkspaceSwitcher";
import {
  useMarkNotificationsRead,
  useNotificationBadges,
} from "../services/notificationCenter";
import { api, apiUrl } from "../services/api";

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
  const [searchParams, setSearchParams] = useSearchParams();

  //search queries
  const [searchQuery, setSearchQuery] = useState("");
  const [regions, setRegions] = useState([]);         // Holds the list of available regions
  const [selectedRegion, setSelectedRegion] = useState(""); // Holds the currently selected region from the dropdown

  // Fetch properties by search query (only for sidebar)
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
  
    try {
      const res = {
        data: await api.get(`/api/properties/search?q=${encodeURIComponent(searchQuery)}`),
      };
  
      if (Array.isArray(res.data)) {
        setProperties(res.data);
        setPageIndex(0);
      } else {
        console.error("❌ Unexpected response format:", res.data);
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
    const res = {
      data: await api.get(`/api/properties/region/${encodeURIComponent(selectedRegion)}`),
    };
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

  // ----------- Auth / Org Info -----------
  const token = localStorage.getItem("token");
  const orgName = localStorage.getItem("orgName") || "Your Organization";
  const role = localStorage.getItem("role") || "user";
  const accountScope = localStorage.getItem("accountScope") || "organization";
  const isManagement = role === "admin" || role === "property_manager";
  const adminOrgType = localStorage.getItem("orgType") || "COM";
  const [canAccessBilling, setCanAccessBilling] = useState(false);
  const notificationBadges = useNotificationBadges(Boolean(token));
  useMarkNotificationsRead(["assignment_created"]);
  const [loginTime] = useState(
    () => localStorage.getItem("loginTime") || new Date().toISOString()
  );

  useEffect(() => {
    let active = true;
    if (!token || adminOrgType !== "COM") {
      setCanAccessBilling(false);
      return () => { active = false; };
    }
    api.get("/api/billing/access")
      .then((result) => {
        if (!active) return;
        const allowed = Boolean(result?.canAccess);
        localStorage.setItem("billingAccess", allowed ? "true" : "false");
        setCanAccessBilling(allowed);
      })
      .catch(() => {
        if (!active) return;
        localStorage.setItem("billingAccess", "false");
        setCanAccessBilling(false);
      });
    return () => { active = false; };
  }, [adminOrgType, token]);

  // ----------- "Add Property" Admin Flow -----------
  const [propertyAdditionChoiceVisible, setPropertyAdditionChoiceVisible] = useState(false);
  const [passkeyPromptVisible, setPasskeyPromptVisible] = useState(false);
  const [addPropertyGrant, setAddPropertyGrant] = useState("");
  const [addPropertyFormVisible, setAddPropertyFormVisible] = useState(false);
  const [propertyActionMessage, setPropertyActionMessage] = useState("");

  useEffect(() => {
    if (role !== "admin" || searchParams.get("onboarding") !== "add-property") return;
    setPropertyAdditionChoiceVisible(true);
    setSearchParams({}, { replace: true });
  }, [role, searchParams, setSearchParams]);

  // ----------- "Remove Property" Admin Flow -----------
  // We have a single modal for removing property + passkey.
  const [removePropertyModalVisible, setRemovePropertyModalVisible] = useState(false);
  const [removePasskey, setRemovePasskey] = useState("");
  const [propertyToRemove, setPropertyToRemove] = useState("");

  // ----------- Property inspection recipients -----------
  const [emailModalProperty, setEmailModalProperty] = useState(null);

  // ------------ Scheduler Flow -----------
  const [assignments, setAssignments] = useState([]);

  // ------------- STR user modal -------------
  const [showModal, setShowModal] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState("");
  const [selectedAssignmentId, setSelectedAssignmentId] = useState("");

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
          apiUrl("/api/profits/latest-statuses"),
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
  // Fetch properties & submissions
  // ======================
  const fetchProperties = useCallback(() => {
    setLoading(true);
    fetch(apiUrl("/api/properties"), {
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
    if (!token) {
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
        const res = { data: await api.get("/api/properties/regions") };
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
    fetch(apiUrl("/api/assignments"), {
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
    if (role === "user" && token) {
      fetch(
        apiUrl("/api/recent-submissions"),
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
      const verification = await api.post("/api/organization-security/grants", {
        purpose: "remove_property",
        passkey: removePasskey,
      });
      await api.delete(
        `/api/admin/property/${encodeURIComponent(propertyToRemove)}`,
        { body: { adminActionGrant: verification.grant } }
      );
      alert(`✅ Property "${propertyToRemove}" removed successfully!`);
      fetchProperties();
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
    setPasskeyPromptVisible(false);
    setAddPropertyGrant("");
  };

  const verifyAddPropertyPasskey = async (passkey) => {
    const data = await api.post("/api/organization-security/grants", {
      purpose: "add_property",
      passkey,
    });
    setAddPropertyGrant(data.grant);
    setPasskeyPromptVisible(false);
    setAddPropertyFormVisible(true);
    return true;
  };

  const openPropertyEmailModal = (property) => {
    setEmailModalProperty(property);
  };

  const savePropertyEmails = async (emails) => {
    const result = await api.put(
      `/api/properties/${emailModalProperty._id}/emails`,
      { emails }
    );
    const updatedEmails = result.property.emails || [];
    const automaticRecipientEmails = result.property.automaticRecipientEmails
      || emailModalProperty.automaticRecipientEmails
      || [];
    setProperties((items) => items.map((property) =>
      property._id === emailModalProperty._id
        ? { ...property, emails: updatedEmails, automaticRecipientEmails }
        : property
    ));
    setEmailModalProperty((property) => ({
      ...property,
      emails: updatedEmails,
      automaticRecipientEmails,
    }));
    return updatedEmails;
  };

  // ======================
  // 5) Submit new property (admin only)
  // ======================
  const handleCreateProperty = async (form) => {
    setPropertyActionMessage("");
    try {
      const emailsArray = form.emails
        .split(",")
        .map((email) => email.trim())
        .filter(Boolean);

      await api.post("/api/admin/add-property", {
        adminActionGrant: addPropertyGrant,
        name: form.name,
        emails: emailsArray,
        lat: parseFloat(form.lat) || 0,
        lng: parseFloat(form.lng) || 0,
        propertyManagerId: form.propertyManagerId || null,
        defaultFulfillmentSource: form.fulfillmentSource || null,
        ...(adminOrgType === "COM" && {
          propertyCode: form.propertyCode.trim(),
          physicalAddress: form.address.trim(),
          billingAddress: form.billingAddress.trim(),
          defaultInspectionAmountCents: form.defaultAmount
            ? Math.round(Number(form.defaultAmount) * 100)
            : null,
          apMethod: form.apMethod,
          apEmail: form.apMethod === "email" ? form.apDestination.trim() : "",
          apPortal: form.apMethod === "portal" ? form.apDestination.trim() : "",
        }),
      });
      if (adminOrgType === "STR") {
        setAddPropertyGrant("");
        navigate(`/admin/edit-property/${encodeURIComponent(form.name)}`);
      } else {
        setAddPropertyFormVisible(false);
        setAddPropertyGrant("");
        setPropertyActionMessage("Property added successfully.");
        await fetchProperties();
      }
    } catch (err) {
      console.error("Error creating property:", err);
      throw err;
    }
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

  function openProperty(prop, assignment = null) {
    if (isManagement) {
      navigate(`/admin/submissions/${encodeURIComponent(prop.name)}`);
      return;
    }
    const assignmentQuery = assignment?._id
      ? `?assignmentId=${encodeURIComponent(assignment._id)}`
      : "";
    if (prop.orgType === "STR") {
      setSelectedProperty(prop.name);
      setSelectedAssignmentId(assignment?._id || "");
      setShowModal(true);
      return;
    }
    let formRoute = "/form";
    if (prop.orgType === "LTR") formRoute = "/long-term-rental-form";
    if (prop.orgType === "RES") formRoute = "/residential-form";
    navigate(`${formRoute}/${encodeURIComponent(prop.name)}${assignmentQuery}`);
  }
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
          fetchProperties();
        }}
        regions={regions}
        selectedRegion={selectedRegion}
        setSelectedRegion={setSelectedRegion}
        onRegionFilter={handleRegionFilter}
        onAddProperty={() => {
          setSidebarCollapsed(false);
          setPropertyAdditionChoiceVisible(true);
          setAddPropertyGrant("");
          setPropertyActionMessage("");
        }}
        onRemoveProperty={() => {
          setSidebarCollapsed(false);
          setRemovePropertyModalVisible(true);
          setRemovePasskey("");
          setPropertyToRemove("");
        }}
        onLogout={handleLogout}
        canAccessBilling={canAccessBilling}
        notificationBadges={notificationBadges}
        accountScope={accountScope}
      />
      {/* STR user action dialog */}
      {showModal && (
        <InspectionLauncherDialog
          propertyName={selectedProperty}
          onAccessInfo={() => {
            const route = orgName === "AzRoots"
              ? "/azr-access-instructions/"
              : "/access-instructions/";
            navigate(`${route}${encodeURIComponent(selectedProperty)}`);
            setShowModal(false);
          }}
          onSubmitForm={() => {
            const assignmentQuery = selectedAssignmentId
              ? `?assignmentId=${encodeURIComponent(selectedAssignmentId)}`
              : "";
            navigate(`/short-term-rental-form/${encodeURIComponent(selectedProperty)}${assignmentQuery}`);
            setShowModal(false);
          }}
          onClose={() => {
            setShowModal(false);
            setSelectedAssignmentId("");
          }}
        />
      )}

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
          actions={(
            <>
              <WorkspaceSwitcher />
              <ContextualHelpLink label="Help Center" />
              <button type="button" className="beta-back-link" onClick={handleLogout}>Log out</button>
            </>
          )}
        />

        {!isManagement && (
          <AssignmentSection
            assignments={assignments}
            properties={properties}
            onOpenProperty={openProperty}
            onNavigate={openNativeMaps}
          />
        )}

        {loading ? (
          <p>Loading properties...</p>
        ) : error ? (
          <p className="error">{error}</p>
        ) : (
          <>
            <PropertySection
              properties={displayedProperties}
              completedProperties={completedProperties}
              isManagement={isManagement}
              role={role}
              orgName={orgName}
              orgType={adminOrgType}
              notificationBadges={notificationBadges}
              profitStatuses={profitStatuses}
              onOpenProperty={openProperty}
              onManageEmails={openPropertyEmailModal}
              onManageDetails={(property) =>
                navigate(`/property-form-settings/${encodeURIComponent(property.name)}`)
              }
              onAccessInfo={(property) => {
                const route = orgName === "AzRoots"
                  ? "/azr-access-instructions/"
                  : "/access-instructions/";
                navigate(`${route}${encodeURIComponent(property.name)}`);
              }}
              onRemove={(property) => {
                setPropertyToRemove(property.name);
                setRemovePropertyModalVisible(true);
              }}
              onNavigate={openNativeMaps}
            />
            {emailModalProperty && (
              <PropertyRecipientsDialog
                property={emailModalProperty}
                onSave={savePropertyEmails}
                onClose={() => setEmailModalProperty(null)}
              />
            )}
            {/* Remove Property Modal (one combined) */}
            {removePropertyModalVisible && (
              <RemovePropertyDialog
                properties={properties}
                propertyName={propertyToRemove}
                passkey={removePasskey}
                busy={false}
                onPropertyChange={setPropertyToRemove}
                onPasskeyChange={setRemovePasskey}
                onConfirm={handleRemoveProperty}
                onClose={() => {
                  setRemovePropertyModalVisible(false);
                  setRemovePasskey("");
                  setPropertyToRemove("");
                }}
              />
            )}

            <DashboardPagination
              canGoPrevious={canGoPrev}
              canGoNext={canGoNext}
              onPrevious={handlePrevPage}
              onNext={handleNextPage}
            />
          </>
        )}

        {propertyAdditionChoiceVisible && (
          <PropertyAdditionChoiceDialog
            onSingle={() => {
              setPropertyAdditionChoiceVisible(false);
              setPasskeyPromptVisible(true);
              setAddPropertyGrant("");
            }}
            onBulk={() => {
              setPropertyAdditionChoiceVisible(false);
              navigate("/admin/bulk-onboarding?type=properties");
            }}
            onClose={() => setPropertyAdditionChoiceVisible(false)}
          />
        )}

        {/* Passkey prompt for adding one property */}
        {passkeyPromptVisible && (
          <AdminVerificationDialog
            onVerify={verifyAddPropertyPasskey}
            onClose={closePasskeyPrompt}
          />
        )}

        {propertyActionMessage && (
          <p className="beta-alert success" role="status">{propertyActionMessage}</p>
        )}

        {/* Show Add Property Form if passkey verified */}
        {addPropertyFormVisible && (
          <AddPropertyForm
            orgType={adminOrgType}
            onCreate={handleCreateProperty}
            onClose={() => {
              setAddPropertyFormVisible(false);
              setAddPropertyGrant("");
            }}
          />
        )}
      </div>
    </div>
  );
}

export default Dashboard;
