import React, { useEffect, useRef, useState } from "react";

export default function ManualActivationDialog({ activation, onClose }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const linkRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    linkRef.current?.focus();
    linkRef.current?.select();
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

  async function copyLink() {
    setCopied(false);
    setCopyError("");
    try {
      await navigator.clipboard.writeText(activation.setupUrl);
      setCopied(true);
    } catch (_error) {
      linkRef.current?.focus();
      linkRef.current?.select();
      setCopyError("Automatic copy is unavailable. The full link is selected so you can copy it manually.");
    }
  }

  return (
    <div className="beta-dialog-overlay" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="beta-dialog" role="dialog" aria-modal="true"
        aria-labelledby="manual-activation-title" aria-describedby="manual-activation-description">
        <div className="beta-dialog-header">
          <div>
            <span className="beta-eyebrow">One-time handoff</span>
            <h2 id="manual-activation-title">Manual activation ready</h2>
          </div>
          <button type="button" className="beta-dialog-close" aria-label="Close manual activation dialog"
            onClick={onClose}>×</button>
        </div>
        <p id="manual-activation-description" className="beta-dialog-copy">
          Give this secure setup link only to <strong>{activation.email}</strong>. They will choose their own password before the account becomes usable.
        </p>
        <div className="beta-dialog-note beta-manual-activation-warning">
          <strong>This link is shown only now.</strong>
          <p>It expires {new Date(activation.expiresAt).toLocaleString()}. Generating another setup link invalidates this one.</p>
        </div>
        <label className="beta-field" htmlFor="manual-activation-link">
          <span>One-time setup link</span>
          <input ref={linkRef} id="manual-activation-link" type="text" readOnly
            value={activation.setupUrl} onFocus={(event) => event.target.select()} />
        </label>
        {copied && <p className="beta-alert success" role="status">Setup link copied.</p>}
        {copyError && <p className="beta-alert notice" role="status">{copyError}</p>}
        <div className="beta-dialog-actions">
          <button type="button" className="beta-button secondary" onClick={onClose}>Done</button>
          <button type="button" className="beta-button" onClick={copyLink}>Copy setup link</button>
        </div>
      </section>
    </div>
  );
}
