import type { EstadoPaciente } from "./estados.js";
import type { NivelTriaje } from "./triaje.js";

export const RENIPRESS_INSNSB = "00006213";
export const PE_CORE = "https://www.gob.pe/minsa/RENHICE/fhir";
export const LOINC_NEUTROFILOS = "26499-4";
export const CODIGO_METODO = "MCK-CAP-OPT";
export const TEXTO_METODO = "Capilaroscopia optica no invasiva 530 nm (tamizaje)";

export interface PacienteInterop {
  historiaClinica: string;
  nombres: string;
  apellidos: string;
  fechaNacimiento: string;
  sexo: "F" | "M";
  departamento: string;
  provincia: string;
}

export interface TamizajeInterop {
  id: string;
  momento: string;
  concluyente: boolean;
  ancEstimado: number | null;
  icInferior: number | null;
  icSuperior: number | null;
  capilares: number;
  eventos: number;
  volumenNl: number | null;
  nivelTriaje: NivelTriaje;
  estado: EstadoPaciente;
  titulo: string;
  accion: string;
  razones: readonly string[];
  temperaturaC: number | null;
  simulado: boolean;
}

export interface MichiInterop {
  serie: string;
  firmware: string;
  enlace: string;
  bateriaPct: number | null;
}

const ESCAPES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\\/g, "\\E\\"],
  [/\|/g, "\\F\\"],
  [/\^/g, "\\S\\"],
  [/~/g, "\\R\\"],
  [/&/g, "\\T\\"],
];

export function escaparHl7(valor: string | number | null | undefined): string {
  let salida = String(valor ?? "").replace(/[\r\n]+/g, " ");
  for (const [patron, reemplazo] of ESCAPES) salida = salida.replace(patron, reemplazo);
  return salida;
}

function marcaHl7(momento: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${momento.getUTCFullYear()}${p(momento.getUTCMonth() + 1)}${p(momento.getUTCDate())}${p(momento.getUTCHours())}${p(momento.getUTCMinutes())}${p(momento.getUTCSeconds())}+0000`;
}

function segmento(nombre: string, campos: Record<number, string>): string {
  const ultimo = Math.max(0, ...Object.keys(campos).map(Number));
  const valores: string[] = [nombre];
  for (let i = 1; i <= ultimo; i++) valores.push(campos[i] ?? "");
  return valores.join("|");
}

export function banderaAnormal(t: TamizajeInterop): string {
  if (!t.concluyente) return "";
  if (t.nivelTriaje === "grave" || t.nivelTriaje === "priorizable") return "LL";
  if (t.ancEstimado !== null && t.ancEstimado < 1500) return "L";
  return "N";
}

export function construirOruR01(
  paciente: PacienteInterop,
  tamizaje: TamizajeInterop,
  michi: MichiInterop | null,
  idControl: string,
  ahora: Date = new Date(),
): string {
  const ts = marcaHl7(ahora);
  const tsObs = marcaHl7(new Date(tamizaje.momento));
  const metodo = `${CODIGO_METODO}^${escaparHl7(TEXTO_METODO)}^L`;
  const segmentos: string[] = [];

  segmentos.push(
    segmento("MSH", {
      1: "^~\\&",
      2: "MICHICHECK",
      3: `INSNSB^${RENIPRESS_INSNSB}^RENIPRESS`,
      4: "GALENUS",
      5: "INSNSB",
      6: ts,
      8: "ORU^R01^ORU_R01",
      9: escaparHl7(idControl),
      10: "P",
      11: "2.5.1",
      14: "AL",
      15: "NE",
      16: "PER",
      17: "UNICODE UTF-8",
    }),
  );
  segmentos.push(
    segmento("PID", {
      1: "1",
      3: `${escaparHl7(paciente.historiaClinica)}^^^INSNSB^MR`,
      5: `${escaparHl7(paciente.apellidos.toUpperCase())}^${escaparHl7(paciente.nombres.toUpperCase())}`,
      7: paciente.fechaNacimiento.replace(/-/g, ""),
      8: paciente.sexo,
      11: `^^${escaparHl7(paciente.provincia.toUpperCase())}^${escaparHl7(paciente.departamento.toUpperCase())}^^PER`,
    }),
  );
  segmentos.push(segmento("PV1", { 1: "1", 2: "O", 3: `MICHI^DOMICILIO^${escaparHl7(michi?.serie ?? "SIN-DISPOSITIVO")}` }));
  segmentos.push(
    segmento("OBR", {
      1: "1",
      3: escaparHl7(tamizaje.id),
      4: "MCK-TAMIZAJE^Tamizaje optico de neutropenia^L",
      5: tamizaje.estado === "priorizable" ? "S" : "R",
      7: tsObs,
      22: ts,
      25: "P",
    }),
  );

  let indice = 0;
  const obx = (tipo: string, codigo: string, valor: string, unidades = "", rango = "", bandera = "", estadoResultado = "P") => {
    indice += 1;
    segmentos.push(
      segmento("OBX", {
        1: String(indice),
        2: tipo,
        3: codigo,
        5: valor,
        6: unidades,
        7: rango,
        8: bandera,
        11: estadoResultado,
        14: tsObs,
        17: metodo,
      }),
    );
  };

  if (tamizaje.concluyente && tamizaje.ancEstimado !== null) {
    obx(
      "NM",
      `${LOINC_NEUTROFILOS}^Neutrofilos [#/volumen] en sangre^LN`,
      String(Math.round(tamizaje.ancEstimado)),
      "/uL^^UCUM",
      "1500-8000",
      banderaAnormal(tamizaje),
    );
    const sup = tamizaje.icSuperior !== null && Number.isFinite(tamizaje.icSuperior) ? String(Math.round(tamizaje.icSuperior)) : "";
    const inf = tamizaje.icInferior !== null ? String(Math.round(tamizaje.icInferior)) : "";
    obx("SN", "MCK-IC95^Intervalo de confianza 95%^L", `^${inf}^-^${sup}`, "/uL^^UCUM");
  } else {
    obx("ST", `${LOINC_NEUTROFILOS}^Neutrofilos [#/volumen] en sangre^LN`, "NO CONCLUYENTE", "", "", "", "X");
  }
  obx("NM", "MCK-CAP^Capilares analizados^L", String(tamizaje.capilares));
  obx("NM", "MCK-EVT^Gaps opticos detectados^L", String(tamizaje.eventos));
  if (tamizaje.volumenNl !== null) obx("NM", "MCK-VOL^Volumen sanguineo interrogado^L", tamizaje.volumenNl.toFixed(3), "nL^^UCUM");
  if (tamizaje.temperaturaC !== null) obx("NM", "8310-5^Temperatura corporal^LN", tamizaje.temperaturaC.toFixed(1), "Cel^^UCUM");
  obx("ST", "MCK-TRI^Nivel de triaje^L", tamizaje.nivelTriaje.toUpperCase(), "", "", "", "F");
  obx("ST", "MCK-EST^Estado del paciente^L", tamizaje.estado.toUpperCase(), "", "", "", "F");
  obx("ST", "MCK-ACT^Conducta indicada^L", escaparHl7(`${tamizaje.titulo}: ${tamizaje.accion}`), "", "", "", "F");
  if (michi) {
    const bateria = michi.bateriaPct === null ? "s/d" : `${Math.round(michi.bateriaPct)}%`;
    obx("ST", "MCK-ENL^Estado del dispositivo^L", escaparHl7(`${michi.enlace.toUpperCase()} bateria ${bateria} firmware ${michi.firmware}`));
  }
  for (const razon of tamizaje.razones) obx("ST", "MCK-QC^Aviso de calidad^L", escaparHl7(razon));

  segmentos.push(segmento("NTE", { 1: "1", 2: "L", 3: "RESULTADO PRELIMINAR. Tamizaje optico no invasivo por capilaroscopia." }));
  segmentos.push(segmento("NTE", { 1: "2", 2: "L", 3: "NO es un hemograma: no mide plaquetas ni formula diferencial." }));
  segmentos.push(
    segmento("NTE", {
      1: "3",
      2: "L",
      3: "Orienta y prioriza. No descarta neutropenia ni justifica suspender o modificar quimioterapia.",
    }),
  );
  if (tamizaje.simulado) segmentos.push(segmento("NTE", { 1: "4", 2: "L", 3: "DATO SIMULADO PARA DEMOSTRACION. NO USAR EN ATENCION." }));
  return segmentos.join("\r");
}

export interface RecursoFhir {
  resourceType: string;
  [clave: string]: unknown;
}

export function construirBundleFhir(
  paciente: PacienteInterop,
  tamizaje: TamizajeInterop,
  michi: MichiInterop | null,
  ahora: Date = new Date(),
  nuevoUuid: () => string = () => globalThis.crypto.randomUUID(),
): RecursoFhir {
  const urlPaciente = `urn:uuid:${nuevoUuid()}`;
  const urlDispositivo = `urn:uuid:${nuevoUuid()}`;
  const urlObservacion = `urn:uuid:${nuevoUuid()}`;
  const entrada = (fullUrl: string, recurso: RecursoFhir) => ({
    fullUrl,
    resource: recurso,
    request: { method: "POST", url: recurso.resourceType },
  });

  const entradas = [
    entrada(urlPaciente, {
      resourceType: "Patient",
      meta: { profile: [`${PE_CORE}/StructureDefinition/PacientePe`] },
      identifier: [
        {
          use: "usual",
          type: { coding: [{ system: `${PE_CORE}/CodeSystem/IdspersonaPeru`, code: "HC" }] },
          system: `${PE_CORE}/NamingSystem/historia-clinica`,
          value: paciente.historiaClinica,
          assigner: { display: `INSN San Borja (RENIPRESS ${RENIPRESS_INSNSB})` },
        },
      ],
      name: [{ family: paciente.apellidos, given: paciente.nombres.split(/\s+/).filter(Boolean) }],
      gender: paciente.sexo === "F" ? "female" : "male",
      birthDate: paciente.fechaNacimiento,
      address: [{ district: paciente.provincia, state: paciente.departamento, country: "PE" }],
    }),
  ];

  if (michi) {
    entradas.push(
      entrada(urlDispositivo, {
        resourceType: "Device",
        identifier: [{ system: `${PE_CORE}/NamingSystem/dispositivo`, value: michi.serie }],
        status: michi.enlace === "sin_contacto" ? "inactive" : "active",
        deviceName: [{ name: "MichiCheck", type: "manufacturer-name" }],
        version: [{ value: michi.firmware }],
        patient: { reference: urlPaciente },
        property: michi.bateriaPct === null ? [] : [{ type: { text: "bateria" }, valueQuantity: { value: michi.bateriaPct, unit: "%" } }],
      }),
    );
  }

  const interpretacion = banderaAnormal(tamizaje);
  entradas.push(
    entrada(urlObservacion, {
      resourceType: "Observation",
      status: "preliminary",
      category: [
        {
          coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "laboratory" }],
        },
      ],
      code: { coding: [{ system: "http://loinc.org", code: LOINC_NEUTROFILOS, display: "Neutrophils [#/volume] in Blood" }] },
      subject: { reference: urlPaciente },
      ...(michi ? { device: { reference: urlDispositivo } } : {}),
      effectiveDateTime: tamizaje.momento,
      issued: ahora.toISOString(),
      ...(tamizaje.concluyente && tamizaje.ancEstimado !== null
        ? {
            valueQuantity: { value: Math.round(tamizaje.ancEstimado), unit: "/uL", system: "http://unitsofmeasure.org", code: "/uL" },
            interpretation: interpretacion
              ? [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation", code: interpretacion }] }]
              : [],
            referenceRange: [
              {
                low: tamizaje.icInferior === null ? undefined : { value: Math.round(tamizaje.icInferior), unit: "/uL" },
                high:
                  tamizaje.icSuperior === null || !Number.isFinite(tamizaje.icSuperior)
                    ? undefined
                    : { value: Math.round(tamizaje.icSuperior), unit: "/uL" },
                text: "Intervalo de confianza 95% del tamizaje (incluye incertidumbre del método)",
              },
            ],
          }
        : { dataAbsentReason: { text: "Tamizaje no concluyente" } }),
      method: { coding: [{ system: "https://michicheck.pe/metodo", code: CODIGO_METODO }], text: TEXTO_METODO },
      note: [
        { text: "Resultado PRELIMINAR de tamizaje. No es un hemograma: no mide plaquetas ni fórmula diferencial." },
        ...(tamizaje.simulado ? [{ text: "Dato simulado para demostración. No usar en atención." }] : []),
      ],
    }),
  );

  entradas.push(
    entrada(`urn:uuid:${nuevoUuid()}`, {
      resourceType: "Flag",
      status: "active",
      category: [{ text: "estado-michicheck" }],
      code: { text: tamizaje.estado },
      subject: { reference: urlPaciente },
      period: { start: tamizaje.momento },
    }),
  );

  return {
    resourceType: "Bundle",
    meta: { profile: [`${PE_CORE}/StructureDefinition/BundlePe`] },
    type: "transaction",
    timestamp: ahora.toISOString(),
    entry: entradas,
  };
}
