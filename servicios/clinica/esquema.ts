import { migracionInicial, type DefinicionTabla, type Migracion } from "../../compartido/almacen/sql.js";
import { COLECCIONES_CLINICA as C } from "../../compartido/contratos/clinica.js";

export const ESQUEMA_CLINICA = "clinica";

const ref = [{ campo: "pacienteId", coleccion: "pacientes" }] as const;
export const TABLAS_CLINICA: readonly DefinicionTabla[] = [
  { coleccion: C.pacientes },
  { coleccion: C.tamizajes, referencias: ref },
  { coleccion: C.hemogramas, referencias: ref },
  { coleccion: C.citas, referencias: ref },
  { coleccion: C.teleconsultas, referencias: ref },
  { coleccion: C.referencias, referencias: ref },
];

export const MIGRACIONES_CLINICA: readonly Migracion[] = [migracionInicial(ESQUEMA_CLINICA, TABLAS_CLINICA)];
