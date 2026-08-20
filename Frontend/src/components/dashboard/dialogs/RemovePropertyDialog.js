import React from "react";

function RemovePropertyDialog({
  properties,
  propertyId,
  passkey,
  busy,
  impact,
  impactLoading,
  error,
  onPropertyChange,
  onPasskeyChange,
  onConfirm,
  onClose,
  requiresPasskey = true,
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
        <p className="beta-dialog-copy">
          Select a property to check for linked routes and records. Removal is permanent.
        </p>
        <label className="beta-field">
          Property
          <select
            value={propertyId}
            onChange={(event) => onPropertyChange(event.target.value)}
            disabled={busy}
          >
            <option value="">-- Select Property --</option>
            {properties.map((property) => (
              <option key={property._id || property.name} value={property._id}>
                {property.name}
              </option>
            ))}
          </select>
        </label>
        {impactLoading && (
          <p className="beta-dialog-note" role="status">Checking linked records…</p>
        )}
        {!impactLoading && impact?.canRemove && (
          <p className="beta-alert success" role="status">
            No linked routes or records were found. This property can be removed.
          </p>
        )}
        {!impactLoading && impact && !impact.canRemove && (
          <div className="beta-alert notice" role="alert">
            <strong>This property cannot be removed yet.</strong>
            <ul className="beta-removal-blockers">
              {impact.blockers.map((blocker) => (
                <li key={blocker.code}>
                  {blocker.count} {blocker.label}: {blocker.message}
                </li>
              ))}
            </ul>
          </div>
        )}
        {requiresPasskey ? <label className="beta-field">
          Removal passkey
          <input
            type="password"
            value={passkey}
            onChange={(event) => onPasskeyChange(event.target.value)}
            autoComplete="current-password"
            disabled={busy}
          />
        </label> : (
          <p className="beta-dialog-note">
            Your protected, audited Admin View session will authorize this action.
          </p>
        )}
        {error && <p className="beta-dialog-error" role="alert">{error}</p>}
        <div className="beta-dialog-actions">
          <button type="button" onClick={onClose} className="beta-button secondary" disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="beta-button danger"
            disabled={busy || impactLoading || !propertyId || !impact?.canRemove || (requiresPasskey && !passkey)}
          >
            {busy ? "Removing..." : "Confirm Removal"}
          </button>
        </div>
      </section>
    </div>
  );
}

export default RemovePropertyDialog;
