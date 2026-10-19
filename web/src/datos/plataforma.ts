import { ClienteClinica, ClienteDispositivos, ClienteInteroperabilidad, ClienteInvestigacion } from "@compartido/clientes/servicios";
import { COLECCIONES_CLINICA, type ApiClinica } from "@compartido/contratos/clinica";
import { COLECCIONES_DISPOSITIVOS, type ApiDispositivos } from "@compartido/contratos/dispositivos";
import { COLECCIONES_INTEROP, type ApiInteroperabilidad } from "@compartido/contratos/interoperabilidad";
import { COLECCIONES_INVESTIGACION, type ApiInvestigacion } from "@compartido/contratos/investigacion";
import { generarDemostracion } from "@compartido/semilla";
import { ServicioClinica } from "@servicios/clinica/servicio";
import { ServicioDispositivos } from "@servicios/dispositivos/servicio";
import { ServicioInteroperabilidad } from "@servicios/interoperabilidad/servicio";
import { ServicioInvestigacion } from "@servicios/investigacion/servicio";
import { AlmacenIndexedDB } from "./almacenIndexedDB";
import type { Configuracion, ModoDatos } from "./configuracion";

export type NombreServicio = "clinica" | "dispositivos" | "interop" | "investigacion";

export interface Plataforma {
  modo: ModoDatos;
  clinica: ApiClinica;
  dispositivos: ApiDispositivos;
  interop: ApiInteroperabilidad;
  investigacion: ApiInvestigacion;
  restablecerDemostracion(): Promise<void>;
  vaciarTodo(): Promise<void>;
  cerrar(): void;
}

export const NOMBRES_SERVICIO: Record<NombreServicio, string> = {
  clinica: "Servicio clínico",
  dispositivos: "Servicio de dispositivos",
  interop: "Servicio de interoperabilidad",
  investigacion: "Servicio de investigación",
};

async function cargarDemostracion(p: Omit<Plataforma, "restablecerDemostracion" | "vaciarTodo" | "cerrar">): Promise<void> {
  await p.interop.vaciar();
  await p.investigacion.vaciar();
  await p.dispositivos.vaciar();
  await p.clinica.vaciar();
  const demo = await generarDemostracion();
  await p.clinica.importar(demo.clinica);
  await p.dispositivos.importar(demo.dispositivos);
  await p.investigacion.importar(demo.investigacion);
}

async function vaciar(p: Omit<Plataforma, "restablecerDemostracion" | "vaciarTodo" | "cerrar">): Promise<void> {
  await p.interop.vaciar();
  await p.investigacion.vaciar();
  await p.dispositivos.vaciar();
  await p.clinica.vaciar();
}

export function crearPlataforma(config: Configuracion): Plataforma {
  if (config.modo === "servidor") {
    const opciones = (nombre: NombreServicio) => ({ base: `/api/v1/${nombre}`, token: () => config.token || null });
    const base = {
      modo: "servidor" as const,
      clinica: new ClienteClinica(opciones("clinica")),
      dispositivos: new ClienteDispositivos(opciones("dispositivos")),
      interop: new ClienteInteroperabilidad(opciones("interop")),
      investigacion: new ClienteInvestigacion(opciones("investigacion")),
    };
    return { ...base, restablecerDemostracion: () => cargarDemostracion(base), vaciarTodo: () => vaciar(base), cerrar: () => undefined };
  }
  const almacenes = {
    clinica: new AlmacenIndexedDB("michicheck-clinica", Object.values(COLECCIONES_CLINICA)),
    dispositivos: new AlmacenIndexedDB("michicheck-dispositivos", Object.values(COLECCIONES_DISPOSITIVOS)),
    interop: new AlmacenIndexedDB("michicheck-interop", Object.values(COLECCIONES_INTEROP)),
    investigacion: new AlmacenIndexedDB("michicheck-investigacion", Object.values(COLECCIONES_INVESTIGACION)),
  };
  const base = {
    modo: "local" as const,
    clinica: new ServicioClinica(almacenes.clinica),
    dispositivos: new ServicioDispositivos(almacenes.dispositivos),
    interop: new ServicioInteroperabilidad(almacenes.interop),
    investigacion: new ServicioInvestigacion(almacenes.investigacion),
  };
  return {
    ...base,
    restablecerDemostracion: () => cargarDemostracion(base),
    vaciarTodo: () => vaciar(base),
    cerrar: () => Object.values(almacenes).forEach((a) => a.cerrar()),
  };
}

const LLAVE_SEMBRADO = "michicheck.demostracion-local";

export async function prepararDemostracionLocal(p: Plataforma): Promise<boolean> {
  if (p.modo !== "local") return false;
  try {
    if (window.localStorage.getItem(LLAVE_SEMBRADO)) return false;
  } catch {
    return false;
  }
  const salud = await p.clinica.salud();
  const vacio = Object.values(salud.registros).every((n) => n === 0);
  if (vacio) await p.restablecerDemostracion();
  try {
    window.localStorage.setItem(LLAVE_SEMBRADO, new Date().toISOString());
  } catch {
    return vacio;
  }
  return vacio;
}
