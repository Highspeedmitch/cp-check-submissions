import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AdminSubmissions from "./AdminSubmissions";

jest.mock("../services/notificationCenter", () => ({
  useMarkNotificationsRead: jest.fn(),
}));
jest.mock("../services/api", () => ({
  apiUrl: (path) => path,
}));
jest.mock("./help/ContextualHelpLink", () => () => null);

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("token", "test-token");
  global.fetch = jest.fn().mockImplementation(async (url) => {
    const requestedPage = String(url).includes("page=2") ? 2 : 1;
    return {
      ok: true,
      json: async () => ({
        items: [{
          _id: "submission-1",
          submittedAt: "2026-08-03T19:00:00.000Z",
          signedPdfUrl: "https://signed.example.com/report.pdf",
          submittedBy: { _id: "507f1f77bcf86cd799439012", name: "Inspector One" },
          assignment: {
            scheduledAt: "2026-08-02T19:00:00.000Z",
            assignedBy: { _id: "507f1f77bcf86cd799439013", name: "Admin One" },
            fulfillmentType: "afterlight_contractor",
          },
        }],
        pagination: { page: requestedPage, pageSize: 10, total: 14, totalPages: 2 },
        filters: {
          submitters: [{ _id: "507f1f77bcf86cd799439012", name: "Inspector One", email: "inspector@example.com" }],
          assigners: [{ _id: "507f1f77bcf86cd799439013", name: "Admin One", email: "admin@example.com" }],
          includeUnassignedAssigner: true,
          fulfillmentTypes: ["direct_submission", "afterlight_contractor"],
        },
      }),
    };
  });
});

afterEach(() => {
  delete global.fetch;
});

test("shows assignment context alongside a property submission", async () => {
  render(
    <MemoryRouter initialEntries={["/admin/submissions/Black%20Crown"]}>
      <Routes>
        <Route path="/admin/submissions/:property" element={<AdminSubmissions />} />
      </Routes>
    </MemoryRouter>
  );

  expect(await screen.findByText("Inspector One")).toBeInTheDocument();
  expect(screen.getByText("Admin One")).toBeInTheDocument();
  expect(screen.getAllByText("Afterlight contractor")).toHaveLength(2);
  expect(screen.getByText("Date assigned")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "View PDF" }))
    .toHaveAttribute("href", "https://signed.example.com/report.pdf");
  expect(screen.getByRole("link", { name: "View PDF" }))
    .toHaveClass("beta-submission-action");
  expect(global.fetch).toHaveBeenCalledWith(
    "/api/admin/submissions/Black%20Crown?months=12&page=1",
    expect.objectContaining({
      method: "GET",
      headers: { Authorization: "Bearer test-token" },
    })
  );
});

test("applies submitter, assigner, and fulfillment filters on the server before requesting a page", async () => {
  render(
    <MemoryRouter initialEntries={["/admin/submissions/Black%20Crown"]}>
      <Routes>
        <Route path="/admin/submissions/:property" element={<AdminSubmissions />} />
      </Routes>
    </MemoryRouter>
  );
  await screen.findByText("Inspector One");

  fireEvent.change(screen.getByLabelText("Submitted by"), {
    target: { value: "507f1f77bcf86cd799439012" },
  });
  fireEvent.change(screen.getByLabelText("Assigned by"), {
    target: { value: "507f1f77bcf86cd799439013" },
  });
  fireEvent.change(screen.getByLabelText("Fulfillment"), {
    target: { value: "afterlight_contractor" },
  });

  await waitFor(() => expect(global.fetch).toHaveBeenLastCalledWith(
    "/api/admin/submissions/Black%20Crown?months=12&page=1&submitter=507f1f77bcf86cd799439012&assigner=507f1f77bcf86cd799439013&fulfillment=afterlight_contractor",
    expect.any(Object)
  ));
  await waitFor(() => expect(screen.queryByText("Loading submissions...")).not.toBeInTheDocument());
});

test("starts a second page after ten records", async () => {
  render(
    <MemoryRouter initialEntries={["/admin/submissions/Black%20Crown"]}>
      <Routes>
        <Route path="/admin/submissions/:property" element={<AdminSubmissions />} />
      </Routes>
    </MemoryRouter>
  );

  fireEvent.click(await screen.findByRole("button", { name: "Next" }));

  await waitFor(() => expect(global.fetch).toHaveBeenLastCalledWith(
    "/api/admin/submissions/Black%20Crown?months=12&page=2",
    expect.any(Object)
  ));
  expect(await screen.findByText(/Page 2 of 2/)).toBeInTheDocument();
});
