import { codigoDesdeEstado, ErrorMichi, type CodigoError, type DetalleError } from "../errores.js";

export interface OpcionesCliente {
  base: string;
  token?: () => string | null;
  fetch?: typeof fetch;
  tiempoMaximoMs?: number;
}

interface RespuestaApi<T> {
  ok: boolean;
  datos?: T;
  error?: { codigo: CodigoError; mensaje: string; detalles?: DetalleError[] };
}

export class ClienteHttp {
  private readonly base: string;

  constructor(private readonly opciones: OpcionesCliente) {
    this.base = opciones.base.replace(/\/+$/, "");
  }

  async pedir<T>(metodo: "GET" | "POST" | "PUT" | "DELETE", ruta: string, cuerpo?: unknown, cabecerasExtra: Record<string, string> = {}): Promise<T> {
    const cabeceras: Record<string, string> = { accept: "application/json", ...cabecerasExtra };
    const token = this.opciones.token?.();
    if (token) cabeceras.authorization = `Bearer ${token}`;
    if (cuerpo !== undefined) cabeceras["content-type"] = "application/json";
    const controlador = new AbortController();
    const temporizador = setTimeout(() => controlador.abort(), this.opciones.tiempoMaximoMs ?? 20_000);
    let respuesta: Response;
    try {
      respuesta = await (this.opciones.fetch ?? globalThis.fetch)(`${this.base}${ruta}`, {
        method: metodo,
        headers: cabeceras,
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
        signal: controlador.signal,
      });
    } catch {
      throw new ErrorMichi("red", "No se pudo conectar con el servicio. Revise la conexión o use el modo local.");
    } finally {
      clearTimeout(temporizador);
    }
    let datos: RespuestaApi<T> | null;
    try {
      datos = (await respuesta.json()) as RespuestaApi<T>;
    } catch {
      datos = null;
    }
    if (!respuesta.ok || !datos || !datos.ok) {
      const codigo = datos?.error?.codigo ?? codigoDesdeEstado(respuesta.status);
      const mensaje = datos?.error?.mensaje ?? `El servicio respondió ${respuesta.status}`;
      throw new ErrorMichi(codigo, mensaje, datos?.error?.detalles ?? []);
    }
    return datos.datos as T;
  }
}

export function segmento(valor: string): string {
  return encodeURIComponent(valor);
}
