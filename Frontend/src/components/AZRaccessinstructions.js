import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";

function AZRaccessinstructions() {
  const navigate = useNavigate();
  const { propertyName } = useParams(); // property name from the route param
  const token = localStorage.getItem("token");

  // Whether we are in "edit" mode or "view" mode
  const [editMode, setEditMode] = useState(false);

  // Access categories loaded from DB
  const [accessCategories, setAccessCategories] = useState([]);

  // Store File objects separately
  // Key = "access-catIndex-subIndex" => array of File
  const [accessFiles, setAccessFiles] = useState({});

  // On mount, fetch existing property data by name
  useEffect(() => {
    async function fetchProperty() {
      try {
        const response = await fetch(
          `/api/azroots/properties/${encodeURIComponent(propertyName)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await response.json();
        if (data.error) {
          alert(data.error);
          return;
        }
        // Set the categories from the DB
        setAccessCategories(data.accessCategories || []);
      } catch (err) {
        console.error("❌ Error fetching property:", err);
      }
    }
    fetchProperty();
  }, [propertyName, token]);

  /** -----------------------------------
   * Read-Only View (if editMode = false)
   * ------------------------------------
   */
  if (!editMode) {
    return (
      <div style={{ padding: "1rem" }}>
        <h2 style={{ marginBottom: "1rem" }}>
          Access Instructions for {propertyName}
        </h2>

        {/* Example: Show a summary of accessCategories */}
        <h3>Access Categories</h3>
        {accessCategories.length === 0 ? (
          <p>No categories selected.</p>
        ) : (
          accessCategories.map((cat, idx) =>
            cat.checked ? (
              <div
                key={idx}
                style={{
                  margin: "0.5rem 0",
                  padding: "0.5rem",
                  border: "1px solid #ccc",
                  borderRadius: "4px",
                }}
              >
                <strong>{cat.name}</strong> <br />
                <em>Quantity:</em> {cat.quantity}
                {cat.details?.map((detail, dIndex) => (
                  <div key={dIndex} style={{ marginLeft: "1.5rem" }}>
                    {cat.name} #{dIndex + 1}: {detail}
                  </div>
                ))}
                {/* If you want to show existing photo URLs, you'd iterate cat.photoUrls here */}
              </div>
            ) : null
          )
        )}

        <div style={{ marginTop: "1rem" }}>
          <button
            onClick={() => setEditMode(true)}
            style={{ marginRight: "1rem" }}
          >
            Edit Instructions
          </button>
          <button onClick={() => navigate("/dashboard")}>Back to Dashboard</button>
        </div>
      </div>
    );
  }

  /** -----------------------------------
   * Edit Mode (Dynamic Form UI)
   * ------------------------------------
   */

  // Handlers for Access Categories
  function handleAccessCheck(catIndex, isChecked) {
    setAccessCategories((prev) => {
      const newArr = [...prev];
      newArr[catIndex].checked = isChecked;
      if (!isChecked) {
        newArr[catIndex].quantity = 0;
        newArr[catIndex].details = [];
        newArr[catIndex].photoUrls = [];
      }
      return newArr;
    });
  }

  function handleAccessQuantityChange(catIndex, qty) {
    setAccessCategories((prev) => {
      const newArr = [...prev];
      const cat = newArr[catIndex];
      cat.quantity = qty;

      // ensure details length matches qty
      while (cat.details.length < qty) cat.details.push("");
      while (cat.details.length > qty) cat.details.pop();

      // ensure photoUrls length matches qty
      while (cat.photoUrls.length < qty) cat.photoUrls.push([]);
      while (cat.photoUrls.length > qty) cat.photoUrls.pop();

      return newArr;
    });
  }

  function handleAccessDetailChange(catIndex, subIndex, value) {
    setAccessCategories((prev) => {
      const newArr = [...prev];
      newArr[catIndex].details[subIndex] = value;
      return newArr;
    });
  }

  function handleAccessPhotoChange(catIndex, subIndex, fileList) {
    const newFiles = Array.from(fileList);
    setAccessFiles((prev) => {
      const newObj = { ...prev };
      newObj[`access-${catIndex}-${subIndex}`] = newFiles;
      return newObj;
    });
  }

  // The Save function
  async function handleSave() {
    try {
      const formData = new FormData();

      // Convert the categories to JSON
      const accessTextData = accessCategories.map((cat) => ({
        name: cat.name,
        checked: cat.checked,
        quantity: cat.quantity,
        details: cat.details,
        // photoUrls we leave out, we let the server fill that after uploading
      }));
      formData.append("accessTextData", JSON.stringify(accessTextData));

      // Attach the files
      Object.keys(accessFiles).forEach((key) => {
        const fileArray = accessFiles[key]; // array of File
        const [prefix, catIndex, subIndex] = key.split("-");
        fileArray.forEach((file, fileIndex) => {
          // e.g. "accessPhotos-catIndex-subIndex-fileIndex"
          formData.append(
            `${prefix}Photos-${catIndex}-${subIndex}-${fileIndex}`,
            file
          );
        });
      });

      const response = await fetch(
        `/api/azroots/properties/${encodeURIComponent(propertyName)}`,
        {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        }
      );
      if (!response.ok) {
        const errData = await response.json();
        alert("Error saving property: " + (errData.error || "Unknown error"));
        return;
      }
      alert("Property updated successfully!");
      setEditMode(false);
    } catch (error) {
      console.error("❌ Error saving advanced data:", error);
      alert("Server error.");
    }
  }

  return (
    <div style={{ padding: "1rem" }}>
      <h2>Editing Access Instructions for {propertyName}</h2>
      <button onClick={() => setEditMode(false)} style={{ marginRight: "1rem" }}>
        Cancel Edit
      </button>
      <button onClick={() => navigate("/dashboard")}>Back to Dashboard</button>

      <hr style={{ margin: "1rem 0" }} />

      <h3>Access Categories</h3>
      {accessCategories.map((cat, idx) => (
        <div key={idx} style={{ marginBottom: "1rem", border: "1px solid #ccc", padding: "0.5rem" }}>
          <label>
            <input
              type="checkbox"
              checked={cat.checked}
              onChange={(e) => handleAccessCheck(idx, e.target.checked)}
            />
            {cat.name}
          </label>

          {cat.checked && (
            <div style={{ marginLeft: "1rem", marginTop: "0.5rem" }}>
              <label>Quantity: </label>
              <input
                type="number"
                min={0}
                value={cat.quantity}
                onChange={(e) =>
                  handleAccessQuantityChange(idx, parseInt(e.target.value) || 0)
                }
                style={{ width: "60px" }}
              />

              {Array.from({ length: cat.quantity }, (_, subIndex) => (
                <div
                  key={subIndex}
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "8px",
                    marginTop: "8px",
                    alignItems: "center",
                    border: "1px solid #ddd",
                    padding: "0.5rem",
                    borderRadius: "4px",
                  }}
                >
                  <input
                    type="text"
                    placeholder={`Access code #${subIndex + 1}`}
                    value={cat.details[subIndex] || ""}
                    onChange={(e) =>
                      handleAccessDetailChange(idx, subIndex, e.target.value)
                    }
                    style={{ flex: "1 0 45%" }}
                  />
                  <div style={{ flex: "1 0 45%" }}>
                    <label>Photos:</label>
                    <input
                      type="file"
                      multiple
                      onChange={(e) =>
                        handleAccessPhotoChange(idx, subIndex, e.target.files)
                      }
                      style={{ display: "block", marginTop: "4px" }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* If you have maintenance logic, replicate a similar pattern here... */}

      <button onClick={handleSave} style={{ marginRight: "1rem" }}>
        Save Changes
      </button>
      <button onClick={() => navigate("/dashboard")}>Back to Dashboard</button>
    </div>
  );
}

export default AZRaccessinstructions;
