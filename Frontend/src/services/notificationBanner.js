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
