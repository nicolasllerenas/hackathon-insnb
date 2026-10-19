export type CodigoError =
  | "validacion"
  | "no_encontrado"
  | "conflicto"
  | "no_autorizado"
  | "prohibido"
  | "no_configurado"
  | "red"
  | "interno";

const ESTADO_HTTP: Record<CodigoError, number> = {
  validacion: 400,
  no_autorizado: 401,
  prohibido: 403,
  no_encontrado: 404,
  conflicto: 409,
  no_configurado: 503,
  red: 502,
  interno: 500,
};

export interface DetalleError {
  campo: string;
  mensaje: string;
}

export class ErrorMichi extends Error {
  readonly codigo: CodigoError;
  readonly detalles: DetalleError[];

  constructor(codigo: CodigoError, mensaje: string, detalles: DetalleError[] = []) {
    super(mensaje);
    this.name = "ErrorMichi";
    this.codigo = codigo;
    this.detalles = detalles;
  }

  get estadoHttp(): number {
    return ESTADO_HTTP[this.codigo];
  }
}

export function codigoDesdeEstado(estado: number): CodigoError {
  const encontrado = (Object.entries(ESTADO_HTTP) as [CodigoError, number][]).find(([, e]) => e === estado);
  return encontrado ? encontrado[0] : estado >= 500 ? "interno" : "validacion";
}

export const noEncontrado = (que: string) => new ErrorMichi("no_encontrado", `${que} no existe`);
export const conflicto = (mensaje: string) => new ErrorMichi("conflicto", mensaje);
export const noAutorizado = (mensaje = "Credenciales inválidas o ausentes") => new ErrorMichi("no_autorizado", mensaje);

export function esErrorMichi(e: unknown): e is ErrorMichi {
  return e instanceof ErrorMichi;
}

export function mensajeDeError(e: unknown): string {
  if (e instanceof ErrorMichi) {
    if (e.detalles.length) return `${e.message}: ${e.detalles.map((d) => (d.campo ? `${d.campo} — ${d.mensaje}` : d.mensaje)).join("; ")}`;
    return e.message;
  }
  if (e instanceof Error) return e.message;
  return "Error inesperado";
}
