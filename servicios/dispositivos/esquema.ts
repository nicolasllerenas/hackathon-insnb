import { migracionInicial, type DefinicionTabla, type Migracion } from "../../compartido/almacen/sql.js";
import { COLECCIONES_DISPOSITIVOS as C } from "../../compartido/contratos/dispositivos.js";

export const ESQUEMA_DISPOSITIVOS = "dispositivos";

export const TABLAS_DISPOSITIVOS: readonly DefinicionTabla[] = [
  { coleccion: C.michis },
  { coleccion: C.latidos, referencias: [{ campo: "serie", coleccion: "michis" }] },
];

export const MIGRACIONES_DISPOSITIVOS: readonly Migracion[] = [migracionInicial(ESQUEMA_DISPOSITIVOS, TABLAS_DISPOSITIVOS)];
