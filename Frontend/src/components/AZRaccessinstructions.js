import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";

function AZRaccessinstructions() {
  const { propertyId } = useParams();
  const token = localStorage.getItem("token");

  // Example state for Access categories
  const [accessCategories, setAccessCategories] = useState([
    { name: "Garage Door", checked: false, quantity: 0, details: [], photoUrls: [] },
    { name: "Keyless", checked: false, quantity: 0, details: [], photoUrls: [] },
    { name: "Front Gate", checked: false, quantity: 0, details: [], photoUrls: [] },
    { name: "Admin", checked: false, quantity: 0, details: [], photoUrls: [] },
  ]);

  // This state will track the File objects for each subfield
  // Key format => "access-catIndex-subIndex" => array of File
  const [accessFiles, setAccessFiles] = useState({});

  useEffect(() => {
    // 1) Potentially fetch existing data from /api/azroots/properties/:propertyId
    //    then setAccessCategories(...) accordingly
  }, [propertyId]);

  /** Handlers **/
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

      // Ensure 'details' has correct length
      while (cat.details.length < qty) cat.details.push("");
      while (cat.details.length > qty) cat.details.pop();

      // Ensure 'photoUrls' has correct length if you track them in this array
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

  function handleAccessPhotoChange(catIndex, subIndex, files) {
    // Convert FileList to array
    const newFiles = Array.from(files);
    setAccessFiles((prev) => {
      const newObj = { ...prev };
      newObj[`access-${catIndex}-${subIndex}`] = newFiles;
      return newObj;
    });
  }

  async function handleSave() {
    try {
      const formData = new FormData();

      // Convert accessCategories to text data
      const accessTextData = accessCategories.map((cat) => ({
        name: cat.name,
        checked: cat.checked,
        quantity: cat.quantity,
        details: cat.details,
      }));
      formData.append("accessTextData", JSON.stringify(accessTextData));

      // Attach access files
      Object.keys(accessFiles).forEach((key) => {
        const fileArray = accessFiles[key]; // array of File
        // key looks like "access-0-1"
        const [prefix, catIndex, subIndex] = key.split("-");
        fileArray.forEach((file, fileIndex) => {
          // field name => "accessPhotos-catIndex-subIndex-fileIndex"
          formData.append(
            `accessPhotos-${catIndex}-${subIndex}-${fileIndex}`,
            file
          );
        });
      });

      // ... similarly for maintenance ...

      const response = await fetch(`/api/azroots/properties/${propertyId}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json();
        alert("Error saving property: " + (errData.error || "Unknown error"));
        return;
      }
      alert("Property updated successfully!");
    } catch (error) {
      console.error("❌ Error saving advanced data:", error);
      alert("Server error.");
    }
  }

  return (
    <div>
      <h2>AzRoots: Access Instructions Setup</h2>

      {accessCategories.map((cat, idx) => (
        <div key={idx} style={{ marginBottom: "1rem" }}>
          {/* Checkbox */}
          <label>
            <input
              type="checkbox"
              checked={cat.checked}
              onChange={(e) => handleAccessCheck(idx, e.target.checked)}
            />
            {cat.name}
          </label>

          {/* If checked, show the rest */}
          {cat.checked && (
            <>
              <span style={{ marginLeft: "1rem" }}>Quantity:</span>
              <input
                type="number"
                min={0}
                value={cat.quantity}
                onChange={(e) =>
                  handleAccessQuantityChange(idx, parseInt(e.target.value) || 0)
                }
                style={{ width: "60px", marginLeft: "0.5rem" }}
              />

              {/* For each quantity, show a row */}
              {Array.from({ length: cat.quantity }, (_, subIndex) => (
                <div
                  key={subIndex}
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "8px",
                    marginTop: "8px",
                    alignItems: "center",
                  }}
                >
                  {/* Access code input */}
                  <input
                    type="text"
                    placeholder={`Access code for ${cat.name} #${subIndex + 1}`}
                    value={cat.details[subIndex] || ""}
                    onChange={(e) =>
                      handleAccessDetailChange(idx, subIndex, e.target.value)
                    }
                    style={{ flex: "1 0 40%" }}
                  />

                  {/* Photo upload */}
                  <label style={{ flex: "0 0 auto" }}>Photos:</label>
                  <input
                    type="file"
                    multiple
                    onChange={(e) =>
                      handleAccessPhotoChange(idx, subIndex, e.target.files)
                    }
                    style={{ flex: "1 0 40%" }}
                  />
                </div>
              ))}
            </>
          )}
        </div>
      ))}

      {/* Maintenance or other sections below in a similar style... */}

      <button onClick={handleSave}>Save All</button>
    </div>
  );
}

export default AZRaccessinstructions;
