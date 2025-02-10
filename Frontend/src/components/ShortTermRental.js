import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
// Helper component: Displays uploaded file names
const FileNameList = ({ fieldName, formData }) => {
    if (!formData.photos || !formData.photos[fieldName]) return null; // Prevents crash
    const fileArray = formData.photos[fieldName];
  
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
    
function ShortTermRental() {
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
    customFields: {}, // Holds dynamic custom form fields
  });

  const [customQuestions, setCustomQuestions] = useState([]);
  const [accessInstructions, setAccessInstructions] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState("");
  const [orgType, setOrgType] = useState(""); // ✅ Add orgType state


  useEffect(() => {
    const fetchPropertyData = async () => {
      try {
        const token = localStorage.getItem("token");
        const response = await fetch(
          `https://cp-check-submissions-dev-backend.onrender.com/api/properties/${encodeURIComponent(property)}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
  
        const data = await response.json();
        if (response.ok) {
          setCustomQuestions(data.customFields || []);
          setAccessInstructions(data.accessInstructions || "No instructions provided.");
          setOrgType(data.orgType || "");
  
          // ✅ Store orgType in localStorage to persist across navigation
          localStorage.setItem("orgType", data.orgType || "");
  
          // ✅ Initialize formData with fetched custom fields
          setFormData((prev) => ({
            ...prev,
            customFields: data.customFields.reduce((acc, field) => {
              acc[field] = "";
              return acc;
            }, {}),
          }));
        }
      } catch (error) {
        console.error("Error fetching property data:", error);
      }
    };
    const fetchAssignmentData = async () => {
        try {
          const token = localStorage.getItem("token");
          const userId = localStorage.getItem("userId");
      
          if (!token || !userId) return;
      
          const response = await fetch(
            `https://cp-check-submissions-dev-backend.onrender.com/api/assignments`,
            {
              headers: { Authorization: `Bearer ${token}` },
            }
          );
      
          const data = await response.json();
      
          if (response.ok) {
            // Find the assignment matching the user and property
            const userAssignment = data.find(
              (assignment) => 
                assignment.userId === userId && assignment.propertyName === property
            );
      
            if (userAssignment) {
              console.log("📌 One-Time Check Request:", userAssignment.oneTimeCheckRequest);
              setFormData((prev) => ({
                ...prev,
                oneTimeCheckRequest: userAssignment.oneTimeCheckRequest || "",
              }));
            }
          }
        } catch (error) {
          console.error("Error fetching assignment data:", error);
        }
      };
      
      // ✅ Call the new function inside `useEffect`
      fetchAssignmentData();      
    fetchPropertyData();
  }, [property]);  

  // Handle changes for standard text/textarea/select fields
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Check all Yes/No fields to ensure photos exist when "Yes" is selected
    for (const question of customQuestions) {
      if (question.type === "yesno" && formData.customFields[question.name] === "yes") {
        if (!formData.customFields[`description_${question.name}`]?.trim()) {
          alert(`Please provide a description for: ${question.name}`);
          return;
        }
        if (!formData.photos[question.name] || formData.photos[question.name].length === 0) {
          alert(`You must upload a photo for: ${question.name}`);
          return;
        }
      }
    }
    try {
      const token = localStorage.getItem("token");
      const formDataToSend = new FormData();
      // Append standard fields
      Object.keys(formData).forEach((key) => {
        if (key !== "photos" && key !== "customFields") {
          formDataToSend.append(key, formData[key]);
        }
      });
      formDataToSend.append("selectedProperty", property);
      formDataToSend.append("orgType", orgType);
      // Append custom fields (text + yes/no)
      Object.keys(formData.customFields).forEach((key) => {
        formDataToSend.append(`custom_${key}`, formData.customFields[key]);
      });
      // Append Photos
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
  return (
    <div className="container">
      <h1>{property} – Short-Term Rental Inspection Checklist</h1>
      <h2>Access Instructions</h2>
      <p>{accessInstructions}</p>

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
                <FileNameList fieldName="toiletriesStocked" formData={formData} />
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
                  <FileNameList fieldName="furnitureCorrect" formData={formData} />
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
                  <FileNameList fieldName="checkoutProcedure" formData={formData} />
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
                  <FileNameList fieldName="propertyDamage" formData={formData} />
                </>
              )}
            </div>
          </div>
          <h2>Custom Inspection Fields</h2>
{customQuestions.length > 0 ? (
  customQuestions.map((question, index) => (
    <div key={index}>
      <label>{question.name}</label>
      
      {question.type === "text" && (
        <input
          type="text"
          name={`custom_${question.name}`}
          value={formData.customFields[question.name] || ""}
          onChange={(e) =>
            setFormData((prev) => ({
              ...prev,
              customFields: { ...prev.customFields, [question.name]: e.target.value },
            }))
          }
        />
      )}
{question.type === "yesno" && (
  <>
    <select
      name={`custom_${question.name}`}
      value={formData.customFields[question.name] || ""}
      onChange={(e) =>
        setFormData((prev) => ({
          ...prev,
          customFields: { ...prev.customFields, [question.name]: e.target.value },
        }))
      }
      required
    >
      <option value="">Select...</option>
      <option value="yes">Yes</option>
      <option value="no">No</option>
    </select>
    {/* Require Description if "Yes" is selected */}
    {formData.customFields[question.name] === "yes" && (
      <>
        <textarea
          name={`description_${question.name}`}
          value={formData.customFields[`description_${question.name}`] || ""}
          onChange={(e) =>
            setFormData((prev) => ({
              ...prev,
              customFields: { ...prev.customFields, [`description_${question.name}`]: e.target.value },
            }))
          }
          placeholder="Describe the issue"
          required
        />
        {/* Require File Upload if "Yes" is selected */}
        <input
          type="file"
          accept="image/*"
          capture="camera"
          multiple
          onChange={(e) => handleFileChange(e, question.name)}
          required
        />
        {/* Show file names if uploaded */}
        <FileNameList fieldName={question.name} formData={formData} />
      </>
    )}
  </>
)}
    </div>
  ))
) : (
  <p>No additional custom fields.</p>
)}
{/* One-Time Check Request (only if it exists) */}
{formData.oneTimeCheckRequest && (
  <div>
    <h2>One-Time Additional Check</h2>
    <p>{formData.oneTimeCheckRequest}</p>
  </div>
)}
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

export default ShortTermRental;
