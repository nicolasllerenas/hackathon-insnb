let iconoEnCache: string | null = null;

export function iconoDelMichi(): string {
  if (iconoEnCache) return iconoEnCache;
  try {
    const c = document.createElement("canvas");
    c.width = c.height = 192;
    const g = c.getContext("2d");
    if (!g) return "";
    g.fillStyle = "#160A2A";
    g.fillRect(0, 0, 192, 192);
    const oreja = (x: number, dir: number) => {
      g.beginPath();
      g.moveTo(x, 62);
      g.lineTo(x + dir * 6, 26);
      g.lineTo(x + dir * 36, 46);
      g.closePath();
      g.fillStyle = "#A79FC0";
      g.fill();
    };
    oreja(52, -1);
    oreja(140, 1);
    g.beginPath();
    g.ellipse(96, 102, 58, 50, 0, 0, Math.PI * 2);
    g.fillStyle = "#DCD6E8";
    g.fill();
    g.fillStyle = "#1B1030";
    g.beginPath();
    g.roundRect(58, 84, 76, 34, 17);
    g.fill();
    g.fillStyle = "#22D3EE";
    g.beginPath();
    g.ellipse(78, 101, 11, 12, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.ellipse(114, 101, 11, 12, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#A855F7";
    g.beginPath();
    g.moveTo(88, 126);
    g.lineTo(104, 126);
    g.lineTo(96, 138);
    g.closePath();
    g.fill();
    iconoEnCache = c.toDataURL("image/png");
  } catch {
    iconoEnCache = "";
  }
  return iconoEnCache;
}

export function notificacionesDisponibles(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export async function pedirPermisoDeNotificaciones(): Promise<boolean> {
  if (!notificacionesDisponibles()) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  try {
    return (await Notification.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

export interface OpcionesNotificacion {
  titulo: string;
  cuerpo: string;
  etiqueta?: string;
  exigeTamizaje?: boolean;
  registro?: ServiceWorkerRegistration | null;
}

export function notificarEnSistema(o: OpcionesNotificacion): boolean {
  if (!notificacionesDisponibles() || Notification.permission !== "granted") return false;
  const icono = iconoDelMichi();
  const base: NotificationOptions = { body: o.cuerpo, icon: icono, badge: icono, tag: o.etiqueta ?? "michicheck", data: { url: window.location.href } };
  try {
    if (o.registro) {
      const opciones = o.exigeTamizaje
        ? {
            ...base,
            actions: [
              { action: "abrir", title: "Poner el dedito" },
              { action: "despues", title: "Después" },
            ],
          }
        : base;
      void o.registro.showNotification(o.titulo, opciones as NotificationOptions);
      return true;
    }
    const n = new Notification(o.titulo, base);
    n.onclick = () => {
      window.focus();
      n.close();
    };
    window.setTimeout(() => n.close(), 9000);
    return true;
  } catch {
    return false;
  }
}
