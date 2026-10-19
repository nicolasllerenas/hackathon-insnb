import type { DefinicionColeccion } from "../contratos/comunes.js";
import { ErrorMichi } from "../errores.js";
import {
  aSerpiente,
  sinDuplicados,
  verificarCampo,
  type Almacen,
  type OpcionesListado,
  type ValorFiltro,
} from "./tipos.js";

export interface ResultadoConsulta {
  rows: Record<string, unknown>[];
}

export type Ejecutor = (sql: string, parametros?: unknown[]) => Promise<ResultadoConsulta>;

export interface Conexion {
  readonly consultar: Ejecutor;
  transaccion<T>(trabajo: (consultar: Ejecutor) => Promise<T>): Promise<T>;
  cerrar(): Promise<void>;
}

export interface ReferenciaTabla {
  campo: string;
  coleccion: string;
}

export interface DefinicionTabla {
  coleccion: DefinicionColeccion;
  referencias?: readonly ReferenciaTabla[];
}

export interface Migracion {
  version: number;
  descripcion: string;
  sentencias: readonly string[];
}

const NOMBRE_SQL = /^[a-z][a-z0-9_]*$/;
const RESERVADAS = new Set(["id", "datos", "insertado_en", "modificado_en"]);

function nombreSql(nombre: string): string {
  if (!NOMBRE_SQL.test(nombre)) throw new ErrorMichi("interno", `Nombre SQL inválido: ${nombre}`);
  return `"${nombre}"`;
}

function columnasIndexadas(c: DefinicionColeccion): string[] {
  return [...new Set([...c.indices, ...c.unicos])].filter((campo) => campo !== "id");
}

export function ddlTabla(esquema: string, t: DefinicionTabla): string[] {
  const c = t.coleccion;
  const tabla = `${nombreSql(esquema)}.${nombreSql(c.nombre)}`;
  const columnas = columnasIndexadas(c).map((campo) => {
    const col = aSerpiente(campo);
    nombreSql(col);
    if (RESERVADAS.has(col)) throw new ErrorMichi("interno", `El campo ${campo} de ${c.nombre} choca con una columna reservada`);
    return `  ${col} text GENERATED ALWAYS AS (datos ->> '${campo}') STORED`;
  });
  const restricciones = [`  CONSTRAINT ${c.nombre}_id_coherente CHECK (datos ->> 'id' = id)`];
  for (const campo of c.unicos) {
    const col = aSerpiente(campo);
    restricciones.push(`  CONSTRAINT ${c.nombre}_${col}_unico UNIQUE (${col})`);
  }
  for (const r of t.referencias ?? []) {
    const col = aSerpiente(r.campo);
    restricciones.push(
      `  CONSTRAINT ${c.nombre}_${col}_fk FOREIGN KEY (${col}) REFERENCES ${nombreSql(esquema)}.${nombreSql(r.coleccion)} (id) ON DELETE CASCADE`,
    );
  }
  const sentencias = [
    [
      `CREATE TABLE IF NOT EXISTS ${tabla} (`,
      [
        "  id text PRIMARY KEY",
        "  datos jsonb NOT NULL",
        "  insertado_en timestamptz NOT NULL DEFAULT now()",
        "  modificado_en timestamptz NOT NULL DEFAULT now()",
        ...columnas,
        ...restricciones,
      ].join(",\n"),
      ")",
    ].join("\n"),
  ];
  for (const campo of c.indices) {
    if (c.unicos.includes(campo) || campo === "id") continue;
    const col = aSerpiente(campo);
    sentencias.push(`CREATE INDEX IF NOT EXISTS ${c.nombre}_${col}_idx ON ${tabla} (${col})`);
  }
  return sentencias;
}

export function ddlAuditoria(esquema: string): string {
  return [
    `CREATE TABLE IF NOT EXISTS ${nombreSql(esquema)}.auditoria (`,
    "  id bigserial PRIMARY KEY,",
    "  momento timestamptz NOT NULL DEFAULT now(),",
    "  actor text NOT NULL,",
    "  accion text NOT NULL,",
    "  coleccion text,",
    "  registro_id text",
    ")",
  ].join("\n");
}

export function migracionInicial(esquema: string, tablas: readonly DefinicionTabla[]): Migracion {
  return {
    version: 1,
    descripcion: `Esquema inicial de ${esquema}`,
    sentencias: [...tablas.flatMap((t) => ddlTabla(esquema, t)), ddlAuditoria(esquema)],
  };
}

export async function migrar(conexion: Conexion, esquema: string, migraciones: readonly Migracion[]): Promise<number[]> {
  const esq = nombreSql(esquema);
  return conexion.transaccion(async (q) => {
    await q("SELECT pg_advisory_xact_lock(hashtext($1))", [`michicheck:${esquema}`]);
    await q(`CREATE SCHEMA IF NOT EXISTS ${esq}`);
    await q(
      `CREATE TABLE IF NOT EXISTS ${esq}.migraciones (version integer PRIMARY KEY, descripcion text NOT NULL, aplicada timestamptz NOT NULL DEFAULT now())`,
    );
    const { rows } = await q(`SELECT version FROM ${esq}.migraciones`);
    const aplicadas = new Set(rows.map((r) => Number(r.version)));
    const nuevas: number[] = [];
    for (const m of [...migraciones].sort((a, b) => a.version - b.version)) {
      if (aplicadas.has(m.version)) continue;
      for (const s of m.sentencias) await q(s);
      await q(`INSERT INTO ${esq}.migraciones (version, descripcion) VALUES ($1, $2)`, [m.version, m.descripcion]);
      nuevas.push(m.version);
    }
    return nuevas;
  });
}

function codigoPg(e: unknown): string | undefined {
  if (e && typeof e === "object" && "code" in e) {
    const codigo = (e as { code: unknown }).code;
    return typeof codigo === "string" ? codigo : undefined;
  }
  return undefined;
}

function traducirError(e: unknown, c: DefinicionColeccion): never {
  const codigo = codigoPg(e);
  if (codigo === "23505") throw new ErrorMichi("conflicto", `Ya existe un registro en ${c.nombre} con un valor que debe ser único`);
  if (codigo === "23503") throw new ErrorMichi("validacion", `Un registro de ${c.nombre} hace referencia a otro que no existe`);
  if (codigo === "23514") throw new ErrorMichi("validacion", `El registro de ${c.nombre} no es coherente con su identificador`);
  if (codigo === "42P01" || codigo === "3F000") throw new ErrorMichi("no_configurado", "La base de datos no tiene el esquema creado");
  throw e;
}

export class AlmacenSql implements Almacen {
  readonly tipo = "postgres" as const;
  private readonly esquema: string;

  constructor(
    esquema: string,
    private readonly conexion: Conexion,
  ) {
    this.esquema = nombreSql(esquema);
  }

  private tabla(c: DefinicionColeccion): string {
    return `${this.esquema}.${nombreSql(c.nombre)}`;
  }

  private columna(c: DefinicionColeccion, campo: string, paraOrdenar = false): string {
    verificarCampo(c, campo, paraOrdenar);
    if (campo === "id") return "id";
    if (columnasIndexadas(c).includes(campo)) return aSerpiente(campo);
    return `(datos ->> '${campo}')`;
  }

  private condiciones(c: DefinicionColeccion, donde: Record<string, ValorFiltro> | undefined, parametros: unknown[]): string {
    const partes: string[] = [];
    for (const [campo, valor] of Object.entries(donde ?? {})) {
      const col = this.columna(c, campo);
      if (valor === null) partes.push(`${col} IS NULL`);
      else {
        parametros.push(String(valor));
        partes.push(`${col} = $${parametros.length}`);
      }
    }
    return partes.length ? ` WHERE ${partes.join(" AND ")}` : "";
  }

  async listar<T extends { id: string }>(c: DefinicionColeccion<T>, opciones: OpcionesListado = {}): Promise<T[]> {
    const parametros: unknown[] = [];
    const donde = this.condiciones(c, opciones.donde, parametros);
    const orden = this.columna(c, opciones.ordenarPor ?? c.orden, true);
    const sentido = opciones.descendente ? "DESC" : "ASC";
    const nulos = opciones.descendente ? "NULLS LAST" : "NULLS FIRST";
    let sql = `SELECT datos FROM ${this.tabla(c)}${donde} ORDER BY ${orden} ${sentido} ${nulos}, id ${sentido}`;
    if (opciones.limite !== undefined && opciones.limite >= 0) {
      parametros.push(Math.floor(opciones.limite));
      sql += ` LIMIT $${parametros.length}`;
    }
    try {
      const { rows } = await this.conexion.consultar(sql, parametros);
      return rows.map((r) => r.datos as T);
    } catch (e) {
      traducirError(e, c);
    }
  }

  async obtener<T extends { id: string }>(c: DefinicionColeccion<T>, id: string): Promise<T | null> {
    try {
      const { rows } = await this.conexion.consultar(`SELECT datos FROM ${this.tabla(c)} WHERE id = $1`, [id]);
      return rows[0] ? (rows[0].datos as T) : null;
    } catch (e) {
      traducirError(e, c);
    }
  }

  async guardar<T extends { id: string }>(c: DefinicionColeccion<T>, documento: T): Promise<T> {
    try {
      const { rows } = await this.conexion.consultar(
        `INSERT INTO ${this.tabla(c)} (id, datos) VALUES ($1, $2::jsonb)
         ON CONFLICT (id) DO UPDATE SET datos = EXCLUDED.datos, modificado_en = now()
         RETURNING datos`,
        [documento.id, JSON.stringify(documento)],
      );
      return (rows[0]?.datos as T) ?? documento;
    } catch (e) {
      traducirError(e, c);
    }
  }

  async guardarVarios<T extends { id: string }>(c: DefinicionColeccion<T>, documentos: readonly T[]): Promise<number> {
    const lote = sinDuplicados(documentos);
    if (!lote.length) return 0;
    try {
      const { rows } = await this.conexion.consultar(
        `INSERT INTO ${this.tabla(c)} (id, datos)
         SELECT elemento ->> 'id', elemento FROM jsonb_array_elements($1::jsonb) AS elemento
         ON CONFLICT (id) DO UPDATE SET datos = EXCLUDED.datos, modificado_en = now()
         RETURNING id`,
        [JSON.stringify(lote)],
      );
      return rows.length;
    } catch (e) {
      traducirError(e, c);
    }
  }

  async eliminar<T extends { id: string }>(c: DefinicionColeccion<T>, id: string): Promise<boolean> {
    try {
      const { rows } = await this.conexion.consultar(`DELETE FROM ${this.tabla(c)} WHERE id = $1 RETURNING id`, [id]);
      return rows.length > 0;
    } catch (e) {
      traducirError(e, c);
    }
  }

  async eliminarDonde<T extends { id: string }>(c: DefinicionColeccion<T>, campo: string, valor: ValorFiltro): Promise<number> {
    const parametros: unknown[] = [];
    const donde = this.condiciones(c, { [campo]: valor }, parametros);
    try {
      const { rows } = await this.conexion.consultar(`DELETE FROM ${this.tabla(c)}${donde} RETURNING id`, parametros);
      return rows.length;
    } catch (e) {
      traducirError(e, c);
    }
  }

  async contar<T extends { id: string }>(c: DefinicionColeccion<T>): Promise<number> {
    try {
      const { rows } = await this.conexion.consultar(`SELECT count(*)::int AS n FROM ${this.tabla(c)}`);
      return Number(rows[0]?.n ?? 0);
    } catch (e) {
      traducirError(e, c);
    }
  }

  async vaciar<T extends { id: string }>(c: DefinicionColeccion<T>): Promise<void> {
    try {
      await this.conexion.consultar(`DELETE FROM ${this.tabla(c)}`);
    } catch (e) {
      traducirError(e, c);
    }
  }
}
