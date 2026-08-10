import React, { useEffect, useMemo, useState } from "react";
import { api } from "../services/api";
import { appendOptimizedPhotos } from "../services/photoUpload";
import MultiPhotoField from "./ui/MultiPhotoField";
import OptionalCommentPhotos from "./ui/OptionalCommentPhotos";
import SortableFieldList from "./ui/SortableFieldList";

function newField(label, type) {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 35);
  return {
    key: `prospect_${base || "field"}_${Date.now().toString(36)}`,
    label, reportLabel: label, type,
    section: type === "yes_no_issue" ? "Property Condition" : "Additional Observations",
    required: false, allowPhotos: type === "yes_no_issue",
    descriptionLabel: "Describe the opportunity", locked: false,
  };
}

function insertBeforeGeneralObservations(fields, field) {
  const generalIndex = fields.findIndex((item) => item.key === "generalObservations");
  if (generalIndex < 0) return [...fields, field];
  const insertAt = field.type === "yes_no_issue" ? generalIndex : generalIndex + 1;
  const next = [...fields];
  next.splice(insertAt, 0, field);
  return next.map((item, order) => ({ ...item, order }));
}

export default function ProspectAssessments() {
  const [view, setView] = useState("repository");
  const [template, setTemplate] = useState(null);
  const [assessments, setAssessments] = useState([]);
  const [responses, setResponses] = useState({});
  const [photos, setPhotos] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState("yes_no_issue");
  const [optionalPhotoFields, setOptionalPhotoFields] = useState({});

  const sections = useMemo(() => {
    const grouped = new Map();
    (template?.fields || []).forEach((field) => {
      const section = field.section || "Property Condition";
      if (!grouped.has(section)) grouped.set(section, []);
      grouped.get(section).push(field);
    });
    return [...grouped.entries()];
  }, [template]);

  const load = async () => {
    try {
      const [loadedTemplate, loadedAssessments] = await Promise.all([
        api.get("/api/platform/prospect-template"),
        api.get("/api/platform/prospect-assessments"),
      ]);
      setTemplate(loadedTemplate);
      setAssessments(loadedAssessments);
    } catch (requestError) {
      setError(requestError.message);
    }
  };
  useEffect(() => { load(); }, []);

  const setResponse = (key, value) => setResponses((current) => ({ ...current, [key]: value }));
  const setTemplateFields = (fields) => setTemplate((current) => ({ ...current, fields }));
  const updateField = (key, changes) => setTemplate((current) => ({
    ...current,
    fields: current.fields.map((field) => (
      field.key === key && !field.locked ? { ...field, ...changes } : field
    )),
  }));

  async function createAssessment(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const formData = new FormData();
      formData.append("responses", JSON.stringify(responses));
      await appendOptimizedPhotos(formData, photos);
      await api.post("/api/platform/prospect-assessments", formData);
      setResponses({}); setPhotos({}); setOptionalPhotoFields({});
      setMessage("Assessment created. The PDF is available in the repository for 30 days.");
      setView("repository");
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally { setBusy(false); }
  }

  async function download(id) {
    try {
      const result = await api.get(`/api/platform/prospect-assessments/${id}/download`);
      window.location.assign(result.url);
    } catch (requestError) { setError(requestError.message); }
  }

  async function remove(id) {
    if (!window.confirm("Permanently delete this assessment and PDF?")) return;
    try {
      await api.delete(`/api/platform/prospect-assessments/${id}`);
      setAssessments((current) => current.filter((item) => item._id !== id));
    } catch (requestError) { setError(requestError.message); }
  }

  async function saveTemplate() {
    setBusy(true); setError(""); setMessage("");
    try {
      const updated = await api.put("/api/platform/prospect-template", {
        name: template.name, title: template.title, fields: template.fields,
      });
      setTemplate(updated);
      setMessage(`Prospect template version ${updated.version} is active.`);
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  const renderAssessmentField = (field) => {
    if (field.type === "text") {
      return (
        <label className="beta-form-field" key={field.key}>
          {field.label}{field.required ? " *" : ""}
          <input type="text" required={field.required} value={responses[field.key] || ""}
            onChange={(event) => setResponse(field.key, event.target.value)} />
        </label>
      );
    }

    if (field.type === "textarea") {
      return (
        <div className="beta-form-field full" key={field.key}>
          <label>{field.label}{field.required ? " *" : ""}</label>
          <textarea required={field.required} value={responses[field.key] || ""}
            onChange={(event) => setResponse(field.key, event.target.value)} />
          {(field.allowPhotos || field.key === "additionalComments") && <OptionalCommentPhotos
            enabled={Boolean(optionalPhotoFields[field.key])}
            onEnabledChange={(enabled) => setOptionalPhotoFields((current) => ({
              ...current,
              [field.key]: enabled,
            }))}
            fieldKey={field.key}
            label={field.reportLabel || field.label}
            prompt={`Include photos related to ${field.label.toLowerCase()}`}
            files={photos[field.key] || []}
            onChange={(files) => setPhotos((current) => ({ ...current, [field.key]: files }))} />}
        </div>
      );
    }

    const opportunityObserved = responses[field.key] === "yes";
    return (
      <div className="beta-inspection-field" key={field.key}>
        <label className="beta-form-field">
          {field.label}{field.required ? " *" : ""}
          <select required={field.required} value={responses[field.key] || ""}
            onChange={(event) => setResponse(field.key, event.target.value)}>
            <option value="">Select...</option>
            <option value="yes">Opportunity observed</option>
            <option value="no">No issue observed</option>
          </select>
        </label>
        {opportunityObserved && (
          <div className="beta-inspection-followup">
            <label className="beta-form-field">
              {field.descriptionLabel || "Describe the opportunity"}
              <textarea value={responses[`${field.key}Description`] || ""}
                onChange={(event) => setResponse(`${field.key}Description`, event.target.value)} />
            </label>
            {field.allowPhotos && <MultiPhotoField fieldKey={field.key}
              label={field.reportLabel || field.label}
              files={photos[field.key] || []}
              onChange={(files) => setPhotos((current) => ({ ...current, [field.key]: files }))} />}
          </div>
        )}
      </div>
    );
  };

  if (!template) return <section className="beta-panel"><p>Loading prospect assessments...</p></section>;
  return (
    <section className="beta-section">
      <div className="beta-section-heading">
        <div><h2>Complimentary reports</h2><p>Create standalone exterior opportunity reports. Stored reports are automatically purged after 30 days.</p></div>
        <div>
          <button type="button" className="beta-button secondary compact" onClick={() => setView("repository")}>Repository</button>{" "}
          <button type="button" className="beta-button secondary compact" onClick={() => setView("create")}>New assessment</button>{" "}
          <button type="button" className="beta-button secondary compact" onClick={() => setView("template")}>Template</button>
        </div>
      </div>
      {error && <p className="beta-alert error">{error}</p>}
      {message && <p className="beta-alert success">{message}</p>}

      {view === "repository" && (
        <div className="beta-card-grid">
          {!assessments.length && <div className="beta-empty-state">No active prospect assessments.</div>}
          {assessments.map((item) => (
            <article className="beta-card" key={item._id}>
              <h3>{item.businessName || item.propertyAddress}</h3>
              {item.businessName && <p>{item.propertyAddress}</p>}
              <p>Created {new Date(item.createdAt).toLocaleDateString()}</p>
              <p>Purges {new Date(item.expiresAt).toLocaleDateString()}</p>
              {item.aiSummary?.status === "generated" && ["dev-preview", "live"].includes(item.aiSummary.mode)
                && <p><strong>Bedrock summary included</strong></p>}
              {item.aiSummary?.status === "failed" && <p><strong>AI summary unavailable; PDF fallback used</strong></p>}
              <button type="button" className="beta-button compact" onClick={() => download(item._id)}>Download PDF</button>{" "}
              <button type="button" className="beta-button danger compact" onClick={() => remove(item._id)}>Delete</button>
            </article>
          ))}
        </div>
      )}

      {view === "create" && (
        <form onSubmit={createAssessment}>
          <section className="beta-panel">
            <div className="beta-section-heading"><div>
              <h2>{template.title}</h2>
              <p>Complete the exterior assessment and attach evidence to observed opportunities. Bedrock will create the concise first-page summary when AI summaries are enabled.</p>
            </div></div>
          </section>
          {sections.map(([section, fields]) => (
            <section className="beta-panel beta-inspection-section" key={section}>
              <h2>{section}</h2>
              <div className="beta-form-grid">{fields.map(renderAssessmentField)}</div>
            </section>
          ))}
          <div className="beta-sticky-submit">
            <button className="beta-button" type="submit" disabled={busy}>
              {busy ? "Generating PDF..." : "Generate assessment PDF"}
            </button>
          </div>
        </form>
      )}

      {view === "template" && (
        <div>
          <section className="beta-panel">
            <div className="beta-form-grid">
              <label className="beta-form-field">Template name<input value={template.name}
                onChange={(e) => setTemplate({ ...template, name: e.target.value })} /></label>
              <label className="beta-form-field">Report title<input value={template.title}
                onChange={(e) => setTemplate({ ...template, title: e.target.value })} /></label>
            </div>
          </section>
          <section className="beta-panel">
            <div className="beta-section-heading"><div><h2>Complimentary report fields</h2>
              <p>Drag unlocked fields within their section. Locked identity and General Observations fields remain fixed. Publishing creates a new template version.</p>
            </div></div>
            <SortableFieldList fields={template.fields} onChange={setTemplateFields}
              emptyMessage="No complimentary report fields have been configured."
              renderField={(field) => (
                <>
                  <div className="beta-form-grid">
                    <label className="beta-form-field full">Question or field label<input value={field.label}
                      disabled={field.locked}
                      onChange={(e) => updateField(field.key, { label: e.target.value, reportLabel: e.target.value })} /></label>
                    <label className="beta-form-field">Section<input value={field.section || ""}
                      disabled={field.locked}
                      onChange={(e) => updateField(field.key, { section: e.target.value })} /></label>
                    <label className="beta-form-field">Type<select value={field.type} disabled={field.locked}
                      onChange={(e) => updateField(field.key, { type: e.target.value })}>
                      <option value="yes_no_issue">Opportunity with details/photos</option>
                      <option value="text">Short text</option>
                      <option value="textarea">Long text</option>
                    </select></label>
                  </div>
                  {field.key === "generalObservations" && <small>Maps to the PDF General Observations area, supports optional photos, and is the fallback when an AI summary is not rendered.</small>}
                  <label className="beta-template-checkbox"><input type="checkbox" checked={Boolean(field.required)}
                    disabled={field.locked}
                    onChange={(e) => updateField(field.key, { required: e.target.checked })} /> Required response</label>
                  {field.type === "yes_no_issue" && <label className="beta-template-checkbox">
                    <input type="checkbox" checked={Boolean(field.allowPhotos)} disabled={field.locked}
                      onChange={(e) => updateField(field.key, { allowPhotos: e.target.checked })} /> Allow opportunity photos
                  </label>}
                  {!field.locked && <button type="button" className="beta-button danger compact" onClick={() =>
                    setTemplateFields(template.fields.filter((item) => item.key !== field.key))
                  }>Remove from Complimentary Report</button>}
                </>
              )} />
            <div className="beta-template-add-field">
              <label className="beta-form-field">New field label
                <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
              </label>
              <label className="beta-form-field">Response type
                <select value={newType} onChange={(e) => setNewType(e.target.value)}>
                  <option value="yes_no_issue">Opportunity with details/photos</option>
                  <option value="text">Short text</option>
                  <option value="textarea">Long text</option>
                </select>
              </label>
              <button type="button" className="beta-button secondary" disabled={!newLabel.trim()} onClick={() => {
                setTemplateFields(insertBeforeGeneralObservations(
                  template.fields,
                  newField(newLabel.trim(), newType)
                ));
                setNewLabel("");
              }}>Add Field</button>
            </div>
          </section>
          <div className="beta-sticky-submit">
            <button type="button" className="beta-button" disabled={busy} onClick={saveTemplate}>
              {busy ? "Saving..." : "Publish template version"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
