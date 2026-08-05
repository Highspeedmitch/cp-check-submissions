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

  fireEvent.click(screen.getByLabelText(/Hybrid/));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.change(screen.getByLabelText("Administrator email"), { target: { value: "ADMIN@EXAMPLE.COM" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));

  expect(screen.getByText("Example Management")).toBeInTheDocument();
  expect(screen.getByText(/Hybrid · Customer employee/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Launch Organization" }));

  await waitFor(() => expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
    name: "Example Management",
    serviceModel: "hybrid",
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
