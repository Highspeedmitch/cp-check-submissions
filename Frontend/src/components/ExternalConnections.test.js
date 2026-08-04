import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ExternalConnections from "./ExternalConnections";

jest.mock("../services/session", () => ({ logoutSession: jest.fn() }));
jest.mock("./CalendarFeedCard", () => function CalendarFeedCard() {
  return <section><h2>Connect My Calendar</h2></section>;
});

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("accountScope", "afterlight_resource");
  localStorage.setItem("role", "contractor");
});

test("keeps shared account controls in the resource sidebar only", () => {
  render(<MemoryRouter><ExternalConnections setUser={jest.fn()} /></MemoryRouter>);

  expect(screen.getByRole("heading", { name: "External Connections" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Connect My Calendar" })).toBeInTheDocument();
  expect(screen.getAllByRole("checkbox", { name: "Dark mode" })).toHaveLength(1);
  expect(screen.getAllByRole("button", { name: "Help Center" })).toHaveLength(1);
  expect(screen.getAllByRole("button", { name: "Log out" })).toHaveLength(1);
});
