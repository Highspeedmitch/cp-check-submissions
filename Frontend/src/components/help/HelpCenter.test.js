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

test("shows only commercial submitter help to a commercial submitter", () => {
  renderHelpCenter("user");

  expect(screen.getByRole("heading", { name: "Complete and submit an inspection" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Prepare and send an invoice for approval" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Review, approve, or decline an invoice" })).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Create and manage a scheduler assignment" })).not.toBeInTheDocument();
});
test("omits commercial billing help for a short-term-rental submitter", () => {
  renderHelpCenter("contractor", "STR");

  expect(screen.getByRole("heading", { name: "Complete and submit an inspection" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: /invoice/i })).not.toBeInTheDocument();
});

test("search narrows the role-visible article list", () => {
  renderHelpCenter("admin");

  fireEvent.change(screen.getByRole("searchbox", { name: "Search help articles" }), {
    target: { value: "calendar" },
  });

  expect(screen.getByRole("heading", { name: "Create and manage a scheduler assignment" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Review inspection submissions for a property" })).not.toBeInTheDocument();
});
