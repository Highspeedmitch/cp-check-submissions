import { fireEvent, render, screen } from "@testing-library/react";
import SchedulerCalendar from "./SchedulerCalendar";

const calendarDate = new Date(2026, 7, 11);
const nextDate = new Date(2026, 7, 12);
const thirdDate = new Date(2026, 7, 13);

jest.mock("react-big-calendar", () => {
  const React = require("react");

  return {
    Calendar: (props) => {
      const mockedDate = new Date(2026, 7, 11);
      const mockedNextDate = new Date(2026, 7, 12);
      const mockedThirdDate = new Date(2026, 7, 13);
      const DateHeader = props.components.month.dateHeader;
      return (
        <div data-testid="calendar" data-view={props.view}>
          <DateHeader date={mockedDate} label="11" isOffRange={false} />
          <button type="button" onClick={() => props.onShowMore(props.events, mockedDate, 0)}>
            Show overflow
          </button>
          <button type="button" onClick={() => props.onSelectSlot({
            start: mockedDate,
            end: mockedNextDate,
            slots: [mockedDate],
            action: "click",
          })}>
            Select one day
          </button>
          <button type="button" onClick={() => props.onSelectSlot({
            start: mockedDate,
            end: mockedThirdDate,
            slots: [mockedDate, mockedNextDate],
            action: "select",
          })}>
            Select date range
          </button>
        </div>
      );
    },
    momentLocalizer: () => ({}),
  };
});

jest.mock("react-big-calendar/lib/addons/dragAndDrop", () => ({
  __esModule: true,
  default: (Component) => Component,
}));

jest.mock("react-dnd", () => ({
  DndProvider: ({ children }) => children,
}));

jest.mock("react-dnd-html5-backend", () => ({
  HTML5Backend: {},
}));

const events = [
  { _id: "a-1", propertyName: "North Plaza", assigneeLabel: "Alex@example.com", start: calendarDate, end: nextDate, tone: "customer" },
  { _id: "a-2", propertyName: "South Plaza", assigneeLabel: "Blair@example.com", start: calendarDate, end: nextDate, tone: "afterlight" },
  { _id: "a-3", propertyName: "East Plaza", assigneeLabel: "Casey@example.com", start: calendarDate, end: nextDate, tone: "customer" },
  { _id: "a-4", propertyName: "West Plaza", assigneeLabel: "Drew@example.com", start: calendarDate, end: nextDate, tone: "legacy" },
  { _id: "a-5", propertyName: "Tomorrow Plaza", assigneeLabel: "Em@example.com", start: nextDate, end: thirdDate, tone: "customer" },
];

function setCompactViewport(matches) {
  window.matchMedia = jest.fn().mockImplementation(() => ({
    matches,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  }));
}

function renderCalendar(overrides = {}) {
  const props = {
    events,
    onEventDrop: jest.fn(),
    onSelectEvent: jest.fn(),
    onSelectSlot: jest.fn(),
    onNewAssignment: jest.fn(),
    onHistory: jest.fn(),
    ...overrides,
  };
  render(<SchedulerCalendar {...props} />);
  return props;
}

beforeEach(() => setCompactViewport(false));

test("shows the assignment count and opens every assignment in the desktop day panel", () => {
  const onSelectEvent = jest.fn();
  renderCalendar({ onSelectEvent });

  fireEvent.click(screen.getByRole("button", { name: /View 4 assignments on Tuesday, August 11/i }));

  expect(screen.getByRole("dialog", { name: "Tuesday, August 11" })).toBeInTheDocument();
  expect(screen.getByText("4 assignments scheduled")).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: /Edit .* assignment/i })).toHaveLength(4);
  expect(screen.queryByText("Tomorrow Plaza")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Edit South Plaza assignment" }));
  expect(onSelectEvent).toHaveBeenCalledWith(events[1]);
  expect(screen.queryByRole("dialog", { name: "Tuesday, August 11" })).not.toBeInTheDocument();
});

test("opens the day panel from calendar overflow and creates an assignment for that day", () => {
  const onSelectSlot = jest.fn();
  renderCalendar({ onSelectSlot });

  fireEvent.click(screen.getByRole("button", { name: "Show overflow" }));
  expect(screen.getByRole("dialog", { name: "Tuesday, August 11" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /Create Assignment/i }));
  expect(onSelectSlot).toHaveBeenCalledWith(expect.objectContaining({
    start: calendarDate,
    end: nextDate,
    slots: [calendarDate],
  }));
});

test("uses a single month date for drill-down while retaining multi-day drag creation", () => {
  const onSelectSlot = jest.fn();
  renderCalendar({ onSelectSlot });

  fireEvent.click(screen.getByRole("button", { name: "Select one day" }));
  expect(screen.getByRole("dialog", { name: "Tuesday, August 11" })).toBeInTheDocument();
  expect(onSelectSlot).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Close daily schedule" }));
  fireEvent.click(screen.getByRole("button", { name: "Select date range" }));
  expect(onSelectSlot).toHaveBeenCalledWith(expect.objectContaining({
    start: calendarDate,
    end: thirdDate,
  }));
});

test("keeps selected-day details inline on compact screens", () => {
  const onSelectSlot = jest.fn();
  setCompactViewport(true);
  renderCalendar({ onSelectSlot });

  fireEvent.click(screen.getByRole("button", { name: "Select date range" }));

  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByText("4 assignments")).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: /Edit .* assignment/i })).toHaveLength(4);

  fireEvent.click(screen.getByRole("button", { name: /Create Assignment/i }));
  expect(onSelectSlot).toHaveBeenCalledWith(expect.objectContaining({
    start: calendarDate,
    end: thirdDate,
  }));
});
