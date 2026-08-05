import React, { useEffect, useMemo, useRef, useState } from "react";

const DRAFT_KEY = "afterlightOrganizationOnboardingDraft";

export const EMPTY_ORGANIZATION = {
  name: "",
  orgType: "COM",
  serviceModel: "managed",
  defaultFulfillmentSource: "afterlight_staff",
  reportingTimezone: "America/Phoenix",
  initialAdminEmail: "",
};

export const ORGANIZATION_TYPES = {
  COM: "Commercial",
  RES: "Residential",
  LTR: "Long-term rental",
  STR: "Short-term rental",
};

export const SERVICE_MODELS = {
  platform: {
    label: "Full-stack SaaS",
    description: "The customer operates inspections with its own employees and contractors.",
  },
  managed: {
    label: "Managed service",
    description: "Afterlight supplies and coordinates the default inspection workforce.",
  },
  hybrid: {
    label: "Hybrid",
    description: "Customer and Afterlight resources can share fulfillment responsibility.",
  },
};

export const SERVICE_MODEL_DEFAULTS = {
  platform: "customer_employee",
  managed: "afterlight_staff",
  hybrid: "customer_employee",
};

export const FULFILLMENT_SOURCES = {
  customer_employee: "Customer employee",
  customer_contractor: "Customer contractor",
  afterlight_staff: "Afterlight staff",
  afterlight_contractor: "Afterlight contractor",
};

export const TIMEZONES = [
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
];

const STEPS = ["Organization", "Service delivery", "Administrator", "Review"];

function savedDraft() {
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY));
    return saved && typeof saved === "object"
      ? { ...EMPTY_ORGANIZATION, ...saved }
      : EMPTY_ORGANIZATION;
  } catch (_error) {
    return EMPTY_ORGANIZATION;
  }
}

function validateStep(stepIndex, draft) {
  if (stepIndex === 0) {
    if (draft.name.trim().length < 2) return "Enter an organization name with at least two characters.";
    if (!ORGANIZATION_TYPES[draft.orgType]) return "Select a valid organization type.";
    if (!TIMEZONES.includes(draft.reportingTimezone)) return "Select a reporting timezone.";
  }
  if (stepIndex === 1) {
    if (!SERVICE_MODELS[draft.serviceModel]) return "Select a service model.";
    if (!FULFILLMENT_SOURCES[draft.defaultFulfillmentSource]) return "Select a default fulfillment source.";
  }
  if (stepIndex === 2 && !/^\S+@\S+\.\S+$/.test(draft.initialAdminEmail.trim())) {
    return "Enter a valid administrator email address.";
  }
  return "";
}

export default function OrganizationOnboardingWizard({ open, busy, error, onClose, onCreate }) {
  const [draft, setDraft] = useState(EMPTY_ORGANIZATION);
  const [stepIndex, setStepIndex] = useState(0);
  const [localError, setLocalError] = useState("");
  const skipDraftPersistence = useRef(false);

  useEffect(() => {
    if (!open) return;
    skipDraftPersistence.current = false;
    setDraft(savedDraft());
    setStepIndex(0);
    setLocalError("");
  }, [open]);

  useEffect(() => {
    if (open && !skipDraftPersistence.current) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    }
  }, [draft, open]);

  const operationalSummary = useMemo(() => {
    const source = FULFILLMENT_SOURCES[draft.defaultFulfillmentSource];
    if (draft.defaultFulfillmentSource.startsWith("afterlight_")) {
      return `${source} routes new assignments into Afterlight coverage and service billing.`;
    }
    return `${source} keeps new assignments in the customer-operated queue.`;
  }, [draft.defaultFulfillmentSource]);

  if (!open) return null;

  const update = (key, value) => {
    skipDraftPersistence.current = false;
    setDraft((current) => ({ ...current, [key]: value }));
    setLocalError("");
  };

  const goToStep = (nextStep) => {
    if (nextStep > stepIndex) {
      const validationError = validateStep(stepIndex, draft);
      if (validationError) {
        setLocalError(validationError);
        return;
      }
    }
    setLocalError("");
    setStepIndex(nextStep);
  };

  const reset = () => {
    skipDraftPersistence.current = true;
    localStorage.removeItem(DRAFT_KEY);
    setDraft(EMPTY_ORGANIZATION);
    setStepIndex(0);
    setLocalError("");
  };

  const submit = async (event) => {
    event.preventDefault();
    const validationError = validateStep(stepIndex, draft);
    if (validationError) {
      setLocalError(validationError);
      return;
    }
    if (stepIndex < STEPS.length - 1) {
      goToStep(stepIndex + 1);
      return;
    }
    const created = await onCreate({
      ...draft,
      name: draft.name.trim(),
      initialAdminEmail: draft.initialAdminEmail.trim().toLowerCase(),
    });
    if (created) {
      skipDraftPersistence.current = true;
      localStorage.removeItem(DRAFT_KEY);
    }
  };

  return (
    <div className="beta-dialog-overlay" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <form className="beta-dialog platform-new-org-dialog platform-onboarding-wizard" role="dialog" aria-modal="true" aria-labelledby="new-org-title" onSubmit={submit}>
        <div className="beta-dialog-header">
          <div><span className="beta-eyebrow">Guided tenant launch</span><h2 id="new-org-title">Onboard an Organization</h2></div>
          <button type="button" className="beta-dialog-close" onClick={onClose} disabled={busy} aria-label="Close dialog">×</button>
        </div>

        <ol className="platform-onboarding-steps" aria-label="Organization onboarding progress">
          {STEPS.map((label, index) => (
            <li key={label} className={`${index === stepIndex ? "active" : ""}${index < stepIndex ? " complete" : ""}`} aria-current={index === stepIndex ? "step" : undefined}>
              <span>{index < stepIndex ? "✓" : index + 1}</span><small>{label}</small>
            </li>
          ))}
        </ol>

        <div className="platform-onboarding-stage">
          {stepIndex === 0 && (
            <>
              <div className="platform-onboarding-stage-copy"><h3>Organization profile</h3><p>Establish the tenant identity and the timezone used for reporting and operational dates.</p></div>
              <div className="beta-form-grid">
                <label className="beta-form-field full">Organization name
                  <input value={draft.name} maxLength="120" autoComplete="organization" onChange={(event) => update("name", event.target.value)} required autoFocus />
                </label>
                <label className="beta-form-field">Organization type
                  <select value={draft.orgType} onChange={(event) => update("orgType", event.target.value)}>
                    {Object.entries(ORGANIZATION_TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label className="beta-form-field">Reporting timezone
                  <select value={draft.reportingTimezone} onChange={(event) => update("reportingTimezone", event.target.value)}>
                    {TIMEZONES.map((timezone) => <option key={timezone} value={timezone}>{timezone.replaceAll("_", " ")}</option>)}
                  </select>
                </label>
              </div>
            </>
          )}

          {stepIndex === 1 && (
            <>
              <div className="platform-onboarding-stage-copy"><h3>Service delivery</h3><p>Choose the contracted operating model and the route used when a property has no override.</p></div>
              <fieldset className="platform-service-model-options">
                <legend className="sr-only">Service model</legend>
                {Object.entries(SERVICE_MODELS).map(([value, option]) => (
                  <label key={value} className={draft.serviceModel === value ? "selected" : ""}>
                    <input type="radio" name="serviceModel" value={value} checked={draft.serviceModel === value} onChange={() => {
                      setDraft((current) => ({ ...current, serviceModel: value, defaultFulfillmentSource: SERVICE_MODEL_DEFAULTS[value] }));
                      setLocalError("");
                    }} />
                    <span><strong>{option.label}</strong><small>{option.description}</small></span>
                  </label>
                ))}
              </fieldset>
              <label className="beta-form-field platform-onboarding-default-source">Default fulfillment
                <select value={draft.defaultFulfillmentSource} onChange={(event) => update("defaultFulfillmentSource", event.target.value)}>
                  {Object.entries(FULFILLMENT_SOURCES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <small className="beta-field-help">{operationalSummary}</small>
              </label>
            </>
          )}

          {stepIndex === 2 && (
            <>
              <div className="platform-onboarding-stage-copy"><h3>Initial administrator</h3><p>This person receives a secure, single-use invitation and becomes responsible for completing organization setup.</p></div>
              <label className="beta-form-field full">Administrator email
                <input type="email" value={draft.initialAdminEmail} autoComplete="email" onChange={(event) => update("initialAdminEmail", event.target.value)} required autoFocus />
              </label>
              <div className="platform-onboarding-handoff">
                <strong>What happens next</strong>
                <ol>
                  <li>Afterlight creates the isolated organization workspace.</li>
                  <li>The administrator accepts the invitation and creates an account.</li>
                  <li>The Setup Guide tracks security, property, team, and first-inspection readiness.</li>
                </ol>
              </div>
            </>
          )}

          {stepIndex === 3 && (
            <>
              <div className="platform-onboarding-stage-copy"><h3>Review and launch</h3><p>Nothing is created until you select Launch Organization.</p></div>
              <dl className="platform-onboarding-review">
                <div><dt>Organization</dt><dd>{draft.name}</dd><button type="button" onClick={() => goToStep(0)}>Edit</button></div>
                <div><dt>Type and timezone</dt><dd>{ORGANIZATION_TYPES[draft.orgType]} · {draft.reportingTimezone.replaceAll("_", " ")}</dd><button type="button" onClick={() => goToStep(0)}>Edit</button></div>
                <div><dt>Service model</dt><dd>{SERVICE_MODELS[draft.serviceModel].label} · {FULFILLMENT_SOURCES[draft.defaultFulfillmentSource]}</dd><button type="button" onClick={() => goToStep(1)}>Edit</button></div>
                <div><dt>Administrator</dt><dd>{draft.initialAdminEmail}</dd><button type="button" onClick={() => goToStep(2)}>Edit</button></div>
              </dl>
              <p className="beta-dialog-note">The launch is audited. The workspace remains intact if invitation delivery fails, and the invitation can be resent from its organization card.</p>
            </>
          )}
        </div>

        {(localError || error) && <p className="beta-dialog-error" role="alert">{localError || error}</p>}
        <div className="platform-onboarding-footer">
          <button type="button" className="beta-text-button" onClick={reset} disabled={busy}>Start over</button>
          <div className="beta-dialog-actions">
            {stepIndex === 0 ? (
              <button type="button" className="beta-button secondary" onClick={onClose} disabled={busy}>Save and close</button>
            ) : (
              <button type="button" className="beta-button secondary" onClick={() => goToStep(stepIndex - 1)} disabled={busy}>Back</button>
            )}
            <button type="submit" className="beta-button" disabled={busy}>
              {busy ? "Launching..." : stepIndex === STEPS.length - 1 ? "Launch Organization" : "Continue"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
