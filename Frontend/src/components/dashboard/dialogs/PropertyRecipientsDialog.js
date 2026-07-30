import React, { useEffect, useRef, useState } from "react";

function PropertyRecipientsDialog({ property, onSave, onClose }) {
  const [draft, setDraft] = useState(() => (property.emails || []).join("\n"));
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const inputRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    inputRef.current?.focus();

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

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (savingRef.current) return;

    const emails = draft
      .split(/[\n,;]+/)
      .map((email) => email.trim())
      .filter(Boolean);

    savingRef.current = true;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const updatedEmails = await onSave(emails);
      setDraft(updatedEmails.join("\n"));
      setMessage("Inspection recipients updated.");
    } catch (saveError) {
      setError(saveError.message || "Unable to update inspection recipients.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <div
      className="beta-dialog-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !savingRef.current) onClose();
      }}
    >
      <form
        className="beta-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="property-email-title"
        aria-describedby="property-email-description"
        onSubmit={handleSubmit}
      >
        <div className="beta-dialog-header">
          <div>
            <span className="beta-eyebrow">Inspection delivery</span>
            <h2 id="property-email-title">Manage recipient emails</h2>
          </div>
          <button
            type="button"
            className="beta-dialog-close"
            aria-label="Close recipient email dialog"
            onClick={onClose}
            disabled={saving}
          >
            ×
          </button>
        </div>
        <p id="property-email-description" className="beta-dialog-copy">
          Inspection reports for <strong>{property.name}</strong> will be sent to
          these addresses. Enter one address per line, or separate them with commas.
        </p>
        <label className="beta-field" htmlFor="property-recipient-emails">
          <span>Recipient emails</span>
          <textarea
            ref={inputRef}
            id="property-recipient-emails"
            rows="6"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setError("");
              setMessage("");
            }}
            placeholder={"manager@example.com\noperations@example.com"}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "property-email-error" : undefined}
            disabled={saving}
          />
        </label>
        <p className="beta-dialog-note">
          Leaving this empty removes all property-specific inspection recipients.
        </p>
        {error && <p id="property-email-error" className="beta-alert error" role="alert">{error}</p>}
        {message && <p className="beta-alert success" role="status">{message}</p>}
        <div className="beta-dialog-actions">
          <button type="button" className="beta-button secondary" onClick={onClose} disabled={saving}>
            Close
          </button>
          <button type="submit" className="beta-button" disabled={saving}>
            {saving ? "Saving…" : "Save Emails"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default PropertyRecipientsDialog;
