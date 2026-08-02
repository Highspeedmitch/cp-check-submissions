import React, { useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../services/api";
import { submitInspectionJob } from "../services/photoUpload";
import MultiPhotoField from "./ui/MultiPhotoField";
import PageHeader from "./ui/PageHeader";
import OptionalCommentPhotos from "./ui/OptionalCommentPhotos";
import ContextualHelpLink from "./help/ContextualHelpLink";
import InspectionDraftPersistence from "./InspectionDraftPersistence";
import {
  deleteInspectionDraft,
  inspectionDraftKey,
  saveInspectionDraft,
} from "../services/inspectionDrafts";

const CONDITION_FIELDS = [
  { key: "lawnCondition", label: "Are there lawn or landscaping issues?" },
  { key: "plumbingLeaks", label: "Are any plumbing leaks visible?" },
  { key: "electricalIssues", label: "Are any electrical issues present?" },
  { key: "HVACWorking", label: "Are there any HVAC concerns?" },
];

export default function ResidentialForm() {
  const { property } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const assignmentId = searchParams.get("assignmentId") || "";
  const dashboardPath = localStorage.getItem("accountScope") === "afterlight_resource" ? "/resource" : "/dashboard";
  const [responses, setResponses] = useState({});
  const [photos, setPhotos] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [commentPhotosEnabled, setCommentPhotosEnabled] = useState(false);
  const draftKey = useMemo(() => inspectionDraftKey("residential", property), [property]);
  const draftMetadata = useMemo(() => ({ formType: "residential" }), []);

  const setResponse = (key, value) =>
    setResponses((current) => ({ ...current, [key]: value }));

  async function submit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
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
        orgType: "RES",
        responses,
        photoGroups: photos,
        assignmentId,
        onProgress: ({ phase, completed, total }) => {
          if (phase === "preparing") setProgress("Preparing photo uploads…");
          if (phase === "uploading") setProgress(`Uploading photo ${completed} of ${total}…`);
          if (phase === "queued") setProgress("Report queued for processing…");
          if (phase === "processing") setProgress("Generating report…");
        },
      });
      if (result.status === "failed") throw new Error(result.error || "Report processing failed.");
      await deleteInspectionDraft(draftKey).catch(() => {});
      setSubmitted(true);
    } catch (requestError) {
      setError(requestError.message || "Unable to submit the inspection.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="beta-page">
      <main className="beta-page-shell beta-inspection-page">
        <PageHeader onBack={() => navigate(dashboardPath)} eyebrow={property}
          title="Residential Property Inspection Checklist"
          subtitle="Complete the inspection and attach photographic evidence for any concerns."
          actions={<ContextualHelpLink slug="complete-and-submit-an-inspection" />} />
        {error && <p className="beta-alert error">{error}</p>}
        {submitting && progress && <p className="beta-alert" role="status">{progress}</p>}
        {!submitted && <InspectionDraftPersistence
          draftKey={draftKey}
          responses={responses}
          photoGroups={photos}
          metadata={draftMetadata}
          disabled={submitting}
          onRestore={(draft) => {
            setResponses((current) => ({ ...current, ...draft.responses }));
            setPhotos(draft.photoGroups || {});
            if (draft.photoGroups?.additionalComments?.length) setCommentPhotosEnabled(true);
          }}
        />}
        {submitted ? <section className="beta-panel">
          <h2>Inspection complete</h2>
          <button className="beta-button" onClick={() => navigate(dashboardPath)}>Return to Dashboard</button>
        </section> : <form onSubmit={submit}>
          <section className="beta-panel beta-inspection-section">
            <div className="beta-form-grid">
              <label className="beta-form-field">Property name
                <input required value={responses.businessName || ""}
                  onChange={(event) => setResponse("businessName", event.target.value)} />
              </label>
              <label className="beta-form-field">Property address
                <input required value={responses.propertyAddress || ""}
                  onChange={(event) => setResponse("propertyAddress", event.target.value)} />
              </label>
            </div>
          </section>
          <section className="beta-panel beta-inspection-section">
            <h2>Property condition</h2>
            {CONDITION_FIELDS.map((field) => (
              <div className="beta-inspection-field" key={field.key}>
                <label className="beta-form-field">{field.label}
                  <select value={responses[field.key] || ""} required
                    onChange={(event) => setResponse(field.key, event.target.value)}>
                    <option value="">Select...</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </label>
                {responses[field.key] === "yes" && <div className="beta-inspection-followup">
                  <label className="beta-form-field">Describe the issue
                    <textarea value={responses[`${field.key}Description`] || ""}
                      onChange={(event) => setResponse(`${field.key}Description`, event.target.value)} />
                  </label>
                  <MultiPhotoField fieldKey={field.key} label={field.label}
                    files={photos[field.key] || []}
                    onChange={(files) => setPhotos((current) => ({ ...current, [field.key]: files }))} />
                </div>}
              </div>
            ))}
          </section>
          <section className="beta-panel">
            <label className="beta-form-field">Additional comments
              <textarea value={responses.additionalComments || ""}
                onChange={(event) => setResponse("additionalComments", event.target.value)} />
            </label>
            <OptionalCommentPhotos enabled={commentPhotosEnabled}
              onEnabledChange={setCommentPhotosEnabled}
              files={photos.additionalComments || []}
              onChange={(files) => setPhotos((current) => ({ ...current, additionalComments: files }))} />
          </section>
          <div className="beta-sticky-submit">
            <button className="beta-button" disabled={submitting}>
              {submitting ? "Submitting..." : "Submit Checklist"}
            </button>
          </div>
        </form>}
      </main>
    </div>
  );
}
