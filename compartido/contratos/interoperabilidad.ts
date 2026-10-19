import { z } from "zod";
import { coleccion, Id, Momento, TextoOpcional, type InfoSalud, type Volcado } from "./comunes.js";
import { Paciente, Tamizaje } from "./clinica.js";

export const FORMATOS = ["hl7v2", "fhir"] as const;
export type Formato = (typeof FORMATOS)[number];

export const Mensaje = z.object({
  id: Id,
  pacienteId: Id,
  tamizajeId: Id,
  formato: z.enum(FORMATOS),
  contenido: z.string().min(1).max(500000),
  creado: Momento,
  estado: z.enum(["pendiente", "enviado", "error"]),
  destino: z.literal("GALENUS"),
  nota: TextoOpcional(500),
});
export type Mensaje = z.infer<typeof Mensaje>;

export const SolicitudMensaje = z.object({
  formato: z.enum(FORMATOS),
  paciente: Paciente,
  tamizaje: Tamizaje,
  michi: z
    .object({
      serie: z.string().max(20),
      firmware: z.string().max(20),
      enlace: z.enum(["en_linea", "intermitente", "sin_contacto"]),
      bateriaPct: z.number().min(0).max(100).nullable(),
    })
    .nullable(),
  guardar: z.boolean(),
});
export type SolicitudMensaje = z.infer<typeof SolicitudMensaje>;

export const COLECCIONES_INTEROP = {
  mensajes: coleccion("mensajes", Mensaje, { indices: ["pacienteId", "creado", "estado"], orden: "creado" }),
} as const;

export interface ApiInteroperabilidad {
  salud(): Promise<InfoSalud>;
  generarMensaje(solicitud: SolicitudMensaje): Promise<Mensaje>;
  listarMensajes(pacienteId?: string): Promise<Mensaje[]>;
  eliminarMensaje(id: string): Promise<void>;
  exportar(): Promise<Volcado>;
  importar(volcado: Volcado): Promise<Record<string, number>>;
  vaciar(): Promise<void>;
}
