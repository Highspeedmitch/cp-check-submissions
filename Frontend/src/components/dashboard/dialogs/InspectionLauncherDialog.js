import React from "react";

function InspectionLauncherDialog({
  propertyName,
  onAccessInfo,
  onSubmitForm,
  onClose,
}) {
  return (
    <div className="modal-overlay">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="inspection-action-title">
        <h2 id="inspection-action-title">Select an Action</h2>
        <p>
          What would you like to do for <strong>{propertyName}</strong>?
        </p>
        <button className="modal-btn" onClick={onAccessInfo}>
          Access / Info
        </button>
        <button className="modal-btn" onClick={onSubmitForm}>
          Submit Form
        </button>
        <button className="modal-close" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export default InspectionLauncherDialog;
