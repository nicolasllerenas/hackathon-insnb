import { describe, expect, it } from "vitest";
import { construirBundleFhir, construirOruR01, escaparHl7, type PacienteInterop, type TamizajeInterop } from "./interop.js";
import { aCsv, areaBajoCurva, emparejar, metricasDiagnosticas, tamanoDeMuestra, wilson } from "./investigacion.js";

const paciente: PacienteInterop = {
  historiaClinica: "2026-04871",
  nombres: "Ana Lucía",
  apellidos: "Quispe Huamán",
  fechaNacimiento: "2019-03-14",
  sexo: "F",
  departamento: "Amazonas",
  provincia: "Bagua",
};

const tamizaje: TamizajeInterop = {
  id: "tam-1",
  momento: "2026-08-17T19:30:00.000Z",
  concluyente: true,
  ancEstimado: 420,
  icInferior: 280,
  icSuperior: 640,
  capilares: 5,
  eventos: 20,
  volumenNl: 0.3,
  nivelTriaje: "grave",
  estado: "grave",
  titulo: "Posible neutropenia grave",
  accion: "Teleconsulta hoy | confirmar",
  razones: [],
  temperaturaC: 37.2,
  simulado: true,
};

describe("HL7 v2 ORU^R01", () => {
  const mensaje = construirOruR01(paciente, tamizaje, { serie: "MC-3F7A21C0", firmware: "0.3.0", enlace: "en_linea", bateriaPct: 78 }, "CTRL1", new Date("2026-08-17T20:00:00Z"));
  const segmentos = mensaje.split("\r");

  it("arma la cabecera estándar con los separadores en su lugar", () => {
    expect(segmentos[0]).toBe(
      "MSH|^~\\&|MICHICHECK|INSNSB^00006213^RENIPRESS|GALENUS|INSNSB|20260817200000+0000||ORU^R01^ORU_R01|CTRL1|P|2.5.1|||AL|NE|PER|UNICODE UTF-8",
    );
  });

  it("identifica al paciente por historia clínica y al dispositivo por su serie", () => {
    const pid = segmentos.find((s) => s.startsWith("PID|"))!.split("|");
    expect(pid[3]).toBe("2026-04871^^^INSNSB^MR");
    expect(pid[5]).toBe("QUISPE HUAMÁN^ANA LUCÍA");
    expect(pid[7]).toBe("20190314");
    expect(segmentos.find((s) => s.startsWith("PV1|"))).toContain("MC-3F7A21C0");
  });

  it("el resultado viaja como preliminar, con unidades correctas y el método explícito", () => {
    const obx = segmentos.find((s) => s.startsWith("OBX|1|"))!.split("|");
    expect(obx[2]).toBe("NM");
    expect(obx[5]).toBe("420");
    expect(obx[6]).toBe("/uL^^UCUM");
    expect(obx[8]).toBe("LL");
    expect(obx[11]).toBe("P");
    expect(obx[17]).toContain("MCK-CAP-OPT");
    expect(segmentos.find((s) => s.startsWith("OBR|"))!.split("|")[25]).toBe("P");
    expect(mensaje).toContain("NO es un hemograma");
    expect(mensaje).toContain("DATO SIMULADO");
  });

  it("escapa los separadores dentro de los campos", () => {
    expect(escaparHl7("a|b^c~d&e\\f")).toBe("a\\F\\b\\S\\c\\R\\d\\T\\e\\E\\f");
    expect(mensaje).toContain("Teleconsulta hoy \\F\\ confirmar");
  });
});

describe("FHIR R4", () => {
  it("emite un Bundle de transacción con la observación preliminar enlazada", () => {
    let n = 0;
    const b = construirBundleFhir(paciente, tamizaje, null, new Date("2026-08-17T20:00:00Z"), () => `id-${++n}`);
    expect(b.resourceType).toBe("Bundle");
    const entradas = b.entry as { resource: Record<string, unknown>; request: { url: string } }[];
    const obs = entradas.find((e) => e.resource.resourceType === "Observation")!.resource;
    expect(obs.status).toBe("preliminary");
    expect((obs.valueQuantity as { unit: string }).unit).toBe("/uL");
    expect((obs.subject as { reference: string }).reference).toBe("urn:uuid:id-1");
    expect(entradas.every((e) => e.request.url === e.resource.resourceType)).toBe(true);
  });
});

describe("estudio de validación", () => {
  it("el intervalo de Wilson coincide con el valor de referencia", () => {
    const w = wilson(19, 20);
    expect(w.valor).toBeCloseTo(0.95, 6);
    expect(w.inferior).toBeCloseTo(0.7639, 3);
    expect(w.superior).toBeCloseTo(0.9911, 3);
  });

  it("empareja cada hemograma con el tamizaje más cercano del mismo niño", () => {
    const t = [
      { id: "t1", pacienteId: "a", momento: "2026-01-01T10:00:00Z", concluyente: true, ancEstimado: 300, icInferior: 200, icSuperior: 600 },
      { id: "t2", pacienteId: "a", momento: "2026-01-01T20:00:00Z", concluyente: true, ancEstimado: 350, icInferior: 210, icSuperior: 650 },
      { id: "t3", pacienteId: "b", momento: "2026-01-01T12:00:00Z", concluyente: true, ancEstimado: 1500, icInferior: 900, icSuperior: 3000 },
    ];
    const h = [
      { id: "h1", pacienteId: "a", fecha: "2026-01-01T19:00:00Z", anc: 380 },
      { id: "h2", pacienteId: "b", fecha: "2026-01-03T12:00:00Z", anc: 1400 },
    ];
    const pares = emparejar(t, h, 24);
    expect(pares).toHaveLength(1);
    expect(pares[0]?.tamizaje.id).toBe("t2");
  });

  it("calcula sensibilidad, especificidad y AUC sobre la regla de decisión", () => {
    const par = (anc: number, lo: number, ref: number, i: number) => ({
      tamizaje: { id: `t${i}`, pacienteId: `p${i}`, momento: "2026-01-01T00:00:00Z", concluyente: true, ancEstimado: anc, icInferior: lo, icSuperior: anc * 2 },
      hemograma: { id: `h${i}`, pacienteId: `p${i}`, fecha: "2026-01-01T00:00:00Z", anc: ref },
      horasDeDiferencia: 0,
    });
    const m = metricasDiagnosticas([par(300, 150, 250, 1), par(450, 300, 480, 2), par(900, 600, 300, 3), par(1500, 800, 1600, 4), par(600, 400, 1200, 5)]);
    expect([m.vp, m.fn, m.fp, m.vn]).toEqual([2, 1, 1, 1]);
    expect(m.sensibilidad.valor).toBeCloseTo(2 / 3, 6);
    expect(m.especificidad.valor).toBeCloseTo(1 / 2, 6);
    expect(m.auc).toBeCloseTo(5 / 6, 6);
  });

  it("calcula el AUC de Mann-Whitney con empates", () => {
    expect(areaBajoCurva([1, 2], [2, 3])).toBeCloseTo(0.875, 6);
    expect(areaBajoCurva([], [1])).toBeNull();
  });

  it("estima el tamaño de muestra de Buderer", () => {
    const n = tamanoDeMuestra({ sensibilidadEsperada: 0.9, especificidadEsperada: 0.8, precision: 0.1, prevalencia: 0.3 });
    expect(n.positivosNecesarios).toBe(35);
    expect(n.negativosNecesarios).toBe(62);
    expect(n.totalPorSensibilidad).toBe(117);
    expect(n.totalPorEspecificidad).toBe(89);
    expect(n.total).toBe(117);
    expect(() => tamanoDeMuestra({ sensibilidadEsperada: 1, especificidadEsperada: 0.8, precision: 0.1, prevalencia: 0.3 })).toThrow();
  });

  it("exporta CSV sin permitir inyección de fórmulas", () => {
    const csv = aCsv([{ a: "=SUMA(1)", b: 3, c: "x,y" }]);
    expect(csv).toBe("a,b,c\n'=SUMA(1),3,\"x,y\"");
  });
});
