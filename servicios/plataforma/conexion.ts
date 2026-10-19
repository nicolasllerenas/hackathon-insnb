import pg from "pg";
import { AlmacenSql, migrar, type Conexion, type Migracion } from "../../compartido/almacen/sql.js";
import type { Almacen } from "../../compartido/almacen/tipos.js";
import { ErrorMichi } from "../../compartido/errores.js";
import type { RegistroAuditoria } from "./http.js";

const conexiones = new Map<string, Conexion>();

export function urlBaseDeDatos(): string | undefined {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  return url && url.trim() ? url.trim() : undefined;
}

export function tokenClinico(): string | undefined {
  const t = process.env.MICHICHECK_TOKEN;
  return t && t.trim().length >= 16 ? t.trim() : undefined;
}

export function conexionPostgres(url: string): Conexion {
  const existente = conexiones.get(url);
  if (existente) return existente;
  const pool = new pg.Pool({ connectionString: url, max: 4, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 8_000 });
  pool.on("error", (e) => console.error("[postgres]", e.message));
  const conexion: Conexion = {
    consultar: async (sql, parametros) => {
      const r = await pool.query(sql, parametros as unknown[] | undefined);
      return { rows: r.rows as Record<string, unknown>[] };
    },
    transaccion: async (trabajo) => {
      const cliente = await pool.connect();
      try {
        await cliente.query("BEGIN");
        const resultado = await trabajo(async (sql, parametros) => {
          const r = await cliente.query(sql, parametros as unknown[] | undefined);
          return { rows: r.rows as Record<string, unknown>[] };
        });
        await cliente.query("COMMIT");
        return resultado;
      } catch (e) {
        await cliente.query("ROLLBACK").catch(() => undefined);
        throw e;
      } finally {
        cliente.release();
      }
    },
    cerrar: async () => {
      conexiones.delete(url);
      await pool.end();
    },
  };
  conexiones.set(url, conexion);
  return conexion;
}

export interface Persistencia {
  almacen: Almacen;
  auditar: (registro: RegistroAuditoria) => Promise<void>;
}

export function persistenciaPerezosa(
  esquema: string,
  migraciones: readonly Migracion[],
  obtenerConexion: () => Conexion = () => {
    const url = urlBaseDeDatos();
    if (!url) throw new ErrorMichi("no_configurado", "El servidor no tiene base de datos (DATABASE_URL). Use el modo local de la app.");
    return conexionPostgres(url);
  },
): () => Promise<Persistencia> {
  let promesa: Promise<Persistencia> | null = null;
  return () => {
    if (!promesa) {
      promesa = (async () => {
        const conexion = obtenerConexion();
        await migrar(conexion, esquema, migraciones);
        return {
          almacen: new AlmacenSql(esquema, conexion),
          auditar: async (r: RegistroAuditoria) => {
            await conexion.consultar(
              `INSERT INTO "${esquema}".auditoria (actor, accion, coleccion, registro_id) VALUES ($1, $2, $3, $4)`,
              [r.actor, r.accion, r.coleccion, r.registroId],
            );
          },
        };
      })().catch((e: unknown) => {
        promesa = null;
        throw e;
      });
    }
    return promesa;
  };
}
