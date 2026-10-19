import { describe, expect, it } from "vitest";
import { sembrado } from "./aleatorio.js";
import {
  ancDesdeLeucocitos,
  ancQueDisparaElUmbralAdulto,
  bandaAnc,
  cuantilGamma,
  eventosPorMinuto,
  fraccionNeutrofilos,
  icCombinadoRelativo,
  icPoissonRelativo,
  leucocitosDesdeEventos,
  rangoReferenciaAnc,
  umbralEventosParaAnc,
} from "./optica.js";
import { simularTamizaje } from "./simulacion.js";

describe("modelo físico", () => {
  it("reproduce los dos puntos publicados por Bourquard 2018", () => {
    expect(leucocitosDesdeEventos(32)).toBeCloseTo(3772.56, 1);
    expect(leucocitosDesdeEventos(2)).toBeCloseTo(235.79, 1);
    expect(eventosPorMinuto(1000)).toBeCloseTo(8.4823, 3);
  });

  it("el umbral del adulto deja ciegos a los niños pequeños entre 272 y 500", () => {
    expect(ancQueDisparaElUmbralAdulto(2)).toBeCloseTo(272.33, 1);
    expect(ancQueDisparaElUmbralAdulto(21)).toBeCloseTo(486.9, 1);
    expect(umbralEventosParaAnc(500, 2)).toBeCloseTo(12.852, 2);
    expect(umbralEventosParaAnc(500, 7)).toBeCloseTo(8.156, 2);
  });

  it("interpola la fracción de neutrófilos y el rango de referencia por edad", () => {
    expect(fraccionNeutrofilos(3)).toBeCloseTo(0.375, 6);
    expect(fraccionNeutrofilos(7.2)).toBeCloseTo(0.522, 6);
    expect(fraccionNeutrofilos(40)).toBeCloseTo(0.59, 6);
    expect(rangoReferenciaAnc(7.2)[0]).toBeCloseTo(1590, 6);
    expect(rangoReferenciaAnc(12)).toEqual([1800, 7925]);
    expect(ancDesdeLeucocitos(1000, 5, 0.6)).toBeCloseTo(600, 6);
  });

  it("clasifica las bandas del NCI", () => {
    expect(bandaAnc(1600)).toBe("normal");
    expect(bandaAnc(1200)).toBe("leve");
    expect(bandaAnc(700)).toBe("moderada");
    expect(bandaAnc(300)).toBe("grave");
    expect(bandaAnc(100)).toBe("profunda");
  });
});

describe("intervalos de confianza", () => {
  it("el cuantil gamma coincide con scipy", () => {
    expect(cuantilGamma(60, 0.025) / 60).toBeCloseTo(0.76311, 4);
    expect(cuantilGamma(61, 0.975) / 60).toBeCloseTo(1.2872, 4);
  });

  it.each([
    [1, 0.025318, 5.571643, 0.022694, 6.964436],
    [5, 0.324697, 2.333666, 0.236269, 3.451247],
    [20, 0.610826, 1.544419, 0.357284, 2.725388],
    [60, 0.763105, 1.287198, 0.389426, 2.555147],
    [200, 0.866204, 1.14861, 0.400579, 2.494431],
  ])("con %i eventos reproduce Poisson y el intervalo honesto del método", (n, pl, ph, cl, ch) => {
    const [loP, hiP] = icPoissonRelativo(n);
    const [loC, hiC] = icCombinadoRelativo(n);
    expect(loP).toBeCloseTo(pl, 4);
    expect(hiP).toBeCloseTo(ph, 4);
    expect(loC).toBeCloseTo(cl, 4);
    expect(hiC).toBeCloseTo(ch, 4);
  });

  it("anclar al hemograma del paciente estrecha el intervalo", () => {
    const [lo, hi] = icCombinadoRelativo(60, true);
    expect(lo).toBeCloseTo(0.502289, 4);
    expect(hi).toBeCloseTo(1.977343, 4);
  });

  it("sin eventos el intervalo superior es infinito", () => {
    expect(icPoissonRelativo(0)).toEqual([0, Number.POSITIVE_INFINITY]);
  });
});

describe("simulación del tamizaje", () => {
  it("es determinista con la misma semilla", () => {
    const a = simularTamizaje({ ancReal: 900, edadAnios: 7, rng: sembrado(42) });
    const b = simularTamizaje({ ancReal: 900, edadAnios: 7, rng: sembrado(42) });
    expect(a).toEqual(b);
  });

  it("estima sin sesgo en promedio y el intervalo contiene al valor real casi siempre", () => {
    const rng = sembrado(7);
    let cubiertos = 0;
    let suma = 0;
    const n = 300;
    for (let i = 0; i < n; i++) {
      const r = simularTamizaje({ ancReal: 1200, edadAnios: 8, rng, probabilidadDeFallo: 0 });
      suma += r.ancEstimado ?? 0;
      if ((r.icInferior ?? 0) <= 1200 && 1200 <= (r.icSuperior ?? Infinity)) cubiertos += 1;
    }
    expect(suma / n).toBeGreaterThan(1100);
    expect(suma / n).toBeLessThan(1300);
    expect(cubiertos / n).toBeGreaterThan(0.95);
  });

  it("se niega a concluir con menos de cinco capilares", () => {
    const r = simularTamizaje({ ancReal: 1000, edadAnios: 6, rng: sembrado(1), capilaresIntentados: 3, probabilidadDeFallo: 0 });
    expect(r.concluyente).toBe(false);
    expect(r.razones.join(" ")).toContain("capilares_insuficientes");
  });
});
