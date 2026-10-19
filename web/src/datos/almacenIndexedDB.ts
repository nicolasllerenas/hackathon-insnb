import Dexie, { type Table } from "dexie";
import type { DefinicionColeccion } from "@compartido/contratos/comunes";
import {
  aplicarListado,
  sinDuplicados,
  verificarCampo,
  verificarUnicos,
  type Almacen,
  type OpcionesListado,
  type ValorFiltro,
} from "@compartido/almacen/tipos";

export class AlmacenIndexedDB implements Almacen {
  readonly tipo = "indexeddb" as const;
  private readonly db: Dexie;

  constructor(nombre: string, colecciones: readonly DefinicionColeccion[]) {
    this.db = new Dexie(nombre);
    const tiendas: Record<string, string> = {};
    for (const c of colecciones) {
      const indices = [...new Set([...c.indices, ...c.unicos])].filter((i) => i !== "id");
      tiendas[c.nombre] = ["id", ...indices].join(",");
    }
    this.db.version(1).stores(tiendas);
  }

  private tabla<T>(c: DefinicionColeccion): Table<T, string> {
    return this.db.table<T, string>(c.nombre);
  }

  private async candidatos<T extends { id: string }>(c: DefinicionColeccion<T>, donde?: Record<string, ValorFiltro>): Promise<T[]> {
    const t = this.tabla<T>(c);
    const entradas = Object.entries(donde ?? {});
    const indexable = entradas.find(([campo, valor]) => typeof valor === "string" && campo !== "id" && (c.indices.includes(campo) || c.unicos.includes(campo)));
    if (indexable) return t.where(indexable[0]).equals(indexable[1] as string).toArray();
    return t.toArray();
  }

  async listar<T extends { id: string }>(c: DefinicionColeccion<T>, opciones?: OpcionesListado): Promise<T[]> {
    for (const campo of Object.keys(opciones?.donde ?? {})) verificarCampo(c, campo);
    return aplicarListado(c, await this.candidatos(c, opciones?.donde), opciones);
  }

  async obtener<T extends { id: string }>(c: DefinicionColeccion<T>, id: string): Promise<T | null> {
    return (await this.tabla<T>(c).get(id)) ?? null;
  }

  private async existentesConUnicos<T extends { id: string }>(c: DefinicionColeccion<T>, documento: T): Promise<T[]> {
    const lista: T[] = [];
    for (const campo of c.unicos) {
      const valor = (documento as Record<string, unknown>)[campo];
      if (typeof valor !== "string" || !valor) continue;
      lista.push(...(await this.tabla<T>(c).where(campo).equals(valor).toArray()));
    }
    return lista;
  }

  async guardar<T extends { id: string }>(c: DefinicionColeccion<T>, documento: T): Promise<T> {
    const t = this.tabla<T>(c);
    await this.db.transaction("rw", t, async () => {
      verificarUnicos(c, documento, await this.existentesConUnicos(c, documento));
      await t.put(documento);
    });
    return documento;
  }

  async guardarVarios<T extends { id: string }>(c: DefinicionColeccion<T>, documentos: readonly T[]): Promise<number> {
    const lote = sinDuplicados(documentos);
    const t = this.tabla<T>(c);
    await this.db.transaction("rw", t, async () => {
      if (c.unicos.length) {
        const resultante = new Map((await t.toArray()).map((d) => [d.id, d]));
        for (const d of lote) {
          verificarUnicos(c, d, [...resultante.values()]);
          resultante.set(d.id, d);
        }
      }
      await t.bulkPut(lote);
    });
    return lote.length;
  }

  async eliminar<T extends { id: string }>(c: DefinicionColeccion<T>, id: string): Promise<boolean> {
    const t = this.tabla<T>(c);
    return this.db.transaction("rw", t, async () => {
      const existe = await t.get(id);
      if (!existe) return false;
      await t.delete(id);
      return true;
    });
  }

  async eliminarDonde<T extends { id: string }>(c: DefinicionColeccion<T>, campo: string, valor: ValorFiltro): Promise<number> {
    verificarCampo(c, campo);
    const objetivo = await this.listar(c, { donde: { [campo]: valor } });
    await this.tabla<T>(c).bulkDelete(objetivo.map((d) => d.id));
    return objetivo.length;
  }

  contar<T extends { id: string }>(c: DefinicionColeccion<T>): Promise<number> {
    return this.tabla<T>(c).count();
  }

  async vaciar<T extends { id: string }>(c: DefinicionColeccion<T>): Promise<void> {
    await this.tabla<T>(c).clear();
  }

  cerrar(): void {
    this.db.close();
  }

  async borrarBaseCompleta(): Promise<void> {
    this.db.close();
    await Dexie.delete(this.db.name);
  }
}
