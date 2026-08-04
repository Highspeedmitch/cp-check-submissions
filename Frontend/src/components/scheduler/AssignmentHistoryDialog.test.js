import { fireEvent, render, screen } from "@testing-library/react";
import AssignmentHistoryDialog from "./AssignmentHistoryDialog";

test("shows completed assignment details as a read-only history", () => {
  const onClose = jest.fn();
  render(<AssignmentHistoryDialog
    assignments={[{
      _id: "assignment-1",
      propertyName: "Black Crown",
      eventType: "QA Check",
      fulfillmentType: "afterlight_contractor",
      assignedTo: { name: "Inspector One" },
      assignedBy: { name: "Admin One" },
      scheduledAt: "2026-08-03T16:00:00.000Z",
      assignedAt: "2026-08-01T16:00:00.000Z",
      completedAt: "2026-08-03T18:30:00.000Z",
      status: "completed",
    }]}
    loading={false}
    error=""
    onClose={onClose}
  />);

  expect(screen.getByRole("heading", { name: "Assignment history" })).toBeInTheDocument();
  expect(screen.getByText("Black Crown")).toBeInTheDocument();
  expect(screen.getByText("Afterlight contractor")).toBeInTheDocument();
  expect(screen.getByText("Inspector One")).toBeInTheDocument();
  expect(screen.getByText("Admin One")).toBeInTheDocument();
  expect(screen.getByText("completed")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(onClose).toHaveBeenCalledTimes(1);
});
