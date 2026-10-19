import type { Almacen } from "../../compartido/almacen/tipos.js";
import {
  type ColeccionDePaciente,
  type EntradaTamizaje,
  type Paciente,
  type RegistroClinico,
  type SolicitudTeleconsultaFamilia,
} from "../../compartido/contratos/clinica.js";
import { ErrorMichi } from "../../compartido/errores.js";
import { ESQUEMA_CLINICA, MIGRACIONES_CLINICA } from "./esquema.js";
export { ESQUEMA_CLINICA, MIGRACIONES_CLINICA, TABLAS_CLINICA } from "./esquema.js";
import { persistenciaPerezosa, tokenClinico } from "../plataforma/conexion.js";
import { crearManejador, exigirObjeto, type Entorno, type Ruta } from "../plataforma/http.js";
import { idCoincide, rutasComunes } from "../plataforma/rutasComunes.js";
import { ServicioClinica } from "./servicio.js";

function coleccionDePaciente(nombre: string | undefined): ColeccionDePaciente {
  const validas: ColeccionDePaciente[] = ["tamizajes", "hemogramas", "citas", "teleconsultas", "referencias"];
  if (!nombre || !validas.includes(nombre as ColeccionDePaciente)) throw new ErrorMichi("no_encontrado", `Colección desconocida: ${nombre}`);
  return nombre as ColeccionDePaciente;
}

export const RUTAS_CLINICA: readonly Ruta<ServicioClinica>[] = [
  ...rutasComunes<ServicioClinica>(),
  { metodo: "GET", patron: "/pacientes", actor: "clinico", ejecutar: (s) => s.listarPacientes() },
  { metodo: "GET", patron: "/pacientes/:id", actor: "clinico", ejecutar: (s, c) => s.obtenerPaciente(c.params.id as string) },
  {
    metodo: "PUT",
    patron: "/pacientes/:id",
    actor: "clinico",
    ejecutar: (s, c) => {
      const cuerpo = exigirObjeto(c.cuerpo, "El paciente");
      idCoincide(c.params, cuerpo);
      return s.guardarPaciente(cuerpo as unknown as Paciente);
    },
  },
  {
    metodo: "DELETE",
    patron: "/pacientes/:id",
    actor: "clinico",
    ejecutar: (s, c) => s.eliminarPaciente(c.params.id as string),
  },
  {
    metodo: "GET",
    patron: "/registros/:coleccion",
    actor: "clinico",
    ejecutar: (s, c) => s.listarRegistros(coleccionDePaciente(c.params.coleccion), c.query.get("pacienteId") ?? undefined),
  },
  {
    metodo: "PUT",
    patron: "/registros/:coleccion/:id",
    actor: "clinico",
    ejecutar: (s, c) => {
      const coleccion = coleccionDePaciente(c.params.coleccion);
      if (coleccion === "tamizajes") throw new ErrorMichi("validacion", "Use POST /tamizajes para registrar tamizajes");
      const cuerpo = exigirObjeto(c.cuerpo, "El registro");
      idCoincide(c.params, cuerpo);
      return s.guardarRegistro(coleccion, cuerpo as unknown as RegistroClinico[typeof coleccion]);
    },
  },
  {
    metodo: "DELETE",
    patron: "/registros/:coleccion/:id",
    actor: "clinico",
    ejecutar: (s, c) => s.eliminarRegistro(coleccionDePaciente(c.params.coleccion), c.params.id as string),
  },
  {
    metodo: "POST",
    patron: "/tamizajes",
    actor: "clinico",
    ejecutar: (s, c) => s.registrarTamizaje(exigirObjeto(c.cuerpo, "El tamizaje") as unknown as EntradaTamizaje),
  },
  { metodo: "GET", patron: "/familia/:codigo", actor: "familia", ejecutar: (s, c) => s.resumenFamilia(c.params.codigo as string) },
  {
    metodo: "POST",
    patron: "/familia/:codigo/tamizajes",
    actor: "familia",
    ejecutar: (s, c) =>
      s.registrarTamizajeFamilia(c.params.codigo as string, exigirObjeto(c.cuerpo, "El tamizaje") as unknown as EntradaTamizaje),
  },
  {
    metodo: "POST",
    patron: "/familia/:codigo/teleconsultas",
    actor: "familia",
    ejecutar: (s, c) =>
      s.solicitarTeleconsultaFamilia(
        c.params.codigo as string,
        exigirObjeto(c.cuerpo, "La solicitud") as unknown as SolicitudTeleconsultaFamilia,
      ),
  },
  {
    metodo: "PUT",
    patron: "/familia/:codigo/citas/:id",
    actor: "familia",
    ejecutar: (s, c) => {
      const cuerpo = exigirObjeto(c.cuerpo, "La cita");
      return s.marcarCitaFamilia(c.params.codigo as string, c.params.id as string, cuerpo.asistio as boolean);
    },
  },
];

export function crearManejadorClinica(entorno?: Entorno<ServicioClinica>, reloj?: () => Date) {
  const persistencia = persistenciaPerezosa(ESQUEMA_CLINICA, MIGRACIONES_CLINICA);
  return crearManejador<ServicioClinica>({
    nombre: "clinica",
    rutas: RUTAS_CLINICA,
    entorno: entorno ?? {
      servicio: async () => new ServicioClinica((await persistencia()).almacen, reloj),
      token: tokenClinico,
      auditar: async (r) => (await persistencia()).auditar(r),
    },
  });
}

export function entornoDePrueba(almacen: Almacen, token: string, reloj?: () => Date): Entorno<ServicioClinica> {
  return { servicio: async () => new ServicioClinica(almacen, reloj), token: () => token };
}
