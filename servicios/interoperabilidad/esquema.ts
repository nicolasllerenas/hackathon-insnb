import { migracionInicial, type DefinicionTabla, type Migracion } from "../../compartido/almacen/sql.js";
import { COLECCIONES_INTEROP as C } from "../../compartido/contratos/interoperabilidad.js";

export const ESQUEMA_INTEROP = "interop";
export const TABLAS_INTEROP: readonly DefinicionTabla[] = [{ coleccion: C.mensajes }];
export const MIGRACIONES_INTEROP: readonly Migracion[] = [migracionInicial(ESQUEMA_INTEROP, TABLAS_INTEROP)];
