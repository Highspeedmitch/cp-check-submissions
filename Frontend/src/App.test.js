import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "./App";

jest.mock("./components/Dashboard", () => () => <div>Dashboard</div>);
jest.mock("./components/AzRootsScheduler", () => () => <div>AzRoots Scheduler</div>);
jest.mock("./components/Scheduler", () => () => <div>Scheduler</div>);
jest.mock("./components/ResidentialForm", () => () => <div>Residential Form</div>);
jest.mock("./components/ResourceDashboard", () => () => <div>Resource Workspace</div>);
jest.mock("./components/ExternalConnections", () => () => <div>External Connections Page</div>);
jest.mock("./components/Reporting", () => () => <div>Portfolio Reporting</div>);
jest.mock("./components/FormPage", () => () => <div>Commercial Inspection Form</div>);
jest.mock("./components/help/HelpArticle", () => () => <div>Public Contractor Setup Guide</div>);

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

test("allows assignable organization users to open External Connections", async () => {
  localStorage.setItem("token", "test-token");
  localStorage.setItem("role", "user");
  localStorage.setItem("accountScope", "organization");

  renderApp("/external-connections");

  expect(await screen.findByText("External Connections Page")).toBeInTheDocument();
});

test("rejects organization administrators from External Connections", async () => {
  localStorage.setItem("token", "test-token");
  localStorage.setItem("role", "admin");
  localStorage.setItem("accountScope", "organization");

  renderApp("/external-connections");

  expect(await screen.findByText("Dashboard")).toBeInTheDocument();
  expect(screen.queryByText("External Connections Page")).not.toBeInTheDocument();
});

test("allows Afterlight resource identities to open External Connections", async () => {
  localStorage.setItem("token", "test-token");
  localStorage.setItem("role", "admin");
  localStorage.setItem("accountScope", "afterlight_resource");

  renderApp("/external-connections");

  expect(await screen.findByText("External Connections Page")).toBeInTheDocument();
});

test("redirects Boutique property managers away from the Reporting route", async () => {
  localStorage.setItem("token", "test-token");
  localStorage.setItem("role", "property_manager");
  localStorage.setItem("accountScope", "organization");
  localStorage.setItem("serviceModel", "boutique");
  localStorage.setItem("portfolioReportingIncluded", "false");

  renderApp("/reporting");

  expect(await screen.findByText("Dashboard")).toBeInTheDocument();
  expect(screen.queryByText("Portfolio Reporting")).not.toBeInTheDocument();
});

test("keeps portfolio Reporting available to an entitled property manager", async () => {
  localStorage.setItem("token", "test-token");
  localStorage.setItem("role", "property_manager");
  localStorage.setItem("accountScope", "organization");
  localStorage.setItem("serviceModel", "managed");
  localStorage.setItem("portfolioReportingIncluded", "true");

  renderApp("/reporting");

  expect(await screen.findByText("Portfolio Reporting")).toBeInTheDocument();
});

test("redirects Boutique organization users away from an unassigned inspection form", async () => {
  localStorage.setItem("token", "test-token");
  localStorage.setItem("role", "user");
  localStorage.setItem("accountScope", "organization");
  localStorage.setItem("serviceModel", "boutique");

  renderApp("/form/Small%20Shop");

  expect(await screen.findByText("Dashboard")).toBeInTheDocument();
  expect(screen.queryByText("Commercial Inspection Form")).not.toBeInTheDocument();
});

test("retains an exact legacy assignment after an organization moves to Boutique", async () => {
  localStorage.setItem("token", "test-token");
  localStorage.setItem("role", "user");
  localStorage.setItem("accountScope", "organization");
  localStorage.setItem("serviceModel", "boutique");

  renderApp("/form/Small%20Shop?assignmentId=legacy-assignment-1");

  expect(await screen.findByText("Commercial Inspection Form")).toBeInTheDocument();
});

test("Afterlight resources require an assignment before opening any inspection form", async () => {
  localStorage.setItem("token", "test-token");
  localStorage.setItem("role", "contractor");
  localStorage.setItem("accountScope", "afterlight_resource");
  localStorage.setItem("serviceModel", "boutique");

  renderApp("/form/Small%20Shop");

  expect(await screen.findByText("Resource Workspace")).toBeInTheDocument();
  expect(screen.queryByText("Commercial Inspection Form")).not.toBeInTheDocument();
});

test("assigned Afterlight resources can open the Boutique inspection form", async () => {
  localStorage.setItem("token", "test-token");
  localStorage.setItem("role", "contractor");
  localStorage.setItem("accountScope", "afterlight_resource");
  localStorage.setItem("serviceModel", "boutique");

  renderApp("/form/Small%20Shop?assignmentId=afterlight-assignment-1");

  expect(await screen.findByText("Commercial Inspection Form")).toBeInTheDocument();
});

test("allows the contractor account setup guide before authentication", async () => {
  renderApp("/help/resource-account-setup");

  expect(await screen.findByText("Public Contractor Setup Guide")).toBeInTheDocument();
});
