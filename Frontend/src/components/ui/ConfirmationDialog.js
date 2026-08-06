import React, { useEffect, useRef, useState } from "react";

export default function ConfirmationDialog({
  title,
  description,
  confirmLabel = "Confirm",
  eyebrow = "Confirm action",
  danger = false,
  onClose,
  onConfirm,
}) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const confirmRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    confirmRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !savingRef.current) onCloseRef.current();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, []);

  async function confirm() {
    if (savingRef.current) return;
    let confirmed = false;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      await onConfirm();
      confirmed = true;
    } catch (confirmError) {
      setError(confirmError.message || "Unable to complete this action.");
    } finally {
      savingRef.current = false;
      setSaving(false);
      if (confirmed) onCloseRef.current();
    }
  }

  return (
    <div className="beta-dialog-overlay" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !savingRef.current) onClose();
    }}>
      <section className="beta-dialog" role="dialog" aria-modal="true"
        aria-labelledby="confirmation-dialog-title" aria-describedby="confirmation-dialog-description">
        <div className="beta-dialog-header">
          <div>
            <span className="beta-eyebrow">{eyebrow}</span>
            <h2 id="confirmation-dialog-title">{title}</h2>
          </div>
          <button type="button" className="beta-dialog-close" aria-label="Close confirmation dialog"
            onClick={onClose} disabled={saving}>×</button>
        </div>
        <p id="confirmation-dialog-description" className="beta-dialog-copy">{description}</p>
        {error && <p className="beta-dialog-error" role="alert">{error}</p>}
        <div className="beta-dialog-actions">
          <button type="button" className="beta-button secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button ref={confirmRef} type="button" className={`beta-button${danger ? " danger" : ""}`}
            onClick={confirm} disabled={saving}>
            {saving ? "Working…" : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
