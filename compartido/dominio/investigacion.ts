import { ANC_NEUTROPENIA_GRAVE } from "./optica.js";

export interface TamizajeMedido {
  id: string;
  pacienteId: string;
  momento: string;
  concluyente: boolean;
  ancEstimado: number | null;
  icInferior: number | null;
  icSuperior: number | null;
}

export interface HemogramaMedido {
  id: string;
  pacienteId: string;
  fecha: string;
  anc: number;
}

export interface Par {
  tamizaje: TamizajeMedido;
  hemograma: HemogramaMedido;
  horasDeDiferencia: number;
}

export interface Proporcion {
  valor: number | null;
  inferior: number | null;
  superior: number | null;
  numerador: number;
  denominador: number;
}

export interface MetricasDiagnosticas {
  umbral: number;
  pares: number;
  excluidosNoConcluyentes: number;
  vp: number;
  fp: number;
  vn: number;
  fn: number;
  sensibilidad: Proporcion;
  especificidad: Proporcion;
  vpp: Proporcion;
  vpn: Proporcion;
  exactitud: Proporcion;
  f1: number | null;
  auc: number | null;
  sesgoRelativo: number | null;
  limitesDeAcuerdo: [number, number] | null;
  coberturaDelIntervalo: Proporcion;
}

const Z95 = 1.959963985;

export function wilson(numerador: number, denominador: number, z = Z95): Proporcion {
  if (denominador <= 0) return { valor: null, inferior: null, superior: null, numerador, denominador };
  const p = numerador / denominador;
  const z2 = z * z;
  const centro = (p + z2 / (2 * denominador)) / (1 + z2 / denominador);
  const margen = (z * Math.sqrt((p * (1 - p)) / denominador + z2 / (4 * denominador * denominador))) / (1 + z2 / denominador);
  return {
    valor: p,
    inferior: Math.max(0, centro - margen),
    superior: Math.min(1, centro + margen),
    numerador,
    denominador,
  };
}

export function emparejar(
  tamizajes: readonly TamizajeMedido[],
  hemogramas: readonly HemogramaMedido[],
  ventanaHoras = 24,
): Par[] {
  const usados = new Set<string>();
  const pares: Par[] = [];
  const ordenados = [...hemogramas].sort((a, b) => a.fecha.localeCompare(b.fecha));
  for (const h of ordenados) {
    const th = Date.parse(h.fecha);
    if (Number.isNaN(th)) continue;
    let mejor: TamizajeMedido | null = null;
    let mejorDif = Number.POSITIVE_INFINITY;
    for (const t of tamizajes) {
      if (t.pacienteId !== h.pacienteId || usados.has(t.id)) continue;
      const tt = Date.parse(t.momento);
      if (Number.isNaN(tt)) continue;
      const dif = Math.abs(tt - th) / 3_600_000;
      if (dif <= ventanaHoras && dif < mejorDif) {
        mejor = t;
        mejorDif = dif;
      }
    }
    if (mejor) {
      usados.add(mejor.id);
      pares.push({ tamizaje: mejor, hemograma: h, horasDeDiferencia: Math.round(mejorDif * 10) / 10 });
    }
  }
  return pares;
}

export function areaBajoCurva(positivos: readonly number[], negativos: readonly number[]): number | null {
  if (!positivos.length || !negativos.length) return null;
  let suma = 0;
  for (const p of positivos) {
    for (const n of negativos) {
      if (p < n) suma += 1;
      else if (p === n) suma += 0.5;
    }
  }
  return suma / (positivos.length * negativos.length);
}

export function metricasDiagnosticas(pares: readonly Par[], umbral = ANC_NEUTROPENIA_GRAVE): MetricasDiagnosticas {
  let vp = 0;
  let fp = 0;
  let vn = 0;
  let fn = 0;
  let excluidos = 0;
  let cubiertos = 0;
  let conIntervalo = 0;
  const puntajePos: number[] = [];
  const puntajeNeg: number[] = [];
  const logRatios: number[] = [];

  for (const { tamizaje: t, hemograma: h } of pares) {
    if (!t.concluyente || t.ancEstimado === null) {
      excluidos += 1;
      continue;
    }
    const limite = t.icInferior ?? t.ancEstimado;
    const pruebaPositiva = limite < umbral;
    const referenciaPositiva = h.anc < umbral;
    if (pruebaPositiva && referenciaPositiva) vp += 1;
    else if (pruebaPositiva) fp += 1;
    else if (referenciaPositiva) fn += 1;
    else vn += 1;
    (referenciaPositiva ? puntajePos : puntajeNeg).push(t.ancEstimado);
    if (t.ancEstimado > 0 && h.anc > 0) logRatios.push(Math.log(t.ancEstimado / h.anc));
    if (t.icInferior !== null) {
      conIntervalo += 1;
      const sup = t.icSuperior ?? Number.POSITIVE_INFINITY;
      if (h.anc >= t.icInferior && h.anc <= sup) cubiertos += 1;
    }
  }

  const sensibilidad = wilson(vp, vp + fn);
  const vpp = wilson(vp, vp + fp);
  const f1 =
    sensibilidad.valor !== null && vpp.valor !== null && sensibilidad.valor + vpp.valor > 0
      ? (2 * sensibilidad.valor * vpp.valor) / (sensibilidad.valor + vpp.valor)
      : null;

  let sesgo: number | null = null;
  let limites: [number, number] | null = null;
  if (logRatios.length >= 2) {
    const media = logRatios.reduce((a, b) => a + b, 0) / logRatios.length;
    const varianza = logRatios.reduce((a, b) => a + (b - media) ** 2, 0) / (logRatios.length - 1);
    const de = Math.sqrt(varianza);
    sesgo = Math.exp(media);
    limites = [Math.exp(media - Z95 * de), Math.exp(media + Z95 * de)];
  } else if (logRatios.length === 1) {
    sesgo = Math.exp(logRatios[0] as number);
  }

  return {
    umbral,
    pares: pares.length,
    excluidosNoConcluyentes: excluidos,
    vp,
    fp,
    vn,
    fn,
    sensibilidad,
    especificidad: wilson(vn, vn + fp),
    vpp,
    vpn: wilson(vn, vn + fn),
    exactitud: wilson(vp + vn, vp + vn + fp + fn),
    f1,
    auc: areaBajoCurva(puntajePos, puntajeNeg),
    sesgoRelativo: sesgo,
    limitesDeAcuerdo: limites,
    coberturaDelIntervalo: wilson(cubiertos, conIntervalo),
  };
}

export interface ParametrosMuestra {
  sensibilidadEsperada: number;
  especificidadEsperada: number;
  precision: number;
  prevalencia: number;
  perdidas?: number;
}

export interface TamanoDeMuestra {
  positivosNecesarios: number;
  negativosNecesarios: number;
  totalPorSensibilidad: number;
  totalPorEspecificidad: number;
  total: number;
  totalConPerdidas: number;
}

export function tamanoDeMuestra(p: ParametrosMuestra): TamanoDeMuestra {
  const validos =
    p.sensibilidadEsperada > 0 &&
    p.sensibilidadEsperada < 1 &&
    p.especificidadEsperada > 0 &&
    p.especificidadEsperada < 1 &&
    p.precision > 0 &&
    p.precision < 1 &&
    p.prevalencia > 0 &&
    p.prevalencia < 1;
  if (!validos) throw new RangeError("Los parámetros deben estar entre 0 y 1 (sin incluir los extremos)");
  const z2 = Z95 * Z95;
  const positivos = Math.ceil((z2 * p.sensibilidadEsperada * (1 - p.sensibilidadEsperada)) / p.precision ** 2);
  const negativos = Math.ceil((z2 * p.especificidadEsperada * (1 - p.especificidadEsperada)) / p.precision ** 2);
  const porSens = Math.ceil(positivos / p.prevalencia);
  const porEsp = Math.ceil(negativos / (1 - p.prevalencia));
  const total = Math.max(porSens, porEsp);
  const perdidas = Math.min(0.9, Math.max(0, p.perdidas ?? 0));
  return {
    positivosNecesarios: positivos,
    negativosNecesarios: negativos,
    totalPorSensibilidad: porSens,
    totalPorEspecificidad: porEsp,
    total,
    totalConPerdidas: Math.ceil(total / (1 - perdidas)),
  };
}

export function aCsv(filas: readonly Record<string, string | number | boolean | null>[]): string {
  if (!filas.length) return "";
  const columnas = Object.keys(filas[0] as object);
  const celda = (v: string | number | boolean | null | undefined): string => {
    if (v === null || v === undefined) return "";
    const texto = String(v);
    const peligroso = /^[=+\-@\t\r]/.test(texto) && typeof v === "string";
    const seguro = peligroso ? `'${texto}` : texto;
    return /[",\n\r;]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
  };
  return [columnas.join(","), ...filas.map((f) => columnas.map((c) => celda(f[c])).join(","))].join("\n");
}

export const NIVELES_TRL = [
  { nivel: 1, nombre: "Principios básicos observados" },
  { nivel: 2, nombre: "Concepto tecnológico formulado" },
  { nivel: 3, nombre: "Prueba de concepto experimental" },
  { nivel: 4, nombre: "Validación en laboratorio" },
  { nivel: 5, nombre: "Validación en entorno relevante" },
  { nivel: 6, nombre: "Demostración en entorno relevante" },
  { nivel: 7, nombre: "Demostración en entorno operativo" },
  { nivel: 8, nombre: "Sistema completo y calificado" },
  { nivel: 9, nombre: "Sistema probado en operación real" },
] as const;
