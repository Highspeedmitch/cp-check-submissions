import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PlatformDashboard from "./PlatformDashboard";
import { api } from "../services/api";
import { storeAuthentication } from "../services/session";
import { beginOktaLogin } from "../services/okta";

jest.mock("../services/api", () => ({
  api: { get: jest.fn(), post: jest.fn() },
}));
jest.mock("../services/session", () => ({
  storeAuthentication: jest.fn(),
  logoutSession: jest.fn(),
}));
jest.mock("../services/okta", () => ({
  beginOktaLogin: jest.fn(),
  oktaConfigured: true,
}));
jest.mock("../services/notificationCenter", () => ({
  NOTIFICATION_SECTIONS: {
    platformBilling: [],
    resources: [],
    serviceModels: [],
  },
  useMarkNotificationsRead: jest.fn(),
  useNotificationBadges: () => ({
    platformBilling: 0,
    resources: 0,
    serviceModels: 0,
  }),
}));
jest.mock("./ProspectAssessments", () => () => <div>Prospects view</div>);
jest.mock("./PlatformResources", () => () => <div>Resources view</div>);
jest.mock("./PlatformServiceBilling", () => () => <div>Billing view</div>);
jest.mock("./PlatformServiceModelChanges", () => () => <div>Service models view</div>);
jest.mock("./ui/ThemeToggle", () => () => <button type="button">Theme</button>);

const report = {
  summary: {
    organizationCount: 1,
    activeUserCount: 4,
    propertyCount: 5,
    recentSubmissionCount: 6,
    pendingBidCount: 0,
    pendingInvoiceCount: 0,
  },
  organizations: [{
    organizationId: "org-1",
    name: "PICOR",
    orgType: "COM",
    propertyCount: 5,
    activeUserCount: 4,
    recentSubmissionCount: 6,
    pendingBidCount: 0,
    pendingInvoiceCount: 0,
    pendingAdminInvitation: null,
  }],
};

function renderDashboard(initialEntry = "/platform") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <PlatformDashboard />
    </MemoryRouter>
  );
}

function stepUpRequiredError() {
  return Object.assign(new Error("Confirm your identity to open Admin View."), {
    data: { code: "STEP_UP_REQUIRED" },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  sessionStorage.clear();
  api.get.mockResolvedValue(report);
  beginOktaLogin.mockResolvedValue(undefined);
  window.prompt = jest.fn(() => "Development and support");
});

test("stale Admin View access opens an authenticator dialog and retries after verification", async () => {
  let assumeAttempts = 0;
  api.post.mockImplementation((path) => {
    if (path.endsWith("/assume")) {
      assumeAttempts += 1;
      if (assumeAttempts === 1) return Promise.reject(stepUpRequiredError());
      return Promise.reject(new Error("Navigation suppressed by test."));
    }
    if (path === "/api/auth/mfa/step-up/challenge") {
      return Promise.resolve({ provider: "totp", challengeToken: "challenge-1" });
    }
    if (path === "/api/auth/mfa/step-up/verify") {
      return Promise.resolve({ token: "renewed-token", organizationId: "platform-org" });
    }
    return Promise.reject(new Error(`Unexpected request: ${path}`));
  });

  renderDashboard();
  fireEvent.click(await screen.findByRole("button", { name: "Open Admin View" }));

  const dialog = await screen.findByRole("dialog", { name: "Confirm your identity" });
  expect(dialog).toHaveTextContent("PICOR");
  expect(screen.queryByText("Reauthenticate with Okta before entering an organization.")).not.toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("Authentication code"), { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: "Verify and continue" }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/api/auth/mfa/step-up/verify",
    { challengeToken: "challenge-1", code: "123456" }
  ));
  await waitFor(() => expect(assumeAttempts).toBe(2));
  expect(storeAuthentication).toHaveBeenCalledWith(
    expect.objectContaining({ token: "renewed-token" })
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("Navigation suppressed by test.");
});

test("Okta is used as a forced reauthentication fallback when the backend selects it", async () => {
  api.post.mockImplementation((path) => {
    if (path.endsWith("/assume")) return Promise.reject(stepUpRequiredError());
    if (path === "/api/auth/mfa/step-up/challenge") {
      return Promise.resolve({ provider: "okta" });
    }
    return Promise.reject(new Error(`Unexpected request: ${path}`));
  });

  renderDashboard();
  fireEvent.click(await screen.findByRole("button", { name: "Open Admin View" }));

  await waitFor(() => expect(beginOktaLogin).toHaveBeenCalledWith({
    returnTo: "/platform?resumeAdminView=1",
    stepUp: true,
  }));
  expect(JSON.parse(sessionStorage.getItem("afterlightPendingAdminViewStepUp")))
    .toEqual(expect.objectContaining({
      organizationId: "org-1",
      reason: "Development and support",
    }));
});

test("a completed Okta step-up restores and retries the pending Admin View request", async () => {
  sessionStorage.setItem("afterlightPendingAdminViewStepUp", JSON.stringify({
    organizationId: "org-1",
    reason: "Investigating an invoice",
    createdAt: Date.now(),
  }));
  api.post.mockRejectedValue(new Error("Navigation suppressed by test."));

  renderDashboard("/platform?resumeAdminView=1");

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/api/platform/organizations/org-1/assume",
    { reason: "Investigating an invoice" }
  ));
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(sessionStorage.getItem("afterlightPendingAdminViewStepUp")).toBeNull();
  expect(await screen.findByRole("alert")).toHaveTextContent("Navigation suppressed by test.");
});

test("a platform error clears when navigating to another dashboard view", async () => {
  api.post.mockRejectedValue(new Error("Unable to open the organization."));

  renderDashboard();
  fireEvent.click(await screen.findByRole("button", { name: "Open Admin View" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to open the organization.");

  fireEvent.click(screen.getByRole("button", { name: "Resources & Payables" }));
  expect(await screen.findByText("Resources view")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
