import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "./App";

jest.mock("./components/Dashboard", () => () => <div>Dashboard</div>);
jest.mock("./components/AzRootsScheduler", () => () => <div>AzRoots Scheduler</div>);
jest.mock("./components/Scheduler", () => () => <div>Scheduler</div>);
jest.mock("./components/ResidentialForm", () => () => <div>Residential Form</div>);
jest.mock("./components/ResourceDashboard", () => () => <div>Resource Workspace</div>);

function renderApp(initialPath = "/") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <App />
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
});

test("shows the login screen when there is no authenticated user", async () => {
  renderApp();

  expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
});

test("shows the dashboard for an authenticated non-client user", async () => {
  localStorage.setItem("token", "test-token");
  localStorage.setItem("role", "user");

  renderApp("/dashboard");

  expect(await screen.findByText("Dashboard")).toBeInTheDocument();
});

test("routes an authenticated Afterlight resource to the shared resource workspace", async () => {
  localStorage.setItem("token", "test-token");
  localStorage.setItem("role", "contractor");
  localStorage.setItem("accountScope", "afterlight_resource");

  renderApp("/dashboard");

  expect(await screen.findByText("Resource Workspace")).toBeInTheDocument();
});
