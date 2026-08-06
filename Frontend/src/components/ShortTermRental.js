import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, apiUrl } from "../services/api";
import { submitInspectionJob } from "../services/photoUpload";
import MultiPhotoField from "./ui/MultiPhotoField";
import OptionalCommentPhotos from "./ui/OptionalCommentPhotos";
import ContextualHelpLink from "./help/ContextualHelpLink";
import InspectionDraftPersistence from "./InspectionDraftPersistence";
import {
  deleteInspectionDraft,
  inspectionDraftKey,
} from "../services/inspectionDrafts";
    
function ShortTermRental() {
  const { property } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const assignmentId = searchParams.get("assignmentId") || "";
  const dashboardPath = localStorage.getItem("accountScope") === "afterlight_resource" ? "/resource" : "/dashboard";

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
  const [draftWarning, setDraftWarning] = useState("");
  const [orgType, setOrgType] = useState(""); // ✅ Add orgType state
  const [commentPhotosEnabled, setCommentPhotosEnabled] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const draftKey = useMemo(() => inspectionDraftKey("short-term-rental", property), [property]);
  const draftResponses = useMemo(() => {
    const { photos, oneTimeCheckRequest, ...responses } = formData;
    return responses;
  }, [formData]);
  const draftMetadata = useMemo(() => ({
    formType: "short-term-rental",
    customQuestions,
    accessInstructions,
    orgType,
    oneTimeCheckRequest: formData.oneTimeCheckRequest || "",
  }), [accessInstructions, customQuestions, formData.oneTimeCheckRequest, orgType]);


  useEffect(() => {
    const fetchPropertyData = async () => {
      try {
        const token = localStorage.getItem("token");
        const response = await fetch(
          apiUrl(`/api/properties/${encodeURIComponent(property)}${assignmentId ? `?assignmentId=${encodeURIComponent(assignmentId)}` : ""}`),
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
            customFields: {
              ...Object.fromEntries((data.customFields || []).map((field) => [field.name, ""])),
              ...prev.customFields,
            },
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
            apiUrl("/api/assignments"),
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
                && (!assignmentId || String(assignment._id) === String(assignmentId))
            );
      
            if (userAssignment) {
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
  }, [assignmentId, property]);

  // Handle changes for standard text/textarea/select fields
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const setFieldPhotos = (fieldName, files) => setFormData((prev) => ({
    ...prev,
    photos: { ...prev.photos, [fieldName]: files },
  }));

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
    setSubmitting(true);
    setDraftWarning("");
    try {
      const { photos, customFields, ...standardResponses } = formData;
      const responses = {
        ...standardResponses,
        ...Object.fromEntries(Object.entries(customFields).map(([key, value]) => [`custom_${key}`, value])),
      };
      const result = await submitInspectionJob({
        api,
        property,
        orgType,
        responses,
        photoGroups: photos,
        assignmentId,
        draft: {
          key: draftKey,
          responses: draftResponses,
          photoGroups: photos,
          assignmentId,
          metadata: draftMetadata,
        },
        onWarning: ({ message: warning }) => setDraftWarning(warning),
        onProgress: ({ phase, completed, total }) => {
          if (phase === "preparing") setMessage("Preparing photo uploads…");
          if (phase === "uploading") setMessage(`Uploading photo ${completed} of ${total}…`);
          if (phase === "queued") setMessage("Report queued for processing…");
          if (phase === "processing") setMessage("Generating report…");
        },
      });
      setMessage(result.status === "completed"
        ? "Inspection submitted and report generated successfully."
        : "Inspection uploaded and queued for background processing.");
      await deleteInspectionDraft(draftKey).catch(() => {});
      setSubmitted(true);
    } catch (error) {
      console.error("Error submitting form:", error);
      alert(error.message || "Error submitting form. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <div className="container">
      <h1>{property} – Short-Term Rental Inspection Checklist</h1>
      <h2>Access Instructions</h2>
      <p>{accessInstructions}</p>
      {draftWarning && <p className="beta-alert notice" role="status">{draftWarning}</p>}

      {!submitted && (
        <div className="return-to-dash">
          <button onClick={() => navigate(dashboardPath)}>Return To Dashboard</button>
          <ContextualHelpLink slug="complete-and-submit-an-inspection" />
        </div>
      )}

      {submitted ? (
        <div>
          <h2>{message}</h2>
          <button onClick={() => navigate(dashboardPath)}>Return To Dashboard</button>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <InspectionDraftPersistence
            draftKey={draftKey}
            responses={draftResponses}
            photoGroups={formData.photos}
            metadata={draftMetadata}
            disabled={submitting}
            onRestore={(draft) => {
              setFormData((current) => ({
                ...current,
                ...draft.responses,
                oneTimeCheckRequest: draft.metadata?.oneTimeCheckRequest || current.oneTimeCheckRequest,
                photos: draft.photoGroups || {},
              }));
              if (draft.metadata?.customQuestions?.length) setCustomQuestions(draft.metadata.customQuestions);
              if (draft.metadata?.accessInstructions) setAccessInstructions(draft.metadata.accessInstructions);
              if (draft.metadata?.orgType) setOrgType(draft.metadata.orgType);
              if (draft.photoGroups?.additionalComments?.length) setCommentPhotosEnabled(true);
            }}
          />
          <input type="hidden" name="selectedProperty" value={property} />

          <label>Property Name:</label>
          <input type="text" name="businessName" value={formData.businessName} onChange={handleChange} required />

          <label>Property Address:</label>
          <input type="text" name="propertyAddress" value={formData.propertyAddress} onChange={handleChange} required />

          <h2>Inspection Items</h2>
          <div className="inspection-items">
            {/* Toiletries Need Re-stocked */}
            <div>
              <label>Toiletries need re-stocked?</label>
              <select name="toiletriesStocked" value={formData.toiletriesStocked} onChange={handleChange}>
                <option value="">Select...</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
              {formData.toiletriesStocked === "yes" && (
                    <>
                <textarea name="toiletriesStockedDescription" value={formData.toiletriesStockedDescription} onChange={handleChange} placeholder="Describe the issue" />
                <MultiPhotoField fieldKey="toiletriesStocked" label="Toiletries need re-stocked"
                  files={formData.photos.toiletriesStocked || []}
                  onChange={(files) => setFieldPhotos("toiletriesStocked", files)} />
            </>
            )}

            </div>

            {/* Furniture Correct */}
            <div>
              <label>Furniture is in correct place?</label>
              <select name="furnitureCorrect" value={formData.furnitureCorrect} onChange={handleChange}>
                <option value="">Select...</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
              {formData.furnitureCorrect === "yes" && (
                <>
                  <textarea name="furnitureCorrectDescription" value={formData.furnitureCorrectDescription} onChange={handleChange} placeholder="Describe the issue" />
                  <MultiPhotoField fieldKey="furnitureCorrect" label="Furniture placement"
                    files={formData.photos.furnitureCorrect || []}
                    onChange={(files) => setFieldPhotos("furnitureCorrect", files)} />
                </>
              )}
            </div>

            {/* Guest Checkout Procedure */}
            <div>
              <label>Guest checkout procedure followed?</label>
              <select name="checkoutProcedure" value={formData.checkoutProcedure} onChange={handleChange}>
                <option value="">Select...</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
              {formData.checkoutProcedure === "no" && (
                <>
                  <textarea name="checkoutProcedureDescription" value={formData.checkoutProcedureDescription} onChange={handleChange} placeholder="Describe the issue" />
                  <MultiPhotoField fieldKey="checkoutProcedure" label="Checkout procedure"
                    files={formData.photos.checkoutProcedure || []}
                    onChange={(files) => setFieldPhotos("checkoutProcedure", files)} />
                </>
              )}
            </div>

            {/* Any Damage to Property */}
            <div>
              <label>Any damage to property?</label>
              <select name="propertyDamage" value={formData.propertyDamage} onChange={handleChange}>
                <option value="">Select...</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
              {formData.propertyDamage === "yes" && (
                <>
                  <textarea name="propertyDamageDescription" value={formData.propertyDamageDescription} onChange={handleChange} placeholder="Describe the issue" />
                  <MultiPhotoField fieldKey="propertyDamage" label="Property damage"
                    files={formData.photos.propertyDamage || []}
                    onChange={(files) => setFieldPhotos("propertyDamage", files)} />
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
        <MultiPhotoField fieldKey={question.name} label={question.name}
          files={formData.photos[question.name] || []}
          onChange={(files) => setFieldPhotos(question.name, files)} />
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
          <textarea name="additionalComments" value={formData.additionalComments} onChange={handleChange} />
          <OptionalCommentPhotos enabled={commentPhotosEnabled}
            onEnabledChange={setCommentPhotosEnabled}
            files={formData.photos.additionalComments || []}
            onChange={(files) => setFieldPhotos("additionalComments", files)} />

          <button type="submit" className="submit button" disabled={submitting}>
            {submitting ? message || "Submitting…" : "Submit Checklist"}
          </button>
        </form>
      )}
    </div>
  );
}

export default ShortTermRental;
