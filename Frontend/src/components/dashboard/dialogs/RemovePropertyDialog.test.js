import { fireEvent, render, screen } from "@testing-library/react";
import RemovePropertyDialog from "./RemovePropertyDialog";

const properties = [
  { _id: "property-1", name: "Campbell Fair | Fort Lowell & Glenn" },
  { _id: "property-2", name: "Menlo Park Shopping Center | St. Mary's" },
];

const defaults = {
  properties,
  propertyId: "property-1",
  passkey: "",
  busy: false,
  impactLoading: false,
  error: "",
  onPropertyChange: jest.fn(),
  onPasskeyChange: jest.fn(),
  onConfirm: jest.fn(),
  onClose: jest.fn(),
};

beforeEach(() => jest.clearAllMocks());

test("platform-managed removal keeps the property selector and hides the passkey", () => {
  render(<RemovePropertyDialog
    {...defaults}
    requiresPasskey={false}
    impact={{ canRemove: true, blockers: [] }}
  />);

  expect(screen.getByLabelText("Property")).toHaveValue("property-1");
  expect(screen.queryByLabelText("Removal passkey")).not.toBeInTheDocument();
  expect(screen.getByText(/protected, audited Admin View session/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Confirm Removal" })).toBeEnabled();
});

test("customer-managed removal requires a passkey and surfaces the API error inline", () => {
  render(<RemovePropertyDialog
    {...defaults}
    requiresPasskey
    error="Administrative verification failed."
    impact={{ canRemove: true, blockers: [] }}
  />);

  expect(screen.getByRole("alert")).toHaveTextContent("Administrative verification failed.");
  expect(screen.getByRole("button", { name: "Confirm Removal" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Removal passkey"), { target: { value: "correct-passkey" } });
  expect(defaults.onPasskeyChange).toHaveBeenCalledWith("correct-passkey");
});

test("linked records are listed and prevent removal", () => {
  render(<RemovePropertyDialog
    {...defaults}
    requiresPasskey={false}
    impact={{
      canRemove: false,
      blockers: [{
        code: "assignments",
        count: 2,
        label: "assignments",
        message: "Assignments preserve scheduling and completion history for this property.",
      }],
    }}
  />);

  expect(screen.getByRole("alert")).toHaveTextContent("2 assignments");
  expect(screen.getByRole("button", { name: "Confirm Removal" })).toBeDisabled();
});

test("property selection emits the immutable property ID", () => {
  render(<RemovePropertyDialog
    {...defaults}
    propertyId=""
    requiresPasskey={false}
    impact={null}
  />);

  fireEvent.change(screen.getByLabelText("Property"), { target: { value: "property-2" } });
  expect(defaults.onPropertyChange).toHaveBeenCalledWith("property-2");
});
