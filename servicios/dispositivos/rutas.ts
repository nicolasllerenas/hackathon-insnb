import type { Almacen } from "../../compartido/almacen/tipos.js";
import { type EntradaLatido, type Michi, type RegistroMichi } from "../../compartido/contratos/dispositivos.js";
import { ErrorMichi } from "../../compartido/errores.js";
import { ESQUEMA_DISPOSITIVOS, MIGRACIONES_DISPOSITIVOS } from "./esquema.js";
export { ESQUEMA_DISPOSITIVOS, MIGRACIONES_DISPOSITIVOS, TABLAS_DISPOSITIVOS } from "./esquema.js";
import { persistenciaPerezosa, tokenClinico } from "../plataforma/conexion.js";
import { crearManejador, exigirObjeto, type Entorno, type Ruta } from "../plataforma/http.js";
import { rutasComunes } from "../plataforma/rutasComunes.js";
import { ServicioDispositivos } from "./servicio.js";

const ESTADOS: readonly Michi["estado"][] = ["activo", "devuelto", "extraviado"];

export const RUTAS_DISPOSITIVOS: readonly Ruta<ServicioDispositivos>[] = [
  ...rutasComunes<ServicioDispositivos>(),
  { metodo: "GET", patron: "/michis", actor: "clinico", ejecutar: (s) => s.listarMichis() },
  { metodo: "GET", patron: "/parque", actor: "clinico", ejecutar: (s) => s.parque() },
  {
    metodo: "POST",
    patron: "/michis",
    actor: "clinico",
    ejecutar: (s, c) => s.registrarMichi(exigirObjeto(c.cuerpo, "El registro") as unknown as RegistroMichi),
  },
  { metodo: "GET", patron: "/michis/:serie", actor: "clinico", ejecutar: (s, c) => s.obtenerMichi(c.params.serie as string) },
  {
    metodo: "PUT",
    patron: "/michis/:serie/estado",
    actor: "clinico",
    ejecutar: (s, c) => {
      const estado = exigirObjeto(c.cuerpo).estado;
      if (!ESTADOS.includes(estado as Michi["estado"])) throw new ErrorMichi("validacion", "Estado inválido");
      return s.cambiarEstado(c.params.serie as string, estado as Michi["estado"]);
    },
  },
  { metodo: "DELETE", patron: "/michis/:serie", actor: "clinico", ejecutar: (s, c) => s.eliminarMichi(c.params.serie as string) },
  {
    metodo: "GET",
    patron: "/michis/:serie/latidos",
    actor: "clinico",
    ejecutar: (s, c) => s.listarLatidos(c.params.serie as string, Number(c.query.get("limite") ?? "50") || 50),
  },
  {
    metodo: "POST",
    patron: "/michis/:serie/latidos",
    actor: "dispositivo",
    ejecutar: (s, c) =>
      s.registrarLatido(
        c.params.serie as string,
        c.cabeceras.get("x-michi-codigo") ?? "",
        exigirObjeto(c.cuerpo, "El latido") as unknown as EntradaLatido,
      ),
  },
  {
    metodo: "POST",
    patron: "/michis/:serie/latidos-clinicos",
    actor: "clinico",
    ejecutar: (s, c) => s.registrarLatidoClinico(c.params.serie as string, exigirObjeto(c.cuerpo, "El latido") as unknown as EntradaLatido),
  },
];

export function crearManejadorDispositivos(entorno?: Entorno<ServicioDispositivos>) {
  const persistencia = persistenciaPerezosa(ESQUEMA_DISPOSITIVOS, MIGRACIONES_DISPOSITIVOS);
  return crearManejador<ServicioDispositivos>({
    nombre: "dispositivos",
    rutas: RUTAS_DISPOSITIVOS,
    entorno: entorno ?? {
      servicio: async () => new ServicioDispositivos((await persistencia()).almacen),
      token: tokenClinico,
      auditar: async (r) => (await persistencia()).auditar(r),
    },
  });
}

export function entornoDePrueba(almacen: Almacen, token: string, reloj?: () => Date): Entorno<ServicioDispositivos> {
  return { servicio: async () => new ServicioDispositivos(almacen, reloj), token: () => token };
}
