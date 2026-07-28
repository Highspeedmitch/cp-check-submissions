import {
  NOTIFICATION_BANNER_SNOOZE_KEY,
  NOTIFICATION_BANNER_SNOOZE_MS,
  notificationBannerIsSnoozed,
  snoozeNotificationBanner,
  clearNotificationBannerSnooze,
  withNotificationSetupTimeout,
} from "./notificationBanner";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test("notification banner can be snoozed for seven days", () => {
  const storage = memoryStorage();
  const now = Date.UTC(2026, 6, 28);

  const snoozedUntil = snoozeNotificationBanner(storage, now);

  expect(snoozedUntil).toBe(now + NOTIFICATION_BANNER_SNOOZE_MS);
  expect(storage.getItem(NOTIFICATION_BANNER_SNOOZE_KEY)).toBe(String(snoozedUntil));
  expect(notificationBannerIsSnoozed(storage, now + 1000)).toBe(true);
  expect(notificationBannerIsSnoozed(storage, snoozedUntil)).toBe(false);
});

test("successful notification setup clears a prior snooze", () => {
  const storage = memoryStorage();
  snoozeNotificationBanner(storage, Date.now());

  clearNotificationBannerSnooze(storage);

  expect(notificationBannerIsSnoozed(storage)).toBe(false);
});

test("notification setup cannot remain pending indefinitely", async () => {
  jest.useFakeTimers();
  const pending = new Promise(() => {});
  const result = withNotificationSetupTimeout(
    pending,
    "Notification setup timed out.",
    1000
  );

  jest.advanceTimersByTime(1000);

  await expect(result).rejects.toMatchObject({
    message: "Notification setup timed out.",
    status: "unavailable",
  });
  jest.useRealTimers();
});
