export const VELOCIDAD_REFERENCIA_UM_S = 800;
export const DIAMETRO_REFERENCIA_UM = 15;
export const UMBRAL_EVENTOS_ADULTO = 7;
export const MIN_CAPILARES_PARA_DECIDIR = 5;
export const ANC_NEUTROPENIA_GRAVE = 500;
export const ANC_VIGILANCIA = 1000;
export const ANC_NORMAL = 1500;

const UM3_POR_UL = 1e9;

const FRACCION_NEUTROFILOS: ReadonlyArray<readonly [number, number]> = [
  [0.0, 0.61],
  [0.0027, 0.61],
  [0.019, 0.45],
  [0.038, 0.4],
  [0.083, 0.35],
  [0.5, 0.32],
  [1.0, 0.31],
  [2.0, 0.33],
  [4.0, 0.42],
  [6.0, 0.51],
  [8.0, 0.53],
  [10.0, 0.54],
  [16.0, 0.57],
  [21.0, 0.59],
];

const RANGO_REFERENCIA_ANC: ReadonlyArray<readonly [number, number, number]> = [
  [1.0, 1500, 8500],
  [4.0, 1500, 8500],
  [6.0, 1500, 8000],
  [10.0, 1800, 8000],
  [18.0, 1800, 7700],
];

export type BandaAnc = "normal" | "leve" | "moderada" | "grave" | "profunda";

function interpolar(x: number, xs: readonly number[], ys: readonly number[]): number {
  const n = xs.length;
  if (n === 0) return Number.NaN;
  if (x <= (xs[0] as number)) return ys[0] as number;
  if (x >= (xs[n - 1] as number)) return ys[n - 1] as number;
  for (let i = 1; i < n; i++) {
    const x1 = xs[i] as number;
    if (x <= x1) {
      const x0 = xs[i - 1] as number;
      const y0 = ys[i - 1] as number;
      const y1 = ys[i] as number;
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return ys[n - 1] as number;
}

export function caudalCapilar(velocidadUmS: number, diametroUm: number): number {
  const radio = diametroUm / 2;
  return velocidadUmS * Math.PI * radio * radio;
}

export function eventosPorMinuto(
  leucocitosPorUl: number,
  velocidadUmS = VELOCIDAD_REFERENCIA_UM_S,
  diametroUm = DIAMETRO_REFERENCIA_UM,
): number {
  return (leucocitosPorUl * caudalCapilar(velocidadUmS, diametroUm) * 60) / UM3_POR_UL;
}

export function leucocitosDesdeEventos(
  eventosMin: number,
  velocidadUmS = VELOCIDAD_REFERENCIA_UM_S,
  diametroUm = DIAMETRO_REFERENCIA_UM,
): number {
  const q = caudalCapilar(velocidadUmS, diametroUm);
  if (q <= 0) return Number.NaN;
  return (eventosMin * UM3_POR_UL) / (q * 60);
}

export function fraccionNeutrofilos(edadAnios: number): number {
  return interpolar(
    edadAnios,
    FRACCION_NEUTROFILOS.map(([a]) => a),
    FRACCION_NEUTROFILOS.map(([, f]) => f),
  );
}

function fraccionAcotada(edadAnios: number, fraccionPaciente?: number | null): number {
  const f = fraccionPaciente ?? fraccionNeutrofilos(edadAnios);
  return Math.min(0.95, Math.max(0.02, f));
}

export function ancDesdeLeucocitos(
  leucocitosPorUl: number,
  edadAnios: number,
  fraccionPaciente?: number | null,
): number {
  return leucocitosPorUl * fraccionAcotada(edadAnios, fraccionPaciente);
}

export function leucocitosDesdeAnc(anc: number, edadAnios: number, fraccionPaciente?: number | null): number {
  return anc / fraccionAcotada(edadAnios, fraccionPaciente);
}

export function rangoReferenciaAnc(edadAnios: number): [number, number] {
  const edades = RANGO_REFERENCIA_ANC.map(([a]) => a);
  return [
    interpolar(edadAnios, edades, RANGO_REFERENCIA_ANC.map(([, inf]) => inf)),
    interpolar(edadAnios, edades, RANGO_REFERENCIA_ANC.map(([, , sup]) => sup)),
  ];
}

export function bandaAnc(anc: number): BandaAnc {
  if (anc >= 1500) return "normal";
  if (anc >= 1000) return "leve";
  if (anc >= 500) return "moderada";
  if (anc >= 200) return "grave";
  return "profunda";
}

export function umbralEventosParaAnc(
  ancUmbral: number,
  edadAnios: number,
  velocidadUmS = VELOCIDAD_REFERENCIA_UM_S,
  diametroUm = DIAMETRO_REFERENCIA_UM,
  fraccionPaciente?: number | null,
): number {
  return eventosPorMinuto(ancUmbral / fraccionAcotada(edadAnios, fraccionPaciente), velocidadUmS, diametroUm);
}

export function ancQueDisparaElUmbralAdulto(edadAnios: number): number {
  return ancDesdeLeucocitos(leucocitosDesdeEventos(UMBRAL_EVENTOS_ADULTO), edadAnios);
}

export function volumenInterrogadoNl(velocidadUmS: number, diametroUm: number, segundos: number): number {
  return caudalCapilar(velocidadUmS, diametroUm) * segundos * 1e-6;
}

const INCERTIDUMBRE_COMPOSICION = 0.3;
const INCERTIDUMBRE_FRACCION = 0.35;
const INCERTIDUMBRE_FRACCION_ANCLADA = 0.12;
const Z95 = 1.959963985;

const LANCZOS = [
  676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

function lnGamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  const z = x - 1;
  let a = 0.99999999999980993;
  const t = z + 7.5;
  LANCZOS.forEach((c, i) => {
    a += c / (z + i + 1);
  });
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

function gammaInferiorRegularizada(a: number, x: number): number {
  if (x <= 0) return 0;
  if (x < a + 1) {
    let suma = 1 / a;
    let termino = suma;
    for (let n = 1; n < 1000; n++) {
      termino *= x / (a + n);
      suma += termino;
      if (Math.abs(termino) < Math.abs(suma) * 1e-15) break;
    }
    return suma * Math.exp(-x + a * Math.log(x) - lnGamma(a));
  }
  let b = x + 1 - a;
  let c = 1 / 1e-300;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c;
    if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-15) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h;
}

export function cuantilGamma(forma: number, p: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return Number.POSITIVE_INFINITY;
  let bajo = 0;
  let alto = Math.max(1, forma);
  while (gammaInferiorRegularizada(forma, alto) < p) alto *= 2;
  for (let i = 0; i < 200; i++) {
    const medio = (bajo + alto) / 2;
    if (gammaInferiorRegularizada(forma, medio) < p) bajo = medio;
    else alto = medio;
    if (alto - bajo < 1e-12 * Math.max(1, alto)) break;
  }
  return (bajo + alto) / 2;
}

export function icPoissonRelativo(eventos: number, confianza = 0.95): [number, number] {
  if (eventos <= 0) return [0, Number.POSITIVE_INFINITY];
  const alfa = 1 - confianza;
  const inferior = cuantilGamma(eventos, alfa / 2);
  const superior = cuantilGamma(eventos + 1, 1 - alfa / 2);
  return [inferior / eventos, superior / eventos];
}

export function sigmaDelMetodo(ancladoAHemograma = false): number {
  const fraccion = ancladoAHemograma ? INCERTIDUMBRE_FRACCION_ANCLADA : INCERTIDUMBRE_FRACCION;
  return Math.sqrt(INCERTIDUMBRE_COMPOSICION ** 2 + fraccion ** 2);
}

export function icCombinadoRelativo(eventos: number, ancladoAHemograma = false): [number, number] {
  const [loP, hiP] = icPoissonRelativo(eventos);
  if (!Number.isFinite(hiP)) return [loP, Number.POSITIVE_INFINITY];
  const sigmaMetodo = sigmaDelMetodo(ancladoAHemograma);
  const sigmaInf = Math.abs(Math.log(Math.max(loP, 1e-9))) / Z95;
  const sigmaSup = Math.abs(Math.log(Math.max(hiP, 1e-9))) / Z95;
  return [
    Math.exp(-Z95 * Math.sqrt(sigmaInf ** 2 + sigmaMetodo ** 2)),
    Math.exp(Z95 * Math.sqrt(sigmaSup ** 2 + sigmaMetodo ** 2)),
  ];
}
