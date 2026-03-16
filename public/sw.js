// Checko — Service Worker für Push Notifications
// Empfängt Push-Events und zeigt Native-Notifications an

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = {
      title: "Checko",
      body: event.data.text(),
      icon: "/gecko-logo.png",
    };
  }

  const options = {
    body: data.body || "Neue Benachrichtigung",
    icon: data.icon || "/gecko-logo.png",
    badge: "/gecko-logo.png",
    tag: data.tag || "checko-notification",
    data: {
      url: data.url || "/dashboard",
    },
    actions: data.actions || [],
    vibrate: [100, 50, 100],
    requireInteraction: false,
  };

  event.waitUntil(
    self.registration.showNotification(data.title || "Checko", options)
  );
});

// Klick auf Notification → URL öffnen
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/dashboard";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Falls ein Tab schon offen ist, fokussieren
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      // Sonst neuen Tab öffnen
      return clients.openWindow(url);
    })
  );
});

// Service Worker installieren
self.addEventListener("install", () => {
  self.skipWaiting();
});

// Service Worker aktivieren
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
