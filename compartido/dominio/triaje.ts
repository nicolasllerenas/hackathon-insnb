import { ANC_NEUTROPENIA_GRAVE, ANC_VIGILANCIA } from "./optica.js";

export const FIEBRE_TOMA_UNICA_C = 38.3;
export const FIEBRE_SOSTENIDA_C = 38.0;

export type NivelTriaje = "estable" | "indeterminado" | "grave" | "priorizable";

const SEVERIDAD: Record<NivelTriaje, number> = {
  estable: 0,
  indeterminado: 1,
  grave: 2,
  priorizable: 3,
};

export interface ResultadoTamizaje {
  concluyente: boolean;
  ancEstimado: number | null;
  icInferior: number | null;
  icSuperior: number | null;
  capilares: number;
  eventos: number;
  razones: readonly string[];
}

export interface ContextoClinico {
  edadAnios: number;
  temperaturaC?: number | null;
  fiebreSostenida1h?: boolean;
  diasPostQuimio?: number | null;
  ancUltimoHemograma?: number | null;
  diasDesdeHemograma?: number | null;
  horasACentroReferencia?: number | null;
  cateterCentral?: boolean;
}

export interface DecisionTriaje {
  nivel: NivelTriaje;
  titulo: string;
  accion: string;
  plazo: string;
  fundamento: string[];
  ancUsado: number | null;
  ancLimiteInferior: number | null;
  escaladoPorFiebre: boolean;
  proximoTamizajeDias: number | null;
}

export function tieneFiebre(contexto: ContextoClinico): boolean {
  const t = contexto.temperaturaC;
  if (t === null || t === undefined) return false;
  if (t >= FIEBRE_TOMA_UNICA_C) return true;
  return Boolean(contexto.fiebreSostenida1h) && t >= FIEBRE_SOSTENIDA_C;
}

export function elevar(actual: NivelTriaje, piso: NivelTriaje): NivelTriaje {
  return SEVERIDAD[actual] >= SEVERIDAD[piso] ? actual : piso;
}

function redondeo(n: number): string {
  return Math.round(n).toLocaleString("es-PE");
}

export function triar(resultado: ResultadoTamizaje, contexto: ContextoClinico): DecisionTriaje {
  const fundamento: string[] = [];
  const anc = resultado.ancEstimado;
  const ancValido = anc !== null && Number.isFinite(anc);
  const concluyente = resultado.concluyente && ancValido;
  let limite = resultado.icInferior;
  if (limite === null || !Number.isFinite(limite)) limite = anc;

  let nivel: NivelTriaje;
  if (concluyente && anc !== null && limite !== null) {
    const superior =
      resultado.icSuperior !== null && Number.isFinite(resultado.icSuperior)
        ? redondeo(resultado.icSuperior)
        : "∞";
    fundamento.push(
      `ANC estimado ${redondeo(anc)}/µL (IC95 ${redondeo(limite)}–${superior}) sobre ${resultado.capilares} capilares y ${resultado.eventos} eventos.`,
    );
    if (limite < ANC_NEUTROPENIA_GRAVE) {
      nivel = "grave";
      fundamento.push(
        `El límite inferior del intervalo (${redondeo(limite)}/µL) está por debajo de 500/µL: no se puede descartar neutropenia grave.`,
      );
    } else if (limite < ANC_VIGILANCIA) {
      nivel = "estable";
      fundamento.push("Recuento en zona de vigilancia (500–1000/µL).");
    } else if (anc < 1500) {
      nivel = "estable";
      fundamento.push("Neutropenia leve (1000–1500/µL).");
    } else {
      nivel = "estable";
    }
  } else {
    nivel = "indeterminado";
    const razones = resultado.razones.length ? resultado.razones.join(", ") : "datos insuficientes";
    fundamento.push(`Tamizaje NO concluyente: ${razones}.`);
  }

  let escalado = false;
  const temperatura = contexto.temperaturaC ?? null;
  if (tieneFiebre(contexto) && temperatura !== null) {
    const limiteBajo = limite !== null && limite < ANC_VIGILANCIA;
    if (nivel === "grave" || nivel === "indeterminado" || limiteBajo) {
      nivel = "priorizable";
      fundamento.push(
        `FIEBRE (${temperatura.toFixed(1)} °C) con neutropenia o tamizaje no concluyente: se maneja como neutropenia febril.`,
      );
    } else {
      nivel = elevar(nivel, "grave");
      fundamento.push(
        `Fiebre (${temperatura.toFixed(1)} °C) sin neutropenia detectada: requiere evaluación aunque el recuento sea normal.`,
      );
    }
    escalado = true;
  }

  if (contexto.cateterCentral && nivel !== "estable") {
    fundamento.push("Porta catéter venoso central: mayor riesgo de bacteriemia, umbral de derivación más bajo.");
    nivel = elevar(nivel, "grave");
  }

  const previo = contexto.ancUltimoHemograma;
  if (previo !== null && previo !== undefined && concluyente && anc !== null) {
    const caida = previo - anc;
    const dias = contexto.diasDesdeHemograma ?? 99;
    if (caida > 800 && dias <= 7) {
      fundamento.push(
        `Caída de ${redondeo(caida)}/µL respecto del hemograma de hace ${dias} días: trayectoria descendente.`,
      );
      nivel = elevar(nivel, "grave");
    }
  }

  const dpq = contexto.diasPostQuimio;
  if (dpq !== null && dpq !== undefined && dpq >= 7 && dpq <= 14) {
    fundamento.push(
      `Día ${dpq} post-quimioterapia: ventana de nadir esperado, el recuento aún puede seguir bajando.`,
    );
  }

  const conducta = conductaPara(nivel, contexto.horasACentroReferencia ?? null);
  return {
    nivel,
    ...conducta,
    fundamento,
    ancUsado: ancValido ? anc : null,
    ancLimiteInferior: limite,
    escaladoPorFiebre: escalado,
  };
}

function conductaPara(
  nivel: NivelTriaje,
  horasACentro: number | null,
): Pick<DecisionTriaje, "titulo" | "accion" | "plazo" | "proximoTamizajeDias"> {
  if (nivel === "priorizable") {
    const extra =
      horasACentro !== null && horasACentro > 4
        ? ` Como el centro de referencia está a ${Math.round(horasACentro)} h, iniciar el antibiótico ANTES del traslado, no al llegar.`
        : "";
    return {
      titulo: "Sospecha de neutropenia febril",
      accion: `Emergencia oncológica. Iniciar antibiótico de amplio espectro dentro de la primera hora, tomar hemocultivos sin demorar el antibiótico y activar la referencia.${extra}`,
      plazo: "Inmediato (< 1 hora)",
      proximoTamizajeDias: null,
    };
  }
  if (nivel === "grave") {
    return {
      titulo: "Posible neutropenia grave",
      accion:
        "Teleconsulta hoy con Hematología del INSN San Borja. Precauciones: evitar aglomeraciones, control de temperatura cada 8 h y acudir de inmediato ante cualquier fiebre. Confirmar con hemograma.",
      plazo: "Mismo día (< 6 horas)",
      proximoTamizajeDias: 2,
    };
  }
  if (nivel === "indeterminado") {
    return {
      titulo: "Tamizaje no concluyente",
      accion:
        "Repetir la captura siguiendo la guía de calidad. Si vuelve a salir no concluyente, hemograma convencional: el tamizaje no puede descartar nada por sí mismo.",
      plazo: "Repetir ahora; si persiste, hemograma en 24 h",
      proximoTamizajeDias: 0,
    };
  }
  return {
    titulo: "Sin hallazgos de alarma",
    accion: "Continuar con el calendario de controles previsto y mantener la vigilancia de signos de alarma en casa.",
    plazo: "Según calendario",
    proximoTamizajeDias: 7,
  };
}
