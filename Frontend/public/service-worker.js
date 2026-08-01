const SHELL_CACHE = "afterlight-shell-v1";
const RUNTIME_CACHE = "afterlight-runtime-v1";
const CACHE_NAMES = new Set([SHELL_CACHE, RUNTIME_CACHE]);
const CORE_ASSETS = [
  "/",
  "/index.html",
  "/offline.html",
  "/manifest.json",
  "/favicon-32.png",
  "/apple-touch-icon.png",
  "/logo192.png",
  "/logo512.png",
  "/maskable-512.png",
  "/help/submitter-submit-inspection.md",
  "/help/submitter-submit-invoice.md",
  "/help/submitter-revise-invoice.md",
  "/help/property-manager-review-invoice.md",
  "/help/property-manager-review-submissions.md",
  "/help/admin-create-assignment.md",
  "/help/images/billing-revise-invoice.svg",
  "/help/images/billing-submit-invoice.svg",
  "/help/images/inspection-checklist.svg",
  "/help/images/invoice-review.svg",
  "/help/images/manager-dashboard.svg",
  "/help/images/property-submissions.svg",
  "/help/images/scheduler-assignment.svg",
  "/help/images/submitter-dashboard.svg",
];

async function cacheResponse(cacheName, request, response) {
  if (response?.ok && response.type !== "opaque") {
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
  }
  return response;
}

async function precacheShell() {
  const cache = await caches.open(SHELL_CACHE);
  const assets = new Set(CORE_ASSETS);
  try {
    const manifestResponse = await fetch("/asset-manifest.json", { cache: "no-store" });
    if (manifestResponse.ok) {
      const manifest = await manifestResponse.json();
      Object.values(manifest.files || {}).forEach((path) => {
        if (typeof path === "string" && path.startsWith("/")) assets.add(path);
      });
    }
  } catch (_error) {
    // The core offline page is still cached when the build manifest is temporarily unavailable.
  }
  await Promise.allSettled([...assets].map(async (path) => {
    const response = await fetch(path, { cache: "reload" });
    if (response.ok) await cache.put(path, response);
  }));
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheShell());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => (
      name.startsWith("afterlight-") && !CACHE_NAMES.has(name)
    )).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      await cache.put("/index.html", response.clone());
    }
    return response;
  } catch (_error) {
    return (await caches.match("/index.html")) || caches.match("/offline.html");
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const network = fetch(request)
    .then((response) => cacheResponse(RUNTIME_CACHE, request, response))
    .catch(() => null);
  return cached || network || Response.error();
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    return await cacheResponse(RUNTIME_CACHE, request, await fetch(request));
  } catch (_error) {
    return Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }
  if (url.pathname.startsWith("/help/") || url.pathname === "/manifest.json") {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }
  if (["script", "style", "font", "image"].includes(request.destination)) {
    event.respondWith(cacheFirst(request));
  }
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() || {};
  } catch (error) {
    payload = { title: "Afterlight", body: event.data?.text() || "" };
  }

  event.waitUntil(Promise.all([
    self.registration.showNotification(
      payload.title || "Afterlight",
      {
        body: payload.body || "",
        icon: "/logo192.png",
        badge: "/logo192.png",
        data: { route: payload.route || "/dashboard" },
        tag: payload.entityId || payload.type || undefined,
      }
    ),
    self.clients.matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => clients.forEach((client) => {
        client.postMessage({ type: "afterlight-notification-received" });
      })),
  ]));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.route || "/dashboard";
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    });
    const targetUrl = new URL(target, self.location.origin);
    for (const client of windows) {
      if ("focus" in client) {
        await client.navigate(targetUrl.href);
        return client.focus();
      }
    }
    return self.clients.openWindow(targetUrl.href);
  })());
});
