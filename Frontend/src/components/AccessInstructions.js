import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";

function AccessInstructions() {
  const { propertyName } = useParams();
  const navigate = useNavigate();
  const role = localStorage.getItem("role") || "user";
  const orgName = localStorage.getItem("orgName") || "";

  // The fields we want to display, whether admin or not
  const [instructions, setInstructions] = useState("");
  const [maintenanceInfo, setMaintenanceInfo] = useState("");
  const [generalInfo, setGeneralInfo] = useState("");

  // Admin‐only: local states for editing
  const [isEditing, setIsEditing] = useState(false);
  const [editedInstructions, setEditedInstructions] = useState("");
  const [editedMaintenance, setEditedMaintenance] = useState("");
  const [editedGeneral, setEditedGeneral] = useState("");

  // Admin‐only: Client assignment
  const [clientEmail, setClientEmail] = useState("");
  const [assignmentMessage, setAssignmentMessage] = useState("");

  // ─────────────────────────────────────────────────────────────
  // 1) Fetch property details
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch(
      `https://cp-check-submissions-dev-backend.onrender.com/api/access-instructions/${encodeURIComponent(propertyName)}`,
      {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      }
    )
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          console.error("Error fetching instructions:", data.error);
        } else {
          setInstructions(data.instructions || "");
          setMaintenanceInfo(data.maintenanceInfo || "");
          setGeneralInfo(data.generalInfo || "");
        }
      })
      .catch((err) => console.error("Server error fetching instructions:", err));
  }, [propertyName]);

  // ─────────────────────────────────────────────────────────────
  // 2) Admin toggles "Edit" mode
  // ─────────────────────────────────────────────────────────────
  const handleEditClick = () => {
    setEditedInstructions(instructions);
    setEditedMaintenance(maintenanceInfo);
    setEditedGeneral(generalInfo);
    setIsEditing(true);
  };

  // ─────────────────────────────────────────────────────────────
  // 3) Admin saves updates
  // ─────────────────────────────────────────────────────────────
  const handleSaveClick = () => {
    fetch(
      `https://cp-check-submissions-dev-backend.onrender.com/api/access-instructions/${encodeURIComponent(propertyName)}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({
          instructions: editedInstructions,
          maintenanceInfo: editedMaintenance,
          generalInfo: editedGeneral,
        }),
      }
    )
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          alert(data.error);
        } else {
          alert("Instructions updated successfully!");
          setInstructions(editedInstructions);
          setMaintenanceInfo(editedMaintenance);
          setGeneralInfo(editedGeneral);
          setIsEditing(false);
        }
      })
      .catch((err) => {
        console.error("Error saving instructions:", err);
        alert("Error saving instructions");
      });
  };

  // ─────────────────────────────────────────────────────────────
  // 4) Admin assigns client to property
  // ─────────────────────────────────────────────────────────────
  const handleAssignClient = () => {
    setAssignmentMessage(""); // reset any prior message

    fetch("https://cp-check-submissions-dev-backend.onrender.com/api/client/assign-client", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      body: JSON.stringify({ propertyName, clientEmail }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setAssignmentMessage(data.error);
        } else {
          setAssignmentMessage(`✅ Successfully assigned ${clientEmail} to ${propertyName}`);
          setClientEmail(""); // Clear input
        }
      })
      .catch((err) => {
        console.error("Error assigning client:", err);
        setAssignmentMessage("❌ Server error assigning client.");
      });
  };

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────
  return (
    <div className="access-instructions-container" style={{ padding: "1rem" }}>
      <h1 style={{ marginBottom: "1.5rem" }}>
        🔑 Access Instructions for {propertyName}
      </h1>

      {/* Admin-only: Assign client to property */}
      {role === "admin" && (
        <div style={{ marginBottom: "1rem" }}>
          <h3>Assign Property to Client</h3>
          <input
            type="email"
            value={clientEmail}
            onChange={(e) => setClientEmail(e.target.value)}
            placeholder="Enter client's email..."
            style={{ width: "100%", padding: "8px", marginBottom: "8px" }}
          />
          <button className="primary-button" onClick={handleAssignClient}>
            Assign Client
          </button>
          {assignmentMessage && (
            <p style={{ marginTop: "8px", color: "red" }}>{assignmentMessage}</p>
          )}
        </div>
      )}

      {role === "admin" && isEditing ? (
        <>
          {/* Edit mode */}
          <label style={{ fontWeight: "bold" }}>Access Instructions:</label>
          <textarea
            value={editedInstructions}
            onChange={(e) => setEditedInstructions(e.target.value)}
            style={{ width: "100%", minHeight: "80px", marginBottom: "1rem" }}
          />

          <label style={{ fontWeight: "bold" }}>Maintenance Info:</label>
          <textarea
            value={editedMaintenance}
            onChange={(e) => setEditedMaintenance(e.target.value)}
            style={{ width: "100%", minHeight: "80px", marginBottom: "1rem" }}
          />

          <label style={{ fontWeight: "bold" }}>General Information:</label>
          <textarea
            value={editedGeneral}
            onChange={(e) => setEditedGeneral(e.target.value)}
            style={{ width: "100%", minHeight: "80px", marginBottom: "1rem" }}
          />

          <button
            className="primary-button"
            onClick={handleSaveClick}
            style={{ marginRight: "10px" }}
          >
            Save
          </button>
          <button className="secondary-button" onClick={() => setIsEditing(false)}>
            Cancel
          </button>
        </>
      ) : (
        <>
          {/* Read-only mode */}
          <p>
            <strong>Lockbox / Instructions:</strong>{" "}
            {instructions || "No instructions yet."}
          </p>
          <p>
            <strong>Maintenance Info:</strong>{" "}
            {maintenanceInfo || "Not specified"}
          </p>
          <p>
            <strong>General Information:</strong>{" "}
            {generalInfo || "Not specified"}
          </p>

          {/* If admin, show "Edit" button + (AzRoots only) "Profit Statement Upload" */}
          {role === "admin" && (
            <>
              <button
                className="primary-button"
                onClick={handleEditClick}
                style={{ marginBottom: "1rem" }}
              >
                Edit Instructions
              </button>

              {/* Only show if orgName === "AzRoots" */}
              {orgName === "AzRoots" && (
                <button
                  className="primary-button"
                  onClick={() =>
                    navigate(`/profit-uploads/${encodeURIComponent(propertyName)}`)
                  }
                  style={{ marginBottom: "1rem" }}
                >
                  Profit Statement Upload
                </button>
              )}
            </>
          )}
        </>
      )}

      <button
        className="secondary-button"
        onClick={() => navigate("/dashboard")}
        style={{ marginTop: "1rem" }}
      >
        Back to Dashboard
      </button>
    </div>
  );
}

export default AccessInstructions;
