import { render, screen } from "@testing-library/react";
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
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => [{
      _id: "submission-1",
      submittedAt: "2026-08-03T19:00:00.000Z",
      signedPdfUrl: "https://signed.example.com/report.pdf",
      submittedBy: { name: "Inspector One" },
      assignment: {
        scheduledAt: "2026-08-02T19:00:00.000Z",
        assignedBy: { name: "Admin One" },
        fulfillmentType: "afterlight_contractor",
      },
    }],
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
  expect(screen.getByText("Afterlight contractor")).toBeInTheDocument();
  expect(screen.getByText("Date assigned")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "View PDF" })).toHaveAttribute(
    "href",
    "https://signed.example.com/report.pdf"
  );
  expect(global.fetch).toHaveBeenCalledWith(
    "/api/admin/submissions/Black%20Crown?months=12",
    expect.objectContaining({
      method: "GET",
      headers: { Authorization: "Bearer test-token" },
    })
  );
});
