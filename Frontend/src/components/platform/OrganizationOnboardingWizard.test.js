import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import OrganizationOnboardingWizard from "./OrganizationOnboardingWizard";

beforeEach(() => localStorage.clear());

test("guides platform administrators through a reviewed organization launch", async () => {
  const onCreate = jest.fn().mockResolvedValue(true);
  render(
    <OrganizationOnboardingWizard
      open
      busy={false}
      error=""
      onClose={jest.fn()}
      onCreate={onCreate}
    />
  );

  fireEvent.change(screen.getByLabelText("Organization name"), { target: { value: "Example Management" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(screen.getByRole("heading", { name: "Service delivery" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("radio", { name: /^Hybrid/ }));
  fireEvent.change(screen.getByRole("combobox", { name: /License tier/i }), { target: { value: "tier_2" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.change(screen.getByLabelText("Administrator email"), { target: { value: "ADMIN@EXAMPLE.COM" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));

  expect(screen.getByText("Example Management")).toBeInTheDocument();
  expect(screen.getByText(/Hybrid · Customer employee/)).toBeInTheDocument();
  expect(screen.getByText(/Tier 2.*3 administrators/)).toBeInTheDocument();
  expect(screen.getByText(/Tier 2.*\$700\/month.*12% Afterlight minimum/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Launch Organization" }));

  await waitFor(() => expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
    name: "Example Management",
    serviceModel: "hybrid",
    licenseTier: "tier_2",
    defaultFulfillmentSource: "customer_employee",
    initialAdminEmail: "admin@example.com",
  })));
  await waitFor(() => expect(localStorage.getItem("afterlightOrganizationOnboardingDraft")).toBeNull());
});

test("preserves a partial draft when the wizard is closed", () => {
  const view = render(
    <OrganizationOnboardingWizard open busy={false} error="" onClose={jest.fn()} onCreate={jest.fn()} />
  );
  fireEvent.change(screen.getByLabelText("Organization name"), { target: { value: "Saved Organization" } });
  view.rerender(
    <OrganizationOnboardingWizard open={false} busy={false} error="" onClose={jest.fn()} onCreate={jest.fn()} />
  );
  view.rerender(
    <OrganizationOnboardingWizard open busy={false} error="" onClose={jest.fn()} onCreate={jest.fn()} />
  );
  expect(screen.getByLabelText("Organization name")).toHaveValue("Saved Organization");
});

test("launches an Afterlight-managed organization without an administrator email", async () => {
  const onCreate = jest.fn().mockResolvedValue(true);
  render(
    <OrganizationOnboardingWizard open busy={false} error="" onClose={jest.fn()} onCreate={onCreate} />
  );

  fireEvent.change(screen.getByLabelText("Organization name"), { target: { value: "Delegated Portfolio" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.click(screen.getByRole("radio", { name: /^Afterlight managed/ }));

  expect(screen.queryByLabelText("Administrator email")).not.toBeInTheDocument();
  expect(screen.getByText(/No organization administrator account or invitation/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(screen.getByText("Afterlight managed")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Launch Organization" }));

  await waitFor(() => expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
    name: "Delegated Portfolio",
    administrationMode: "platform_managed",
    initialAdminEmail: null,
  })));
});

test("SaaS onboarding offers only customer-controlled fulfillment", () => {
  render(
    <OrganizationOnboardingWizard open busy={false} error="" onClose={jest.fn()} onCreate={jest.fn()} />
  );
  fireEvent.change(screen.getByLabelText("Organization name"), { target: { value: "SaaS Organization" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.click(screen.getByLabelText(/Full-stack SaaS/));

  const fulfillmentSelect = screen.getByRole("combobox", { name: /Default fulfillment/i });
  expect(fulfillmentSelect).toHaveValue("customer_employee");
  expect(screen.getByRole("option", { name: "Customer employee" })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "Customer contractor" })).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "Afterlight staff" })).not.toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "Afterlight contractor" })).not.toBeInTheDocument();
});

test("Boutique onboarding applies the $75 non-tiered plan and Afterlight fulfillment", async () => {
  const onCreate = jest.fn().mockResolvedValue(true);
  render(
    <OrganizationOnboardingWizard open busy={false} error="" onClose={jest.fn()} onCreate={onCreate} />
  );

  fireEvent.change(screen.getByLabelText("Organization name"), { target: { value: "Small Firm" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.click(screen.getByLabelText(/Boutique/));

  expect(screen.queryByRole("combobox", { name: /License tier/i })).not.toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: /Default fulfillment/i })).toHaveValue("afterlight_staff");
  expect(screen.queryByRole("option", { name: "Customer employee" })).not.toBeInTheDocument();
  expect(screen.getByRole("option", { name: "Afterlight contractor" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.change(screen.getByLabelText("Administrator email"), { target: { value: "owner@small.example" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(screen.getByText(/Boutique.*\$75\/month \+ visit costs/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Launch Organization" }));

  await waitFor(() => expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
    serviceModel: "boutique",
    licenseTier: null,
    defaultFulfillmentSource: "afterlight_staff",
  })));
});

test("Boutique is unavailable for non-commercial organizations", () => {
  render(
    <OrganizationOnboardingWizard open busy={false} error="" onClose={jest.fn()} onCreate={jest.fn()} />
  );

  fireEvent.change(screen.getByLabelText("Organization name"), { target: { value: "Residential Firm" } });
  fireEvent.change(screen.getByLabelText("Organization type"), { target: { value: "RES" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));

  expect(screen.getByLabelText(/Boutique/)).toBeDisabled();
  expect(screen.getByText(/Commercial organizations only/)).toBeInTheDocument();
});
