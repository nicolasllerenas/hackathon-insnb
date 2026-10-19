import { normal, poisson, type Aleatorio } from "./aleatorio.js";
import {
  ancDesdeLeucocitos,
  caudalCapilar,
  eventosPorMinuto,
  icCombinadoRelativo,
  leucocitosDesdeAnc,
  MIN_CAPILARES_PARA_DECIDIR,
} from "./optica.js";
import type { ResultadoTamizaje } from "./triaje.js";

export interface ParametrosSimulacion {
  ancReal: number;
  edadAnios: number;
  rng: Aleatorio;
  capilaresIntentados?: number;
  segundosPorCapilar?: number;
  fraccionPaciente?: number | null;
  probabilidadDeFallo?: number;
}

export interface TamizajeSimulado extends ResultadoTamizaje {
  volumenNl: number;
  velocidadMediaUmS: number | null;
  diametroMedioUm: number | null;
  capilaresIntentados: number;
}

function acotar(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function simularTamizaje(p: ParametrosSimulacion): TamizajeSimulado {
  const intentados = p.capilaresIntentados ?? 6;
  const segundos = p.segundosPorCapilar ?? 60;
  const fallo = p.probabilidadDeFallo ?? 0.06;
  const leucocitos = leucocitosDesdeAnc(Math.max(0, p.ancReal), p.edadAnios, p.fraccionPaciente);
  const diametroBase = acotar(normal(p.rng, 14, 1.4), 10, 19);
  const velocidadBase = acotar(normal(p.rng, 800, 90), 450, 1200);

  let eventos = 0;
  let volumen = 0;
  let usados = 0;
  let sumaV = 0;
  let sumaD = 0;
  const razones: string[] = [];
  let movimiento = 0;

  for (let i = 0; i < intentados; i++) {
    if (p.rng() < fallo) {
      movimiento += 1;
      continue;
    }
    const d = acotar(normal(p.rng, diametroBase, 1.2), 8, 22);
    const v = acotar(normal(p.rng, velocidadBase, 100), 300, 1600);
    const esperado = eventosPorMinuto(leucocitos, v, d) * (segundos / 60);
    eventos += poisson(p.rng, esperado);
    volumen += caudalCapilar(v, d) * segundos * 1e-6;
    sumaV += v;
    sumaD += d;
    usados += 1;
  }

  if (movimiento) razones.push(`movimiento_no_corregido (${movimiento} capilares descartados)`);
  const concluyente = usados >= MIN_CAPILARES_PARA_DECIDIR && volumen > 0;
  if (usados < MIN_CAPILARES_PARA_DECIDIR) razones.push(`capilares_insuficientes (${usados}/${MIN_CAPILARES_PARA_DECIDIR})`);

  let ancEstimado: number | null = null;
  let icInferior: number | null = null;
  let icSuperior: number | null = null;
  if (volumen > 0) {
    const leucocitosEstimados = eventos / (volumen * 1e-3);
    ancEstimado = ancDesdeLeucocitos(leucocitosEstimados, p.edadAnios, p.fraccionPaciente);
    const [lo, hi] = icCombinadoRelativo(eventos, p.fraccionPaciente !== null && p.fraccionPaciente !== undefined);
    if (eventos > 0) {
      icInferior = ancEstimado * lo;
      icSuperior = Number.isFinite(hi) ? ancEstimado * hi : null;
    } else {
      icInferior = 0;
      icSuperior = null;
    }
  }

  return {
    concluyente,
    ancEstimado: ancEstimado === null ? null : Math.round(ancEstimado),
    icInferior: icInferior === null ? null : Math.round(icInferior),
    icSuperior: icSuperior === null ? null : Math.round(icSuperior),
    capilares: usados,
    capilaresIntentados: intentados,
    eventos,
    volumenNl: Math.round(volumen * 10000) / 10000,
    velocidadMediaUmS: usados ? Math.round(sumaV / usados) : null,
    diametroMedioUm: usados ? Math.round((sumaD / usados) * 10) / 10 : null,
    razones,
  };
}
