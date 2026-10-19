import type { DefinicionColeccion } from "../contratos/comunes.js";
import { ErrorMichi } from "../errores.js";

export type ValorFiltro = string | number | boolean | null;

export interface OpcionesListado {
  donde?: Record<string, ValorFiltro>;
  ordenarPor?: string;
  descendente?: boolean;
  limite?: number;
}

export type TipoAlmacen = "postgres" | "indexeddb" | "memoria";

export interface Almacen {
  readonly tipo: TipoAlmacen;
  listar<T extends { id: string }>(c: DefinicionColeccion<T>, opciones?: OpcionesListado): Promise<T[]>;
  obtener<T extends { id: string }>(c: DefinicionColeccion<T>, id: string): Promise<T | null>;
  guardar<T extends { id: string }>(c: DefinicionColeccion<T>, documento: T): Promise<T>;
  guardarVarios<T extends { id: string }>(c: DefinicionColeccion<T>, documentos: readonly T[]): Promise<number>;
  eliminar<T extends { id: string }>(c: DefinicionColeccion<T>, id: string): Promise<boolean>;
  eliminarDonde<T extends { id: string }>(c: DefinicionColeccion<T>, campo: string, valor: ValorFiltro): Promise<number>;
  contar<T extends { id: string }>(c: DefinicionColeccion<T>): Promise<number>;
  vaciar<T extends { id: string }>(c: DefinicionColeccion<T>): Promise<void>;
}

const IDENTIFICADOR = /^[A-Za-z][A-Za-z0-9]*$/;

export function camposFiltrables(c: DefinicionColeccion): Set<string> {
  return new Set(["id", ...c.indices, ...c.unicos]);
}

export function verificarCampo(c: DefinicionColeccion, campo: string, paraOrdenar = false): void {
  const permitido = camposFiltrables(c).has(campo) || (paraOrdenar && campo === c.orden);
  if (!permitido || !IDENTIFICADOR.test(campo)) {
    throw new ErrorMichi("validacion", `El campo «${campo}» no se puede usar para ${paraOrdenar ? "ordenar" : "filtrar"} ${c.nombre}`);
  }
}

export function aSerpiente(campo: string): string {
  return campo.replace(/[A-Z]/g, (l) => `_${l.toLowerCase()}`);
}

export function valorDeCampo(documento: unknown, campo: string): unknown {
  if (documento === null || typeof documento !== "object") return undefined;
  return (documento as Record<string, unknown>)[campo];
}

export function comparar(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "es");
}

export function coincide(documento: unknown, donde: Record<string, ValorFiltro> | undefined): boolean {
  if (!donde) return true;
  return Object.entries(donde).every(([campo, valor]) => {
    const actual = valorDeCampo(documento, campo);
    if (valor === null) return actual === null || actual === undefined;
    return actual !== undefined && actual !== null && String(actual) === String(valor);
  });
}

export function aplicarListado<T>(c: DefinicionColeccion, documentos: T[], opciones: OpcionesListado = {}): T[] {
  for (const campo of Object.keys(opciones.donde ?? {})) verificarCampo(c, campo);
  const campoOrden = opciones.ordenarPor ?? c.orden;
  verificarCampo(c, campoOrden, true);
  const filtrados = documentos.filter((d) => coincide(d, opciones.donde));
  filtrados.sort((a, b) => {
    const r = comparar(valorDeCampo(a, campoOrden), valorDeCampo(b, campoOrden)) || comparar(valorDeCampo(a, "id"), valorDeCampo(b, "id"));
    return opciones.descendente ? -r : r;
  });
  const limite = opciones.limite;
  return limite !== undefined && limite >= 0 ? filtrados.slice(0, limite) : filtrados;
}

export function verificarUnicos<T extends { id: string }>(c: DefinicionColeccion<T>, documento: T, existentes: readonly T[]): void {
  for (const campo of c.unicos) {
    const valor = valorDeCampo(documento, campo);
    if (valor === null || valor === undefined || valor === "") continue;
    const duplicado = existentes.find((e) => e.id !== documento.id && valorDeCampo(e, campo) === valor);
    if (duplicado) throw new ErrorMichi("conflicto", `Ya existe un registro en ${c.nombre} con ${campo} = ${String(valor)}`);
  }
}

export function sinDuplicados<T extends { id: string }>(documentos: readonly T[]): T[] {
  const mapa = new Map<string, T>();
  for (const d of documentos) mapa.set(d.id, d);
  return [...mapa.values()];
}
