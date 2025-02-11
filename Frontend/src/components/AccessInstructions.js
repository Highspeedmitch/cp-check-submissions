// AccessInstructions.js
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

function AccessInstructions() {
  const { propertyName } = useParams();
  const navigate = useNavigate();
  const [instructions, setInstructions] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const token = localStorage.getItem("token");

  useEffect(() => {
    // Fetch the access instructions for this property.
    // Adjust the URL if needed to match your backend endpoint.
    fetch(`https://cp-check-submissions-dev-backend.onrender.com/api/properties/${encodeURIComponent(propertyName)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => res.json())
      .then(data => {
        // Assuming the property data has an 'accessInstructions' field.
        setInstructions(data.accessInstructions || "No instructions provided.");
      })
      .catch(err => console.error("Error fetching instructions:", err));
  }, [propertyName, token]);

  function handleSave() {
    // Save the updated instructions. Adjust the URL as needed.
    fetch(`https://cp-check-submissions-dev-backend.onrender.com/api/admin/edit-property/${encodeURIComponent(propertyName)}`, {
      method: "PUT",
      headers: { 
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ accessInstructions: instructions }),
    })
      .then(res => res.json())
      .then(data => {
        setIsEditing(false);
        alert("Instructions updated successfully!");
      })
      .catch(err => console.error("Error updating instructions:", err));
  }

  return (
    <div style={{ padding: "20px" }}>
      <h1>Access Instructions for {decodeURIComponent(propertyName)}</h1>
      {isEditing ? (
        <>
          <textarea 
            value={instructions} 
            onChange={(e) => setInstructions(e.target.value)}
            style={{ width: "100%", height: "150px" }}
          />
          <button onClick={handleSave}>Save</button>
          <button onClick={() => setIsEditing(false)}>Cancel</button>
        </>
      ) : (
        <>
          <p>{instructions}</p>
          <button onClick={() => setIsEditing(true)}>Edit Instructions</button>
        </>
      )}
      <button onClick={() => navigate("/dashboard")}>Back to Dashboard</button>
    </div>
  );
}

export default AccessInstructions;
