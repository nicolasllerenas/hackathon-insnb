import { describe, expect, it } from "vitest";
import { aEntradaLatido, interpretarLinea, SeparadorDeLineas } from "./protocolo";

describe("protocolo serial del michi", () => {
  it("interpreta el latido exacto que imprime el firmware", () => {
    const linea =
      '{"latido":1,"bateria_pct":78,"capturas_en_cola":0,"alertas_emitidas":12,"alertas_atendidas":11,"silenciamientos":0,"escalado":false,"firmware":"0.3.0"}';
    const l = interpretarLinea(linea);
    expect(l).toEqual({
      bateriaPct: 78,
      capturasEnCola: 0,
      alertasEmitidas: 12,
      alertasAtendidas: 11,
      silenciamientos: 0,
      escalado: false,
      firmware: "0.3.0",
      serie: null,
    });
    const entrada = aEntradaLatido(l!);
    expect(entrada.origen).toBe("robot");
    expect(entrada.tamizajesEnCola).toBe(0);
  });

  it("ignora ruido del arranque del ESP32 y JSON que no es latido", () => {
    expect(interpretarLinea("ets Jun  8 2016 00:22:57")).toBeNull();
    expect(interpretarLinea('{"otra":1}')).toBeNull();
    expect(interpretarLinea("{roto")).toBeNull();
  });

  it("acota valores imposibles", () => {
    const l = interpretarLinea('{"latido":1,"bateria_pct":140,"alertas_emitidas":-3,"serie":"MC-3F7A21C0"}');
    expect(l?.bateriaPct).toBe(100);
    expect(l?.alertasEmitidas).toBe(0);
    expect(l?.serie).toBe("MC-3F7A21C0");
  });

  it("reconstruye líneas partidas entre lecturas", () => {
    const s = new SeparadorDeLineas();
    expect(s.agregar('{"latido":1,')).toEqual([]);
    expect(s.agregar('"bateria_pct":50}\r\n{"lat')).toEqual(['{"latido":1,"bateria_pct":50}']);
    expect(s.agregar('ido":1}\n')).toEqual(['{"latido":1}']);
  });
});
