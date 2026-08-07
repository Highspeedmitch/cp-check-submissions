import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../services/api";
import { submitInspectionJob } from "../services/photoUpload";
import PageHeader from "./ui/PageHeader";
import MultiPhotoField from "./ui/MultiPhotoField";
import OptionalCommentPhotos from "./ui/OptionalCommentPhotos";
import ContextualHelpLink from "./help/ContextualHelpLink";
import InspectionDraftPersistence from "./InspectionDraftPersistence";
import {
  deleteInspectionDraft,
  inspectionDraftKey,
} from "../services/inspectionDrafts";

export default function FormPage() {
  const { property } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const assignmentId = searchParams.get("assignmentId") || "";
  const dashboardPath = localStorage.getItem("accountScope") === "afterlight_resource" ? "/resource" : "/dashboard";
  const [template, setTemplate] = useState(null);
  const [responses, setResponses] = useState({});
  const [photos, setPhotos] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [draftWarning, setDraftWarning] = useState("");
  const [assignmentInstructions, setAssignmentInstructions] = useState("");
  const [commentPhotosEnabled, setCommentPhotosEnabled] = useState(false);
  const draftKey = useMemo(() => inspectionDraftKey("commercial", property), [property]);
  const draftMetadata = useMemo(() => ({ formType: "commercial", template }), [template]);

  const updateProgress = ({ phase, completed, total }) => {
    if (phase === "preparing") setMessage("Preparing secure photo uploads…");
    if (phase === "uploading") setMessage(`Uploading photo ${completed} of ${total}…`);
    if (phase === "queued") setMessage("Photos uploaded. Your report is queued for processing.");
    if (phase === "processing") setMessage("Generating your inspection report…");
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    const userId = localStorage.getItem("userId");
    Promise.all([
      api.get(`/api/inspection-templates/properties/${encodeURIComponent(property)}/effective${assignmentId ? `?assignmentId=${encodeURIComponent(assignmentId)}` : ""}`),
      api.get("/api/assignments").catch((assignmentError) => {
        console.error("Unable to load assignment instructions:", assignmentError);
        return [];
      }),
    ])
      .then(([data, assignments]) => {
        if (!active) return;
        setTemplate(data);
        setResponses((current) => ({
          ...Object.fromEntries(data.fields.map((field) => [field.key, ""])),
          ...current,
        }));
        const assignment = Array.isArray(assignments)
          ? assignments.find((item) => (
            String(item.userId) === String(userId)
            && item.propertyName === property
            && (!assignmentId || String(item._id) === String(assignmentId))
          ))
          : null;
        setAssignmentInstructions(assignment?.oneTimeCheckRequest || "");
        setError("");
      })
      .catch((err) => active && setError(err.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [assignmentId, property]);

  const sections = useMemo(() => {
    if (!template) return [];
    const grouped = new Map();
    template.fields.forEach((field) => {
      const section = field.section || "Property Condition";
      if (!grouped.has(section)) grouped.set(section, []);
      grouped.get(section).push(field);
    });
    return [...grouped.entries()];
  }, [template]);

  const setResponse = (key, value) => {
    setResponses((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!template || submitting) return;
    setSubmitting(true);
    setError("");
    setDraftWarning("");
    try {
      const payload = {};
      template.fields.forEach((field) => {
        payload[field.key] = responses[field.key] || "";
        if (field.type === "yes_no_issue") {
          payload[`${field.key}Description`] = responses[`${field.key}Description`] || "";
        }
      });
      const result = await submitInspectionJob({
        api,
        property,
        orgType: "COM",
        responses: payload,
        photoGroups: photos,
        assignmentId,
        draft: {
          key: draftKey,
          responses,
          photoGroups: photos,
          assignmentId,
          metadata: draftMetadata,
        },
        onProgress: updateProgress,
        onWarning: ({ message: warning }) => setDraftWarning(warning),
      });
      setMessage(result.status === "completed"
        ? "Inspection submitted and report generated successfully."
        : "Inspection uploaded and queued. Processing will continue in the background.");
      await deleteInspectionDraft(draftKey).catch(() => {});
      setSubmitted(true);
    } catch (err) {
      setError(err.message || "Unable to submit the inspection.");
    } finally {
      setSubmitting(false);
    }
  };

  const renderField = (field) => {
    if (field.type === "text") {
      return (
        <label className="beta-form-field" key={field.key}>
          {field.label}
          <input
            type="text"
            value={responses[field.key] || ""}
            onChange={(event) => setResponse(field.key, event.target.value)}
            required={field.required}
          />
        </label>
      );
    }

    if (field.type === "textarea") {
      return (
        <div className="beta-form-field full" key={field.key}>
          <label>{field.label}</label>
          <textarea value={responses[field.key] || ""}
            onChange={(event) => setResponse(field.key, event.target.value)}
            required={field.required} />
          {field.key === "additionalComments" && <OptionalCommentPhotos
            enabled={commentPhotosEnabled}
            onEnabledChange={setCommentPhotosEnabled}
            files={photos.additionalComments || []}
            onChange={(files) => setPhotos((current) => ({ ...current, additionalComments: files }))} />}
        </div>
      );
    }

    const needsDetails = responses[field.key] === "yes";
    return (
      <div className="beta-inspection-field" key={field.key}>
        <label className="beta-form-field">
          {field.label}
          <select
            value={responses[field.key] || ""}
            onChange={(event) => setResponse(field.key, event.target.value)}
            required={field.required}
          >
            <option value="">Select…</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>
        {needsDetails && (
          <div className="beta-inspection-followup">
            <label className="beta-form-field">
              {field.descriptionLabel || "Describe the issue"}
              <textarea
                value={responses[`${field.key}Description`] || ""}
                onChange={(event) => setResponse(`${field.key}Description`, event.target.value)}
              />
            </label>
            {field.allowPhotos && (
              <MultiPhotoField fieldKey={field.key} label={field.reportLabel || field.label}
                files={photos[field.key] || []}
                onChange={(files) => setPhotos((current) => ({ ...current, [field.key]: files }))} />
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="beta-page">
      <main className="beta-page-shell beta-inspection-page">
        <PageHeader
          onBack={() => navigate(dashboardPath)}
          eyebrow={property}
          title={template?.title || "Commercial Property Inspection Checklist"}
          subtitle="Complete the property inspection and attach photos for any issues."
          actions={<ContextualHelpLink slug="complete-and-submit-an-inspection" />}
        />

        {loading && <div className="beta-empty-state">Loading inspection form…</div>}
        {error && <p className="beta-alert error" role="alert">{error}</p>}
        {draftWarning && <p className="beta-alert notice" role="status">{draftWarning}</p>}
        {assignmentInstructions && !submitted && (
          <section className="beta-assignment-note beta-inspection-assignment-note">
            <strong>Special assignment instructions</strong>
            <p>{assignmentInstructions}</p>
          </section>
        )}
        {!submitted && <InspectionDraftPersistence
          draftKey={draftKey}
          responses={responses}
          photoGroups={photos}
          metadata={draftMetadata}
          disabled={submitting}
          onRestore={(draft) => {
            if (draft.metadata?.template) setTemplate(draft.metadata.template);
            setResponses((current) => ({ ...current, ...draft.responses }));
            setPhotos(draft.photoGroups || {});
            if (draft.photoGroups?.additionalComments?.length) setCommentPhotosEnabled(true);
            setLoading(false);
          }}
        />}

        {submitted ? (
          <section className="beta-panel">
            <h2>Inspection complete</h2>
            <p>{message}</p>
            <button className="beta-button" onClick={() => navigate(dashboardPath)}>
              Return to Dashboard
            </button>
          </section>
        ) : !loading && template && (
          <form onSubmit={handleSubmit}>
            {sections.map(([section, fields]) => (
              <section className="beta-panel beta-inspection-section" key={section}>
                <h2>{section}</h2>
                <div className="beta-form-grid">
                  {fields.map(renderField)}
                </div>
              </section>
            ))}
            <div className="beta-sticky-submit">
              {submitting && message && <span role="status">{message}</span>}
              <button className="beta-button" type="submit" disabled={submitting}>
                {submitting ? "Submitting…" : "Submit Checklist"}
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
