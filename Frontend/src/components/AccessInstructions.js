import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";

function AccessInstructions() {
  const { propertyName } = useParams();
  const navigate = useNavigate();

  // Role from localStorage to decide if user can edit
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

  useEffect(() => {
    // 1) Fetch from your backend GET /api/access-instructions/:propertyName
    //    which returns { instructions, maintenanceInfo, generalInfo }
    fetch(
      `https://cp-check-submissions-dev-backend.onrender.com/api/access-instructions/${encodeURIComponent(
        propertyName
      )}`,
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

  // 2) For admin: let them switch to “edit” mode
  const handleEditClick = () => {
    setEditedInstructions(instructions);
    setEditedMaintenance(maintenanceInfo);
    setEditedGeneral(generalInfo);
    setIsEditing(true);
  };

  // 3) For admin: Save updates
  const handleSaveClick = () => {
    fetch(
      `https://cp-check-submissions-dev-backend.onrender.com/api/access-instructions/${encodeURIComponent(
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

  return (
    <div className="access-instructions-container" style={{ padding: "1rem" }}>
      <h1 style={{ marginBottom: "1.5rem" }}>
        🔑 Access Instructions for {propertyName}
      </h1>

      {/** If admin is editing, show textareas for all fields */}
      {role === "admin" && isEditing ? (
        <>
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
          <button
            className="secondary-button"
            onClick={() => setIsEditing(false)}
          >
            Cancel
          </button>
        </>
      ) : (
        <>
          {/** Otherwise, show them read‐only. Everyone sees these. */}
          <p
            style={{
              fontSize: "1.1rem",
              marginBottom: "1rem",
              whiteSpace: "pre-wrap",
            }}
          >
            <strong>Lockbox / Instructions:</strong>{" "}
            {instructions || "No instructions yet."}
          </p>

          <p
            style={{
              fontSize: "1.1rem",
              marginBottom: "1rem",
              whiteSpace: "pre-wrap",
            }}
          >
            <strong>Maintenance Info:</strong>{" "}
            {maintenanceInfo || "Not specified"}
          </p>

          <p
            style={{
              fontSize: "1.1rem",
              marginBottom: "2rem",
              whiteSpace: "pre-wrap",
            }}
          >
            <strong>General Information:</strong>{" "}
            {generalInfo || "Not specified"}
          </p>

          {/** Admin sees an Edit button if not in editing mode */}
          {role === "admin" && (
            <button
              className="primary-button"
              onClick={handleEditClick}
              style={{ marginBottom: "1rem" }}
            >
              Edit Instructions
            </button>
          )}
        </>
      )}
      {/* Conditionally render the Profit Statements button for AzRoots Admins */}
      {role === "admin" && orgName === "AzRoots" && (
              <button
                className="primary-button"
                onClick={() => navigate(`/profit-upload/${encodeURIComponent(propertyName)}`)}
                style={{ marginTop: "1rem" }}
              >
                Profit Statements
              </button>)}
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
