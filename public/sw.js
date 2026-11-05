self.addEventListener("push", (event) => {
  let payload = { title: "Pushr", body: "New activity" };
  try {
    if (event.data) {
      const parsed = event.data.json();
      if (parsed && typeof parsed === "object") {
        payload = parsed;
      }
    }
  } catch {
    payload = { title: "Pushr", body: "New activity" };
  }

  const title = payload.title || "Pushr";
  const options = {
    body: payload.body || "New activity",
    icon: "/logo.png",
    badge: "/logo.png",
    data: { url: payload.href || "/notifications" },
    tag: payload.tag,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/notifications";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ("focus" in client) {
          return client.focus().then((focused) => {
            if (focused && "navigate" in focused) {
              return focused.navigate(url);
            }
            return focused;
          });
        }
      }
      return clients.openWindow(url);
    })
  );
});

self.addEventListener("notificationclose", (event) => {
  void event;
});
