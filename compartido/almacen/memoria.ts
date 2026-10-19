import type { DefinicionColeccion } from "../contratos/comunes.js";
import {
  aplicarListado,
  coincide,
  sinDuplicados,
  verificarCampo,
  verificarUnicos,
  type Almacen,
  type OpcionesListado,
  type ValorFiltro,
} from "./tipos.js";

function copia<T>(valor: T): T {
  return structuredClone(valor);
}

export class AlmacenMemoria implements Almacen {
  readonly tipo = "memoria" as const;
  private readonly tablas = new Map<string, Map<string, unknown>>();

  private tabla(nombre: string): Map<string, unknown> {
    let t = this.tablas.get(nombre);
    if (!t) {
      t = new Map();
      this.tablas.set(nombre, t);
    }
    return t;
  }

  async listar<T extends { id: string }>(c: DefinicionColeccion<T>, opciones?: OpcionesListado): Promise<T[]> {
    return aplicarListado(c, [...this.tabla(c.nombre).values()] as T[], opciones).map(copia);
  }

  async obtener<T extends { id: string }>(c: DefinicionColeccion<T>, id: string): Promise<T | null> {
    const d = this.tabla(c.nombre).get(id);
    return d === undefined ? null : copia(d as T);
  }

  async guardar<T extends { id: string }>(c: DefinicionColeccion<T>, documento: T): Promise<T> {
    const t = this.tabla(c.nombre);
    verificarUnicos(c, documento, [...t.values()] as T[]);
    t.set(documento.id, copia(documento));
    return copia(documento);
  }

  async guardarVarios<T extends { id: string }>(c: DefinicionColeccion<T>, documentos: readonly T[]): Promise<number> {
    const lote = sinDuplicados(documentos);
    const t = this.tabla(c.nombre);
    const resultante = new Map(t);
    for (const d of lote) {
      verificarUnicos(c, d, [...resultante.values()] as T[]);
      resultante.set(d.id, copia(d));
    }
    this.tablas.set(c.nombre, resultante);
    return lote.length;
  }

  async eliminar<T extends { id: string }>(c: DefinicionColeccion<T>, id: string): Promise<boolean> {
    return this.tabla(c.nombre).delete(id);
  }

  async eliminarDonde<T extends { id: string }>(c: DefinicionColeccion<T>, campo: string, valor: ValorFiltro): Promise<number> {
    verificarCampo(c, campo);
    const t = this.tabla(c.nombre);
    let n = 0;
    for (const [id, d] of [...t.entries()]) {
      if (coincide(d, { [campo]: valor })) {
        t.delete(id);
        n += 1;
      }
    }
    return n;
  }

  async contar<T extends { id: string }>(c: DefinicionColeccion<T>): Promise<number> {
    return this.tabla(c.nombre).size;
  }

  async vaciar<T extends { id: string }>(c: DefinicionColeccion<T>): Promise<void> {
    this.tabla(c.nombre).clear();
  }
}
