import { iguales } from "../../compartido/dominio/identificadores.js";
import { ErrorMichi, esErrorMichi } from "../../compartido/errores.js";

export type Metodo = "GET" | "POST" | "PUT" | "DELETE";
export type Actor = "publico" | "clinico" | "familia" | "dispositivo";

export interface ContextoRuta {
  params: Record<string, string>;
  query: URLSearchParams;
  cuerpo: unknown;
  cabeceras: Headers;
  clinicoAutorizado: boolean;
}

export interface Ruta<S> {
  metodo: Metodo;
  patron: string;
  actor: Actor;
  ejecutar: (servicio: S, ctx: ContextoRuta) => Promise<unknown>;
}

export interface RegistroAuditoria {
  actor: Actor;
  accion: string;
  coleccion: string | null;
  registroId: string | null;
}

export interface Entorno<S> {
  servicio: () => Promise<S>;
  token: () => string | undefined;
  auditar?: (registro: RegistroAuditoria) => Promise<void>;
}

export interface OpcionesManejador<S> {
  nombre: string;
  rutas: readonly Ruta<S>[];
  entorno: Entorno<S>;
  maxBytes?: number;
}

const CABECERAS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

function responder(estado: number, cuerpo: unknown): Response {
  return new Response(JSON.stringify(cuerpo), { status: estado, headers: CABECERAS });
}

function error(e: ErrorMichi): Response {
  return responder(e.estadoHttp, { ok: false, error: { codigo: e.codigo, mensaje: e.message, detalles: e.detalles } });
}

interface PatronCompilado {
  regex: RegExp;
  nombres: string[];
}

function compilar(patron: string): PatronCompilado {
  const nombres: string[] = [];
  const cuerpo = patron
    .split("/")
    .filter(Boolean)
    .map((parte) => {
      if (parte.startsWith(":")) {
        nombres.push(parte.slice(1));
        return "([^/]+)";
      }
      return parte.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");
  return { regex: new RegExp(`^/${cuerpo}/?$`), nombres };
}

export function rutaSolicitada(url: URL, nombre: string): string {
  const reescrita = url.searchParams.get("__ruta");
  let ruta = reescrita;
  if (ruta === null) {
    const prefijo = `/api/v1/${nombre}`;
    ruta = url.pathname.startsWith(prefijo) ? url.pathname.slice(prefijo.length) : url.pathname;
  }
  return `/${ruta.replace(/^\/+|\/+$/g, "")}`;
}

async function leerCuerpo(peticion: Request, maxBytes: number): Promise<unknown> {
  if (peticion.method === "GET" || peticion.method === "DELETE") return undefined;
  const declarado = Number(peticion.headers.get("content-length") ?? "0");
  if (declarado > maxBytes) throw new ErrorMichi("validacion", `El cuerpo supera el máximo de ${Math.round(maxBytes / 1024)} KB`);
  const texto = await peticion.text();
  if (new TextEncoder().encode(texto).length > maxBytes) {
    throw new ErrorMichi("validacion", `El cuerpo supera el máximo de ${Math.round(maxBytes / 1024)} KB`);
  }
  if (!texto.trim()) return undefined;
  try {
    return JSON.parse(texto) as unknown;
  } catch {
    throw new ErrorMichi("validacion", "El cuerpo no es JSON válido");
  }
}

function tokenDe(cabeceras: Headers): string | null {
  const valor = cabeceras.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(valor.trim());
  return m ? (m[1] as string).trim() : null;
}

export function crearManejador<S>(opciones: OpcionesManejador<S>): (peticion: Request) => Promise<Response> {
  const compiladas = opciones.rutas.map((r) => ({ ruta: r, patron: compilar(r.patron) }));
  const maxBytes = opciones.maxBytes ?? 4 * 1024 * 1024;

  return async (peticion: Request): Promise<Response> => {
    try {
      const url = new URL(peticion.url);
      const ruta = rutaSolicitada(url, opciones.nombre);
      const metodo = peticion.method.toUpperCase();
      const query = new URLSearchParams(url.searchParams);
      query.delete("__ruta");

      let encontrada: { ruta: Ruta<S>; params: Record<string, string> } | null = null;
      let metodoNoPermitido = false;
      for (const { ruta: r, patron } of compiladas) {
        const m = patron.regex.exec(ruta);
        if (!m) continue;
        if (r.metodo !== metodo) {
          metodoNoPermitido = true;
          continue;
        }
        const params: Record<string, string> = {};
        patron.nombres.forEach((n, i) => {
          params[n] = decodeURIComponent(m[i + 1] as string);
        });
        encontrada = { ruta: r, params };
        break;
      }
      if (!encontrada) {
        if (metodoNoPermitido) return responder(405, { ok: false, error: { codigo: "validacion", mensaje: "Método no permitido", detalles: [] } });
        return responder(404, { ok: false, error: { codigo: "no_encontrado", mensaje: `Ruta desconocida: ${metodo} ${ruta}`, detalles: [] } });
      }

      const esperado = opciones.entorno.token();
      const recibido = tokenDe(peticion.headers);
      const clinicoAutorizado = Boolean(esperado && recibido && iguales(esperado, recibido));
      if (encontrada.ruta.actor === "clinico") {
        if (!esperado) {
          throw new ErrorMichi("no_configurado", "El servidor no tiene MICHICHECK_TOKEN configurado: las rutas clínicas están cerradas");
        }
        if (!clinicoAutorizado) throw new ErrorMichi("no_autorizado", "Token clínico inválido o ausente");
      }

      const cuerpo = await leerCuerpo(peticion, maxBytes);
      const servicio = await opciones.entorno.servicio();
      const datos = await encontrada.ruta.ejecutar(servicio, {
        params: encontrada.params,
        query,
        cuerpo,
        cabeceras: peticion.headers,
        clinicoAutorizado,
      });

      if (metodo !== "GET" && opciones.entorno.auditar) {
        const registroId = encontrada.params.id ?? encontrada.params.serie ?? null;
        await opciones.entorno
          .auditar({
            actor: encontrada.ruta.actor,
            accion: `${metodo} ${encontrada.ruta.patron}`,
            coleccion: encontrada.params.coleccion ?? null,
            registroId,
          })
          .catch(() => undefined);
      }
      return responder(200, { ok: true, datos: datos ?? null });
    } catch (e) {
      if (esErrorMichi(e)) return error(e);
      console.error(`[${opciones.nombre}]`, e);
      return error(new ErrorMichi("interno", "Error interno del servicio"));
    }
  };
}

export function exigirObjeto(cuerpo: unknown, que = "El cuerpo"): Record<string, unknown> {
  if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo)) throw new ErrorMichi("validacion", `${que} debe ser un objeto JSON`);
  return cuerpo as Record<string, unknown>;
}
