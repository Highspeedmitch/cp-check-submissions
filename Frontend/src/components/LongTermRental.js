import React, { useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../services/api";
import { submitInspectionJob } from "../services/photoUpload";
import MultiPhotoField from "./ui/MultiPhotoField";
import OptionalCommentPhotos from "./ui/OptionalCommentPhotos";
import ContextualHelpLink from "./help/ContextualHelpLink";
import InspectionDraftPersistence from "./InspectionDraftPersistence";
import {
  deleteInspectionDraft,
  inspectionDraftKey,
  saveInspectionDraft,
} from "../services/inspectionDrafts";

function LongTermRental() {
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
  });

  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState("");
  const [commentPhotosEnabled, setCommentPhotosEnabled] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const draftKey = useMemo(() => inspectionDraftKey("long-term-rental", property), [property]);
  const draftMetadata = useMemo(() => ({ formType: "long-term-rental" }), []);
  const { photos: draftPhotos, ...draftResponses } = formData;

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
    setSubmitting(true);
    try {
      const { photos, ...responses } = formData;
      await saveInspectionDraft({
        key: draftKey,
        responses,
        photoGroups: photos,
        assignmentId,
        metadata: draftMetadata,
      });

      const result = await submitInspectionJob({
        api,
        property,
        orgType: "LTR",
        responses,
        photoGroups: photos,
        assignmentId,
        onProgress: ({ phase, completed, total }) => {
          if (phase === "preparing") setMessage("Preparing photo uploads…");
          if (phase === "uploading") setMessage(`Uploading photo ${completed} of ${total}…`);
          if (phase === "queued") setMessage("Report queued for processing…");
          if (phase === "processing") setMessage("Generating report…");
        },
      });

      if (result.status === "failed") throw new Error(result.error || "Report processing failed.");
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
      <h1>{property} – Long-Term Rental Inspection Checklist</h1>

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
            photoGroups={draftPhotos}
            metadata={draftMetadata}
            disabled={submitting}
            onRestore={(draft) => {
              setFormData((current) => ({
                ...current,
                ...draft.responses,
                photos: draft.photoGroups || {},
              }));
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

export default LongTermRental;
