import type { EntradaLatido } from "@compartido/contratos/dispositivos";

export const ORDENES = {
  pedirTamizaje: "T",
  recordarCita: "C",
  maullar: "M",
  pedirLatido: "L",
} as const;
export type Orden = (typeof ORDENES)[keyof typeof ORDENES];

export const DESCRIPCION_ORDEN: Record<Orden, string> = {
  T: "Pedir el dedito (solo suena en la ventana audible)",
  C: "Recordar la cita (solo suena en la ventana audible)",
  M: "Maullar ahora",
  L: "Pedir un latido de estado",
};

export interface LatidoRobot {
  bateriaPct: number | null;
  capturasEnCola: number;
  alertasEmitidas: number;
  alertasAtendidas: number;
  silenciamientos: number;
  escalado: boolean;
  firmware: string;
  serie: string | null;
}

function entero(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

export function interpretarLinea(linea: string): LatidoRobot | null {
  const texto = linea.trim();
  if (!texto.startsWith("{") || !texto.endsWith("}")) return null;
  let datos: Record<string, unknown>;
  try {
    datos = JSON.parse(texto) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (datos.latido !== 1 && datos.latido !== true) return null;
  const bateria = Number(datos.bateria_pct);
  return {
    bateriaPct: Number.isFinite(bateria) ? Math.min(100, Math.max(0, Math.round(bateria))) : null,
    capturasEnCola: entero(datos.capturas_en_cola),
    alertasEmitidas: entero(datos.alertas_emitidas),
    alertasAtendidas: entero(datos.alertas_atendidas),
    silenciamientos: entero(datos.silenciamientos),
    escalado: datos.escalado === true,
    firmware: typeof datos.firmware === "string" ? datos.firmware.slice(0, 20) : "",
    serie: typeof datos.serie === "string" && /^MC-[0-9A-F]{8}$/.test(datos.serie) ? datos.serie : null,
  };
}

export function aEntradaLatido(l: LatidoRobot, origen: EntradaLatido["origen"] = "robot"): EntradaLatido {
  return {
    origen,
    momento: new Date().toISOString(),
    bateriaPct: l.bateriaPct,
    tamizajesEnCola: l.capturasEnCola,
    alertasEmitidas: l.alertasEmitidas,
    alertasAtendidas: l.alertasAtendidas,
    silenciamientos: l.silenciamientos,
    escalado: l.escalado,
    firmware: l.firmware,
    rssiDbm: null,
  };
}

export class SeparadorDeLineas {
  private resto = "";

  agregar(trozo: string): string[] {
    this.resto += trozo;
    const partes = this.resto.split(/\r?\n/);
    this.resto = partes.pop() ?? "";
    if (this.resto.length > 4096) this.resto = this.resto.slice(-4096);
    return partes.filter((p) => p.trim().length > 0);
  }
}
