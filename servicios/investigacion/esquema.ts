import { migracionInicial, type DefinicionTabla, type Migracion } from "../../compartido/almacen/sql.js";
import { COLECCIONES_INVESTIGACION as C } from "../../compartido/contratos/investigacion.js";

export const ESQUEMA_INVESTIGACION = "investigacion";
export const TABLAS_INVESTIGACION: readonly DefinicionTabla[] = [{ coleccion: C.participantes }];
export const MIGRACIONES_INVESTIGACION: readonly Migracion[] = [migracionInicial(ESQUEMA_INVESTIGACION, TABLAS_INVESTIGACION)];
