// AccessInstructions.js
import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";

function AccessInstructions() {
  const { propertyName } = useParams();
  const navigate = useNavigate();

  // Role from localStorage to decide if user can edit
  const role = localStorage.getItem("role") || "user";

  // State for instructions
  const [instructions, setInstructions] = useState("");
  // State to show/hide the "edit" interface (admin only)
  const [isEditing, setIsEditing] = useState(false);
  // For admin's local edits
  const [editedInstructions, setEditedInstructions] = useState("");

  useEffect(() => {
    // Fetch existing instructions from your backend API
    // e.g. GET /api/access-instructions/:propertyName
    fetch(
      `https://cp-check-submissions-dev-backend.onrender.com/api/access-instructions/${encodeURIComponent(
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
          // data.instructions should be the text from the DB
          setInstructions(data.instructions || "");
        }
      })
      .catch((err) => console.error("Server error fetching instructions:", err));
  }, [propertyName]);

  // Handler for admin to toggle edit mode
  const handleEditClick = () => {
    setEditedInstructions(instructions);
    setIsEditing(true);
  };

  // Handler for admin to save changes
  const handleSaveClick = () => {
    // PUT or PATCH to your backend
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
        body: JSON.stringify({ instructions: editedInstructions }),
      }
    )
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          alert(data.error);
        } else {
          alert("Instructions updated successfully!");
          setInstructions(editedInstructions);
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

      {/* If not editing, show instructions as plain text. 
          If editing, admin can type in a textarea */}
      {!isEditing ? (
        <p
          style={{
            fontSize: "1.1rem",
            marginBottom: "2rem",
            whiteSpace: "pre-wrap", // to preserve line breaks
          }}
        >
          {instructions || "No instructions provided yet."}
        </p>
      ) : (
        <textarea
          value={editedInstructions}
          onChange={(e) => setEditedInstructions(e.target.value)}
          style={{
            width: "100%",
            minHeight: "100px",
            marginBottom: "1rem",
            padding: "0.5rem",
          }}
        />
      )}

      {/* If user is admin, show edit button (or save/cancel).
          Otherwise, hide or disable. */}
      {role === "admin" ? (
        <>
          {!isEditing ? (
            <button
              className="primary-button"
              onClick={handleEditClick}
              style={{ marginBottom: "1rem" }}
            >
              Edit Instructions
            </button>
          ) : (
            <div style={{ marginBottom: "1rem" }}>
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
            </div>
          )}
        </>
      ) : (
        <p style={{ fontStyle: "italic", color: "#666", marginBottom: "1rem" }}>
          *You have view-only access*
        </p>
      )}

      <button
        className="secondary-button"
        onClick={() => navigate("/dashboard")} // or just navigate(-1)
      >
        Back to Dashboard
      </button>
    </div>
  );
}

export default AccessInstructions;
