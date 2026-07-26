import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";
import PageHeader from "./ui/PageHeader";

function createField(label, type) {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 35) || "field";
  return {
    key: `org_${base}_${Date.now().toString(36)}`,
    label,
    reportLabel: label,
    type,
    section: type === "yes_no_issue" ? "Property Condition" : "Additional Observations",
    required: false,
    allowPhotos: type === "yes_no_issue",
    descriptionLabel: "Describe the issue",
    locked: false,
  };
}

export default function OrganizationFormSettings() {
  const navigate = useNavigate();
  const [template, setTemplate] = useState(null);
  const [fields, setFields] = useState([]);
  const [label, setLabel] = useState("");
  const [type, setType] = useState("yes_no_issue");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/api/inspection-templates/organization")
      .then((data) => {
        setTemplate(data);
        setFields(data.fields || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const updateField = (key, changes) => setFields((current) => current.map((field) =>
    field.key === key ? { ...field, ...changes } : field
  ));

  const save = async () => {
    if (!template || saving) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const updated = await api.put("/api/inspection-templates/organization", {
        name: template.name,
        title: template.title,
        fields,
      });
      setTemplate(updated);
      setFields(updated.fields || []);
      setMessage(`Organization form template version ${updated.version} is now active.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="beta-page">
      <main className="beta-page-shell">
        <PageHeader onBack={() => navigate("/dashboard")} eyebrow="Organization settings"
          title="Inspection Form Template"
          subtitle="Define the default commercial inspection form inherited by every property." />
        {loading && <div className="beta-empty-state">Loading organization template…</div>}
        {error && <p className="beta-alert error">{error}</p>}
        {message && <p className="beta-alert success">{message}</p>}
        {!loading && template && (
          <>
            <section className="beta-panel">
              <div className="beta-form-grid">
                <label className="beta-form-field">Template name
                  <input value={template.name} onChange={(event) => setTemplate({ ...template, name: event.target.value })} />
                </label>
                <label className="beta-form-field">Form title
                  <input value={template.title} onChange={(event) => setTemplate({ ...template, title: event.target.value })} />
                </label>
              </div>
            </section>
            <section className="beta-panel">
              <div className="beta-section-heading"><div><h2>Default fields</h2>
                <p>Changes create a new template version. Property overrides remain separate.</p></div></div>
              <div className="beta-template-custom-fields">
                {fields.map((field) => (
                  <article className="beta-settings-card" key={field.key}>
                    <div className="beta-form-grid">
                      <label className="beta-form-field full">Question or field label
                        <input value={field.label} onChange={(event) => updateField(field.key, {
                          label: event.target.value,
                          reportLabel: event.target.value,
                        })} />
                      </label>
                      <label className="beta-form-field">Section
                        <input value={field.section || ""} onChange={(event) => updateField(field.key, { section: event.target.value })} />
                      </label>
                      <label className="beta-form-field">Type
                        <select value={field.type} disabled={field.locked}
                          onChange={(event) => updateField(field.key, { type: event.target.value })}>
                          <option value="yes_no_issue">Yes / No with issue details</option>
                          <option value="text">Short text</option>
                          <option value="textarea">Long text</option>
                        </select>
                      </label>
                    </div>
                    <label className="beta-template-checkbox">
                      <input type="checkbox" checked={Boolean(field.required)}
                        onChange={(event) => updateField(field.key, { required: event.target.checked })} />
                      Required response
                    </label>
                    {field.type === "yes_no_issue" && <label className="beta-template-checkbox">
                      <input type="checkbox" checked={Boolean(field.allowPhotos)}
                        onChange={(event) => updateField(field.key, { allowPhotos: event.target.checked })} />
                      Allow issue photos
                    </label>}
                    {!field.locked && <button type="button" className="beta-button danger compact"
                      onClick={() => setFields((current) => current.filter((item) => item.key !== field.key))}>
                      Remove from Organization Form
                    </button>}
                  </article>
                ))}
              </div>
              <div className="beta-template-add-field">
                <label className="beta-form-field">New field label
                  <input value={label} onChange={(event) => setLabel(event.target.value)} />
                </label>
                <label className="beta-form-field">Response type
                  <select value={type} onChange={(event) => setType(event.target.value)}>
                    <option value="yes_no_issue">Yes / No with issue details</option>
                    <option value="text">Short text</option>
                    <option value="textarea">Long text</option>
                  </select>
                </label>
                <button type="button" className="beta-button secondary" disabled={!label.trim()} onClick={() => {
                  setFields((current) => [...current, createField(label.trim(), type)]);
                  setLabel("");
                }}>Add Field</button>
              </div>
            </section>
            <div className="beta-sticky-submit">
              <button type="button" className="beta-button" disabled={saving} onClick={save}>
                {saving ? "Publishing…" : "Publish New Template Version"}
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
