import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import HelpCenter from "./HelpCenter";

function renderHelpCenter(role, orgType = "COM") {
  localStorage.setItem("role", role);
  localStorage.setItem("orgType", orgType);
  return render(
    <MemoryRouter>
      <HelpCenter />
    </MemoryRouter>
  );
}

beforeEach(() => localStorage.clear());

test("shows inspection help without contractor billing to a commercial employee", () => {
  renderHelpCenter("user");

  expect(screen.getByRole("heading", { name: "Complete and submit an inspection" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Prepare and send an invoice for approval" })).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Review, approve, or decline an invoice" })).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Create and manage a scheduler assignment" })).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Enable and troubleshoot notifications" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Set up and recover authenticator verification" })).toBeInTheDocument();
});
test("omits commercial billing help for a short-term-rental submitter", () => {
  renderHelpCenter("contractor", "STR");

  expect(screen.getByRole("heading", { name: "Complete and submit an inspection" })).toBeInTheDocument();
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
    name: "Configure property delivery and inspection recipients",
  })).toBeInTheDocument();
});
