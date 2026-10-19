import { fechaLocalISO } from "@compartido/dominio/fechas";
import { LECCIONES, LOGROS, PRENDAS } from "./contenido";

export interface Vinculo {
  codigo: string;
  pacienteId: string;
  serie: string | null;
}

export interface EstadoJuego {
  version: 4;
  nombreMichi: string;
  monedas: number;
  racha: number;
  ultimoDiaTamizaje: string | null;
  energia: number;
  animo: number;
  salud: number;
  lecciones: Record<string, true>;
  logros: Record<string, true>;
  prenda: string | null;
  prendas: string[];
  postergaciones: number;
  alertasEmitidas: number;
  alertasAtendidas: number;
  vinculo: Vinculo | null;
  visto: boolean;
}

export const LLAVE_JUEGO = "michicheck.michi.v4";

export function estadoInicial(): EstadoJuego {
  return {
    version: 4,
    nombreMichi: "Michi",
    monedas: 30,
    racha: 0,
    ultimoDiaTamizaje: null,
    energia: 78,
    animo: 72,
    salud: 88,
    lecciones: {},
    logros: {},
    prenda: null,
    prendas: ["gorro"],
    postergaciones: 0,
    alertasEmitidas: 0,
    alertasAtendidas: 0,
    vinculo: null,
    visto: false,
  };
}

export const limitar = (v: number, min = 0, max = 100) => Math.max(min, Math.min(max, v));

export function cargarJuego(crudo: string | null): EstadoJuego {
  if (!crudo) return estadoInicial();
  try {
    const datos = JSON.parse(crudo) as Partial<EstadoJuego>;
    const base = estadoInicial();
    const numero = (v: unknown, d: number, max = 100) => (typeof v === "number" && Number.isFinite(v) ? limitar(v, 0, max) : d);
    return {
      ...base,
      nombreMichi: typeof datos.nombreMichi === "string" && datos.nombreMichi.trim() ? datos.nombreMichi.slice(0, 24) : base.nombreMichi,
      monedas: numero(datos.monedas, base.monedas, 100000),
      racha: numero(datos.racha, 0, 10000),
      ultimoDiaTamizaje: typeof datos.ultimoDiaTamizaje === "string" ? datos.ultimoDiaTamizaje : null,
      energia: numero(datos.energia, base.energia),
      animo: numero(datos.animo, base.animo),
      salud: numero(datos.salud, base.salud),
      lecciones: datos.lecciones && typeof datos.lecciones === "object" ? datos.lecciones : {},
      logros: datos.logros && typeof datos.logros === "object" ? datos.logros : {},
      prenda: typeof datos.prenda === "string" && PRENDAS.some((p) => p.id === datos.prenda) ? datos.prenda : null,
      prendas: Array.isArray(datos.prendas) ? datos.prendas.filter((p) => PRENDAS.some((x) => x.id === p)) : base.prendas,
      postergaciones: numero(datos.postergaciones, 0, 1000),
      alertasEmitidas: numero(datos.alertasEmitidas, 0, 1_000_000),
      alertasAtendidas: numero(datos.alertasAtendidas, 0, 1_000_000),
      vinculo:
        datos.vinculo && typeof datos.vinculo.codigo === "string" && typeof datos.vinculo.pacienteId === "string"
          ? { codigo: datos.vinculo.codigo, pacienteId: datos.vinculo.pacienteId, serie: datos.vinculo.serie ?? null }
          : null,
      visto: Boolean(datos.visto),
    };
  } catch {
    return estadoInicial();
  }
}

export function expresionBase(e: EstadoJuego): Cara {
  if (e.energia < 22) return "dormido";
  if (e.animo < 30 || e.salud < 45) return "triste";
  if (e.animo > 82 && e.salud > 75) return "feliz";
  return "normal";
}

export type Cara = "normal" | "feliz" | "dormido" | "triste" | "amor";

export interface ResultadoAccion {
  estado: EstadoJuego;
  ok: boolean;
  mensaje?: string;
}

export function alimentar(e: EstadoJuego): ResultadoAccion {
  if (e.monedas < 5) return { estado: e, ok: false, mensaje: "No hay pescaditos. Gana con una lección 🎓" };
  return { estado: { ...e, monedas: e.monedas - 5, energia: limitar(e.energia + 16), animo: limitar(e.animo + 4) }, ok: true, mensaje: "¡Ñam! Gracias 🐟" };
}

export function jugar(e: EstadoJuego): ResultadoAccion {
  if (e.energia < 12) return { estado: e, ok: false, mensaje: "Estoy muy cansado… déjame dormir 🌙" };
  return { estado: { ...e, energia: limitar(e.energia - 9), animo: limitar(e.animo + 15) }, ok: true, mensaje: "¡Otra vez, otra vez!" };
}

export function mimar(e: EstadoJuego): ResultadoAccion {
  return { estado: { ...e, animo: limitar(e.animo + 9) }, ok: true, mensaje: "Prrrrr… 💜" };
}

export function dormir(e: EstadoJuego): ResultadoAccion {
  return { estado: { ...e, energia: limitar(e.energia + 26) }, ok: true, mensaje: "Zzz… zzz…" };
}

export function desgastar(e: EstadoJuego): EstadoJuego {
  return { ...e, energia: limitar(e.energia - 0.5), animo: limitar(e.animo - 0.4) };
}

export function registrarTamizajeEnJuego(e: EstadoJuego, estable: boolean, ahora: Date = new Date()): EstadoJuego {
  const hoy = fechaLocalISO(ahora);
  const ayer = fechaLocalISO(new Date(ahora.getTime() - 86_400_000));
  let racha = e.racha;
  if (e.ultimoDiaTamizaje !== hoy) racha = e.ultimoDiaTamizaje === ayer || e.ultimoDiaTamizaje === null ? e.racha + 1 : 1;
  return {
    ...e,
    racha,
    ultimoDiaTamizaje: hoy,
    postergaciones: 0,
    alertasAtendidas: e.alertasAtendidas + 1,
    salud: limitar(estable ? e.salud + 6 : e.salud - 4),
    animo: limitar(e.animo + 10),
  };
}

export function postergar(e: EstadoJuego): EstadoJuego {
  return { ...e, postergaciones: e.postergaciones + 1, animo: limitar(e.animo - 8) };
}

export function comprarOPonerPrenda(e: EstadoJuego, id: string): ResultadoAccion {
  const prenda = PRENDAS.find((p) => p.id === id);
  if (!prenda) return { estado: e, ok: false };
  if (e.prendas.includes(id)) return { estado: { ...e, prenda: e.prenda === id ? null : id }, ok: true };
  if (e.monedas < prenda.precio) return { estado: e, ok: false, mensaje: `Te faltan ${prenda.precio - e.monedas} pescaditos 🐟` };
  return { estado: { ...e, monedas: e.monedas - prenda.precio, prendas: [...e.prendas, id], prenda: id }, ok: true, mensaje: `¡${prenda.nombre} desbloqueado!` };
}

export function aprenderLeccion(e: EstadoJuego, id: string): { estado: EstadoJuego; premio: number; nuevo: boolean } {
  const leccion = LECCIONES.find((l) => l.id === id);
  if (!leccion || e.lecciones[id]) return { estado: e, premio: 0, nuevo: false };
  return {
    estado: { ...e, lecciones: { ...e.lecciones, [id]: true }, animo: limitar(e.animo + 6), monedas: e.monedas + leccion.premio },
    premio: leccion.premio,
    nuevo: true,
  };
}

export function logrosPendientes(e: EstadoJuego, tamizajesHechos: number): string[] {
  const nuevos: string[] = [];
  const cumple: Record<string, boolean> = {
    primer: tamizajesHechos >= 1,
    racha3: e.racha >= 3,
    racha7: e.racha >= 7,
    racha30: e.racha >= 30,
    sabio: LECCIONES.every((l) => e.lecciones[l.id]),
    cuidador: e.animo >= 100,
  };
  for (const l of LOGROS) if (cumple[l.id] && !e.logros[l.id]) nuevos.push(l.id);
  return nuevos;
}

export function otorgarLogros(e: EstadoJuego, ids: string[]): EstadoJuego {
  if (!ids.length) return e;
  const logros = { ...e.logros };
  ids.forEach((id) => {
    logros[id] = true;
  });
  return { ...e, logros, monedas: e.monedas + 30 * ids.length };
}
