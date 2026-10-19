import { describe, expect, it } from "vitest";
import {
  alimentar,
  aprenderLeccion,
  cargarJuego,
  comprarOPonerPrenda,
  estadoInicial,
  jugar,
  logrosPendientes,
  otorgarLogros,
  postergar,
  registrarTamizajeEnJuego,
} from "./juego";

describe("estado del juego del michi", () => {
  it("recupera un estado corrupto sin romperse", () => {
    expect(cargarJuego("{no es json").monedas).toBe(30);
    const raro = cargarJuego(JSON.stringify({ monedas: -50, energia: 999, prenda: "inexistente", prendas: ["lazo", "x"], vinculo: { codigo: 3 } }));
    expect(raro.monedas).toBe(0);
    expect(raro.energia).toBe(100);
    expect(raro.prenda).toBeNull();
    expect(raro.prendas).toEqual(["lazo"]);
    expect(raro.vinculo).toBeNull();
  });

  it("no deja comer sin pescaditos ni jugar sin energía", () => {
    expect(alimentar({ ...estadoInicial(), monedas: 2 }).ok).toBe(false);
    expect(jugar({ ...estadoInicial(), energia: 5 }).ok).toBe(false);
    expect(alimentar(estadoInicial()).estado.monedas).toBe(25);
  });

  it("la racha sube con días seguidos y se reinicia si se salta uno", () => {
    const dia1 = registrarTamizajeEnJuego(estadoInicial(), true, new Date(2026, 9, 1, 20));
    const dia2 = registrarTamizajeEnJuego(dia1, true, new Date(2026, 9, 2, 20));
    const mismoDia = registrarTamizajeEnJuego(dia2, true, new Date(2026, 9, 2, 21));
    const salto = registrarTamizajeEnJuego(mismoDia, true, new Date(2026, 9, 5, 20));
    expect([dia1.racha, dia2.racha, mismoDia.racha, salto.racha]).toEqual([1, 2, 2, 1]);
    expect(salto.postergaciones).toBe(0);
  });

  it("cuenta las postergaciones y las limpia al hacer el tamizaje", () => {
    const tres = postergar(postergar(postergar(estadoInicial())));
    expect(tres.postergaciones).toBe(3);
    expect(registrarTamizajeEnJuego(tres, false).postergaciones).toBe(0);
  });

  it("compra, pone y quita ropita", () => {
    const rico = { ...estadoInicial(), monedas: 100 };
    const comprado = comprarOPonerPrenda(rico, "lazo");
    expect(comprado.ok).toBe(true);
    expect(comprado.estado.monedas).toBe(60);
    expect(comprado.estado.prenda).toBe("lazo");
    expect(comprarOPonerPrenda(comprado.estado, "lazo").estado.prenda).toBeNull();
    expect(comprarOPonerPrenda(estadoInicial(), "medico").ok).toBe(false);
  });

  it("premia una lección una sola vez y otorga logros", () => {
    const r = aprenderLeccion(estadoInicial(), "mp6");
    expect(r.nuevo).toBe(true);
    expect(aprenderLeccion(r.estado, "mp6").nuevo).toBe(false);
    const conTamizaje = registrarTamizajeEnJuego(r.estado, true);
    const pendientes = logrosPendientes(conTamizaje, 1);
    expect(pendientes).toContain("primer");
    expect(otorgarLogros(conTamizaje, pendientes).logros.primer).toBe(true);
  });
});
