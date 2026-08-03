import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CalendarFeedCard from "./CalendarFeedCard";
import { api } from "../services/api";

jest.mock("../services/api", () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
  },
  apiUrl: (path) => `https://dev.example.com${path}`,
}));

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  localStorage.setItem("role", "user");
  localStorage.setItem("orgType", "COM");
  localStorage.setItem("accountScope", "organization");
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: jest.fn().mockResolvedValue(undefined) },
  });
  window.confirm = jest.fn(() => true);
});

function renderCard() {
  return render(<MemoryRouter><CalendarFeedCard /></MemoryRouter>);
}

test("creates and copies a private link that was not available in status", async () => {
  api.get.mockResolvedValue({ connected: false, generatedAt: null, lastAccessedAt: null });
  api.post.mockResolvedValue({
    connected: true,
    generatedAt: "2026-08-03T20:00:00.000Z",
    subscriptionPath: "/calendar/private-token/assignments.ics",
  });
  renderCard();

  fireEvent.click(await screen.findByRole("button", { name: "Create Private Link" }));

  const link = await screen.findByLabelText("Private subscription URL");
  expect(link).toHaveValue("https://dev.example.com/calendar/private-token/assignments.ics");
  expect(api.post).toHaveBeenCalledWith("/api/calendar-feed", {});
  fireEvent.click(screen.getByRole("button", { name: "Copy Link" }));
  await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(link.value));
  expect(await screen.findByText("Private calendar link copied.")).toBeInTheDocument();
});

test("an existing connection never retrieves or displays its raw link", async () => {
  api.get.mockResolvedValue({
    connected: true,
    generatedAt: "2026-08-03T20:00:00.000Z",
    lastAccessedAt: "2026-08-03T21:00:00.000Z",
  });
  renderCard();

  expect(await screen.findByText("Connected")).toBeInTheDocument();
  expect(screen.queryByLabelText("Private subscription URL")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Regenerate Link" })).toBeInTheDocument();
});

test("disconnect revokes the server feed and returns the card to its initial state", async () => {
  api.get.mockResolvedValue({ connected: true, generatedAt: null, lastAccessedAt: null });
  api.delete.mockResolvedValue(null);
  renderCard();

  fireEvent.click(await screen.findByRole("button", { name: "Disconnect" }));

  await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/api/calendar-feed"));
  expect(await screen.findByText("Calendar feed disconnected.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Create Private Link" })).toBeInTheDocument();
});
