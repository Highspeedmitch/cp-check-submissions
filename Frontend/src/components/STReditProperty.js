import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";

function STReditProperty() {
  const { propertyId } = useParams();
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const [propertyData, setPropertyData] = useState({
    name: "",
    accessInstructions: "",
    customFields: [],
  });
  const [newField, setNewField] = useState("");

  useEffect(() => {
    const fetchPropertyDetails = async () => {
      try {
        const response = await fetch(
          `https://cp-check-submissions-dev-backend.onrender.com/api/properties/${propertyId}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        const data = await response.json();
        if (response.ok) {
          setPropertyData({
            name: data.name || "",
            accessInstructions: data.accessInstructions || "",
            customFields: data.customFields || [],
          });
        }
      } catch (error) {
        console.error("Error fetching property details:", error);
      }
    };
    fetchPropertyDetails();
  }, [propertyId, token]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setPropertyData((prev) => ({ ...prev, [name]: value }));
  };

  const handleAddCustomField = () => {
    if (newField.trim()) {
      setPropertyData((prev) => ({
        ...prev,
        customFields: [...prev.customFields, newField.trim()],
      }));
      setNewField("");
    }
  };

  const handleSaveChanges = async () => {
    try {
      const response = await fetch(
        `https://cp-check-submissions-dev-backend.onrender.com/api/admin/edit-property/${propertyId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(propertyData),
        }
      );

      if (response.ok) {
        alert("Property updated successfully!");
        navigate("/dashboard");
      } else {
        alert("Failed to update property.");
      }
    } catch (error) {
      console.error("Error updating property:", error);
    }
  };

  return (
    <div className="container">
      <h1>Edit Property: {propertyData.name}</h1>
      <label>Access Instructions:</label>
      <textarea
        name="accessInstructions"
        value={propertyData.accessInstructions}
        onChange={handleInputChange}
        placeholder="Enter access instructions..."
      />
      
      <h2>Custom Form Fields</h2>
      <ul>
        {propertyData.customFields.map((field, index) => (
          <li key={index}>{field}</li>
        ))}
      </ul>
      <input
        type="text"
        value={newField}
        onChange={(e) => setNewField(e.target.value)}
        placeholder="Add new field"
      />
      <button onClick={handleAddCustomField}>Add Field</button>
      
      <button onClick={handleSaveChanges} className="save-button">
        Save Changes
      </button>
      <button onClick={() => navigate("/dashboard")} className="cancel-button">
        Cancel
      </button>
    </div>
  );
}

export default STReditProperty;
