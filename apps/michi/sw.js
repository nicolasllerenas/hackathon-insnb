const CACHE = "michicheck-v3";
const RECURSOS = ["./", "./index.html", "./manifest.webmanifest"];

self.addEventListener("install", evento => {
  self.skipWaiting();
  evento.waitUntil(caches.open(CACHE).then(c => c.addAll(RECURSOS)).catch(() => null));
});

self.addEventListener("activate", evento => {
  evento.waitUntil(
    caches.keys()
      .then(llaves => Promise.all(llaves.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", evento => {
  if (evento.request.method !== "GET") return;
  evento.respondWith(
    caches.match(evento.request).then(hit => hit || fetch(evento.request).catch(() => hit))
  );
});

self.addEventListener("push", evento => {
  let datos = { titulo: "Michi te está llamando", cuerpo: "Toca ponerte el dedito." };
  try { if (evento.data) datos = Object.assign(datos, evento.data.json()); } catch (e) {}
  evento.waitUntil(self.registration.showNotification(datos.titulo, {
    body: datos.cuerpo,
    icon: datos.icono,
    badge: datos.icono,
    tag: datos.etiqueta || "michicheck",
    renotify: true,
    vibrate: [90, 60, 90, 60, 180],
    data: { url: datos.url || "./" },
    actions: [
      { action: "abrir", title: "Poner el dedito" },
      { action: "despues", title: "Después" }
    ]
  }));
});

self.addEventListener("notificationclick", evento => {
  evento.notification.close();
  const destino = (evento.notification.data && evento.notification.data.url) || "./";
  evento.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(lista => {
      for (const cliente of lista) {
        if ("focus" in cliente) {
          cliente.postMessage({ tipo: "notificacion", accion: evento.action });
          return cliente.focus();
        }
      }
      return clients.openWindow(destino);
    })
  );
});
