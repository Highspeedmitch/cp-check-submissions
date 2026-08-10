import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import HelpCenter from "./HelpCenter";
import { api } from "../../services/api";

jest.mock("../../services/api", () => ({
  api: { get: jest.fn() },
}));

function renderHelpCenter(role, orgType = "COM") {
  localStorage.setItem("role", role);
  localStorage.setItem("orgType", orgType);
  return render(
    <MemoryRouter>
      <HelpCenter />
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
  api.get.mockReset();
});

test("shows inspection help without contractor billing to a commercial employee", () => {
  renderHelpCenter("user");

  expect(screen.getByRole("heading", { name: "Complete and submit an inspection" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Prepare and send an invoice for approval" })).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Review, approve, or decline an invoice" })).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Create and manage a scheduler assignment" })).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Enable and troubleshoot notifications" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Set up and recover authenticator verification" })).toBeInTheDocument();
});
test("shows billing guidance to a Customer Contractor Field Operator", () => {
  localStorage.setItem("billingAccess", "true");
  renderHelpCenter("user");

  expect(screen.getByRole("heading", { name: "Prepare and send an invoice for approval" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Revise and resubmit a declined invoice" })).toBeInTheDocument();
});
test("omits commercial billing help for a short-term-rental submitter", () => {
  renderHelpCenter("contractor", "STR");

  expect(screen.getByRole("heading", { name: "Complete and submit an inspection" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: /invoice/i })).not.toBeInTheDocument();
});

test("shows portal guidance to a short-term-rental property owner", () => {
  renderHelpCenter("client", "STR");

  expect(screen.getByRole("heading", {
    name: "Use the short-term rental property owner portal",
  })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: /invoice/i })).not.toBeInTheDocument();
});

test("shows resource portal guidance instead of organization billing to an Afterlight contractor", () => {
  localStorage.setItem("accountScope", "afterlight_resource");
  renderHelpCenter("contractor");

  expect(screen.getByRole("heading", { name: "Set up your Afterlight resource account" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Use the Afterlight Resource Portal" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Complete an assigned Afterlight resource inspection" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Understand your contractor earnings" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: /send an invoice/i })).not.toBeInTheDocument();
});

test("search narrows the role-visible article list", () => {
  renderHelpCenter("admin");

  fireEvent.change(screen.getByRole("searchbox", { name: "Search help articles" }), {
    target: { value: "calendar" },
  });

  expect(screen.getByRole("heading", { name: "Create and manage a scheduler assignment" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Review inspection submissions for a property" })).not.toBeInTheDocument();
});

test("shows the platform operations guide to a platform administrator", () => {
  localStorage.setItem("platformRole", "platform_admin");
  renderHelpCenter("admin");

  expect(screen.getByRole("heading", {
    name: "Manage Afterlight resources and contractor payables",
  })).toBeInTheDocument();
  expect(screen.getByRole("heading", {
    name: "Configure Gusto for Afterlight contractor payments",
  })).toBeInTheDocument();
  expect(screen.getByRole("heading", {
    name: "Process Afterlight service invoices",
  })).toBeInTheDocument();
  expect(screen.getByRole("heading", {
    name: "Create and securely access an organization",
  })).toBeInTheDocument();
  expect(screen.getByRole("heading", {
    name: "Create a complimentary prospect report",
  })).toBeInTheDocument();
  expect(screen.queryByRole("heading", {
    name: "Create and manage a scheduler assignment",
  })).not.toBeInTheDocument();
});

test("hides platform service billing guidance from organization administrators", () => {
  renderHelpCenter("admin");

  expect(screen.queryByRole("heading", {
    name: "Process Afterlight service invoices",
  })).not.toBeInTheDocument();
  expect(screen.getByRole("heading", {
    name: "Manage organization users and access",
  })).toBeInTheDocument();
  expect(screen.getByRole("heading", {
    name: "Complete the organization Setup Guide",
  })).toBeInTheDocument();
  expect(screen.getByRole("heading", {
    name: "Invite organization administrators and manage licensed seats",
  })).toBeInTheDocument();
  expect(screen.getByRole("heading", {
    name: "Configure property delivery and inspection recipients",
  })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Review portfolio reporting" })).toBeInTheDocument();
  expect(screen.getByRole("heading", {
    name: "Manage inspection form templates and field order",
  })).toBeInTheDocument();
  expect(screen.getByRole("heading", {
    name: "Request and manage a property service bid",
  })).toBeInTheDocument();
});

test("offers completed setup as a Help Center readiness review", async () => {
  localStorage.setItem("token", "test-token");
  api.get.mockResolvedValue({ guided: true, status: "completed", completedAt: "2026-08-06T12:00:00Z" });
  renderHelpCenter("admin");

  expect(await screen.findByRole("button", { name: "Review Setup Guide" })).toBeInTheDocument();
  expect(api.get).toHaveBeenCalledWith("/api/onboarding/status");
});
