import React, { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../services/api";
import { appendOptimizedPhotos } from "../services/photoUpload";
import MultiPhotoField from "./ui/MultiPhotoField";
import PageHeader from "./ui/PageHeader";
import OptionalCommentPhotos from "./ui/OptionalCommentPhotos";

const CONDITION_FIELDS = [
  { key: "lawnCondition", label: "Are there lawn or landscaping issues?" },
  { key: "plumbingLeaks", label: "Are any plumbing leaks visible?" },
  { key: "electricalIssues", label: "Are any electrical issues present?" },
  { key: "HVACWorking", label: "Are there any HVAC concerns?" },
];

export default function ResidentialForm() {
  const { property } = useParams();
  const navigate = useNavigate();
  const [responses, setResponses] = useState({});
  const [photos, setPhotos] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [commentPhotosEnabled, setCommentPhotosEnabled] = useState(false);

  const setResponse = (key, value) =>
    setResponses((current) => ({ ...current, [key]: value }));

  async function submit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const payload = new FormData();
      Object.entries(responses).forEach(([key, value]) => payload.append(key, value));
      payload.append("selectedProperty", property);
      payload.append("orgType", "RES");
      await appendOptimizedPhotos(payload, photos);
      await api.post("/api/submit-form", payload);
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
        <PageHeader onBack={() => navigate("/dashboard")} eyebrow={property}
          title="Residential Property Inspection Checklist"
          subtitle="Complete the inspection and attach photographic evidence for any concerns." />
        {error && <p className="beta-alert error">{error}</p>}
        {submitted ? <section className="beta-panel">
          <h2>Inspection complete</h2>
          <button className="beta-button" onClick={() => navigate("/dashboard")}>Return to Dashboard</button>
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
