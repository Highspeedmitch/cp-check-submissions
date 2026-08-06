import {
  setupGuideHelpActionVisible,
  setupGuideNavigationVisible,
} from "./organizationOnboardingStatus";

test("keeps the Setup Guide in navigation while guided onboarding is incomplete", () => {
  expect(setupGuideNavigationVisible({ loading: false, error: false, guided: true, status: "in_progress" })).toBe(true);
  expect(setupGuideHelpActionVisible({ loading: false, error: false, guided: true, status: "in_progress" })).toBe(false);
});

test.each([
  { guided: true, status: "completed" },
  { guided: false, status: "established" },
])("moves completed or established setup access to Help Center", (status) => {
  const value = { loading: false, error: false, ...status };
  expect(setupGuideNavigationVisible(value)).toBe(false);
  expect(setupGuideHelpActionVisible(value)).toBe(true);
});

test("fails open in navigation if setup status is unavailable", () => {
  expect(setupGuideNavigationVisible({ loading: false, error: true, guided: null, status: "unknown" })).toBe(true);
  expect(setupGuideHelpActionVisible({ loading: false, error: true, guided: null, status: "unknown" })).toBe(false);
});
