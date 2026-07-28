export const NOTIFICATION_BANNER_SNOOZE_KEY = "notificationBannerSnoozedUntil";
export const NOTIFICATION_BANNER_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

export function notificationBannerIsSnoozed(storage, now = Date.now()) {
  const snoozedUntil = Number(storage?.getItem(NOTIFICATION_BANNER_SNOOZE_KEY) || 0);
  return Number.isFinite(snoozedUntil) && snoozedUntil > now;
}

export function snoozeNotificationBanner(storage, now = Date.now()) {
  const snoozedUntil = now + NOTIFICATION_BANNER_SNOOZE_MS;
  storage?.setItem(NOTIFICATION_BANNER_SNOOZE_KEY, String(snoozedUntil));
  return snoozedUntil;
}

export function clearNotificationBannerSnooze(storage) {
  storage?.removeItem(NOTIFICATION_BANNER_SNOOZE_KEY);
}

export function withNotificationSetupTimeout(
  promise,
  message,
  timeoutMs = 15000,
  timerApi = window
) {
  let timeout;
  const deadline = new Promise((_, reject) => {
    timeout = timerApi.setTimeout(() => {
      const error = new Error(message);
      error.name = "NotificationSetupError";
      error.status = "unavailable";
      reject(error);
    }, timeoutMs);
  });
  return Promise.race([promise, deadline])
    .finally(() => timerApi.clearTimeout(timeout));
}
