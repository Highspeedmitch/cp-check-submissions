import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";

function STReditProperty() {
  const { propertyName } = useParams();
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  // Extend the propertyData state to include the new fields.
  const [propertyData, setPropertyData] = useState({
    name: "",
    accessInstructions: "",
    customFields: [],
    maintenanceInterval: "", // new field
    generalInfo: "",         // new field
  });

  // Existing custom field handling...
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState("text"); // Default type
  const [regionOption, setRegionOption] = useState("existing"); // "existing" or "new"
  const [newRegion, setNewRegion] = useState("");
  const [existingRegions, setExistingRegions] = useState([]);
  useEffect(() => {
    const fetchRegions = async () => {
      try {
        const res = await axios.get(
          "https://cp-check-submissions-dev-backend.onrender.com/api/properties/regions",
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setExistingRegions(res.data);
      } catch (err) {
        console.error("Error fetching regions:", err);
      }
    };
    fetchRegions();
  }, [token]);

  useEffect(() => {
    if (!propertyName) {
      console.warn("⚠️ propertyName is undefined, skipping fetch...");
      return;
    }
    const fetchPropertyDetails = async () => {
      try {
        const response = await fetch(
          `https://cp-check-submissions-dev-backend.onrender.com/api/properties/${encodeURIComponent(propertyName)}`,
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
            maintenanceInterval: data.maintenanceInterval || "", // load if exists
            generalInfo: data.generalInfo || "",                 // load if exists
          });
        } else {
          console.error("Failed to fetch property details", data);
        }
      } catch (error) {
        console.error("Error fetching property details:", error);
      }
    };

    fetchPropertyDetails();
  }, [propertyName, token]);

  // Handler for adding a new custom field (existing code)
  const handleAddCustomField = () => {
    if (newFieldName.trim()) {
      setPropertyData((prev) => ({
        ...prev,
        customFields: [...prev.customFields, { name: newFieldName.trim(), type: newFieldType }],
      }));
      setNewFieldName("");
      setNewFieldType("text");
    }
  };

  // Handler for saving changes – include the new fields in the payload
  const handleSaveChanges = async () => {
  const regionToSend = regionOption === "new" ? newRegion : selectedExistingRegion;
  try {
    const response = await fetch(
      `https://cp-check-submissions-dev-backend.onrender.com/api/admin/edit-property/${encodeURIComponent(propertyName)}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          accessInstructions: propertyData.accessInstructions,
          customFields: propertyData.customFields,
          maintenanceInterval: propertyData.maintenanceInterval,
          generalInfo: propertyData.generalInfo,
          region: regionToSend, // include region here
        }),
      }
    );;

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
      
      {/* Access Instructions */}
      <label>Access Instructions:</label>
      <textarea
        value={propertyData.accessInstructions}
        onChange={(e) =>
          setPropertyData((prev) => ({
            ...prev,
            accessInstructions: e.target.value,
          }))
        }
        placeholder="Enter access instructions..."
      />

      {/* NEW: Maintenance Interval */}
      <label>Maintenance Interval:</label>
      <input
        type="text"
        value={propertyData.maintenanceInterval}
        onChange={(e) =>
          setPropertyData((prev) => ({
            ...prev,
            maintenanceInterval: e.target.value,
          }))
        }
        placeholder="e.g., every 6 months, filter size 16x16"
      />

      {/* NEW: General Information */}
      <label>General Information:</label>
      <textarea
        value={propertyData.generalInfo}
        onChange={(e) =>
          setPropertyData((prev) => ({
            ...prev,
            generalInfo: e.target.value,
          }))
        }
        placeholder="e.g., location of breaker box, additional notes..."
      />

      {/* Existing custom fields section remains unchanged */}
      <h2>Add New Custom Field</h2>
      <input
        type="text"
        value={newFieldName}
        onChange={(e) => setNewFieldName(e.target.value)}
        placeholder="Enter field name"
      />
      <select value={newFieldType} onChange={(e) => setNewFieldType(e.target.value)}>
        <option value="text">Text Input</option>
        <option value="yesno">Yes/No with Picture</option>
      </select>
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