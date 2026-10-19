import type { Almacen } from "../../compartido/almacen/tipos.js";
import { type SolicitudMensaje } from "../../compartido/contratos/interoperabilidad.js";
import { ESQUEMA_INTEROP, MIGRACIONES_INTEROP } from "./esquema.js";
export { ESQUEMA_INTEROP, MIGRACIONES_INTEROP, TABLAS_INTEROP } from "./esquema.js";
import { persistenciaPerezosa, tokenClinico } from "../plataforma/conexion.js";
import { crearManejador, exigirObjeto, type Entorno, type Ruta } from "../plataforma/http.js";
import { rutasComunes } from "../plataforma/rutasComunes.js";
import { ServicioInteroperabilidad } from "./servicio.js";

export const RUTAS_INTEROP: readonly Ruta<ServicioInteroperabilidad>[] = [
  ...rutasComunes<ServicioInteroperabilidad>(),
  {
    metodo: "GET",
    patron: "/mensajes",
    actor: "clinico",
    ejecutar: (s, c) => s.listarMensajes(c.query.get("pacienteId") ?? undefined),
  },
  {
    metodo: "POST",
    patron: "/mensajes",
    actor: "clinico",
    ejecutar: (s, c) => s.generarMensaje(exigirObjeto(c.cuerpo, "La solicitud") as unknown as SolicitudMensaje),
  },
  { metodo: "DELETE", patron: "/mensajes/:id", actor: "clinico", ejecutar: (s, c) => s.eliminarMensaje(c.params.id as string) },
];

export function crearManejadorInterop(entorno?: Entorno<ServicioInteroperabilidad>) {
  const persistencia = persistenciaPerezosa(ESQUEMA_INTEROP, MIGRACIONES_INTEROP);
  return crearManejador<ServicioInteroperabilidad>({
    nombre: "interop",
    rutas: RUTAS_INTEROP,
    entorno: entorno ?? {
      servicio: async () => new ServicioInteroperabilidad((await persistencia()).almacen),
      token: tokenClinico,
      auditar: async (r) => (await persistencia()).auditar(r),
    },
  });
}

export function entornoDePrueba(almacen: Almacen, token: string): Entorno<ServicioInteroperabilidad> {
  return { servicio: async () => new ServicioInteroperabilidad(almacen), token: () => token };
}
