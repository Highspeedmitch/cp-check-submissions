import React from "react";

function RemovePropertyDialog({
  properties,
  propertyName,
  passkey,
  busy,
  onPropertyChange,
  onPasskeyChange,
  onConfirm,
  onClose,
}) {
  return (
    <div className="beta-dialog-overlay">
      <section className="beta-dialog" role="dialog" aria-modal="true" aria-labelledby="remove-property-title">
        <div className="beta-dialog-header">
          <div>
            <span className="beta-eyebrow">Property administration</span>
            <h2 id="remove-property-title">Remove Property</h2>
          </div>
          <button type="button" className="beta-dialog-close" aria-label="Close remove property dialog" onClick={onClose}>×</button>
        </div>
        <p className="beta-dialog-copy">Select the property you wish to remove.</p>
        <label className="beta-field">
          Property
          <select value={propertyName} onChange={(event) => onPropertyChange(event.target.value)}>
            <option value="">-- Select Property --</option>
            {properties.map((property) => (
              <option key={property._id || property.name} value={property.name}>
                {property.name}
              </option>
            ))}
          </select>
        </label>
        <label className="beta-field">
          Removal passkey
          <input
            type="password"
            value={passkey}
            onChange={(event) => onPasskeyChange(event.target.value)}
          />
        </label>
        <div className="beta-dialog-actions">
          <button type="button" onClick={onClose} className="beta-button secondary" disabled={busy}>
            Cancel
          </button>
          <button type="button" onClick={onConfirm} className="beta-button danger" disabled={busy}>
            {busy ? "Removing..." : "Confirm Removal"}
          </button>
        </div>
      </section>
    </div>
  );
}

export default RemovePropertyDialog;
