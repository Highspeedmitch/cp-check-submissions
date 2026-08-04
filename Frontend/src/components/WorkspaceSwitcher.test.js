import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import WorkspaceSwitcher from "./WorkspaceSwitcher";
import { api } from "../services/api";

jest.mock("../services/api", () => ({
  api: { post: jest.fn() },
}));

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
});

test("switches a dual-workspace submitter into the Resource Portal", async () => {
  localStorage.setItem("token", "old-token");
  localStorage.setItem("accountScope", "organization");
  localStorage.setItem("availableWorkspaces", JSON.stringify([
    "organization",
    "afterlight_resource",
  ]));
  api.post.mockResolvedValue({
    token: "new-token",
    organizationId: "org-1",
    orgName: "Example",
    orgType: "COM",
    role: "user",
    accountScope: "afterlight_resource",
    availableWorkspaces: ["organization", "afterlight_resource"],
  });

  render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <WorkspaceSwitcher />
      <Routes><Route path="/resource" element={<div>Resource destination</div>} /></Routes>
    </MemoryRouter>
  );

  fireEvent.click(screen.getByRole("button", { name: "Resource Portal" }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/api/auth/workspace",
    { accountScope: "afterlight_resource" }
  ));
  expect(await screen.findByText("Resource destination")).toBeInTheDocument();
  expect(localStorage.getItem("accountScope")).toBe("afterlight_resource");
});

test("stays hidden for a single-workspace account", () => {
  localStorage.setItem("accountScope", "organization");
  localStorage.setItem("availableWorkspaces", JSON.stringify(["organization"]));
  render(<MemoryRouter><WorkspaceSwitcher /></MemoryRouter>);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
