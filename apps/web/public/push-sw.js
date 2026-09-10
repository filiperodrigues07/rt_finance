/* global self, clients */
// Injetado no service worker gerado pelo workbox (workbox.importScripts).
// Só cuida de Web Push — o resto (precache, navigateFallback) é do workbox.

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { title: "RT Finance", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "RT Finance";
  const options = {
    body: data.body || "",
    icon: "/pwa-192.png",
    badge: "/favicon-32.png",
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    data: { link: data.link || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          c.navigate(link);
          return c.focus();
        }
      }
      return clients.openWindow(link);
    }),
  );
});
