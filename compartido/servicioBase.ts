import type { Almacen } from "./almacen/tipos.js";
import { validar, type DefinicionColeccion, type InfoSalud, type Volcado } from "./contratos/comunes.js";
import { ErrorMichi } from "./errores.js";

export const VERSION = "1.0.0";

export async function informeDeSalud(
  servicio: string,
  almacen: Almacen,
  colecciones: readonly DefinicionColeccion[],
): Promise<InfoSalud> {
  const registros: Record<string, number> = {};
  for (const c of colecciones) registros[c.nombre] = await almacen.contar(c);
  return { servicio, version: VERSION, almacen: almacen.tipo, registros };
}

export async function exportarColecciones(almacen: Almacen, colecciones: readonly DefinicionColeccion[]): Promise<Volcado> {
  const volcado: Volcado = {};
  for (const c of colecciones) volcado[c.nombre] = await almacen.listar(c);
  return volcado;
}

export function validarVolcado(
  colecciones: readonly DefinicionColeccion[],
  volcado: unknown,
): Map<string, { id: string }[]> {
  if (!volcado || typeof volcado !== "object" || Array.isArray(volcado)) {
    throw new ErrorMichi("validacion", "El respaldo debe ser un objeto con una lista por colección");
  }
  const datos = volcado as Record<string, unknown>;
  const conocidas = new Set(colecciones.map((c) => c.nombre));
  const desconocidas = Object.keys(datos).filter((k) => !conocidas.has(k));
  if (desconocidas.length) {
    throw new ErrorMichi("validacion", `Colecciones desconocidas en el respaldo: ${desconocidas.join(", ")}`);
  }
  const resultado = new Map<string, { id: string }[]>();
  for (const c of colecciones) {
    const lista = datos[c.nombre];
    if (lista === undefined) continue;
    if (!Array.isArray(lista)) throw new ErrorMichi("validacion", `«${c.nombre}» debe ser una lista`);
    resultado.set(
      c.nombre,
      lista.map((doc, i) => validar(c.esquema, doc, `${c.nombre}[${i}]`)),
    );
  }
  return resultado;
}

export async function importarColecciones(
  almacen: Almacen,
  colecciones: readonly DefinicionColeccion[],
  volcado: unknown,
): Promise<Record<string, number>> {
  const validos = validarVolcado(colecciones, volcado);
  const conteo: Record<string, number> = {};
  for (const c of colecciones) {
    const docs = validos.get(c.nombre);
    if (!docs) continue;
    conteo[c.nombre] = await almacen.guardarVarios(c, docs);
  }
  return conteo;
}

export async function vaciarColecciones(almacen: Almacen, colecciones: readonly DefinicionColeccion[]): Promise<void> {
  for (const c of [...colecciones].reverse()) await almacen.vaciar(c);
}
