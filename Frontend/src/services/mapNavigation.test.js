import {
  isAppleMapsDevice,
  mapDirectionsUrl,
  openNativeMaps,
} from "./mapNavigation";

test("recognizes iPhone and iPadOS desktop-mode devices", () => {
  expect(isAppleMapsDevice({
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X)",
    platform: "iPhone",
    maxTouchPoints: 5,
  })).toBe(true);
  expect(isAppleMapsDevice({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)",
    platform: "MacIntel",
    maxTouchPoints: 5,
  })).toBe(true);
  expect(isAppleMapsDevice({
    userAgent: "Mozilla/5.0 (Linux; Android 16)",
    platform: "Linux armv8l",
    maxTouchPoints: 5,
  })).toBe(false);
});

test("builds documented Apple Map Links for Apple mobile devices", () => {
  expect(mapDirectionsUrl(33.45, -112.07, {
    userAgent: "Mozilla/5.0 (iPhone)",
    platform: "iPhone",
  })).toBe("https://maps.apple.com/?daddr=33.45%2C-112.07&dirflg=d");
});

test("builds Google Maps directions for non-Apple devices", () => {
  expect(mapDirectionsUrl("33.45", "-112.07", {
    userAgent: "Mozilla/5.0 (Linux; Android 16)",
    platform: "Linux armv8l",
  })).toBe("https://www.google.com/maps/dir/?api=1&destination=33.45%2C-112.07");
});

test("opens the selected native map destination from the user gesture", () => {
  const openWindow = jest.fn();

  expect(openNativeMaps(33.45, -112.07, {
    navigatorObject: { userAgent: "Mozilla/5.0 (iPhone)", platform: "iPhone" },
    openWindow,
  })).toBe(true);
  expect(openWindow).toHaveBeenCalledWith(
    "https://maps.apple.com/?daddr=33.45%2C-112.07&dirflg=d",
    "_blank",
    "noopener,noreferrer"
  );
});

test("rejects invalid coordinates without opening a window", () => {
  const openWindow = jest.fn();

  expect(openNativeMaps(100, -112.07, { openWindow })).toBe(false);
  expect(openWindow).not.toHaveBeenCalled();
});
