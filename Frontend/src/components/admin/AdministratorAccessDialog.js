import React, { useEffect, useRef, useState } from "react";
import {
  CUSTOMER_ENGAGEMENT_OPTIONS,
  ORGANIZATION_ROLE_OPTIONS,
  roleRequiresCustomerEngagement,
} from "../../services/organizationUsers";

export default function AdministratorAccessDialog({
  administrator,
  adminSeats,
  properties = [],
  onClose,
  onSubmit,
}) {
  const [disposition, setDisposition] = useState("archive");
  const [targetRole, setTargetRole] = useState("user");
  const [engagementType, setEngagementType] = useState("customer_employee");
  const [propertyIds, setPropertyIds] = useState([]);
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [code, setCode] = useState("");
  const [passkey, setPasskey] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const outcomeRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    outcomeRef.current?.focus();
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

  function changeTargetRole(nextRole) {
    setTargetRole(nextRole);
    if (!["property_manager", "client"].includes(nextRole)) setPropertyIds([]);
    if (!roleRequiresCustomerEngagement(nextRole)) setEngagementType("");
    else if (!engagementType) setEngagementType("customer_employee");
    setError("");
  }

  function toggleProperty(propertyId, checked) {
    setPropertyIds((current) => checked
      ? [...current, propertyId]
      : current.filter((id) => id !== propertyId));
  }

  async function submit(event) {
    event.preventDefault();
    if (savingRef.current) return;
    if (reason.trim().length < 3) {
      setError("Enter a reason of at least 3 characters.");
      return;
    }
    if (confirmation.trim().toLowerCase() !== administrator.email.toLowerCase()) {
      setError("Type the administrator's email address exactly to confirm.");
      return;
    }
    if (!currentPassword) {
      setError("Enter your current account password.");
      return;
    }
    if (!/^\d{6}$/.test(code.trim())) {
      setError("Enter the current 6-digit authenticator code.");
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
      await onSubmit({
        disposition,
        targetRole: disposition === "demote" ? targetRole : null,
        engagementType: disposition === "demote" ? engagementType : null,
        propertyIds: disposition === "demote" ? propertyIds : [],
        reason: reason.trim(),
        currentPassword,
        code: code.trim(),
        passkey,
      });
    } catch (submitError) {
      setError(submitError.message || "Unable to change administrator access.");
    } finally {
      setCurrentPassword("");
      setCode("");
      setPasskey("");
      savingRef.current = false;
      setSaving(false);
    }
  }

  const activeAfterRemoval = Math.max(
    0,
    Number(adminSeats?.active || 0) - (administrator.accountStatus === "inactive" ? 0 : 1)
  );
  const submitLabel = disposition === "archive"
    ? "Remove administrator access"
    : "Change administrator access";

  return (
    <div className="beta-dialog-overlay" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !savingRef.current) onClose();
    }}>
      <form className="beta-dialog beta-admin-access-dialog" role="dialog" aria-modal="true"
        aria-labelledby="administrator-access-title" aria-describedby="administrator-access-description"
        onSubmit={submit}>
        <div className="beta-dialog-header">
          <div>
            <span className="beta-eyebrow">Sensitive organization action</span>
            <h2 id="administrator-access-title">Manage administrator access</h2>
          </div>
          <button type="button" className="beta-dialog-close" aria-label="Close administrator access dialog"
            onClick={onClose} disabled={saving}>X</button>
        </div>
        <p id="administrator-access-description" className="beta-dialog-copy">
          Change access for <strong>{administrator.username || administrator.email}</strong>. Their current sessions
          will be revoked immediately.
        </p>
        <div className="beta-dialog-note beta-license-request-current">
          <strong>{activeAfterRemoval} active administrator{activeAfterRemoval === 1 ? "" : "s"} will remain</strong>
          <p>Historical assignments, submissions, and audit records are preserved.</p>
        </div>

        <label className="beta-field" htmlFor="administrator-access-outcome">
          <span>Access outcome</span>
          <select ref={outcomeRef} id="administrator-access-outcome" value={disposition} disabled={saving}
            onChange={(event) => { setDisposition(event.target.value); setError(""); }}>
            <option value="archive">Remove from the organization</option>
            <option value="demote">Keep as a non-administrator</option>
          </select>
        </label>

        {disposition === "demote" && <>
          <label className="beta-field" htmlFor="administrator-resulting-role">
            <span>Resulting organization role</span>
            <select id="administrator-resulting-role" value={targetRole} disabled={saving}
              onChange={(event) => changeTargetRole(event.target.value)}>
              {ORGANIZATION_ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          {roleRequiresCustomerEngagement(targetRole) && (
            <label className="beta-field" htmlFor="administrator-resulting-engagement">
              <span>Assignment type</span>
              <select id="administrator-resulting-engagement" value={engagementType} disabled={saving}
                onChange={(event) => { setEngagementType(event.target.value); setError(""); }}>
                {CUSTOMER_ENGAGEMENT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          )}
          {["property_manager", "client"].includes(targetRole) && properties.length > 0 && (
            <fieldset className="beta-admin-access-properties">
              <legend>Property access</legend>
              <p>Select the properties this person should retain after the role change.</p>
              <div>
                {properties.map((property) => (
                  <label className="beta-template-checkbox" key={property._id}>
                    <input type="checkbox" checked={propertyIds.includes(property._id)} disabled={saving}
                      onChange={(event) => toggleProperty(property._id, event.target.checked)} />
                    {property.name}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        </>}

        <label className="beta-field" htmlFor="administrator-access-reason">
          <span>Reason for access change</span>
          <textarea id="administrator-access-reason" rows="3" maxLength="500" value={reason} disabled={saving}
            onChange={(event) => { setReason(event.target.value); setError(""); }} />
        </label>
        <label className="beta-field" htmlFor="administrator-access-confirmation">
          <span>Type {administrator.email} to confirm</span>
          <input id="administrator-access-confirmation" type="email" autoComplete="off"
            value={confirmation} disabled={saving}
            onChange={(event) => { setConfirmation(event.target.value); setError(""); }} />
        </label>
        <label className="beta-field" htmlFor="administrator-access-password">
          <span>Confirm your account password</span>
          <input id="administrator-access-password" type="password" autoComplete="current-password"
            value={currentPassword} disabled={saving}
            onChange={(event) => { setCurrentPassword(event.target.value); setError(""); }} />
        </label>
        <label className="beta-field" htmlFor="administrator-access-code">
          <span>Current authenticator code</span>
          <input id="administrator-access-code" inputMode="numeric" autoComplete="one-time-code"
            maxLength="6" pattern="[0-9]{6}" value={code} disabled={saving}
            onChange={(event) => { setCode(event.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }} />
        </label>
        <label className="beta-field" htmlFor="administrator-access-passkey">
          <span>Administrative action passkey</span>
          <input id="administrator-access-passkey" type="password" autoComplete="off"
            value={passkey} disabled={saving}
            onChange={(event) => { setPasskey(event.target.value); setError(""); }} />
        </label>
        {error && <p className="beta-alert error" role="alert">{error}</p>}
        <div className="beta-dialog-actions">
          <button type="button" className="beta-button secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="beta-button danger" disabled={saving}>
            {saving ? "Changing access..." : submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
