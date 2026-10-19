import type { EntradaTamizaje, Hemograma, Paciente, Tamizaje } from "../contratos/clinica.js";
import { estadoDesdeNivel } from "../dominio/estados.js";
import { edadEnAnios } from "../dominio/fechas.js";
import { triar, type ContextoClinico } from "../dominio/triaje.js";

export function contextoDelPaciente(paciente: Paciente, entrada: EntradaTamizaje, hemogramaPrevio: Hemograma | null): ContextoClinico {
  const momento = new Date(entrada.momento);
  return {
    edadAnios: edadEnAnios(paciente.fechaNacimiento, momento),
    temperaturaC: entrada.temperaturaC,
    fiebreSostenida1h: entrada.fiebreSostenida,
    diasPostQuimio: entrada.diasPostQuimio,
    ancUltimoHemograma: hemogramaPrevio?.anc ?? null,
    diasDesdeHemograma: hemogramaPrevio ? Math.floor((momento.getTime() - Date.parse(hemogramaPrevio.fecha)) / 86_400_000) : null,
    horasACentroReferencia: paciente.domicilio.horasAlInsn,
    cateterCentral: paciente.cateterCentral,
  };
}

export function completarTamizaje(entrada: EntradaTamizaje, paciente: Paciente, hemogramaPrevio: Hemograma | null): Tamizaje {
  const decision = triar(entrada, contextoDelPaciente(paciente, entrada, hemogramaPrevio));
  return {
    ...entrada,
    nivelTriaje: decision.nivel,
    estado: estadoDesdeNivel(decision.nivel),
    escaladoPorFiebre: decision.escaladoPorFiebre,
    titulo: decision.titulo,
    accion: decision.accion,
    plazo: decision.plazo,
    fundamento: decision.fundamento,
  };
}

export function hemogramaPrevio(hemogramas: readonly Hemograma[], pacienteId: string, antesDe: string): Hemograma | null {
  return (
    [...hemogramas]
      .filter((h) => h.pacienteId === pacienteId && h.fecha <= antesDe)
      .sort((a, b) => b.fecha.localeCompare(a.fecha))[0] ?? null
  );
}
