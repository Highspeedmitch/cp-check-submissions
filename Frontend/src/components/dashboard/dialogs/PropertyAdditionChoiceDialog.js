import React, { useEffect, useRef } from "react";

export default function PropertyAdditionChoiceDialog({ onSingle, onBulk, onClose }) {
  const singleButtonRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    singleButtonRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, []);

  return (
    <div className="beta-dialog-overlay" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="beta-dialog beta-property-addition-dialog" role="dialog" aria-modal="true"
        aria-labelledby="property-addition-choice-title" aria-describedby="property-addition-choice-description">
        <div className="beta-dialog-header">
          <div>
            <span className="beta-eyebrow">Property onboarding</span>
            <h2 id="property-addition-choice-title">How would you like to add properties?</h2>
          </div>
          <button type="button" className="beta-dialog-close" aria-label="Close property onboarding options"
            onClick={onClose}>×</button>
        </div>
        <p id="property-addition-choice-description" className="beta-dialog-copy">
          Choose a single-property setup or prepare a licensed CSV import.
        </p>
        <div className="beta-property-addition-options">
          <button ref={singleButtonRef} type="button" className="beta-property-addition-option" onClick={onSingle}>
            <strong>Single property</strong>
            <span>Use the existing guided form for one property.</span>
          </button>
          <button type="button" className="beta-property-addition-option" onClick={onBulk}>
            <strong>Bulk load</strong>
            <span>Upload and validate a CSV for multiple properties.</span>
          </button>
        </div>
        <p className="beta-field-help">
          Your organization passkey is verified immediately before data is created.
        </p>
      </section>
    </div>
  );
}
