import { useEffect, useState } from "react";
import { api } from "./api";

const UNKNOWN_STATUS = {
  loading: false,
  error: false,
  guided: null,
  status: "unknown",
  completedAt: null,
};

export function setupGuideNavigationVisible(onboardingStatus) {
  if (!onboardingStatus || onboardingStatus.loading || onboardingStatus.error) return true;
  if (onboardingStatus.guided === null) return true;
  return onboardingStatus.guided && onboardingStatus.status !== "completed";
}

export function setupGuideHelpActionVisible(onboardingStatus) {
  if (!onboardingStatus || onboardingStatus.loading || onboardingStatus.error) return false;
  return onboardingStatus.guided === false || onboardingStatus.status === "completed";
}

export function useOrganizationOnboardingStatus(enabled = true) {
  const token = localStorage.getItem("token");
  const [onboardingStatus, setOnboardingStatus] = useState(() => (
    enabled && token ? { ...UNKNOWN_STATUS, loading: true } : UNKNOWN_STATUS
  ));

  useEffect(() => {
    let active = true;
    if (!enabled || !token) {
      setOnboardingStatus(UNKNOWN_STATUS);
      return () => { active = false; };
    }

    setOnboardingStatus((current) => ({ ...current, loading: true, error: false }));
    api.get("/api/onboarding/status")
      .then((result) => {
        if (!active) return;
        setOnboardingStatus({
          loading: false,
          error: false,
          guided: Boolean(result.guided),
          status: result.status || "unknown",
          completedAt: result.completedAt || null,
        });
      })
      .catch(() => {
        if (!active) return;
        setOnboardingStatus({ ...UNKNOWN_STATUS, error: true });
      });

    return () => { active = false; };
  }, [enabled, token]);

  return onboardingStatus;
}
