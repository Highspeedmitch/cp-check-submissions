self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() || {};
  } catch (error) {
    payload = { title: "Afterlight", body: event.data?.text() || "" };
  }

  event.waitUntil(self.registration.showNotification(
    payload.title || "Afterlight",
    {
      body: payload.body || "",
      icon: "/logo192.png",
      badge: "/logo192.png",
      data: { route: payload.route || "/dashboard" },
      tag: payload.entityId || payload.type || undefined,
    }
  ));
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
