function numericCoordinate(value, minimum, maximum) {
  const coordinate = Number(value);
  return Number.isFinite(coordinate) && coordinate >= minimum && coordinate <= maximum
    ? coordinate
    : null;
}

function currentNavigator() {
  return typeof navigator === "undefined" ? undefined : navigator;
}

function openBrowserWindow(...arguments_) {
  return typeof window === "undefined" ? undefined : window.open(...arguments_);
}

export function isAppleMapsDevice(navigatorObject = currentNavigator()) {
  const userAgent = String(navigatorObject?.userAgent || "");
  const platform = String(
    navigatorObject?.userAgentData?.platform
    || navigatorObject?.platform
    || ""
  );
  const touchPoints = Number(navigatorObject?.maxTouchPoints || 0);

  return /iPhone|iPad|iPod/i.test(userAgent)
    || /iPhone|iPad|iPod/i.test(platform)
    || (/Mac/i.test(platform) && touchPoints > 1);
}

export function mapDirectionsUrl(
  latitude,
  longitude,
  navigatorObject = currentNavigator()
) {
  const lat = numericCoordinate(latitude, -90, 90);
  const lng = numericCoordinate(longitude, -180, 180);
  if (lat === null || lng === null) return "";

  const destination = encodeURIComponent(`${lat},${lng}`);
  return isAppleMapsDevice(navigatorObject)
    ? `https://maps.apple.com/?daddr=${destination}&dirflg=d`
    : `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
}

export function openNativeMaps(
  latitude,
  longitude,
  {
    navigatorObject = currentNavigator(),
    openWindow = openBrowserWindow,
  } = {}
) {
  const url = mapDirectionsUrl(latitude, longitude, navigatorObject);
  if (!url || typeof openWindow !== "function") return false;
  openWindow(url, "_blank", "noopener,noreferrer");
  return true;
}
