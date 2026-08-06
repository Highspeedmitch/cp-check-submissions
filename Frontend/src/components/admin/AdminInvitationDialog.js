import React, { useEffect, useRef, useState } from "react";

function parseEmails(value) {
  return [...new Set(String(value || "")
    .split(/[\n,;]+/)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean))];
}

export default function AdminInvitationDialog({ adminSeats, onClose, onSubmit }) {
  const [emailsDraft, setEmailsDraft] = useState("");
  const [passkey, setPasskey] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const emailInputRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    emailInputRef.current?.focus();
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

  async function submit(event) {
    event.preventDefault();
    if (savingRef.current) return;
    const emails = parseEmails(emailsDraft);
    if (!emails.length) {
      setError("Enter at least one administrator email address.");
      return;
    }
    if (!adminSeats.unmetered && emails.length > adminSeats.remaining) {
      setError(`Only ${adminSeats.remaining} administrator ${adminSeats.remaining === 1 ? "seat is" : "seats are"} available.`);
      return;
    }
    if (!passkey) {
      setError("Enter the organization's administrative action passkey.");
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      await onSubmit({ emails, passkey });
    } catch (submitError) {
      setError(submitError.message || "Unable to invite the administrator.");
    } finally {
      setPasskey("");
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="beta-dialog-overlay" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !savingRef.current) onClose();
    }}>
      <form className="beta-dialog" role="dialog" aria-modal="true"
        aria-labelledby="admin-invitation-title" aria-describedby="admin-invitation-description"
        onSubmit={submit}>
        <div className="beta-dialog-header">
          <div>
            <span className="beta-eyebrow">Organization administration</span>
            <h2 id="admin-invitation-title">Invite an administrator</h2>
          </div>
          <button type="button" className="beta-dialog-close" aria-label="Close administrator invitation dialog"
            onClick={onClose} disabled={saving}>×</button>
        </div>
        <p id="admin-invitation-description" className="beta-dialog-copy">
          New administrators receive full organization access. Pending invitations reserve an administrator seat.
        </p>
        <div className="beta-dialog-note">
          <strong>{adminSeats.unmetered ? "Managed service" : `${adminSeats.remaining} of ${adminSeats.limit} seats available`}</strong>
          <p>{adminSeats.active} active · {adminSeats.pending} pending</p>
        </div>
        <label className="beta-field" htmlFor="administrator-invitation-emails">
          <span>Administrator email addresses</span>
          <textarea ref={emailInputRef} id="administrator-invitation-emails" rows="4"
            value={emailsDraft} disabled={saving}
            placeholder={"administrator@example.com\nsecond.admin@example.com"}
            onChange={(event) => { setEmailsDraft(event.target.value); setError(""); }} />
          <small>Enter one address per line, or separate addresses with commas.</small>
        </label>
        <label className="beta-field" htmlFor="administrator-invitation-passkey">
          <span>Administrative action passkey</span>
          <input id="administrator-invitation-passkey" type="password" autoComplete="off"
            value={passkey} disabled={saving}
            onChange={(event) => { setPasskey(event.target.value); setError(""); }} />
        </label>
        {error && <p className="beta-alert error" role="alert">{error}</p>}
        <div className="beta-dialog-actions">
          <button type="button" className="beta-button secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="beta-button" disabled={saving}>
            {saving ? "Sending…" : "Send administrator invitation"}
          </button>
        </div>
      </form>
    </div>
  );
}

export { parseEmails };
