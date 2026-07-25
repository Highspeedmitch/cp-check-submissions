import { useCallback, useEffect, useState } from "react";

const API = "https://cp-check-submissions-dev-backend.onrender.com/api/notifications";

export const NOTIFICATION_SECTIONS = {
  dashboard: ["assignment_created", "inspection_submitted"],
  billing: ["invoice_submitted", "invoice_status_changed", "payment_processed"],
  bids: ["bid_request_submitted", "bid_request_received", "bid_request_status_changed"],
};

export function groupUnreadNotifications(notifications) {
  const unread = notifications.filter((notification) => !notification.readAt);
  return Object.fromEntries(Object.entries(NOTIFICATION_SECTIONS).map(([section, types]) => [
    section,
    unread.filter((notification) => types.includes(notification.type)).length,
  ]));
}

function authHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${localStorage.getItem("token")}`,
  };
}

export function useNotificationBadges(enabled = true) {
  const [counts, setCounts] = useState({ dashboard: 0, billing: 0, bids: 0 });

  const load = useCallback(async () => {
    if (!enabled || !localStorage.getItem("token")) return;
    try {
      const response = await fetch(`${API}?unread=true`, { headers: authHeaders() });
      if (!response.ok) return;
      setCounts(groupUnreadNotifications(await response.json()));
    } catch (error) {
      // Badges are supplemental and should not interrupt the dashboard.
    }
  }, [enabled]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 30000);
    const handleVisibility = () => document.visibilityState === "visible" && load();
    const handleRead = () => load();
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("notifications-read", handleRead);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("notifications-read", handleRead);
    };
  }, [load]);

  return counts;
}

export function useMarkNotificationsRead(types, route = "") {
  const stableTypes = [...types].sort().join(",");
  useEffect(() => {
    if (!stableTypes || !localStorage.getItem("token")) return;
    fetch(`${API}/read`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ types: stableTypes.split(","), route }),
    }).then((response) => {
      if (response.ok) window.dispatchEvent(new Event("notifications-read"));
    }).catch(() => {});
  }, [stableTypes, route]);
}
