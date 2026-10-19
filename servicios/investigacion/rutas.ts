import type { Almacen } from "../../compartido/almacen/tipos.js";
import { type Participante } from "../../compartido/contratos/investigacion.js";
import { ESQUEMA_INVESTIGACION, MIGRACIONES_INVESTIGACION } from "./esquema.js";
export { ESQUEMA_INVESTIGACION, MIGRACIONES_INVESTIGACION, TABLAS_INVESTIGACION } from "./esquema.js";
import { persistenciaPerezosa, tokenClinico } from "../plataforma/conexion.js";
import { crearManejador, exigirObjeto, type Entorno, type Ruta } from "../plataforma/http.js";
import { idCoincide, rutasComunes } from "../plataforma/rutasComunes.js";
import { ServicioInvestigacion } from "./servicio.js";

export const RUTAS_INVESTIGACION: readonly Ruta<ServicioInvestigacion>[] = [
  ...rutasComunes<ServicioInvestigacion>(),
  { metodo: "GET", patron: "/participantes", actor: "clinico", ejecutar: (s) => s.listarParticipantes() },
  { metodo: "GET", patron: "/codigo-siguiente", actor: "clinico", ejecutar: (s) => s.siguienteCodigo() },
  {
    metodo: "PUT",
    patron: "/participantes/:id",
    actor: "clinico",
    ejecutar: (s, c) => {
      const cuerpo = exigirObjeto(c.cuerpo, "El participante");
      idCoincide(c.params, cuerpo);
      return s.guardarParticipante(cuerpo as unknown as Participante);
    },
  },
  {
    metodo: "DELETE",
    patron: "/participantes/:id",
    actor: "clinico",
    ejecutar: (s, c) => s.eliminarParticipante(c.params.id as string),
  },
];

export function crearManejadorInvestigacion(entorno?: Entorno<ServicioInvestigacion>) {
  const persistencia = persistenciaPerezosa(ESQUEMA_INVESTIGACION, MIGRACIONES_INVESTIGACION);
  return crearManejador<ServicioInvestigacion>({
    nombre: "investigacion",
    rutas: RUTAS_INVESTIGACION,
    entorno: entorno ?? {
      servicio: async () => new ServicioInvestigacion((await persistencia()).almacen),
      token: tokenClinico,
      auditar: async (r) => (await persistencia()).auditar(r),
    },
  });
}

export function entornoDePrueba(almacen: Almacen, token: string): Entorno<ServicioInvestigacion> {
  return { servicio: async () => new ServicioInvestigacion(almacen), token: () => token };
}
