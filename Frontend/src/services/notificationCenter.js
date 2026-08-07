import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

export const NOTIFICATION_SECTIONS = {
  dashboard: [
    "assignment_created",
    "assignment_rescheduled",
    "assignment_reassigned",
    "assignment_canceled",
    "inspection_submitted",
    "assignment_completed",
  ],
  billing: [
    "invoice_submitted",
    "invoice_submitted_for_review",
    "invoice_review_changed",
    "invoice_status_changed",
    "invoice_ap_delivery_queued",
    "invoice_ap_delivery_failed",
  ],
  bids: ["bid_request_submitted", "bid_request_received", "bid_request_status_changed"],
  resources: [
    "contractor_earning_created",
    "contractor_earning_approved",
    "contractor_earning_voided",
    "gusto_batch_created",
    "gusto_batch_submitted",
    "gusto_batch_paid",
  ],
  serviceModels: [
    "service_model_change_requested",
    "service_model_information_requested",
    "service_model_information_supplied",
    "service_model_change_approved",
    "service_model_change_denied",
    "license_tier_change_requested",
    "license_tier_information_requested",
    "license_tier_information_supplied",
    "license_tier_change_approved",
    "license_tier_change_denied",
    "custom_capacity_change_requested",
    "custom_capacity_information_requested",
    "custom_capacity_information_supplied",
    "custom_capacity_change_approved",
    "custom_capacity_change_denied",
  ],
  platformOrganizations: [
    "administrator_license_requested",
    "bulk_onboarding_assistance_requested",
  ],
  platformBilling: [
    "invoice_ap_delivery_queued",
    "invoice_ap_delivery_failed",
    "afterlight_service_invoice_paid",
  ],
};

const PROPERTY_ACTIVITY_TYPES = new Set(["inspection_submitted", "assignment_completed"]);

export function groupUnreadNotifications(notifications) {
  const unread = notifications.filter((notification) => !notification.readAt);
  return Object.fromEntries(Object.entries(NOTIFICATION_SECTIONS).map(([section, types]) => [
    section,
    unread.filter((notification) => {
      if (!types.includes(notification.type)) return false;
      if (section === "platformBilling") return notification.recipientScope === "platform";
      if (section === "platformOrganizations") return notification.recipientScope === "platform";
      if (section === "billing") return notification.recipientScope !== "platform";
      return true;
    }).length,
  ]));
}

export function unreadPropertyActivityRoutes(notifications) {
  return [...new Set(
    notifications
      .filter((notification) =>
        !notification.readAt
        && PROPERTY_ACTIVITY_TYPES.has(notification.type)
        && /^\/admin\/submissions\/[^/]+$/.test(notification.route || "")
      )
      .map((notification) => notification.route)
  )];
}

export function useNotificationBadges(enabled = true) {
  const [badgeState, setBadgeState] = useState({
    dashboard: 0,
    billing: 0,
    bids: 0,
    resources: 0,
    serviceModels: 0,
    platformBilling: 0,
    platformOrganizations: 0,
    propertyActivityRoutes: [],
  });

  const load = useCallback(async () => {
    if (!enabled || !localStorage.getItem("token")) return;
    try {
      const notifications = await api.get("/api/notifications?unread=true");
      setBadgeState({
        ...groupUnreadNotifications(notifications),
        propertyActivityRoutes: unreadPropertyActivityRoutes(notifications),
      });
    } catch (error) {
      // Badges are supplemental and should not interrupt the dashboard.
    }
  }, [enabled]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 30000);
    const handleVisibility = () => document.visibilityState === "visible" && load();
    const handleRead = () => load();
    const handlePush = () => load();
    const handleServiceWorkerMessage = (event) => {
      if (event.data?.type === "afterlight-notification-received") load();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("notifications-read", handleRead);
    window.addEventListener("afterlight-notification-received", handlePush);
    navigator.serviceWorker?.addEventListener("message", handleServiceWorkerMessage);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("notifications-read", handleRead);
      window.removeEventListener("afterlight-notification-received", handlePush);
      navigator.serviceWorker?.removeEventListener("message", handleServiceWorkerMessage);
    };
  }, [load]);

  return badgeState;
}

export function useMarkNotificationsRead(types, route = "") {
  const stableTypes = [...types].sort().join(",");
  useEffect(() => {
    if (!stableTypes || !localStorage.getItem("token")) return;
    api.put("/api/notifications/read", {
      types: stableTypes.split(","),
      route,
    }).then(() => {
      window.dispatchEvent(new Event("notifications-read"));
    }).catch(() => {});
  }, [stableTypes, route]);
}
