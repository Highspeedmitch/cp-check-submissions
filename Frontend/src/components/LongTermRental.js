// LongTermRental.js
import React, { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

function LongTermRental() {
  const { property } = useParams();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    businessName: "",
    propertyAddress: "",
    toiletriesStocked: "",
    furnitureCorrect: "",
    checkoutProcedureFollowed: "",
    propertyDamage: "",
    additionalComments: "",
    photos: {}, // Each fieldName will store an array of Files
  });

  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState("");

  // Handle changes for standard text/textarea/select fields
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Handle multiple file uploads for a given field
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

  // Submit the form with text fields + photos in FormData
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem("token");
      const formDataToSend = new FormData();

      // Append text fields
      Object.keys(formData).forEach((key) => {
        if (key !== "photos") {
          formDataToSend.append(key, formData[key]);
        }
      });

      // Append selected property
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

      const response = await fetch(
        "https://cp-check-submissions-dev-backend.onrender.com/api/submit-form",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formDataToSend,
        }
      );

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

  // Renders just the file names for each field
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

          <h2>Additional Property Condition Checks</h2>
          <div className="additional-checks">
            {/* Toiletries Restocked */}
            <div>
              <label>
                Toiletries need re-stocked?:
                <select name="toiletriesStocked" onChange={handleChange}>
                  <option value="">Select...</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>
              {formData.toiletriesStocked === "yes" && (
                <>
                  <input
                    type="file"
                    accept="image/*"
                    capture="camera"
                    multiple
                    onChange={(e) => handleFileChange(e, "toiletriesStocked")}
                  />
                  <FileNameList fieldName="toiletriesStocked" />
                </>
              )}
            </div>

            {/* Furniture Placement */}
            <div>
              <label>
                Furniture is in the correct place?:
                <select name="furnitureCorrect" onChange={handleChange}>
                  <option value="">Select...</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>
              {formData.furnitureCorrect === "no" && (
                <>
                  <input
                    type="file"
                    accept="image/*"
                    capture="camera"
                    multiple
                    onChange={(e) => handleFileChange(e, "furnitureCorrect")}
                  />
                  <FileNameList fieldName="furnitureCorrect" />
                </>
              )}
            </div>

            {/* Guest Checkout Procedure */}
            <div>
              <label>
                Guest checkout procedure followed?:
                <select name="checkoutProcedureFollowed" onChange={handleChange}>
                  <option value="">Select...</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>
              {formData.checkoutProcedureFollowed === "no" && (
                <>
                  <input
                    type="file"
                    accept="image/*"
                    capture="camera"
                    multiple
                    onChange={(e) => handleFileChange(e, "checkoutProcedureFollowed")}
                  />
                  <FileNameList fieldName="checkoutProcedureFollowed" />
                </>
              )}
            </div>

            {/* Any Property Damage */}
            <div>
              <label>
                Any damage to property?:
                <select name="propertyDamage" onChange={handleChange}>
                  <option value="">Select...</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>
              {formData.propertyDamage === "yes" && (
                <>
                  <input
                    type="file"
                    accept="image/*"
                    capture="camera"
                    multiple
                    onChange={(e) => handleFileChange(e, "propertyDamage")}
                  />
                  <FileNameList fieldName="propertyDamage" />
                </>
              )}
            </div>
          </div>

          {/* Additional Comments */}
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
