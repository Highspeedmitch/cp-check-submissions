import React, { useEffect, useMemo, useState } from "react";
import { api } from "../services/api";
import { appendOptimizedPhotos, mergePhotoSelection } from "../services/photoUpload";

function PhotoPreview({ file, onRemove }) {
  const previewUrl = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(previewUrl), [previewUrl]);
  return (
    <div style={{ width: 92 }}>
      <img src={previewUrl} alt={file.name || "Selected photo"}
        style={{ width: 92, height: 72, objectFit: "cover", borderRadius: 6 }} />
      <button type="button" className="beta-text-button" onClick={onRemove}>Remove</button>
    </div>
  );
}

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
  const addPhotos = (fieldKey, fileList) => {
    const selectedFiles = Array.from(fileList || []);
    if (!selectedFiles.length) return;
    setPhotos((current) => ({
      ...current,
      [fieldKey]: mergePhotoSelection(current[fieldKey], selectedFiles),
    }));
  };
  const updateField = (key, changes) => setTemplate((current) => ({
    ...current,
    fields: current.fields.map((field) => field.key === key ? { ...field, ...changes } : field),
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
      setResponses({}); setPhotos({});
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

  if (!template) return <section className="beta-panel"><p>Loading prospect assessments...</p></section>;
  return (
    <section className="beta-section">
      <div className="beta-section-heading">
        <div><h2>Prospect assessments</h2><p>Standalone exterior reports are automatically purged after 30 days.</p></div>
        <div>
          <button className="beta-button secondary compact" onClick={() => setView("repository")}>Repository</button>{" "}
          <button className="beta-button secondary compact" onClick={() => setView("create")}>New assessment</button>{" "}
          <button className="beta-button secondary compact" onClick={() => setView("template")}>Template</button>
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
              <button className="beta-button compact" onClick={() => download(item._id)}>Download PDF</button>{" "}
              <button className="beta-button danger compact" onClick={() => remove(item._id)}>Delete</button>
            </article>
          ))}
        </div>
      )}

      {view === "create" && (
        <form className="beta-panel" onSubmit={createAssessment}>
          <h2>{template.title}</h2>
          {(template.fields || []).map((field) => (
            <div className="beta-form-field" key={field.key}>
              <label>{field.label}{field.required ? " *" : ""}</label>
              {field.type === "textarea" && <textarea required={field.required} value={responses[field.key] || ""}
                onChange={(event) => setResponse(field.key, event.target.value)} />}
              {field.type === "text" && <input required={field.required} value={responses[field.key] || ""}
                onChange={(event) => setResponse(field.key, event.target.value)} />}
              {field.type === "yes_no_issue" && <>
                <select required={field.required} value={responses[field.key] || ""}
                  onChange={(event) => setResponse(field.key, event.target.value)}>
                  <option value="">Select...</option><option value="yes">Opportunity observed</option><option value="no">No issue observed</option>
                </select>
                {responses[field.key] === "yes" && <>
                  <textarea placeholder={field.descriptionLabel || "Describe the opportunity"}
                    value={responses[`${field.key}Description`] || ""}
                    onChange={(event) => setResponse(`${field.key}Description`, event.target.value)} />
                  {field.allowPhotos && <>
                    <strong>Photos for: {field.reportLabel || field.label}</strong>
                    <input key={`${field.key}-${photos[field.key]?.length || 0}`} type="file" accept="image/*" multiple
                      onChange={(event) => addPhotos(field.key, event.currentTarget.files)} />
                    <small>{photos[field.key]?.length || 0} of 6 photos attached. Select again to add more.</small>
                    {photos[field.key]?.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                      {photos[field.key].map((file, index) => (
                        <PhotoPreview key={`${file.name}-${file.lastModified}-${index}`} file={file}
                          onRemove={() => setPhotos((current) => ({
                            ...current,
                            [field.key]: current[field.key].filter((_item, photoIndex) => photoIndex !== index),
                          }))} />
                      ))}
                    </div>}
                    {photos[field.key]?.length > 0 && <button type="button" className="beta-text-button"
                      onClick={() => setPhotos((current) => ({ ...current, [field.key]: [] }))}>
                      Clear section photos
                    </button>}
                  </>}
                </>}
              </>}
            </div>
          ))}
          <button className="beta-button" disabled={busy}>{busy ? "Generating PDF..." : "Generate assessment PDF"}</button>
        </form>
      )}

      {view === "template" && (
        <div className="beta-panel">
          <div className="beta-form-grid">
            <label className="beta-form-field">Template name<input value={template.name}
              onChange={(e) => setTemplate({ ...template, name: e.target.value })} /></label>
            <label className="beta-form-field">Report title<input value={template.title}
              onChange={(e) => setTemplate({ ...template, title: e.target.value })} /></label>
          </div>
          {template.fields.map((field) => (
            <article className="beta-settings-card" key={field.key}>
              <label className="beta-form-field">Label<input value={field.label}
                onChange={(e) => updateField(field.key, { label: e.target.value, reportLabel: e.target.value })} /></label>
              <label className="beta-template-checkbox"><input type="checkbox" checked={field.required}
                onChange={(e) => updateField(field.key, { required: e.target.checked })} /> Required</label>
              {!field.locked && <button className="beta-button danger compact" onClick={() =>
                setTemplate({ ...template, fields: template.fields.filter((item) => item.key !== field.key) })
              }>Remove</button>}
            </article>
          ))}
          <div className="beta-template-add-field">
            <input placeholder="New field label" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
            <select value={newType} onChange={(e) => setNewType(e.target.value)}>
              <option value="yes_no_issue">Opportunity with details/photos</option>
              <option value="text">Short text</option><option value="textarea">Long text</option>
            </select>
            <button className="beta-button secondary" disabled={!newLabel.trim()} onClick={() => {
              setTemplate({ ...template, fields: [...template.fields, newField(newLabel.trim(), newType)] });
              setNewLabel("");
            }}>Add field</button>
          </div>
          <button className="beta-button" disabled={busy} onClick={saveTemplate}>{busy ? "Saving..." : "Publish template version"}</button>
        </div>
      )}
    </section>
  );
}
