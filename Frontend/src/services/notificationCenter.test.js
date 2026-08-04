import {
  groupUnreadNotifications,
  unreadPropertyActivityRoutes,
} from "./notificationCenter";

test("groups only unread notifications into their destination sections", () => {
  expect(groupUnreadNotifications([
    { type: "invoice_status_changed", readAt: null },
    { type: "invoice_submitted_for_review", readAt: null },
    { type: "invoice_submitted", readAt: "2026-07-25T00:00:00Z" },
    { type: "bid_request_received", readAt: null },
    { type: "inspection_submitted", readAt: null },
    { type: "assignment_completed", readAt: null },
    { type: "unknown_event", readAt: null },
  ])).toEqual({
    dashboard: 2,
    billing: 2,
    bids: 1,
    resources: 0,
    serviceModels: 0,
    platformBilling: 0,
  });
});

test("separates platform billing events and groups new operational notifications", () => {
  expect(groupUnreadNotifications([
    { type: "invoice_ap_delivery_failed", recipientScope: "platform", readAt: null },
    { type: "invoice_ap_delivery_queued", recipientScope: "organization", readAt: null },
    { type: "contractor_earning_created", recipientScope: "platform", readAt: null },
    { type: "gusto_batch_paid", recipientScope: "afterlight_resource", readAt: null },
    { type: "service_model_change_approved", recipientScope: "organization", readAt: null },
    { type: "assignment_canceled", recipientScope: "afterlight_resource", readAt: null },
  ])).toEqual({
    dashboard: 1,
    billing: 1,
    bids: 0,
    resources: 2,
    serviceModels: 1,
    platformBilling: 1,
  });
});

test("identifies properties with unread inspection activity", () => {
  expect(unreadPropertyActivityRoutes([
    {
      type: "inspection_submitted",
      route: "/admin/submissions/Broadway%20Center",
      readAt: null,
    },
    {
      type: "assignment_completed",
      route: "/admin/submissions/22%20%26%20Harrison",
      readAt: null,
    },
    {
      type: "inspection_submitted",
      route: "/admin/submissions/Already%20Read",
      readAt: "2026-07-28T00:00:00Z",
    },
    {
      type: "invoice_status_changed",
      route: "/billing",
      readAt: null,
    },
  ])).toEqual([
    "/admin/submissions/Broadway%20Center",
    "/admin/submissions/22%20%26%20Harrison",
  ]);
});
