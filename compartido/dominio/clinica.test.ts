import { describe, expect, it } from "vitest";
import { dentroDeVentana, escalarAlerta, MAX_POSTERGACIONES, planificarAlertas, respaldoConvencional, ventanaAudible, type FichaAlertas } from "./alertas.js";
import { evaluarEnlace } from "./enlace.js";
import { evaluar, ordenarCola, type FichaParaEvaluar } from "./estados.js";
import { combinar, diasEntre, edadEnAnios, horaLocal, sumarDias } from "./fechas.js";
import { candidatos, cobertura, proponerReferencia, RED, type Domicilio } from "./referencias.js";
import { etapaDesdeTexto, PERFILES, planificarEtapa } from "./tratamiento.js";
import { triar, type ResultadoTamizaje } from "./triaje.js";

function resultado(anc: number, lo: number, hi: number, concluyente = true, razones: string[] = []): ResultadoTamizaje {
  return { concluyente, ancEstimado: anc, icInferior: lo, icSuperior: hi, capilares: 5, eventos: 20, razones };
}

const domicilio = (cambios: Partial<Domicilio> = {}): Domicilio => ({
  departamento: "Amazonas",
  provincia: "Bagua",
  horasAlInsn: 9,
  puedeViajarALima: true,
  motivoImpedimento: "",
  ...cambios,
});

const ficha = (cambios: Partial<FichaParaEvaluar> = {}): FichaParaEvaluar => ({
  historiaClinica: "2026-04871",
  etapa: "mantenimiento",
  domicilio: domicilio(),
  ...cambios,
});

describe("fechas", () => {
  it("opera sobre fechas sin depender de la zona horaria", () => {
    expect(sumarDias("2026-02-27", 3)).toBe("2026-03-02");
    expect(diasEntre("2026-01-01", "2026-12-31")).toBe(364);
    expect(edadEnAnios("2019-03-14", new Date(2026, 2, 14))).toBeCloseTo(7, 1);
    expect(() => sumarDias("2026-02-30", 1)).toThrow();
  });
});

describe("etapas del tratamiento", () => {
  it("el mantenimiento es la etapa de mayor riesgo y la más domiciliaria", () => {
    expect(PERFILES.mantenimiento.riesgoAbandono).toBe("alto");
    expect(PERFILES.induccion.riesgoAbandono).toBe("bajo");
    expect(PERFILES.mantenimiento.diasEntreControles).toBeGreaterThan(PERFILES.induccion.diasEntreControles);
    expect(PERFILES.mantenimiento.ambito).toBe("domiciliario");
  });

  it("el plan no programa dos años de golpe", () => {
    const plan = planificarEtapa("mantenimiento", "2026-01-01", 90);
    expect(plan.tamizajes.length).toBeGreaterThan(0);
    expect(plan.tamizajes.every((d) => d <= "2026-04-01")).toBe(true);
  });

  it("acepta lo que escriba el médico", () => {
    expect(etapaDesdeTexto("Inducción")).toBe("induccion");
    expect(etapaDesdeTexto("REINDUCCION")).toBe("intensificacion");
    expect(() => etapaDesdeTexto("fase lunar")).toThrow();
  });
});

describe("triaje", () => {
  it("decide sobre el límite inferior del intervalo, no sobre la estimación", () => {
    expect(triar(resultado(700, 320, 1500), { edadAnios: 6 }).nivel).toBe("grave");
    expect(triar(resultado(1800, 1400, 2300), { edadAnios: 6 }).nivel).toBe("estable");
  });

  it("la fiebre escala y nunca rebaja", () => {
    const dudoso = resultado(900, 400, 2000, false, ["capilares_insuficientes (2/5)"]);
    expect(triar(dudoso, { edadAnios: 6 }).nivel).toBe("indeterminado");
    expect(triar(dudoso, { edadAnios: 6, temperaturaC: 38.5 }).nivel).toBe("priorizable");
    expect(triar(resultado(1800, 1400, 2300), { edadAnios: 6, temperaturaC: 38.6 }).nivel).toBe("grave");
  });

  it("38 °C solo cuenta como fiebre si es sostenida una hora", () => {
    expect(triar(resultado(420, 280, 640), { edadAnios: 6, temperaturaC: 38.0 }).nivel).toBe("grave");
    expect(triar(resultado(420, 280, 640), { edadAnios: 6, temperaturaC: 38.0, fiebreSostenida1h: true }).nivel).toBe("priorizable");
  });

  it("el catéter central y la caída brusca elevan, nunca bajan", () => {
    const caida = triar(resultado(1200, 1000, 2000), { edadAnios: 6, ancUltimoHemograma: 2400, diasDesdeHemograma: 5 });
    expect(caida.nivel).toBe("grave");
    const lejos = triar(resultado(300, 150, 600), { edadAnios: 6, temperaturaC: 39, horasACentroReferencia: 9 });
    expect(lejos.accion).toContain("ANTES del traslado");
  });
});

describe("tres estados", () => {
  it("estable no moviliza a nadie", () => {
    const ev = evaluar(resultado(1800, 1400, 2300), { edadAnios: 6 });
    expect(ev.estado).toBe("estable");
    expect(ev.requiereTeleconsulta).toBe(false);
    expect(ev.habilitaEmergencia).toBe(false);
  });

  it("grave abre teleconsulta pero no emergencia", () => {
    const ev = evaluar(resultado(420, 280, 640), { edadAnios: 6 });
    expect(ev.estado).toBe("grave");
    expect(ev.requiereTeleconsulta).toBe(true);
    expect(ev.habilitaEmergencia).toBe(false);
  });

  it("la fiebre escala a priorizable y habilita la emergencia", () => {
    const ev = evaluar(resultado(420, 280, 640), { edadAnios: 6, temperaturaC: 38.6 });
    expect(ev.estado).toBe("priorizable");
    expect(ev.habilitaEmergencia).toBe(true);
    expect(ev.escaladoPorFiebre).toBe(true);
  });

  it("un tamizaje dudoso con fiebre nunca tranquiliza", () => {
    const ev = evaluar(resultado(900, 400, 2000, false, ["capilares_insuficientes (2/5)"]), { edadAnios: 6, temperaturaC: 38.5 });
    expect(ev.estado).toBe("priorizable");
  });

  it("el michi callado escala aunque el tamizaje fuera normal", () => {
    const ahora = new Date("2026-08-17T20:00:00-05:00");
    const salud = evaluarEnlace(
      { momento: new Date(ahora.getTime() - 96 * 3_600_000).toISOString(), bateriaPct: 0, tamizajesEnCola: 0, alertasEmitidas: 0, alertasAtendidas: 0, silenciamientos: 0 },
      null,
      ahora,
    );
    const ev = evaluar(resultado(1800, 1400, 2300), { edadAnios: 6 }, null, salud);
    expect(ev.estado).toBe("grave");
    expect(ev.escaladoPorSilencio).toBe(true);
    expect(ev.paraElEquipo).toContain("búsqueda");
  });

  it("si no pueden viajar, la referencia ya viene resuelta y fuera de Lima", () => {
    const f = ficha({ domicilio: domicilio({ departamento: "Puno", provincia: "Azángaro", horasAlInsn: 20, puedeViajarALima: false, motivoImpedimento: "tres hijos a cargo" }) });
    const ev = evaluar(resultado(420, 280, 640), { edadAnios: 6 }, f);
    expect(ev.referenciaSugerida).not.toBeNull();
    expect(ev.referenciaSugerida?.destino.departamento).not.toBe("Lima");
  });

  it("si pueden viajar no se genera referencia", () => {
    expect(evaluar(resultado(420, 280, 640), { edadAnios: 6 }, ficha()).referenciaSugerida).toBeNull();
  });

  it("la cola pone primero lo que no puede esperar", () => {
    const casos = [
      { n: "estable", e: evaluar(resultado(1800, 1400, 2300), { edadAnios: 6 }) },
      { n: "priorizable", e: evaluar(resultado(300, 180, 500), { edadAnios: 6, temperaturaC: 38.7 }) },
      { n: "grave", e: evaluar(resultado(420, 280, 640), { edadAnios: 6 }) },
    ];
    expect(ordenarCola(casos, (c) => c.e.estado).map((c) => c.n)).toEqual(["priorizable", "grave", "estable"]);
  });

  it("sin tamizajes el paciente queda estable salvo que el michi esté callado", () => {
    expect(evaluar(null, { edadAnios: 6 }).sinTamizajes).toBe(true);
    expect(evaluar(null, { edadAnios: 6 }).estado).toBe("estable");
  });
});

describe("estado del juguete", () => {
  const ahora = new Date("2026-08-17T20:00:00-05:00");
  const latido = (horas: number, extra: Partial<Parameters<typeof evaluarEnlace>[0] & object> = {}) => ({
    momento: new Date(ahora.getTime() - horas * 3_600_000).toISOString(),
    bateriaPct: 80,
    tamizajesEnCola: 0,
    alertasEmitidas: 10,
    alertasAtendidas: 9,
    silenciamientos: 0,
    ...extra,
  });

  it("más de 72 h de silencio es una alarma de abandono", () => {
    const s = evaluarEnlace(latido(80), null, ahora);
    expect(s.enlace).toBe("sin_contacto");
    expect(s.urgente).toBe(true);
    expect(s.conducta.toLowerCase()).toContain("abandono");
  });

  it("un latido reciente no moviliza a nadie", () => {
    const s = evaluarEnlace(latido(2), null, ahora);
    expect(s.enlace).toBe("en_linea");
    expect(s.urgente).toBe(false);
  });

  it("tres silenciamientos seguidos son una señal", () => {
    const s = evaluarEnlace(latido(1, { silenciamientos: 3 }), null, ahora);
    expect(s.urgente).toBe(true);
    expect(s.motivos.some((m) => m.includes("silenciamientos"))).toBe(true);
  });

  it("la batería crítica es urgente", () => {
    expect(evaluarEnlace(latido(1, { bateriaPct: 5 }), null, ahora).urgente).toBe(true);
  });

  it("un michi que nunca habló se mide desde la entrega", () => {
    expect(evaluarEnlace(null, new Date(ahora.getTime() - 3_600_000).toISOString(), ahora).enlace).toBe("en_linea");
    expect(evaluarEnlace(null, null, ahora).enlace).toBe("sin_contacto");
  });
});

describe("red nacional", () => {
  it("la red oncológica está concentrada en cuatro departamentos y deja 21 sin ninguno", () => {
    const onco = new Set(RED.filter((c) => c.nivel === "oncologico").map((c) => c.departamento));
    expect(onco).toEqual(new Set(["Lima", "La Libertad", "Arequipa", "Cusco"]));
    expect(cobertura().departamentosSinOncologico).toHaveLength(21);
    expect(cobertura().centros).toBe(30);
  });

  it("si no pueden ir a Lima el destino no es Lima", () => {
    const r = proponerReferencia(domicilio({ departamento: "Loreto", provincia: "Maynas", horasAlInsn: 2, puedeViajarALima: false }), "hemograma_de_control");
    expect(r.destino.departamento).not.toBe("Lima");
    expect(r.horasDeViajeEvitadas).toBeGreaterThan(0);
  });

  it("la fiebre no manda al niño a nueve horas por un hemocultivo", () => {
    const r = proponerReferencia(domicilio({ puedeViajarALima: false }), "neutropenia_febril");
    expect(r.destino.departamento).toBe("Amazonas");
    expect(r.advertencias.some((a) => a.includes("ANTES del traslado"))).toBe(true);
  });

  it("un destino de continuidad declara lo que no puede hacer", () => {
    const r = proponerReferencia(domicilio({ departamento: "Loreto", provincia: "Maynas", puedeViajarALima: false }), "transfusion");
    expect(r.destino.nivel).toBe("continuidad");
    expect(r.advertencias.some((a) => a.includes("no sustituye al centro oncológico"))).toBe(true);
    expect(r.advertencias.some((a) => a.toLowerCase().includes("contrarreferencia"))).toBe(true);
  });

  it("la quimioterapia solo va a un centro oncológico", () => {
    const r = proponerReferencia(domicilio({ departamento: "Puno", provincia: "Azángaro", puedeViajarALima: false }), "quimioterapia");
    expect(r.destino.capacidades).toContain("quimioterapia_pediatrica");
  });

  it("prefiere el departamento propio antes que el vecino", () => {
    expect(candidatos(domicilio({ departamento: "Junín", provincia: "Huancayo" }), ["hemograma"])[0]?.departamento).toBe("Junín");
  });
});

describe("ventana de alertas", () => {
  const f: FichaAlertas = {
    nombreNino: "Ana Lucía",
    nombreMichi: "Nube",
    etapa: "mantenimiento",
    inicioEtapa: "2026-08-01",
    jornada: { finJornada: "18:30", sinHorarioFijo: false },
    controles: ["2026-08-20", "2026-09-19"],
  };

  it("el michi calla mientras los padres trabajan", () => {
    const { inicio, fin } = ventanaAudible(f.jornada, "2026-08-17");
    expect(horaLocal(inicio) >= "19:00").toBe(true);
    expect(horaLocal(fin)).toBe("21:00");
  });

  it("sin horario fijo la ventana se corre a la noche", () => {
    expect(horaLocal(ventanaAudible({ finJornada: "08:00", sinHorarioFijo: true }, "2026-08-17").inicio)).toBe("19:00");
  });

  it("una jornada que termina tarde deja al menos una hora de ventana", () => {
    const { inicio, fin } = ventanaAudible({ finJornada: "20:50", sinHorarioFijo: false }, "2026-08-17");
    expect(fin.getTime() - inicio.getTime()).toBe(3_600_000);
  });

  it("ninguna alerta del juguete cae fuera de la ventana", () => {
    for (const a of planificarAlertas(f, "2026-08-15", 21)) {
      if (a.canal !== "juguete") continue;
      const dia = `${a.programada.getFullYear()}-${String(a.programada.getMonth() + 1).padStart(2, "0")}-${String(a.programada.getDate()).padStart(2, "0")}`;
      const { inicio, fin } = ventanaAudible(f.jornada, dia);
      expect(a.programada.getTime()).toBeGreaterThanOrEqual(inicio.getTime());
      expect(a.programada.getTime()).toBeLessThanOrEqual(fin.getTime() + 5 * 60_000);
    }
  });

  it("el tamizaje es lo que calla al michi", () => {
    const tamizajes = planificarAlertas(f, "2026-08-15", 30).filter((a) => a.tipo === "tamizaje");
    expect(tamizajes.length).toBeGreaterThan(0);
    expect(tamizajes.every((a) => a.exigeTamizaje && a.canal === "juguete")).toBe(true);
  });

  it("la insistencia tiene un límite y ese límite avisa al hospital", () => {
    let alerta = planificarAlertas(f, "2026-08-15", 30)[0]!;
    for (let i = 0; i < MAX_POSTERGACIONES - 1; i++) {
      const siguiente = escalarAlerta(alerta);
      expect(siguiente).not.toBeNull();
      alerta = siguiente!;
    }
    expect(escalarAlerta(alerta)).toBeNull();
    expect(alerta.estado).toBe("escalada");
  });

  it("los canales convencionales salen igual", () => {
    const alerta = planificarAlertas(f, "2026-08-15", 30)[0]!;
    expect(new Set(respaldoConvencional(alerta).map((r) => r.canal))).toEqual(new Set(["sms", "llamada", "correo"]));
  });

  it("después de la ventana el aviso pasa a la ventana del día siguiente", () => {
    const tarde = combinar("2026-08-17", "22:30");
    const r = dentroDeVentana(f.jornada, tarde);
    expect(r.getDate()).toBe(18);
    expect(horaLocal(r)).toBe("19:00");
  });
});
