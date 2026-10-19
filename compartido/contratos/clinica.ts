import { z } from "zod";
import { ESTADOS } from "../dominio/estados.js";
import { CAPACIDADES, DEPARTAMENTOS, MOTIVOS_REFERENCIA } from "../dominio/referencias.js";
import { ETAPAS } from "../dominio/tratamiento.js";
import {
  CodigoVinculacion,
  coleccion,
  Fecha,
  Hora,
  Id,
  Momento,
  SerieMichi,
  texto,
  TextoOpcional,
  type InfoSalud,
  type Volcado,
} from "./comunes.js";

export const PARENTESCOS = ["madre", "padre", "abuela", "abuelo", "tutor", "otro"] as const;
export const CANALES = ["app", "whatsapp", "sms", "llamada", "correo"] as const;
export const FOTOTIPOS = ["I", "II", "III", "IV", "V", "VI"] as const;
export const NIVELES_TRIAJE = ["estable", "indeterminado", "grave", "priorizable"] as const;
export const ORIGENES_TAMIZAJE = ["app", "michi", "consola", "analisis_optico", "demo"] as const;
export const TIPOS_CITA = ["control", "hemograma", "quimioterapia", "evaluacion", "teleconsulta"] as const;

export const NOMBRE_TIPO_CITA: Record<(typeof TIPOS_CITA)[number], string> = {
  control: "Control con Hematología",
  hemograma: "Hemograma de control",
  quimioterapia: "Quimioterapia",
  evaluacion: "Evaluación de etapa",
  teleconsulta: "Teleconsulta",
};

export const Apoderado = z.object({
  nombre: texto(2, 80),
  parentesco: z.enum(PARENTESCOS),
  celular: z.string().regex(/^9\d{8}$/, "Celular peruano de 9 dígitos que empieza en 9"),
  canalPreferido: z.enum(CANALES),
  finJornada: Hora,
  sinHorarioFijo: z.boolean(),
  segundoContacto: TextoOpcional(80),
  correo: z.union([z.literal(""), z.email("Correo inválido")]),
});

export const DomicilioEsquema = z.object({
  departamento: z.enum(DEPARTAMENTOS),
  provincia: texto(1, 60),
  distrito: TextoOpcional(60),
  horasAlInsn: z.number().min(0, "No puede ser negativo").max(96, "Máximo 96 h"),
  puedeViajarALima: z.boolean(),
  motivoImpedimento: TextoOpcional(200),
});

export const Paciente = z.object({
  id: Id,
  historiaClinica: z
    .string()
    .trim()
    .min(3, "Mínimo 3 caracteres")
    .max(32, "Máximo 32 caracteres")
    .regex(/^[A-Za-z0-9-]+$/, "Solo letras, números y guiones"),
  nombres: texto(1, 80),
  apellidos: texto(1, 80),
  fechaNacimiento: Fecha,
  sexo: z.enum(["F", "M"]),
  diagnostico: texto(3, 120),
  fototipo: z.enum(FOTOTIPOS),
  etapa: z.enum(ETAPAS),
  inicioEtapa: Fecha,
  medicoAsignado: texto(3, 120),
  cmpMedico: TextoOpcional(12),
  cateterCentral: z.boolean(),
  fraccionNeutrofilos: z.number().gt(0).lt(1).nullable(),
  apoderado: Apoderado,
  domicilio: DomicilioEsquema,
  nombreMichi: texto(1, 24),
  serieMichi: SerieMichi.nullable(),
  codigoVinculacion: CodigoVinculacion.nullable(),
  entregadoEn: Momento.nullable(),
  seguimiento: z.enum(["activo", "cerrado"]),
  creado: Momento,
  actualizado: Momento,
});
export type Paciente = z.infer<typeof Paciente>;

export const EntradaTamizaje = z.object({
  id: Id,
  pacienteId: Id,
  momento: Momento,
  origen: z.enum(ORIGENES_TAMIZAJE),
  serie: SerieMichi.nullable(),
  concluyente: z.boolean(),
  ancEstimado: z.number().min(0).max(100000).nullable(),
  icInferior: z.number().min(0).max(100000).nullable(),
  icSuperior: z.number().min(0).max(1000000).nullable(),
  capilares: z.number().int().min(0).max(30),
  eventos: z.number().int().min(0).max(100000),
  volumenNl: z.number().min(0).max(1000).nullable(),
  razones: z.array(TextoOpcional(200)).max(20),
  temperaturaC: z.number().min(34, "Temperatura fuera de rango").max(43, "Temperatura fuera de rango").nullable(),
  fiebreSostenida: z.boolean(),
  diasPostQuimio: z.number().int().min(0).max(60).nullable(),
  simulado: z.boolean(),
});
export type EntradaTamizaje = z.infer<typeof EntradaTamizaje>;

export const Tamizaje = EntradaTamizaje.extend({
  nivelTriaje: z.enum(NIVELES_TRIAJE),
  estado: z.enum(ESTADOS),
  escaladoPorFiebre: z.boolean(),
  titulo: z.string().max(200),
  accion: z.string().max(1000),
  plazo: z.string().max(120),
  fundamento: z.array(z.string().max(500)).max(30),
});
export type Tamizaje = z.infer<typeof Tamizaje>;

export const Hemograma = z.object({
  id: Id,
  pacienteId: Id,
  fecha: Momento,
  anc: z.number().min(0).max(100000),
  leucocitos: z.number().min(0).max(500000).nullable(),
  fraccionNeutrofilos: z.number().gt(0).lt(1).nullable(),
  hemoglobina: z.number().min(0).max(25).nullable(),
  plaquetas: z.number().min(0).max(3000000).nullable(),
  laboratorio: texto(2, 120),
  observaciones: TextoOpcional(500),
});
export type Hemograma = z.infer<typeof Hemograma>;

export const Cita = z.object({
  id: Id,
  pacienteId: Id,
  fecha: Fecha,
  hora: Hora.nullable(),
  tipo: z.enum(TIPOS_CITA),
  lugar: texto(2, 120),
  asistio: z.boolean().nullable(),
});
export type Cita = z.infer<typeof Cita>;

export const Teleconsulta = z.object({
  id: Id,
  pacienteId: Id,
  tamizajeId: Id.nullable(),
  creada: Momento,
  prioridad: z.enum(["diferida", "tiempo_real"]),
  estado: z.enum(["abierta", "respondida", "cerrada"]),
  origen: z.enum(["consola", "familia"]),
  pregunta: texto(5, 2000),
  respuesta: TextoOpcional(4000),
  respondidaEn: Momento.nullable(),
  responsable: TextoOpcional(120),
  puedeViajarALima: z.boolean().nullable(),
});
export type Teleconsulta = z.infer<typeof Teleconsulta>;

export const Referencia = z.object({
  id: Id,
  pacienteId: Id,
  creada: Momento,
  motivo: z.enum(MOTIVOS_REFERENCIA),
  capacidadesRequeridas: z.array(z.enum(CAPACIDADES)).min(1),
  destinoCodigo: texto(2, 20),
  destinoNombre: texto(2, 160),
  destinoCiudad: texto(2, 80),
  destinoDepartamento: z.enum(DEPARTAMENTOS),
  alternativas: z.array(z.string().max(160)).max(5),
  horasEvitadas: z.number().min(0).max(500),
  justificacion: z.string().max(1500),
  advertencias: z.array(z.string().max(500)).max(10),
  emitidaPor: TextoOpcional(120),
  estado: z.enum(["emitida", "atendida", "contrarreferida"]),
});
export type Referencia = z.infer<typeof Referencia>;

export const COLECCIONES_CLINICA = {
  pacientes: coleccion("pacientes", Paciente, {
    indices: ["historiaClinica", "codigoVinculacion"],
    unicos: ["historiaClinica", "codigoVinculacion"],
    orden: "apellidos",
  }),
  tamizajes: coleccion("tamizajes", Tamizaje, { indices: ["pacienteId", "momento"], orden: "momento" }),
  hemogramas: coleccion("hemogramas", Hemograma, { indices: ["pacienteId", "fecha"], orden: "fecha" }),
  citas: coleccion("citas", Cita, { indices: ["pacienteId", "fecha"], orden: "fecha" }),
  teleconsultas: coleccion("teleconsultas", Teleconsulta, { indices: ["pacienteId", "creada", "estado"], orden: "creada" }),
  referencias: coleccion("referencias", Referencia, { indices: ["pacienteId", "creada"], orden: "creada" }),
} as const;

export type ColeccionClinica = keyof typeof COLECCIONES_CLINICA;
export const NOMBRES_COLECCIONES_CLINICA = Object.keys(COLECCIONES_CLINICA) as ColeccionClinica[];
export type ColeccionDePaciente = Exclude<ColeccionClinica, "pacientes">;

export interface RegistroClinico {
  tamizajes: Tamizaje;
  hemogramas: Hemograma;
  citas: Cita;
  teleconsultas: Teleconsulta;
  referencias: Referencia;
}

export interface ResumenFamilia {
  pacienteId: string;
  nombres: string;
  nombreMichi: string;
  serieMichi: string | null;
  etapa: Paciente["etapa"];
  inicioEtapa: string;
  fechaNacimiento: string;
  finJornada: string;
  sinHorarioFijo: boolean;
  departamento: Paciente["domicilio"]["departamento"];
  provincia: string;
  horasAlInsn: number;
  puedeViajarALima: boolean;
  citas: Cita[];
  tamizajes: Tamizaje[];
}

export const SolicitudTeleconsultaFamilia = z.object({
  tamizajeId: Id,
  puedeViajarALima: z.boolean(),
});
export type SolicitudTeleconsultaFamilia = z.infer<typeof SolicitudTeleconsultaFamilia>;

export interface RespuestaTeleconsultaFamilia {
  teleconsulta: Teleconsulta;
  referencia: Referencia | null;
}

export interface ApiClinica {
  salud(): Promise<InfoSalud>;
  listarPacientes(): Promise<Paciente[]>;
  obtenerPaciente(id: string): Promise<Paciente>;
  guardarPaciente(paciente: Paciente): Promise<Paciente>;
  eliminarPaciente(id: string): Promise<void>;
  listarRegistros<K extends ColeccionDePaciente>(coleccion: K, pacienteId?: string): Promise<RegistroClinico[K][]>;
  guardarRegistro<K extends Exclude<ColeccionDePaciente, "tamizajes">>(coleccion: K, registro: RegistroClinico[K]): Promise<RegistroClinico[K]>;
  eliminarRegistro(coleccion: ColeccionDePaciente, id: string): Promise<void>;
  registrarTamizaje(entrada: EntradaTamizaje): Promise<Tamizaje>;
  resumenFamilia(codigo: string): Promise<ResumenFamilia>;
  registrarTamizajeFamilia(codigo: string, entrada: EntradaTamizaje): Promise<Tamizaje>;
  solicitarTeleconsultaFamilia(codigo: string, solicitud: SolicitudTeleconsultaFamilia): Promise<RespuestaTeleconsultaFamilia>;
  marcarCitaFamilia(codigo: string, citaId: string, asistio: boolean): Promise<Cita>;
  exportar(): Promise<Volcado>;
  importar(volcado: Volcado): Promise<Record<string, number>>;
  vaciar(): Promise<void>;
}
