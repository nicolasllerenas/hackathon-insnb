import { z } from "zod";
import { ErrorMichi } from "../errores.js";
import { esFechaValida, esHoraValida } from "../dominio/fechas.js";

export const Id = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z0-9._:-]+$/, "Solo letras, números y . _ : -");

export const Fecha = z.string().refine(esFechaValida, "Fecha inválida (AAAA-MM-DD)");
export const Hora = z.string().refine(esHoraValida, "Hora inválida (HH:MM)");
export const Momento = z.iso.datetime({ offset: true, error: "Fecha y hora ISO inválida" });

export function texto(min: number, max: number) {
  return z
    .string()
    .trim()
    .min(min, min <= 1 ? "Obligatorio" : `Mínimo ${min} caracteres`)
    .max(max, `Máximo ${max} caracteres`);
}

export const TextoOpcional = (max: number) => z.string().trim().max(max, `Máximo ${max} caracteres`);

export const SerieMichi = z.string().regex(/^MC-[0-9A-F]{8}$/, "Serie inválida (MC-XXXXXXXX)");
export const CodigoVinculacion = z
  .string()
  .regex(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/, "Código inválido (XXXX-XXXX-XXXX)");

export interface DefinicionColeccion<T extends { id: string } = { id: string }> {
  nombre: string;
  esquema: z.ZodType<T>;
  indices: readonly string[];
  unicos: readonly string[];
  orden: string;
}

export function coleccion<T extends { id: string }>(
  nombre: string,
  esquema: z.ZodType<T>,
  opciones: { indices?: readonly string[]; unicos?: readonly string[]; orden?: string } = {},
): DefinicionColeccion<T> {
  return {
    nombre,
    esquema,
    indices: opciones.indices ?? [],
    unicos: opciones.unicos ?? [],
    orden: opciones.orden ?? "id",
  };
}

export function validar<T>(esquema: z.ZodType<T>, datos: unknown, que = "Datos"): T {
  const r = esquema.safeParse(datos);
  if (r.success) return r.data;
  throw new ErrorMichi(
    "validacion",
    `${que} inválidos`,
    r.error.issues.map((i) => ({ campo: i.path.map(String).join("."), mensaje: i.message })),
  );
}

export interface InfoSalud {
  servicio: string;
  version: string;
  almacen: "postgres" | "indexeddb" | "memoria";
  registros: Record<string, number>;
}

export type Volcado = Record<string, unknown[]>;
