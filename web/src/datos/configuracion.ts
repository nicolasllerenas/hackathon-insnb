export type ModoDatos = "local" | "servidor";

export interface Configuracion {
  modo: ModoDatos;
  token: string;
}

const LLAVE = "michicheck.configuracion";

export function modoPorDefecto(): ModoDatos {
  return import.meta.env.VITE_MODO_DATOS === "servidor" ? "servidor" : "local";
}

export function leerConfiguracion(): Configuracion {
  const base: Configuracion = { modo: modoPorDefecto(), token: "" };
  try {
    const crudo = window.localStorage.getItem(LLAVE);
    if (!crudo) return base;
    const datos = JSON.parse(crudo) as Partial<Configuracion>;
    return {
      modo: datos.modo === "servidor" || datos.modo === "local" ? datos.modo : base.modo,
      token: typeof datos.token === "string" ? datos.token : "",
    };
  } catch {
    return base;
  }
}

export function guardarConfiguracion(config: Configuracion): void {
  try {
    window.localStorage.setItem(LLAVE, JSON.stringify(config));
  } catch {
    return;
  }
}

export function leerLocal<T>(llave: string, porDefecto: T): T {
  try {
    const crudo = window.localStorage.getItem(llave);
    return crudo ? (JSON.parse(crudo) as T) : porDefecto;
  } catch {
    return porDefecto;
  }
}

export function guardarLocal(llave: string, valor: unknown): void {
  try {
    window.localStorage.setItem(llave, JSON.stringify(valor));
  } catch {
    return;
  }
}

export function borrarLocal(llave: string): void {
  try {
    window.localStorage.removeItem(llave);
  } catch {
    return;
  }
}
