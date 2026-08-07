import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../services/api";
import { orderFieldsByKeys } from "../services/formFieldOrdering";
import PageHeader from "./ui/PageHeader";
import SortableFieldList from "./ui/SortableFieldList";

function newField(label, type) {
  const base = label.toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 35) || "field";
  return {
    key: `property_${base}_${Date.now().toString(36)}`,
    label,
    reportLabel: label,
    type,
    section: "Property-Specific Checks",
    required: false,
    allowPhotos: type === "yes_no_issue",
    descriptionLabel: "Describe the issue",
  };
}

export default function PropertyFormSettings() {
  const { property } = useParams();
  const navigate = useNavigate();
  const [template, setTemplate] = useState(null);
  const [propertyDetails, setPropertyDetails] = useState(null);
  const [omittedFieldKeys, setOmittedFieldKeys] = useState([]);
  const [additionalFields, setAdditionalFields] = useState([]);
  const [fieldOrder, setFieldOrder] = useState([]);
  const [fieldLabel, setFieldLabel] = useState("");
  const [fieldType, setFieldType] = useState("yes_no_issue");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [detailsSaving, setDetailsSaving] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api.get(`/api/inspection-templates/properties/${encodeURIComponent(property)}/effective`)
      .then(async (data) => {
        setTemplate(data);
        setOmittedFieldKeys(data.override?.omittedFieldKeys || []);
        setAdditionalFields(data.override?.additionalFields || []);
        setFieldOrder(data.override?.fieldOrder || data.fields?.map((field) => field.key) || []);
        setPropertyDetails(await api.get(`/api/properties/${data.property._id}/details`));
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [property]);

  const geocodeAddress = async () => {
    if (!propertyDetails?.physicalAddress || geocoding) return;
    const mapboxToken = process.env.REACT_APP_MAPBOX_ACCESS_TOKEN;
    if (!mapboxToken) {
      setError("Address lookup is temporarily unavailable.");
      return;
    }
    setGeocoding(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(propertyDetails.physicalAddress)}.json?access_token=${mapboxToken}`
      );
      const data = await response.json();
      if (!response.ok || !data.features?.length) {
        throw new Error(data.message || "No location was found for that address.");
      }
      const [lng, lat] = data.features[0].center;
      setPropertyDetails((current) => ({ ...current, lat, lng }));
      setMessage("Location updated. Save property details to apply it.");
    } catch (err) {
      setError(err.message || "Unable to locate that address.");
    } finally {
      setGeocoding(false);
    }
  };

  const savePropertyDetails = async () => {
    if (!propertyDetails || detailsSaving) return;
    setDetailsSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await api.put(
        `/api/properties/${propertyDetails._id}/details`,
        propertyDetails
      );
      setPropertyDetails(result.property);
      setMessage("Property details updated.");
      if (result.property.name !== property) {
        navigate(`/property-form-settings/${encodeURIComponent(result.property.name)}`, { replace: true });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setDetailsSaving(false);
    }
  };

  const toggleOrganizationField = (field, included) => {
    if (field.locked) return;
    setOmittedFieldKeys((current) => included
      ? current.filter((key) => key !== field.key)
      : [...new Set([...current, field.key])]
    );
    setMessage("");
  };

  const addField = () => {
    const label = fieldLabel.trim();
    if (!label) return;
    const created = newField(label, fieldType);
    setAdditionalFields((current) => [...current, created]);
    setFieldOrder((current) => [...current, created.key]);
    setFieldLabel("");
    setMessage("");
  };

  const updateAdditionalField = (key, changes) => {
    setAdditionalFields((current) => current.map((field) =>
      field.key === key ? { ...field, ...changes } : field
    ));
  };

  const removeAdditionalField = (key) => {
    setAdditionalFields((current) => current.filter((field) => field.key !== key));
    setFieldOrder((current) => current.filter((fieldKey) => fieldKey !== key));
    setMessage("");
  };

  const allFields = template ? [
    ...template.organizationFields,
    ...additionalFields,
  ] : [];
  const orderedFields = orderFieldsByKeys(allFields, fieldOrder);

  const save = async () => {
    if (!template || saving) return;
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const updated = await api.put(
        `/api/inspection-templates/properties/${template.property._id}/override`,
        {
          omittedFieldKeys,
          additionalFields,
          fieldOrder: orderedFields.map((field) => field.key),
        }
      );
      setTemplate(updated);
      setOmittedFieldKeys(updated.override?.omittedFieldKeys || []);
      setAdditionalFields(updated.override?.additionalFields || []);
      setFieldOrder(updated.override?.fieldOrder || updated.fields?.map((field) => field.key) || []);
      setMessage("Property inspection form updated.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="beta-page">
      <main className="beta-page-shell">
        <PageHeader
          onBack={() => navigate("/dashboard")}
          eyebrow="Managed property settings"
          title={propertyDetails?.name || property}
          subtitle="Update property information and customize the inspection form."
        />

        {loading && <div className="beta-empty-state">Loading form settings…</div>}
        {error && <p className="beta-alert error" role="alert">{error}</p>}
        {message && <p className="beta-alert success" role="status">{message}</p>}

        {!loading && template && (
          <>
            <section className="beta-panel">
              <div className="beta-section-heading">
                <div>
                  <h2>Property details</h2>
                  <p>Changes apply to this managed property. Renaming it also updates its existing in-app records.</p>
                </div>
              </div>
              <div className="beta-form-grid">
                <label className="beta-form-field">Property name
                  <input value={propertyDetails?.name || ""}
                    onChange={(event) => setPropertyDetails({ ...propertyDetails, name: event.target.value })} />
                </label>
                <label className="beta-form-field">Property code
                  <input value={propertyDetails?.propertyCode || ""}
                    onChange={(event) => setPropertyDetails({ ...propertyDetails, propertyCode: event.target.value })} />
                </label>
                <label className="beta-form-field full">Physical property address
                  <input value={propertyDetails?.physicalAddress || ""}
                    onChange={(event) => setPropertyDetails({
                      ...propertyDetails,
                      physicalAddress: event.target.value,
                      lat: "",
                      lng: "",
                    })} />
                </label>
                <label className="beta-form-field">Latitude
                  <input type="number" step="any" value={propertyDetails?.lat ?? ""}
                    onChange={(event) => setPropertyDetails({ ...propertyDetails, lat: event.target.value })} />
                </label>
                <label className="beta-form-field">Longitude
                  <input type="number" step="any" value={propertyDetails?.lng ?? ""}
                    onChange={(event) => setPropertyDetails({ ...propertyDetails, lng: event.target.value })} />
                </label>
              </div>
              <div className="beta-card-actions">
                <button type="button" className="beta-button secondary" disabled={geocoding || detailsSaving}
                  onClick={geocodeAddress}>
                  {geocoding ? "Locating…" : "Re-locate from Address"}
                </button>
                <button type="button" className="beta-button" disabled={detailsSaving || geocoding}
                  onClick={savePropertyDetails}>
                  {detailsSaving ? "Saving…" : "Save Property Details"}
                </button>
              </div>
            </section>

            <section className="beta-panel">
              <div className="beta-section-heading">
                <div>
                  <h2>Inspection form fields</h2>
                  <p>Enable organization fields and drag unlocked fields within their section. Disabled fields retain their position.</p>
                </div>
              </div>

              <div className="beta-template-add-field">
                <label className="beta-form-field">Field label
                  <input value={fieldLabel} onChange={(event) => setFieldLabel(event.target.value)}
                    placeholder="Example: Is the loading dock secure?" />
                </label>
                <label className="beta-form-field">Response type
                  <select value={fieldType} onChange={(event) => setFieldType(event.target.value)}>
                    <option value="yes_no_issue">Yes / No with issue details</option>
                    <option value="text">Short text</option>
                    <option value="textarea">Long text</option>
                  </select>
                </label>
                <button type="button" className="beta-button secondary" disabled={!fieldLabel.trim()} onClick={addField}>
                  Add Field
                </button>
              </div>

              <SortableFieldList fields={orderedFields}
                className="beta-integrated-field-list"
                onChange={(nextFields) => setFieldOrder(nextFields.map((field) => field.key))}
                emptyMessage="No inspection fields have been configured."
                renderField={(field) => {
                  const propertySpecific = additionalFields.some((item) => item.key === field.key);
                  const included = propertySpecific || field.locked || !omittedFieldKeys.includes(field.key);
                  if (!propertySpecific) {
                    return (
                      <label className={`beta-integrated-field-toggle${included ? "" : " is-disabled"}`}>
                        <input type="checkbox" checked={included} disabled={field.locked}
                          onChange={(event) => toggleOrganizationField(field, event.target.checked)} />
                        <span>
                          <strong>{field.label}</strong>
                          <small>
                            {field.locked
                              ? "Organization field · locked and always included"
                              : `Organization field · ${included ? "included" : "not included"}`}
                          </small>
                        </span>
                      </label>
                    );
                  }
                  return (
                    <div className="beta-integrated-field-editor">
                      <div className="beta-form-grid">
                        <label className="beta-form-field">Label
                          <input value={field.label}
                            onChange={(event) => updateAdditionalField(field.key, {
                              label: event.target.value,
                              reportLabel: event.target.value,
                            })} />
                        </label>
                        <label className="beta-form-field">Section
                          <input value={field.section || ""}
                            onChange={(event) => updateAdditionalField(field.key, { section: event.target.value })} />
                        </label>
                      </div>
                      <div className="beta-integrated-field-options">
                        <span className="beta-field-state">Property-specific · included</span>
                        <label className="beta-template-checkbox">
                          <input type="checkbox" checked={Boolean(field.required)}
                            onChange={(event) => updateAdditionalField(field.key, { required: event.target.checked })} />
                          Required response
                        </label>
                        {field.type === "yes_no_issue" && (
                          <label className="beta-template-checkbox">
                            <input type="checkbox" checked={Boolean(field.allowPhotos)}
                              onChange={(event) => updateAdditionalField(field.key, { allowPhotos: event.target.checked })} />
                            Allow issue photos
                          </label>
                        )}
                      </div>
                      <button type="button" className="beta-button danger compact"
                        onClick={() => removeAdditionalField(field.key)}>
                        Remove Field
                      </button>
                    </div>
                  );
                }} />
            </section>

            <div className="beta-sticky-submit">
              <button className="beta-button" type="button" disabled={saving} onClick={save}>
                {saving ? "Saving…" : "Save Form Settings"}
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
