const CACHE = "michicheck-michi-v5";

self.addEventListener("install", (evento) => {
  self.skipWaiting();
  evento.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(["/michi/", "/michi/manifest.webmanifest", "/michi/icono.svg"]))
      .catch(() => undefined),
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((llaves) => Promise.all(llaves.filter((k) => k.startsWith("michicheck-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (evento) => {
  const peticion = evento.request;
  if (peticion.method !== "GET") return;
  const url = new URL(peticion.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (peticion.mode === "navigate") {
    evento.respondWith(
      fetch(peticion)
        .then((respuesta) => {
          const copia = respuesta.clone();
          caches.open(CACHE).then((c) => c.put("/michi/", copia)).catch(() => undefined);
          return respuesta;
        })
        .catch(() => caches.match("/michi/").then((r) => r || Response.error())),
    );
    return;
  }

  if (url.pathname.startsWith("/assets/")) {
    evento.respondWith(
      caches.match(peticion).then(
        (guardada) =>
          guardada ||
          fetch(peticion).then((respuesta) => {
            if (respuesta.ok) {
              const copia = respuesta.clone();
              caches.open(CACHE).then((c) => c.put(peticion, copia)).catch(() => undefined);
            }
            return respuesta;
          }),
      ),
    );
    return;
  }

  evento.respondWith(fetch(peticion).catch(() => caches.match(peticion).then((r) => r || Response.error())));
});

self.addEventListener("push", (evento) => {
  let datos = { titulo: "Michi te está llamando", cuerpo: "Toca ponerte el dedito." };
  try {
    if (evento.data) datos = Object.assign(datos, evento.data.json());
  } catch (e) {
    datos = { titulo: "Michi te está llamando", cuerpo: "Toca ponerte el dedito." };
  }
  evento.waitUntil(
    self.registration.showNotification(datos.titulo, {
      body: datos.cuerpo,
      icon: "/michi/icono.svg",
      badge: "/michi/icono.svg",
      tag: "michicheck",
      data: { url: "/michi/" },
      actions: [
        { action: "abrir", title: "Poner el dedito" },
        { action: "despues", title: "Después" },
      ],
    }),
  );
});

self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  const destino = (evento.notification.data && evento.notification.data.url) || "/michi/";
  evento.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((lista) => {
      for (const cliente of lista) {
        if ("focus" in cliente) {
          cliente.postMessage({ tipo: "notificacion", accion: evento.action });
          return cliente.focus();
        }
      }
      return self.clients.openWindow(destino);
    }),
  );
});
