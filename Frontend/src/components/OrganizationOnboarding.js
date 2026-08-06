import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";
import ContextualHelpLink from "./help/ContextualHelpLink";
import PageHeader from "./ui/PageHeader";

const STATUS_LABELS = {
  invited: "Invitation sent",
  in_progress: "Setup in progress",
  completed: "Onboarding complete",
  established: "Established workspace",
};

export default function OrganizationOnboarding() {
  const navigate = useNavigate();
  const [guide, setGuide] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const assumedOrganization = localStorage.getItem("assumedOrganization") === "true";

  const loadGuide = useCallback(async () => {
    try {
      setGuide(await api.get("/api/onboarding"));
      setError("");
    } catch (requestError) {
      setError(requestError.message || "Unable to load the setup guide.");
    }
  }, []);

  useEffect(() => { loadGuide(); }, [loadGuide]);

  async function completeOnboarding() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      setGuide(await api.post("/api/onboarding/complete", {}));
    } catch (requestError) {
      setError(requestError.message || "Unable to complete onboarding.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="beta-page organization-onboarding-page">
      <main className="beta-page-shell organization-onboarding-shell">
        <PageHeader
          eyebrow="Organization setup"
          title={guide?.guided ? "Setup Guide" : "Workspace Readiness"}
          subtitle={guide?.guided
            ? "Complete the operational foundation, then validate the first inspection with your team."
            : "Review the same readiness checks used for newly onboarded organizations."}
          actions={(
            <>
              <ContextualHelpLink slug="complete-organization-setup" label="Help Center" />
              <button type="button" className="beta-back-link" onClick={() => navigate("/dashboard")}>Dashboard</button>
            </>
          )}
        />

        {error && <p className="beta-alert error" role="alert">{error}</p>}
        {assumedOrganization && (
          <p className="beta-alert warning" role="status">
            You are viewing this guide through audited Admin View. Organization security changes must be completed by the customer administrator.
          </p>
        )}

        {!guide ? (
          <div className="beta-empty-state">Loading setup progress...</div>
        ) : (
          <>
            <section className={`organization-onboarding-hero${guide.status === "completed" ? " complete" : ""}`}>
              <div>
                <span className="beta-eyebrow">{STATUS_LABELS[guide.status] || "Setup guide"}</span>
                <h2>{guide.organization.name}</h2>
                <p>{guide.status === "completed"
                  ? "The required workspace foundation is complete. Optional readiness items remain available below."
                  : "Required setup is based on live workspace configuration, so progress updates whenever you return."}</p>
              </div>
              <div className="organization-onboarding-progress" aria-label={`${guide.progress.percent}% of required setup complete`}>
                <strong>{guide.progress.percent}%</strong>
                <span>{guide.progress.requiredComplete} of {guide.progress.requiredTotal} required</span>
                <div><i style={{ width: `${guide.progress.percent}%` }} /></div>
              </div>
            </section>

            <section className="organization-onboarding-list" aria-label="Setup tasks">
              {guide.steps.map((item, index) => (
                <article key={item.id} className={item.complete ? "complete" : ""}>
                  <span className="organization-onboarding-step-icon" aria-hidden="true">{item.complete ? "✓" : index + 1}</span>
                  <div>
                    <div className="organization-onboarding-step-title">
                      <h3>{item.title}</h3>
                      <span>{item.complete ? "Complete" : item.optional ? "Recommended" : "Required"}</span>
                    </div>
                    <p>{item.description}</p>
                  </div>
                  <button type="button" className="beta-button secondary compact" onClick={() => navigate(item.action.path)}>
                    {item.action.label}
                  </button>
                </article>
              ))}
            </section>

            <section className="organization-onboarding-finish">
              <div>
                <h2>{guide.status === "completed" ? "The workspace is ready" : guide.canComplete ? "Required setup is complete" : "Build the operating foundation"}</h2>
                <p>{guide.status === "completed"
                  ? "Use the Setup Guide whenever you want to repeat a readiness review."
                  : guide.canComplete
                    ? "Finish onboarding now, or complete the recommended team and first-inspection checks before launch."
                    : "Complete the required items above before marking onboarding complete."}</p>
              </div>
              {guide.guided && guide.status !== "completed" && (
                <button type="button" className="beta-button" disabled={!guide.canComplete || busy} onClick={completeOnboarding}>
                  {busy ? "Finishing..." : "Complete Onboarding"}
                </button>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
