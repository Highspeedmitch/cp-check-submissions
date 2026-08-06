import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import OrganizationOnboarding from "./OrganizationOnboarding";
import { api } from "../services/api";

jest.mock("../services/api", () => ({ api: { get: jest.fn(), post: jest.fn() } }));

const guide = {
  guided: true,
  status: "in_progress",
  organization: { name: "Example Management" },
  progress: { requiredComplete: 3, requiredTotal: 3, percent: 100 },
  canComplete: true,
  steps: [{
    id: "security",
    title: "Secure administrator actions",
    description: "Configure an organization-owned passkey.",
    complete: true,
    optional: false,
    action: { label: "Review security", path: "/organization-security" },
  }],
};

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  localStorage.setItem("role", "admin");
  localStorage.setItem("orgType", "COM");
  api.get.mockResolvedValue(guide);
});

test("renders live onboarding progress and completes a ready organization", async () => {
  api.post.mockResolvedValue({ ...guide, status: "completed", canComplete: false });
  render(<MemoryRouter><OrganizationOnboarding /></MemoryRouter>);

  expect(await screen.findByRole("heading", { name: "Example Management" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Help Center/ })).toHaveAttribute(
    "href",
    "/help/complete-organization-setup"
  );
  expect(screen.getByLabelText("100% of required setup complete")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Complete Onboarding" }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith("/api/onboarding/complete", {}));
  expect(await screen.findByText("The workspace is ready")).toBeInTheDocument();
});
