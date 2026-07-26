import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../services/api";
import PageHeader from "./ui/PageHeader";

export default function FormPage() {
  const { property } = useParams();
  const navigate = useNavigate();
  const [template, setTemplate] = useState(null);
  const [responses, setResponses] = useState({});
  const [photos, setPhotos] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.get(`/api/inspection-templates/properties/${encodeURIComponent(property)}/effective`)
      .then((data) => {
        if (!active) return;
        setTemplate(data);
        setResponses(Object.fromEntries(data.fields.map((field) => [field.key, ""])));
        setError("");
      })
      .catch((err) => active && setError(err.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [property]);

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

  const handleFileChange = (event, fieldKey) => {
    const selected = [...(event.target.files || [])];
    if (!selected.length) return;
    setPhotos((current) => ({
      ...current,
      [fieldKey]: [...(current[fieldKey] || []), ...selected],
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!template || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const payload = new FormData();
      template.fields.forEach((field) => {
        payload.append(field.key, responses[field.key] || "");
        if (field.type === "yes_no_issue") {
          payload.append(`${field.key}Description`, responses[`${field.key}Description`] || "");
        }
      });
      payload.append("selectedProperty", property);
      Object.entries(photos).forEach(([fieldKey, files]) => {
        files.forEach((file) => {
          payload.append(
            "photos",
            new File([file], `${fieldKey}-${file.name}`, { type: file.type })
          );
        });
      });
      const result = await api.post("/api/submit-form", payload);
      setMessage(result.message || "Inspection submitted successfully.");
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
        <label className="beta-form-field full" key={field.key}>
          {field.label}
          <textarea
            value={responses[field.key] || ""}
            onChange={(event) => setResponse(field.key, event.target.value)}
            required={field.required}
          />
        </label>
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
              <label className="beta-form-field">
                Add photos
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  onChange={(event) => handleFileChange(event, field.key)}
                />
                {(photos[field.key] || []).map((file, index) => (
                  <small key={`${file.name}-${index}`}>{file.name}</small>
                ))}
              </label>
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
          onBack={() => navigate("/dashboard")}
          eyebrow={property}
          title={template?.title || "Commercial Property Inspection Checklist"}
          subtitle="Complete the property inspection and attach photos for any issues."
        />

        {loading && <div className="beta-empty-state">Loading inspection form…</div>}
        {error && <p className="beta-alert error" role="alert">{error}</p>}

        {submitted ? (
          <section className="beta-panel">
            <h2>Inspection complete</h2>
            <p>{message}</p>
            <button className="beta-button" onClick={() => navigate("/dashboard")}>
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
