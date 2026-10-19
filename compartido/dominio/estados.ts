import type { SaludDelEnlace } from "./enlace.js";
import { proponerReferencia, type Domicilio, type MotivoReferencia, type PropuestaReferencia } from "./referencias.js";
import { PERFILES, type Etapa } from "./tratamiento.js";
import { tieneFiebre, triar, type ContextoClinico, type DecisionTriaje, type NivelTriaje, type ResultadoTamizaje } from "./triaje.js";

export const ESTADOS = ["estable", "grave", "priorizable"] as const;
export type EstadoPaciente = (typeof ESTADOS)[number];

export const ORDEN_ESTADO: Record<EstadoPaciente, number> = { estable: 0, grave: 1, priorizable: 2 };

const DESDE_TRIAJE: Record<NivelTriaje, EstadoPaciente> = {
  estable: "estable",
  indeterminado: "grave",
  grave: "grave",
  priorizable: "priorizable",
};

export interface Conducta {
  titulo: string;
  nombre: string;
  paraLaFamilia: string;
  paraElEquipo: string;
  plazo: string | null;
  teleconsulta: boolean;
  emergencia: boolean;
}

export const CONDUCTAS: Readonly<Record<EstadoPaciente, Conducta>> = {
  estable: {
    titulo: "Todo en orden",
    nombre: "Estable",
    paraLaFamilia: "El michi no encontró nada raro. Sigan con el calendario de siempre.",
    paraElEquipo: "Basta el recordatorio de audio. Ninguna acción del equipo tratante.",
    plazo: null,
    teleconsulta: false,
    emergencia: false,
  },
  grave: {
    titulo: "Hay que avisar hoy",
    nombre: "Grave",
    paraLaFamilia:
      "El michi vio menos defensas de las esperadas. Se abrió una teleconsulta con el médico asignado. No espera a mañana.",
    paraElEquipo: "Teleconsulta con el médico asignado dentro de las 6 horas. Confirmar con hemograma.",
    plazo: "6 h",
    teleconsulta: true,
    emergencia: false,
  },
  priorizable: {
    titulo: "Atención prioritaria",
    nombre: "Priorizable",
    paraLaFamilia:
      "El michi vio muy pocas defensas. El INSN ya fue avisado. Si además hay fiebre de 38 °C o más, vayan a emergencias ahora mismo sin esperar la llamada.",
    paraElEquipo:
      "Teleconsulta prioritaria en 15 minutos con opción de ingreso por emergencia. Si hay fiebre, antibiótico de amplio espectro en la primera hora.",
    plazo: "15 min",
    teleconsulta: true,
    emergencia: true,
  },
};

export interface FichaParaEvaluar {
  historiaClinica: string;
  etapa: Etapa;
  domicilio: Domicilio;
}

export interface Evaluacion {
  estado: EstadoPaciente;
  titulo: string;
  paraLaFamilia: string;
  paraElEquipo: string;
  plazo: string | null;
  requiereTeleconsulta: boolean;
  habilitaEmergencia: boolean;
  motivos: string[];
  escaladoPorFiebre: boolean;
  escaladoPorSilencio: boolean;
  referenciaSugerida: PropuestaReferencia | null;
  triaje: DecisionTriaje | null;
  sinTamizajes: boolean;
}

export function elevarEstado(actual: EstadoPaciente, piso: EstadoPaciente): EstadoPaciente {
  return ORDEN_ESTADO[actual] >= ORDEN_ESTADO[piso] ? actual : piso;
}

export function estadoDesdeNivel(nivel: NivelTriaje): EstadoPaciente {
  return DESDE_TRIAJE[nivel];
}

export function motivoDeReferencia(estado: EstadoPaciente, contexto: ContextoClinico): MotivoReferencia {
  if (estado === "priorizable" && tieneFiebre(contexto)) return "neutropenia_febril";
  if (estado === "priorizable") return "transfusion";
  return "hemograma_de_control";
}

export function evaluar(
  resultado: ResultadoTamizaje | null,
  contexto: ContextoClinico,
  ficha: FichaParaEvaluar | null = null,
  salud: SaludDelEnlace | null = null,
): Evaluacion {
  const decision = resultado ? triar(resultado, contexto) : null;
  let estado: EstadoPaciente = decision ? estadoDesdeNivel(decision.nivel) : "estable";
  const motivos: string[] = decision ? [...decision.fundamento] : ["Todavía no hay tamizajes registrados."];

  let escaladoSilencio = false;
  if (salud) {
    if (salud.enlace === "sin_contacto") {
      estado = elevarEstado(estado, "grave");
      escaladoSilencio = true;
      motivos.push(
        Number.isFinite(salud.horasDeSilencio)
          ? `El michi lleva ${Math.round(salud.horasDeSilencio)} h sin comunicarse: no sabemos cómo está este niño y llevamos días sin saberlo. Se maneja como pérdida de seguimiento.`
          : "El michi nunca se comunicó: se maneja como pérdida de seguimiento.",
      );
    }
    motivos.push(...salud.motivos);
  }

  if (ficha) {
    const perfil = PERFILES[ficha.etapa];
    motivos.push(
      `Etapa ${perfil.nombre.toLowerCase()}: riesgo de abandono ${perfil.riesgoAbandono}, control presencial cada ${perfil.diasEntreControles} días.`,
    );
  }

  const plantilla = CONDUCTAS[estado];
  let paraElEquipo = plantilla.paraElEquipo;
  if (escaladoSilencio && estado === "grave" && decision?.nivel !== "grave" && decision?.nivel !== "indeterminado") {
    paraElEquipo =
      "Contacto telefónico con el apoderado hoy y, si no responde, activación del circuito del Comité de Abandono. No es una teleconsulta: es una búsqueda.";
  }

  let referencia: PropuestaReferencia | null = null;
  if (ficha && estado !== "estable" && !ficha.domicilio.puedeViajarALima) {
    referencia = proponerReferencia(ficha.domicilio, motivoDeReferencia(estado, contexto));
    motivos.push(
      `La familia declaró que no puede viajar a Lima. Referencia propuesta a ${referencia.destino.nombre} (${referencia.destino.ciudad}), que evita ${Math.round(referencia.horasDeViajeEvitadas)} h de viaje.`,
    );
  }

  return {
    estado,
    titulo: plantilla.titulo,
    paraLaFamilia: plantilla.paraLaFamilia,
    paraElEquipo,
    plazo: plantilla.plazo,
    requiereTeleconsulta: plantilla.teleconsulta,
    habilitaEmergencia: plantilla.emergencia,
    motivos,
    escaladoPorFiebre: decision?.escaladoPorFiebre ?? false,
    escaladoPorSilencio: escaladoSilencio,
    referenciaSugerida: referencia,
    triaje: decision,
    sinTamizajes: resultado === null,
  };
}

export function ordenarCola<T>(casos: readonly T[], estadoDe: (c: T) => EstadoPaciente, urgenciaExtra?: (c: T) => number): T[] {
  return [...casos].sort((a, b) => {
    const diferencia = ORDEN_ESTADO[estadoDe(b)] - ORDEN_ESTADO[estadoDe(a)];
    if (diferencia !== 0) return diferencia;
    return (urgenciaExtra?.(b) ?? 0) - (urgenciaExtra?.(a) ?? 0);
  });
}
