import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import BulkOnboarding from "./BulkOnboarding";
import { api } from "../services/api";

jest.mock("../services/api", () => ({
  api: { post: jest.fn() },
}));

const preview = {
  type: "users",
  rowCount: 1,
  validRowCount: 1,
  canCommit: true,
  capacityError: null,
  capacity: {
    users: { allocated: 1, limit: 5, unmetered: false },
    properties: { allocated: 2, limit: 10, unmetered: false },
  },
  rows: [{
    rowNumber: 2,
    errors: [],
    data: { email: "person@example.com", role: "user" },
  }],
};

beforeEach(() => {
  api.post.mockReset();
});

test("previews and commits a user CSV through a scoped passkey grant", async () => {
  api.post.mockImplementation(async (path) => {
    if (path === "/api/bulk-onboarding/preview") return preview;
    if (path === "/api/organization-security/grants") return { grant: "bulk-grant" };
    if (path === "/api/bulk-onboarding/commit") {
      return { type: "users", imported: 1, message: "1 user invitation created." };
    }
    throw new Error("Unexpected request");
  });

  render(<MemoryRouter><BulkOnboarding /></MemoryRouter>);
  const file = new File(["email,role\nperson@example.com,user"], "users.csv", { type: "text/csv" });
  Object.defineProperty(file, "text", {
    value: async () => "email,role\nperson@example.com,user",
  });
  fireEvent.change(screen.getByLabelText("CSV file"), { target: { files: [file] } });

  await screen.findByText("Selected: users.csv");
  fireEvent.click(screen.getByRole("button", { name: "Preview import" }));
  expect(await screen.findByText("person@example.com")).toBeInTheDocument();
  expect(screen.getByText(/1 of 5 currently allocated/i)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Continue to verification" }));
  fireEvent.change(screen.getByLabelText("Administrative action passkey"), {
    target: { value: "organization-passkey" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Complete import" }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/api/organization-security/grants",
    { purpose: "bulk_onboarding", passkey: "organization-passkey" }
  ));
  expect(api.post).toHaveBeenCalledWith("/api/bulk-onboarding/commit", {
    type: "users",
    csv: "email,role\nperson@example.com,user",
    adminActionGrant: "bulk-grant",
  });
  expect(await screen.findByText("1 user invitation created.")).toBeInTheDocument();
});

test("does not allow a capacity-blocked preview to continue", async () => {
  api.post.mockResolvedValue({
    ...preview,
    canCommit: false,
    capacityError: {
      code: "USER_LIMIT_REACHED",
      error: "This organization does not have enough licensed user seats for this operation.",
    },
  });
  render(<MemoryRouter><BulkOnboarding /></MemoryRouter>);
  const file = new File(["email,role\nperson@example.com,user"], "users.csv", { type: "text/csv" });
  Object.defineProperty(file, "text", {
    value: async () => "email,role\nperson@example.com,user",
  });
  fireEvent.change(screen.getByLabelText("CSV file"), { target: { files: [file] } });
  await screen.findByText("Selected: users.csv");
  fireEvent.click(screen.getByRole("button", { name: "Preview import" }));

  expect(await screen.findByText(/not have enough licensed user seats/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Continue to verification" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Review license options" })).toBeInTheDocument();
});

test("uses the contextual property entry point to preset the import type", () => {
  render(<MemoryRouter initialEntries={["/admin/bulk-onboarding?type=properties"]}><BulkOnboarding /></MemoryRouter>);

  expect(screen.getByRole("button", { name: "Properties" })).not.toHaveClass("secondary");
  expect(screen.getByRole("button", { name: "Users" })).toHaveClass("secondary");
  expect(screen.getByRole("button", { name: "Download properties template" })).toBeInTheDocument();
});

test("submits an assistance request without attaching CSV data", async () => {
  api.post.mockResolvedValue({
    requestId: "request-1",
    message: "Onboarding assistance requested. Afterlight platform administration was notified.",
  });
  render(<MemoryRouter initialEntries={["/admin/bulk-onboarding?type=users"]}><BulkOnboarding /></MemoryRouter>);

  fireEvent.click(screen.getByRole("button", { name: "Request Onboarding Assistance" }));
  fireEvent.change(screen.getByLabelText("Approximate number of records (optional)"), {
    target: { value: "42" },
  });
  fireEvent.change(screen.getByLabelText("What assistance do you need?"), {
    target: { value: "Help us prepare for a newly acquired portfolio." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Submit request" }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/api/bulk-onboarding/assistance-requests",
    {
      type: "users",
      estimatedRows: 42,
      reason: "Help us prepare for a newly acquired portfolio.",
    }
  ));
  expect(api.post.mock.calls[0][1]).not.toHaveProperty("csv");
  expect(await screen.findByText(/platform administration was notified/i)).toBeInTheDocument();
});
