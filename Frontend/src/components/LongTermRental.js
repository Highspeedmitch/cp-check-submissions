import React, { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

function LongTermRental() {
  const { property } = useParams();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    businessName: "",
    propertyAddress: "",
    toiletriesStocked: "",
    toiletriesStockedDescription: "",
    furnitureCorrect: "",
    furnitureCorrectDescription: "",
    checkoutProcedure: "",
    checkoutProcedureDescription: "",
    propertyDamage: "",
    propertyDamageDescription: "",
    additionalComments: "",
    photos: {}, // Stores photos per field
  });

  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState("");

  // Handle changes for standard text/textarea/select fields
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  /**
   * Handle multiple file uploads for a given field.
   * Stores an array of files in formData.photos[fieldName].
   */
  const handleFileChange = (e, fieldName) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setFormData((prev) => {
      const updatedPhotos = { ...prev.photos };

      if (!updatedPhotos[fieldName]) {
        updatedPhotos[fieldName] = [];
      }

      for (let i = 0; i < files.length; i++) {
        const originalFile = files[i];
        const newFile = new File([originalFile], `${fieldName}-${originalFile.name}`, {
          type: originalFile.type,
        });
        updatedPhotos[fieldName].push(newFile);
      }

      return {
        ...prev,
        photos: updatedPhotos,
      };
    });
  };

  /**
   * Submit form data and files to backend
   */
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem("token");
      const formDataToSend = new FormData();

      // Append all text fields
      Object.keys(formData).forEach((key) => {
        if (key !== "photos") {
          formDataToSend.append(key, formData[key]);
        }
      });

      // ✅ Ensure orgType is included
      formDataToSend.append("orgType", "LTR");
      formDataToSend.append("selectedProperty", property);

      // Append photos
      Object.keys(formData.photos).forEach((field) => {
        const files = formData.photos[field];
        if (Array.isArray(files)) {
          files.forEach((file) => {
            formDataToSend.append("photos", file);
          });
        }
      });

      const response = await fetch("https://cp-check-submissions-dev-backend.onrender.com/api/submit-form", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formDataToSend,
      });

      const data = await response.json();
      if (response.ok) {
        setMessage(data.message);
        setSubmitted(true);
      } else {
        alert("Error: " + data.message);
      }
    } catch (error) {
      console.error("Error submitting form:", error);
      alert("Error submitting form. Please try again.");
    }
  };

  // Renders uploaded file names
  const FileNameList = ({ fieldName }) => {
    const fileArray = formData.photos[fieldName] || [];
    return (
      <>
        {fileArray.map((file, idx) => (
          <div key={idx} style={{ marginTop: "4px", fontSize: "0.9em", color: "#999" }}>
            {file.name}
          </div>
        ))}
      </>
    );
  };

  return (
    <div className="container">
      <h1>{property} – Long-Term Rental Inspection Checklist</h1>

      {!submitted && (
        <div className="return-to-dash">
          <button onClick={() => navigate("/dashboard")}>Return To Dashboard</button>
        </div>
      )}

      {submitted ? (
        <div>
          <h2>{message}</h2>
          <button onClick={() => navigate("/dashboard")}>Return To Dashboard</button>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <input type="hidden" name="selectedProperty" value={property} />

          <label>Property Name:</label>
          <input type="text" name="businessName" onChange={handleChange} required />

          <label>Property Address:</label>
          <input type="text" name="propertyAddress" onChange={handleChange} required />

          <h2>Inspection Items</h2>
          <div className="inspection-items">
            {/* Toiletries Need Re-stocked */}
            <div>
              <label>Toiletries need re-stocked?</label>
              <select name="toiletriesStocked" onChange={handleChange}>
                <option value="">Select...</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
              {formData.toiletriesStocked === "yes" && (
                <>
                  <textarea name="toiletriesStockedDescription" onChange={handleChange} placeholder="Describe the issue" />
                  <input type="file" accept="image/*" capture="camera" multiple onChange={(e) => handleFileChange(e, "toiletriesStocked")} />
                  <FileNameList fieldName="toiletriesStocked" />
                </>
              )}
            </div>

            {/* Furniture Correct */}
            <div>
              <label>Furniture is in correct place?</label>
              <select name="furnitureCorrect" onChange={handleChange}>
                <option value="">Select...</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
              {formData.furnitureCorrect === "yes" && (
                <>
                  <textarea name="furnitureCorrectDescription" onChange={handleChange} placeholder="Describe the issue" />
                  <input type="file" accept="image/*" capture="camera" multiple onChange={(e) => handleFileChange(e, "furnitureCorrect")} />
                  <FileNameList fieldName="furnitureCorrect" />
                </>
              )}
            </div>

            {/* Guest Checkout Procedure */}
            <div>
              <label>Guest checkout procedure followed?</label>
              <select name="checkoutProcedure" onChange={handleChange}>
                <option value="">Select...</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
              {formData.checkoutProcedure === "no" && (
                <>
                  <textarea name="checkoutProcedureDescription" onChange={handleChange} placeholder="Describe the issue" />
                  <input type="file" accept="image/*" capture="camera" multiple onChange={(e) => handleFileChange(e, "checkoutProcedure")} />
                  <FileNameList fieldName="checkoutProcedure" />
                </>
              )}
            </div>

            {/* Any Damage to Property */}
            <div>
              <label>Any damage to property?</label>
              <select name="propertyDamage" onChange={handleChange}>
                <option value="">Select...</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
              {formData.propertyDamage === "yes" && (
                <>
                  <textarea name="propertyDamageDescription" onChange={handleChange} placeholder="Describe the issue" />
                  <input type="file" accept="image/*" capture="camera" multiple onChange={(e) => handleFileChange(e, "propertyDamage")} />
                  <FileNameList fieldName="propertyDamage" />
                </>
              )}
            </div>
          </div>

          {/* Other Text Areas */}
          <label>Additional Comments:</label>
          <textarea name="additionalComments" onChange={handleChange} />

          <button type="submit" className="submit button">
            Submit Checklist
          </button>
        </form>
      )}
    </div>
  );
}

export default LongTermRental;
