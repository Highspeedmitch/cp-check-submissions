import React, { useEffect, useRef, useState } from "react";

function AdminVerificationDialog({
  onVerify,
  onClose,
  title = "Add a new property",
  description = "Enter your organization passkey to continue to property setup.",
  continueLabel = "Continue",
}) {
  const [passkey, setPasskey] = useState("");
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const inputRef = useRef(null);
  const verifyingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    inputRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !verifyingRef.current) onCloseRef.current();
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
    if (!passkey.trim() || verifying) return;

    verifyingRef.current = true;
    setVerifying(true);
    setError("");
    try {
      const valid = await onVerify(passkey);
      if (!valid) setError("That passkey is not valid. Please try again.");
    } catch (verifyError) {
      console.error("Error verifying passkey:", verifyError);
      setError(verifyError.message || "We could not verify the passkey. Please try again.");
    } finally {
      verifyingRef.current = false;
      setVerifying(false);
    }
  };

  return (
    <div
      className="beta-dialog-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !verifyingRef.current) onClose();
      }}
    >
      <form
        className="beta-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-verification-title"
        aria-describedby="admin-verification-description"
        onSubmit={handleSubmit}
      >
        <div className="beta-dialog-header">
          <div>
            <span className="beta-eyebrow">Admin verification</span>
            <h2 id="admin-verification-title">{title}</h2>
          </div>
          <button
            type="button"
            className="beta-dialog-close"
            aria-label="Close passkey dialog"
            onClick={onClose}
            disabled={verifying}
          >
            ×
          </button>
        </div>
        <p id="admin-verification-description" className="beta-dialog-copy">
          {description}
        </p>
        <label className="beta-field" htmlFor="admin-verification-passkey">
          <span>Organization passkey</span>
          <input
            ref={inputRef}
            id="admin-verification-passkey"
            type="password"
            autoComplete="current-password"
            value={passkey}
            onChange={(event) => {
              setPasskey(event.target.value);
              setError("");
            }}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "passkey-error" : undefined}
            disabled={verifying}
          />
        </label>
        {error && <p id="passkey-error" className="beta-dialog-error" role="alert">{error}</p>}
        <div className="beta-dialog-actions">
          <button type="button" className="beta-button secondary" onClick={onClose} disabled={verifying}>
            Cancel
          </button>
          <button type="submit" className="beta-button" disabled={!passkey.trim() || verifying}>
            {verifying ? "Verifying…" : continueLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

export default AdminVerificationDialog;
