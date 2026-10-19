export const DEPARTAMENTOS = [
  "Amazonas",
  "Áncash",
  "Apurímac",
  "Arequipa",
  "Ayacucho",
  "Cajamarca",
  "Callao",
  "Cusco",
  "Huancavelica",
  "Huánuco",
  "Ica",
  "Junín",
  "La Libertad",
  "Lambayeque",
  "Lima",
  "Loreto",
  "Madre de Dios",
  "Moquegua",
  "Pasco",
  "Piura",
  "Puno",
  "San Martín",
  "Tacna",
  "Tumbes",
  "Ucayali",
] as const;
export type Departamento = (typeof DEPARTAMENTOS)[number];

export const CAPACIDADES = [
  "hemograma",
  "hemocultivo",
  "antibiotico_amplio_espectro",
  "transfusion",
  "hospitalizacion_pediatrica",
  "uci_pediatrica",
  "quimioterapia_pediatrica",
  "hematologia_pediatrica",
  "trasplante_medula",
] as const;
export type Capacidad = (typeof CAPACIDADES)[number];

export const NOMBRE_CAPACIDAD: Record<Capacidad, string> = {
  hemograma: "hemograma",
  hemocultivo: "hemocultivo",
  antibiotico_amplio_espectro: "antibiótico de amplio espectro",
  transfusion: "transfusión",
  hospitalizacion_pediatrica: "hospitalización pediátrica",
  uci_pediatrica: "UCI pediátrica",
  quimioterapia_pediatrica: "quimioterapia pediátrica",
  hematologia_pediatrica: "hematología pediátrica",
  trasplante_medula: "trasplante de médula",
};

export type NivelCentro = "oncologico" | "continuidad";

export interface Centro {
  codigo: string;
  nombre: string;
  nivel: NivelCentro;
  departamento: Departamento;
  ciudad: string;
  capacidades: readonly Capacidad[];
  horasALima: number;
  renipress: string | null;
}

const ONCO: readonly Capacidad[] = [
  "hemograma",
  "hemocultivo",
  "antibiotico_amplio_espectro",
  "transfusion",
  "hospitalizacion_pediatrica",
  "uci_pediatrica",
  "quimioterapia_pediatrica",
  "hematologia_pediatrica",
];
const ONCO_TRASPLANTE: readonly Capacidad[] = [...ONCO, "trasplante_medula"];
const CONTINUIDAD: readonly Capacidad[] = [
  "hemograma",
  "hemocultivo",
  "antibiotico_amplio_espectro",
  "transfusion",
  "hospitalizacion_pediatrica",
];
const BASICO: readonly Capacidad[] = ["hemograma", "antibiotico_amplio_espectro", "hospitalizacion_pediatrica"];

function centro(
  codigo: string,
  nombre: string,
  nivel: NivelCentro,
  departamento: Departamento,
  ciudad: string,
  capacidades: readonly Capacidad[],
  horasALima: number,
  renipress: string | null = null,
): Centro {
  return { codigo, nombre, nivel, departamento, ciudad, capacidades, horasALima, renipress };
}

export const RED: readonly Centro[] = [
  centro("INSNSB", "Instituto Nacional de Salud del Niño San Borja", "oncologico", "Lima", "Lima", ONCO_TRASPLANTE, 0, "00006213"),
  centro("INEN", "Instituto Nacional de Enfermedades Neoplásicas", "oncologico", "Lima", "Lima", ONCO_TRASPLANTE, 0),
  centro("INSNB", "Instituto Nacional de Salud del Niño (Breña)", "oncologico", "Lima", "Lima", ONCO, 0),
  centro("HNDM", "Hospital Nacional Dos de Mayo", "oncologico", "Lima", "Lima", ONCO, 0),
  centro("HCH", "Hospital Cayetano Heredia", "oncologico", "Lima", "Lima", ONCO, 0),
  centro("HBT", "Hospital Belén de Trujillo", "oncologico", "La Libertad", "Trujillo", ONCO, 9),
  centro("IRENSUR", "Instituto Regional de Enfermedades Neoplásicas del Sur", "oncologico", "Arequipa", "Arequipa", ONCO, 16),
  centro("HRHD", "Hospital Regional Honorio Delgado Espinoza", "oncologico", "Arequipa", "Arequipa", ONCO, 16),
  centro("HAL", "Hospital Antonio Lorena del Cusco", "oncologico", "Cusco", "Cusco", ONCO, 21),
  centro("HRC", "Hospital Regional del Cusco", "oncologico", "Cusco", "Cusco", ONCO, 21),
  centro("HRDLM", "Hospital Regional Docente Las Mercedes", "continuidad", "Lambayeque", "Chiclayo", CONTINUIDAD, 11),
  centro("HJCH", "Hospital José Cayetano Heredia", "continuidad", "Piura", "Piura", CONTINUIDAD, 14),
  centro("HRVF", "Hospital Regional Virgen de Fátima", "continuidad", "Amazonas", "Chachapoyas", BASICO, 20),
  centro("HRC-CAJ", "Hospital Regional Docente de Cajamarca", "continuidad", "Cajamarca", "Cajamarca", CONTINUIDAD, 14),
  centro("HII-2TAR", "Hospital II-2 Tarapoto", "continuidad", "San Martín", "Tarapoto", CONTINUIDAD, 24),
  centro("HRL", "Hospital Regional de Loreto Felipe Santiago Arriola", "continuidad", "Loreto", "Iquitos", [...CONTINUIDAD, "uci_pediatrica"], 2),
  centro("HRP", "Hospital Regional de Pucallpa", "continuidad", "Ucayali", "Pucallpa", CONTINUIDAD, 18),
  centro("HRHV", "Hospital Regional Hermilio Valdizán", "continuidad", "Huánuco", "Huánuco", CONTINUIDAD, 8),
  centro("HDAC-PAS", "Hospital Daniel Alcides Carrión de Pasco", "continuidad", "Pasco", "Cerro de Pasco", BASICO, 8),
  centro("HRDMI", "Hospital Regional Docente Materno Infantil El Carmen", "continuidad", "Junín", "Huancayo", CONTINUIDAD, 7),
  centro("HRA", "Hospital Regional de Ayacucho Miguel Ángel Mariscal Llerena", "continuidad", "Ayacucho", "Ayacucho", CONTINUIDAD, 9),
  centro("HRZCV", "Hospital Regional Zacarías Correa Valdivia", "continuidad", "Huancavelica", "Huancavelica", BASICO, 11),
  centro("HRICA", "Hospital Regional de Ica", "continuidad", "Ica", "Ica", CONTINUIDAD, 4.5),
  centro("HRMNB", "Hospital Regional Manuel Núñez Butrón", "continuidad", "Puno", "Puno", CONTINUIDAD, 20),
  centro("HHU-TAC", "Hospital Hipólito Unanue de Tacna", "continuidad", "Tacna", "Tacna", CONTINUIDAD, 19),
  centro("HRM", "Hospital Regional de Moquegua", "continuidad", "Moquegua", "Moquegua", BASICO, 18),
  centro("HSRPM", "Hospital Santa Rosa de Puerto Maldonado", "continuidad", "Madre de Dios", "Puerto Maldonado", BASICO, 3),
  centro("HRDA", "Hospital Regional de Apurímac Guillermo Díaz de la Vega", "continuidad", "Apurímac", "Abancay", BASICO, 16),
  centro("HRDAV", "Hospital Regional Eleazar Guzmán Barrón", "continuidad", "Áncash", "Chimbote", CONTINUIDAD, 6),
  centro("HRT-TUM", "Hospital Regional José Alfredo Mendoza Olavarría", "continuidad", "Tumbes", "Tumbes", BASICO, 18),
];

export const VECINDAD: Readonly<Record<Departamento, readonly Departamento[]>> = {
  Amazonas: ["Cajamarca", "San Martín", "Lambayeque", "La Libertad"],
  Áncash: ["La Libertad", "Lima", "Huánuco"],
  Apurímac: ["Cusco", "Ayacucho", "Arequipa"],
  Arequipa: ["Moquegua", "Puno", "Cusco", "Ica"],
  Ayacucho: ["Huancavelica", "Junín", "Apurímac", "Ica"],
  Cajamarca: ["Lambayeque", "La Libertad", "Amazonas", "Piura"],
  Callao: ["Lima"],
  Cusco: ["Apurímac", "Puno", "Arequipa", "Madre de Dios"],
  Huancavelica: ["Junín", "Ayacucho", "Ica", "Lima"],
  Huánuco: ["Pasco", "Junín", "Áncash", "Ucayali", "San Martín"],
  Ica: ["Lima", "Ayacucho", "Huancavelica", "Arequipa"],
  Junín: ["Pasco", "Huancavelica", "Ayacucho", "Huánuco", "Lima"],
  "La Libertad": ["Lambayeque", "Cajamarca", "Áncash", "San Martín"],
  Lambayeque: ["La Libertad", "Cajamarca", "Piura", "Amazonas"],
  Lima: ["Ica", "Junín", "Áncash", "Huánuco", "Pasco"],
  Loreto: ["San Martín", "Ucayali", "Amazonas"],
  "Madre de Dios": ["Cusco", "Puno", "Ucayali"],
  Moquegua: ["Arequipa", "Tacna", "Puno"],
  Pasco: ["Junín", "Huánuco", "Lima", "Ucayali"],
  Piura: ["Lambayeque", "Tumbes", "Cajamarca"],
  Puno: ["Cusco", "Arequipa", "Moquegua", "Madre de Dios"],
  "San Martín": ["Loreto", "Amazonas", "La Libertad", "Huánuco", "Ucayali"],
  Tacna: ["Moquegua", "Puno"],
  Tumbes: ["Piura"],
  Ucayali: ["Huánuco", "Pasco", "Loreto", "Madre de Dios"],
};

export const MOTIVOS_REFERENCIA = [
  "hemograma_de_control",
  "neutropenia_febril",
  "transfusion",
  "ajuste_de_quimioterapia",
  "quimioterapia",
  "sospecha_de_recaida",
] as const;
export type MotivoReferencia = (typeof MOTIVOS_REFERENCIA)[number];

export const NOMBRE_MOTIVO: Record<MotivoReferencia, string> = {
  hemograma_de_control: "Hemograma de control",
  neutropenia_febril: "Neutropenia febril",
  transfusion: "Transfusión",
  ajuste_de_quimioterapia: "Ajuste de quimioterapia",
  quimioterapia: "Quimioterapia",
  sospecha_de_recaida: "Sospecha de recaída",
};

export const CAPACIDADES_POR_MOTIVO: Readonly<Record<MotivoReferencia, readonly Capacidad[]>> = {
  hemograma_de_control: ["hemograma"],
  neutropenia_febril: ["antibiotico_amplio_espectro", "hospitalizacion_pediatrica"],
  transfusion: ["transfusion", "hemograma"],
  ajuste_de_quimioterapia: ["hematologia_pediatrica", "hemograma"],
  quimioterapia: ["quimioterapia_pediatrica"],
  sospecha_de_recaida: ["hematologia_pediatrica", "quimioterapia_pediatrica"],
};

const CAPACIDADES_DESEABLES: Partial<Record<MotivoReferencia, readonly Capacidad[]>> = {
  neutropenia_febril: ["hemocultivo", "hemograma"],
  transfusion: ["uci_pediatrica"],
};

export interface Domicilio {
  departamento: Departamento;
  provincia: string;
  horasAlInsn: number | null;
  puedeViajarALima: boolean;
  motivoImpedimento: string;
}

export interface PropuestaReferencia {
  motivo: MotivoReferencia;
  capacidadesRequeridas: Capacidad[];
  destino: Centro;
  alternativas: Centro[];
  horasDeViajeEvitadas: number;
  justificacion: string;
  advertencias: string[];
  contrarreferenciaA: string;
}

export function puede(c: Centro, requeridas: readonly Capacidad[]): boolean {
  return requeridas.every((r) => c.capacidades.includes(r));
}

export function distanciaAdministrativa(origen: Departamento, destino: Departamento): number {
  if (origen === destino) return 0;
  const vecinos = VECINDAD[origen] ?? [];
  if (vecinos.includes(destino)) return 1;
  if (vecinos.some((v) => (VECINDAD[v] ?? []).includes(destino))) return 2;
  return 3;
}

export function candidatos(domicilio: Domicilio, requeridas: readonly Capacidad[]): Centro[] {
  let capaces = RED.filter((c) => puede(c, requeridas));
  if (!domicilio.puedeViajarALima) {
    const fueraDeLima = capaces.filter((c) => c.departamento !== "Lima");
    if (fueraDeLima.length) capaces = fueraDeLima;
  }
  const costo = (c: Centro): [number, number] => {
    const salto = distanciaAdministrativa(domicilio.departamento, c.departamento);
    return [salto, salto ? c.horasALima : 0];
  };
  return [...capaces].sort((a, b) => {
    const [sa, ha] = costo(a);
    const [sb, hb] = costo(b);
    return sa - sb || ha - hb;
  });
}

function listar(capacidades: readonly Capacidad[]): string {
  return [...capacidades]
    .map((c) => NOMBRE_CAPACIDAD[c])
    .sort((a, b) => a.localeCompare(b, "es"))
    .join(", ");
}

export function proponerReferencia(domicilio: Domicilio, motivo: MotivoReferencia): PropuestaReferencia {
  const requeridas = CAPACIDADES_POR_MOTIVO[motivo];
  const orden = candidatos(domicilio, requeridas);
  const destino = orden[0];
  if (!destino) throw new RangeError(`Ningún establecimiento de la red cubre: ${listar(requeridas)}`);

  const horasLima = domicilio.horasAlInsn ?? 0;
  const evitadas = destino.codigo !== "INSNSB" && destino.departamento !== "Lima" ? 2 * horasLima : 0;

  const advertencias: string[] = [];
  if (motivo === "neutropenia_febril") {
    advertencias.push(
      "Iniciar el antibiótico de amplio espectro ANTES del traslado, no al llegar. La primera hora manda sobre la distancia.",
    );
  }
  const faltanDeseables = (CAPACIDADES_DESEABLES[motivo] ?? []).filter((c) => !destino.capacidades.includes(c));
  if (faltanDeseables.length) {
    advertencias.push(
      `El destino no dispone de ${listar(faltanDeseables)}. Tomarlos si es posible sin demorar el tratamiento; si no, coordinar el envío de la muestra.`,
    );
  }
  if (destino.nivel === "continuidad") {
    const faltan = ONCO.filter((c) => !destino.capacidades.includes(c));
    if (faltan.length) {
      advertencias.push(
        `El destino resuelve la urgencia pero no sustituye al centro oncológico: no dispone de ${listar(faltan)}.`,
      );
    }
    advertencias.push(
      "El hematólogo del INSN San Borja mantiene la conducción del caso por teleconsulta. La contrarreferencia es obligatoria.",
    );
  }
  if (!domicilio.puedeViajarALima && domicilio.motivoImpedimento.trim()) {
    advertencias.push(`Impedimento declarado por la familia: ${domicilio.motivoImpedimento.trim()}.`);
  }

  let justificacion =
    `El niño requiere ${listar(requeridas)}. ${destino.nombre} (${destino.ciudad}, ${destino.departamento}) ` +
    `es el establecimiento capaz más cercano al domicilio declarado (${domicilio.provincia || domicilio.departamento}). `;
  justificacion += evitadas
    ? `Resolver aquí evita ${Math.round(evitadas)} horas de viaje ida y vuelta a Lima.`
    : "No existe alternativa capaz fuera de Lima para este motivo, o la familia puede viajar.";

  return {
    motivo,
    capacidadesRequeridas: [...requeridas],
    destino,
    alternativas: orden.slice(1, 4),
    horasDeViajeEvitadas: Math.round(evitadas * 10) / 10,
    justificacion,
    advertencias,
    contrarreferenciaA: "INSNSB",
  };
}

export function centroPorCodigo(codigo: string): Centro | undefined {
  return RED.find((c) => c.codigo === codigo);
}

export interface Cobertura {
  centros: number;
  oncologicos: number;
  continuidad: number;
  departamentosConCentro: number;
  departamentosConOncologico: Departamento[];
  departamentosSinOncologico: Departamento[];
}

export function cobertura(): Cobertura {
  const conOnco = new Set(RED.filter((c) => c.nivel === "oncologico").map((c) => c.departamento));
  return {
    centros: RED.length,
    oncologicos: RED.filter((c) => c.nivel === "oncologico").length,
    continuidad: RED.filter((c) => c.nivel === "continuidad").length,
    departamentosConCentro: new Set(RED.map((c) => c.departamento)).size,
    departamentosConOncologico: DEPARTAMENTOS.filter((d) => conOnco.has(d)),
    departamentosSinOncologico: DEPARTAMENTOS.filter((d) => !conOnco.has(d)),
  };
}
