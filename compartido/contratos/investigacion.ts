import { z } from "zod";
import { coleccion, Fecha, Id, texto, TextoOpcional, type InfoSalud, type Volcado } from "./comunes.js";
import { FOTOTIPOS, PARENTESCOS } from "./clinica.js";

export const Participante = z.object({
  id: Id,
  codigoEstudio: z.string().regex(/^MCK-E-\d{3,4}$/, "Formato MCK-E-001"),
  pacienteId: Id,
  fechaInclusion: Fecha,
  consentimiento: z.object({
    fecha: Fecha,
    version: texto(1, 20),
    otorgadoPor: texto(2, 80),
    parentesco: z.enum(PARENTESCOS),
  }),
  asentimiento: z.object({
    aplica: z.boolean(),
    otorgado: z.boolean(),
    fecha: Fecha.nullable(),
  }),
  fototipoVerificado: z.enum(FOTOTIPOS),
  estado: z.enum(["activo", "retirado", "completado"]),
  fechaRetiro: Fecha.nullable(),
  motivoRetiro: TextoOpcional(200),
  observaciones: TextoOpcional(500),
});
export type Participante = z.infer<typeof Participante>;

export const COLECCIONES_INVESTIGACION = {
  participantes: coleccion("participantes", Participante, {
    indices: ["pacienteId", "codigoEstudio"],
    unicos: ["pacienteId", "codigoEstudio"],
    orden: "codigoEstudio",
  }),
} as const;

export interface ApiInvestigacion {
  salud(): Promise<InfoSalud>;
  listarParticipantes(): Promise<Participante[]>;
  guardarParticipante(participante: Participante): Promise<Participante>;
  eliminarParticipante(id: string): Promise<void>;
  siguienteCodigo(): Promise<string>;
  exportar(): Promise<Volcado>;
  importar(volcado: Volcado): Promise<Record<string, number>>;
  vaciar(): Promise<void>;
}
