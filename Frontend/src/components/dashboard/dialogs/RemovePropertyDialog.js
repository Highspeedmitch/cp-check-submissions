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
    <div className="modal-overlay">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="remove-property-title">
        <h2 id="remove-property-title">Remove Property</h2>
        <p>Select the property you wish to remove:</p>
        <select value={propertyName} onChange={(event) => onPropertyChange(event.target.value)}>
          <option value="">-- Select Property --</option>
          {properties.map((property) => (
            <option key={property._id || property.name} value={property.name}>
              {property.name}
            </option>
          ))}
        </select>
        <label style={{ marginTop: "1rem", display: "block" }}>
          Enter Removal Passkey:
          <input
            type="password"
            value={passkey}
            onChange={(event) => onPasskeyChange(event.target.value)}
          />
        </label>
        <div style={{ marginTop: "10px" }}>
          <button onClick={onConfirm} className="payments-button" disabled={busy}>
            {busy ? "Removing…" : "Confirm Removal"}
          </button>
          <button onClick={onClose} className="payments-button" disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default RemovePropertyDialog;
