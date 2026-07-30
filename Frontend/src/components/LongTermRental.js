import React, { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiUrl } from "../services/api";
import { appendOptimizedPhotos } from "../services/photoUpload";
import MultiPhotoField from "./ui/MultiPhotoField";
import OptionalCommentPhotos from "./ui/OptionalCommentPhotos";

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
  const [commentPhotosEnabled, setCommentPhotosEnabled] = useState(false);

  // Handle changes for standard text/textarea/select fields
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const setFieldPhotos = (fieldName, files) => setFormData((prev) => ({
    ...prev,
    photos: { ...prev.photos, [fieldName]: files },
  }));

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
      await appendOptimizedPhotos(formDataToSend, formData.photos);

      const response = await fetch(apiUrl("/api/submit-form"), {
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
                  <MultiPhotoField fieldKey="toiletriesStocked" label="Toiletries need re-stocked"
                    files={formData.photos.toiletriesStocked || []}
                    onChange={(files) => setFieldPhotos("toiletriesStocked", files)} />
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
                  <MultiPhotoField fieldKey="furnitureCorrect" label="Furniture placement"
                    files={formData.photos.furnitureCorrect || []}
                    onChange={(files) => setFieldPhotos("furnitureCorrect", files)} />
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
                  <MultiPhotoField fieldKey="checkoutProcedure" label="Checkout procedure"
                    files={formData.photos.checkoutProcedure || []}
                    onChange={(files) => setFieldPhotos("checkoutProcedure", files)} />
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
                  <MultiPhotoField fieldKey="propertyDamage" label="Property damage"
                    files={formData.photos.propertyDamage || []}
                    onChange={(files) => setFieldPhotos("propertyDamage", files)} />
                </>
              )}
            </div>
          </div>

          {/* Other Text Areas */}
          <label>Additional Comments:</label>
          <textarea name="additionalComments" onChange={handleChange} />
          <OptionalCommentPhotos enabled={commentPhotosEnabled}
            onEnabledChange={setCommentPhotosEnabled}
            files={formData.photos.additionalComments || []}
            onChange={(files) => setFieldPhotos("additionalComments", files)} />

          <button type="submit" className="submit button">
            Submit Checklist
          </button>
        </form>
      )}
    </div>
  );
}

export default LongTermRental;
