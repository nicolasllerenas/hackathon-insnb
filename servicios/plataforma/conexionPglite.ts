import { PGlite } from "@electric-sql/pglite";
import type { Conexion, Ejecutor } from "../../compartido/almacen/sql.js";

export async function conexionPglite(): Promise<Conexion> {
  const db = await PGlite.create();
  const consultar: Ejecutor = async (sql, parametros) => {
    const r = await db.query<Record<string, unknown>>(sql, parametros as unknown[] | undefined);
    return { rows: r.rows };
  };
  return {
    consultar,
    transaccion: (trabajo) =>
      db.transaction(async (tx) =>
        trabajo(async (sql, parametros) => {
          const r = await tx.query<Record<string, unknown>>(sql, parametros as unknown[] | undefined);
          return { rows: r.rows };
        }),
      ),
    cerrar: () => db.close(),
  };
}
