// AccessInstructions.js
import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";

function AccessInstructions() {
  const { propertyName } = useParams();
  const navigate = useNavigate();

  // Role from localStorage to decide if user can edit
  const role = localStorage.getItem("role") || "user";

  // State for instructions and new fields
  const [instructions, setInstructions] = useState("");
  const [maintenanceInterval, setMaintenanceInterval] = useState("");
  const [generalInfo, setGeneralInfo] = useState("");

  // State to show/hide the edit interface (admin only)
  const [isEditing, setIsEditing] = useState(false);
  // For admin's local edits
  const [editedInstructions, setEditedInstructions] = useState("");
  const [editedMaintenance, setEditedMaintenance] = useState("");
  const [editedGeneral, setEditedGeneral] = useState("");

  useEffect(() => {
    // Fetch existing instructions and extra info from your backend API
    // e.g. GET /api/access-instructions/:propertyName
    fetch(
      `https://cp-check-submissions-dev-onrender.com/api/access-instructions/${encodeURIComponent(
        propertyName
      )}`,
      {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      }
    )
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          console.error("Error fetching instructions:", data.error);
        } else {
          // Expect data.instructions, data.maintenanceInterval, and data.generalInfo from the backend
          setInstructions(data.instructions || "");
          setMaintenanceInterval(data.maintenanceInterval || "");
          setGeneralInfo(data.generalInfo || "");
        }
      })
      .catch((err) => console.error("Server error fetching instructions:", err));
  }, [propertyName]);

  // Handler for admin to toggle edit mode
  const handleEditClick = () => {
    setEditedInstructions(instructions);
    setEditedMaintenance(maintenanceInterval);
    setEditedGeneral(generalInfo);
    setIsEditing(true);
  };

  // Handler for admin to save changes
  const handleSaveClick = () => {
    // PUT or PATCH to your backend including the extra fields
    fetch(
      `https://cp-check-submissions-dev-onrender.com/api/access-instructions/${encodeURIComponent(
        propertyName
      )}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({
          instructions: editedInstructions,
          maintenanceInterval: editedMaintenance,
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
          setMaintenanceInterval(editedMaintenance);
          setGeneralInfo(editedGeneral);
          setIsEditing(false);
        }
      })
      .catch((err) => {
        console.error("Error saving instructions:", err);
        alert("Error saving instructions");
      });
  };

  return (
    <div className="access-instructions-container" style={{ padding: "1rem" }}>
      <h1 style={{ marginBottom: "1.5rem" }}>
        🔑 Access Instructions for {propertyName}
      </h1>

      {role === "admin" ? (
        <>
          {isEditing ? (
            <>
              <textarea
                value={editedInstructions}
                onChange={(e) => setEditedInstructions(e.target.value)}
                placeholder="Edit access instructions..."
                style={{ width: "100%", minHeight: "100px", marginBottom: "1rem" }}
              />
              <input
                type="text"
                value={editedMaintenance}
                onChange={(e) => setEditedMaintenance(e.target.value)}
                placeholder="Maintenance Interval (e.g., every 6 months)"
                style={{ width: "100%", marginBottom: "1rem" }}
              />
              <textarea
                value={editedGeneral}
                onChange={(e) => setEditedGeneral(e.target.value)}
                placeholder="General Information (e.g., breaker box location, notes)"
                style={{ width: "100%", minHeight: "80px", marginBottom: "1rem" }}
              />
              <button
                className="primary-button"
                onClick={handleSaveClick}
                style={{ marginRight: "10px" }}
              >
                Save
              </button>
              <button
                className="secondary-button"
                onClick={() => setIsEditing(false)}
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <p
                style={{
                  fontSize: "1.1rem",
                  marginBottom: "2rem",
                  whiteSpace: "pre-wrap",
                }}
              >
                {instructions || "No instructions provided yet."}
              </p>
              <h3>Maintenance Interval</h3>
              <p>{maintenanceInterval || "Not specified"}</p>
              <h3>General Information</h3>
              <p>{generalInfo || "Not specified"}</p>
              <button
                className="primary-button"
                onClick={handleEditClick}
                style={{ marginBottom: "1rem" }}
              >
                Edit Instructions
              </button>
            </>
          )}
        </>
      ) : (
        // For non-admin users, show view-only access instructions.
        <p
          style={{
            fontSize: "1.1rem",
            marginBottom: "2rem",
            whiteSpace: "pre-wrap",
          }}
        >
          {instructions || "No instructions provided yet."}
        </p>
      )}

      <button
        className="secondary-button"
        onClick={() => navigate("/dashboard")}
      >
        Back to Dashboard
      </button>
    </div>
  );
}

export default AccessInstructions;
