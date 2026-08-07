import React from "react";

function InspectionLauncherDialog({
  propertyName,
  onAccessInfo,
  onSubmitForm,
  onClose,
}) {
  return (
    <div className="beta-dialog-overlay">
      <section className="beta-dialog" role="dialog" aria-modal="true" aria-labelledby="inspection-action-title">
        <div className="beta-dialog-header">
          <div>
            <span className="beta-eyebrow">Property workflow</span>
            <h2 id="inspection-action-title">Select an Action</h2>
          </div>
          <button type="button" className="beta-dialog-close" aria-label="Close inspection action dialog" onClick={onClose}>×</button>
        </div>
        <p className="beta-dialog-copy">
          What would you like to do for <strong>{propertyName}</strong>?
        </p>
        <div className="beta-dialog-actions">
          <button type="button" className="beta-button secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="beta-button secondary" onClick={onAccessInfo}>Access / Info</button>
          <button type="button" className="beta-button" onClick={onSubmitForm}>Submit Form</button>
        </div>
      </section>
    </div>
  );
}

export default InspectionLauncherDialog;
