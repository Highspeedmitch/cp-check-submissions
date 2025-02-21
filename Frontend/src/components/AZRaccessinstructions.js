import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";

const DEFAULT_ACCESS_CATEGORIES = [
  { name: "Garage Door", checked: false, quantity: 0, details: [], photoUrls: [] },
  { name: "Keyless", checked: false, quantity: 0, details: [], photoUrls: [] },
  { name: "Front Gate", checked: false, quantity: 0, details: [], photoUrls: [] },
  { name: "Admin", checked: false, quantity: 0, details: [], photoUrls: [] },
];

function AZRaccessinstructions() {
  const navigate = useNavigate();
  const { propertyName } = useParams();
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role") || "user";
  const isAdmin = (role === "admin");

  // Whether we are in "edit" mode or "view" mode
  const [editMode, setEditMode] = useState(false);

  // Access categories from DB or defaults
  const [accessCategories, setAccessCategories] = useState([]);
  const [accessFiles, setAccessFiles] = useState({});

  // On mount, fetch data
  useEffect(() => {
    async function fetchProperty() {
      try {
        const encodedName = encodeURIComponent(propertyName);
        const response = await fetch(
          `https://cp-check-submissions-dev-backend.onrender.com/api/azroots/properties/${encodedName}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          const text = await response.text();
          console.error("❌ Unexpected response, not JSON:", text);
          return;
        }

        const data = await response.json();
        console.log("✅ Property data received:", data);

        if (!data.accessCategories || data.accessCategories.length === 0) {
          setAccessCategories(DEFAULT_ACCESS_CATEGORIES);
        } else {
          setAccessCategories(data.accessCategories);
        }
      } catch (err) {
        console.error("❌ Error fetching property:", err);
      }
    }
    fetchProperty();
  }, [propertyName, token]);

  /**
   * ─────────────────────────────────────
   * READ‐ONLY MODE (Or Non‐Admin)
   * ─────────────────────────────────────
   */
  if (!editMode || !isAdmin) {
    return (
      <div style={styles.container}>
        <h2 style={styles.header}>🔑 Access Instructions for {propertyName}</h2>

        <h3 style={styles.subHeader}>Access Categories</h3>
        {accessCategories.filter(cat => cat.checked).length === 0 ? (
          <p style={styles.paragraph}>No categories selected.</p>
        ) : (
          accessCategories
            .filter(cat => cat.checked)
            .map((cat, idx) => (
              <div key={idx} style={styles.categoryBox}>
                <strong>{cat.name}</strong>
                <p style={styles.subInfo}>
                  <em>Quantity:</em> {cat.quantity}
                </p>
                {cat.details?.map((detail, dIndex) => (
                  <p key={dIndex} style={{ marginLeft: "1rem" }}>
                    {cat.name} #{dIndex + 1}: {detail}
                  </p>
                ))}
              </div>
            ))
        )}

        <div style={{ marginTop: "1rem" }}>
          {/* If admin => show “Edit” and “Profit Statements” buttons */}
          {isAdmin && (
            <>
              <button style={styles.button} onClick={() => setEditMode(true)}>
                Edit Instructions
              </button>
              {/* Profit Statement Uploads */}
              <button
                style={styles.button}
                onClick={() =>
                  navigate(`/profit-uploads/${encodeURIComponent(propertyName)}`)
                }
              >
                Profit Statements
              </button>
            </>
          )}

          <button style={styles.button} onClick={() => navigate("/dashboard")}>
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  /**
   * ─────────────────────────────────────
   * EDIT MODE (Admin Only)
   * ─────────────────────────────────────
   */
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

      while (cat.details.length < qty) cat.details.push("");
      while (cat.details.length > qty) cat.details.pop();
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

  async function handleSave() {
    try {
      const formData = new FormData();
      const accessTextData = accessCategories.map((cat) => ({
        name: cat.name,
        checked: cat.checked,
        quantity: cat.quantity,
        details: cat.details,
      }));
      formData.append("accessTextData", JSON.stringify(accessTextData));

      Object.keys(accessFiles).forEach((key) => {
        const fileArray = accessFiles[key];
        const [prefix, catIndex, subIndex] = key.split("-");
        fileArray.forEach((file, fileIndex) => {
          formData.append(`${prefix}Photos-${catIndex}-${subIndex}-${fileIndex}`, file);
        });
      });

      const encodedName = encodeURIComponent(propertyName);
      const response = await fetch(
        `https://cp-check-submissions-dev-backend.onrender.com/api/azroots/properties/${encodedName}`,
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
    } catch (err) {
      console.error("❌ Error saving advanced data:", err);
      alert("Server error.");
    }
  }

  // Admin-Only Edit UI
  return (
    <div style={styles.container}>
      <h2 style={styles.header}>Editing Access Instructions for {propertyName}</h2>
      <div style={styles.buttonRow}>
        <button style={styles.button} onClick={() => setEditMode(false)}>
          Cancel Edit
        </button>
        <button style={styles.button} onClick={() => navigate("/dashboard")}>
          Back to Dashboard
        </button>
      </div>
      <hr />

      <h3 style={styles.subHeader}>Access Categories</h3>
      {accessCategories.map((cat, idx) => (
        <div key={idx} style={styles.editCategoryBox}>
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
                <div key={subIndex} style={styles.subItemRow}>
                  <input
                    type="text"
                    placeholder={`Access code #${subIndex + 1}`}
                    value={cat.details[subIndex] || ""}
                    onChange={(e) =>
                      handleAccessDetailChange(idx, subIndex, e.target.value)
                    }
                    style={styles.subItemInput}
                  />
                  <div style={styles.subItemFileBlock}>
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

      <div style={{ marginTop: "1rem" }}>
        <button style={styles.button} onClick={handleSave}>
          Save Changes
        </button>
        <button style={styles.button} onClick={() => navigate("/dashboard")}>
          Back to Dashboard
        </button>
      </div>
    </div>
  );
}

// basic styles
const styles = {
  container: {
    maxWidth: "600px",
    margin: "0 auto",
    padding: "1rem",
  },
  header: {
    marginBottom: "1rem",
    fontSize: "1.3rem",
  },
  subHeader: {
    marginTop: "1rem",
    marginBottom: "0.5rem",
    fontWeight: "bold",
  },
  paragraph: {
    margin: "0.5rem 0",
  },
  buttonRow: {
    display: "flex",
    gap: "0.5rem",
    marginBottom: "1rem",
  },
  button: {
    backgroundColor: "#007bff",
    color: "#fff",
    border: "none",
    padding: "0.5rem 1rem",
    borderRadius: "4px",
    cursor: "pointer",
    marginRight: "0.5rem",
  },
  categoryBox: {
    margin: "0.5rem 0",
    padding: "0.5rem",
    border: "1px solid #ccc",
    borderRadius: "4px",
  },
  editCategoryBox: {
    marginBottom: "1rem",
    padding: "0.5rem",
    border: "1px solid #ccc",
    borderRadius: "4px",
  },
  subInfo: {
    marginLeft: "1rem",
  },
  subItemRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    marginTop: "8px",
    alignItems: "center",
    border: "1px solid #ddd",
    padding: "0.5rem",
    borderRadius: "4px",
  },
  subItemInput: {
    flex: "1 0 45%",
  },
  subItemFileBlock: {
    flex: "1 0 45%",
  },
};

export default AZRaccessinstructions;
