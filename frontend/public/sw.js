// Service Worker для ЭкспоЛид PWA
const CACHE = "expolid-shell-v3";
const SHELL = ["/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api") || url.pathname.startsWith("/uploads")) return;

  const isNavigation = req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html");

  if (isNavigation) {
    event.respondWith(
      fetch(req, { cache: "no-store" })
        .then((res) => {
          const cp = res.clone();
          caches.open(CACHE).then((c) => c.put("/", cp));
          return res;
        })
        .catch(() => caches.match("/").then((m) => m || new Response("offline", { status: 503 })))
    );
    return;
  }

  // Hashed static assets — stale-while-revalidate
  event.respondWith(
    caches.open(CACHE).then((c) =>
      c.match(req).then((cached) => {
        const fetchPromise = fetch(req).then((res) => {
          if (res && res.status === 200) c.put(req, res.clone());
          return res;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    )
  );
});

// Push handler
self.addEventListener("push", (event) => {
  let data = { title: "ЭкспоЛид", body: "Новое уведомление" };
  try { data = event.data?.json() ?? data; } catch { /* keep default */ }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: data.data || {},
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(self.clients.openWindow(url));
});
