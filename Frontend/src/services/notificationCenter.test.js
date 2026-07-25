import { groupUnreadNotifications } from "./notificationCenter";

test("groups only unread notifications into their destination sections", () => {
  expect(groupUnreadNotifications([
    { type: "invoice_status_changed", readAt: null },
    { type: "invoice_submitted", readAt: "2026-07-25T00:00:00Z" },
    { type: "bid_request_received", readAt: null },
    { type: "inspection_submitted", readAt: null },
    { type: "unknown_event", readAt: null },
  ])).toEqual({ dashboard: 1, billing: 1, bids: 1 });
});
