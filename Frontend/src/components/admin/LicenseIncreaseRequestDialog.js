import React, { useEffect, useMemo, useRef, useState } from "react";

const TIER_LABELS = {
  tier_1: "Tier 1",
  tier_2: "Tier 2",
  tier_3: "Tier 3",
};

function limitSummary(limits) {
  return `${limits.adminLimit} administrators, ${limits.userLimit} users, ${limits.propertyLimit} properties`;
}
export default function LicenseIncreaseRequestDialog({ license, options, onClose, onSubmit }) {
  const availableTiers = useMemo(() => {
    const tiers = options?.tiers || [];
    return tiers.slice(tiers.indexOf(license.tier) + 1);
  }, [license.tier, options]);
  const customCapacity = availableTiers.length === 0;
  const [requestedTier, setRequestedTier] = useState(availableTiers[0] || "");
  const [requestedAdminLimit, setRequestedAdminLimit] = useState((license.adminLimit || 0) + 1);
  const [reason, setReason] = useState("");
  const [proposedEffectiveDate, setProposedEffectiveDate] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const firstFieldRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    firstFieldRef.current?.focus();
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
    if (!reason.trim()) {
      setError("Enter the business reason for this request.");
      return;
    }
    if (customCapacity && (!Number.isInteger(Number(requestedAdminLimit)) || Number(requestedAdminLimit) <= license.adminLimit)) {
      setError(`Requested administrator capacity must be a whole number greater than ${license.adminLimit}.`);
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      await onSubmit(customCapacity ? {
        changeType: "custom_capacity",
        requestedAdminLimit: Number(requestedAdminLimit),
        reason: reason.trim(),
        proposedEffectiveDate: proposedEffectiveDate || null,
      } : {
        changeType: "license_tier",
        requestedLicenseTier: requestedTier,
        reason: reason.trim(),
        proposedEffectiveDate: proposedEffectiveDate || null,
      });
    } catch (submitError) {
      setError(submitError.message || "Unable to submit the license increase request.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="beta-dialog-overlay" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !savingRef.current) onClose();
    }}>
      <form className="beta-dialog" role="dialog" aria-modal="true"
        aria-labelledby="license-increase-title" aria-describedby="license-increase-description"
        onSubmit={submit}>
        <div className="beta-dialog-header">
          <div>
            <span className="beta-eyebrow">Service plan request</span>
            <h2 id="license-increase-title">
              {customCapacity ? "Request custom administrator capacity" : "Request a license tier increase"}
            </h2>
          </div>
          <button type="button" className="beta-dialog-close" aria-label="Close license request dialog"
            onClick={onClose} disabled={saving}>×</button>
        </div>
        <p id="license-increase-description" className="beta-dialog-copy">
          This request will be sent to Afterlight for review. Your current capacity stays in effect until it is approved.
        </p>
        <div className="beta-dialog-note beta-license-request-current">
          <strong>{license.label}</strong>
          <p>Current capacity: {limitSummary(license)}</p>
        </div>
        {customCapacity ? (
          <label className="beta-field" htmlFor="requested-administrator-capacity">
            <span>Requested administrator capacity</span>
            <input ref={firstFieldRef} id="requested-administrator-capacity" type="number"
              min={(license.adminLimit || 0) + 1} max="1000" step="1"
              value={requestedAdminLimit} disabled={saving}
              onChange={(event) => { setRequestedAdminLimit(event.target.value); setError(""); }} />
            <small>Tier 3 custom capacity changes administrator seats only.</small>
          </label>
        ) : (
          <label className="beta-field" htmlFor="requested-license-tier">
            <span>Requested license tier</span>
            <select ref={firstFieldRef} id="requested-license-tier" value={requestedTier} disabled={saving}
              onChange={(event) => { setRequestedTier(event.target.value); setError(""); }}>
              {availableTiers.map((tier) => (
                <option key={tier} value={tier}>
                  {TIER_LABELS[tier]} · {limitSummary(options.tierLimits[tier])}
                  {license.serviceModel === "hybrid" ? ` · ${options.hybridPortfolioMinimums[tier]}% Afterlight minimum` : ""}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="beta-field" htmlFor="license-request-effective-date">
          <span>Requested effective date (optional)</span>
          <input id="license-request-effective-date" type="date" value={proposedEffectiveDate} disabled={saving}
            onChange={(event) => { setProposedEffectiveDate(event.target.value); setError(""); }} />
        </label>
        <label className="beta-field" htmlFor="license-request-reason">
          <span>Business reason and capacity context</span>
          <textarea id="license-request-reason" rows="4" maxLength="2000" required
            value={reason} disabled={saving}
            placeholder="Describe the capacity need, expected growth, and requested timing."
            onChange={(event) => { setReason(event.target.value); setError(""); }} />
        </label>
        {error && <p className="beta-dialog-error" role="alert">{error}</p>}
        <div className="beta-dialog-actions">
          <button type="button" className="beta-button secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="beta-button" disabled={saving || !reason.trim()}>
            {saving ? "Submitting…" : "Submit request"}
          </button>
        </div>
      </form>
    </div>
  );
}
