import { completarTamizaje, hemogramaPrevio } from "./aplicacion/tamizaje.js";
import type { Volcado } from "./contratos/comunes.js";
import type { Cita, EntradaTamizaje, Hemograma, Paciente, Referencia, Tamizaje, Teleconsulta } from "./contratos/clinica.js";
import type { Latido, Michi } from "./contratos/dispositivos.js";
import type { Participante } from "./contratos/investigacion.js";
import { normal, sembrado, uniforme, type Aleatorio } from "./dominio/aleatorio.js";
import { fechaLocalISO, MS_DIA, MS_HORA, sumarDias } from "./dominio/fechas.js";
import { normalizarCodigo, sha256Hex } from "./dominio/identificadores.js";
import { fraccionNeutrofilos } from "./dominio/optica.js";
import { proponerReferencia, type Departamento } from "./dominio/referencias.js";
import { simularTamizaje } from "./dominio/simulacion.js";
import { PERFILES, type Etapa } from "./dominio/tratamiento.js";

export interface DatosDemostracion {
  clinica: Volcado;
  dispositivos: Volcado;
  investigacion: Volcado;
}

interface Perfil {
  id: string;
  nombres: string;
  apellidos: string;
  historiaClinica: string;
  edad: number;
  sexo: "F" | "M";
  fototipo: Paciente["fototipo"];
  departamento: Departamento;
  provincia: string;
  horas: number;
  puedeViajar: boolean;
  impedimento: string;
  etapa: Etapa;
  diasEnEtapa: number;
  apoderado: string;
  parentesco: Paciente["apoderado"]["parentesco"];
  celular: string;
  canal: Paciente["apoderado"]["canalPreferido"];
  salida: string;
  sinHorario: boolean;
  michi: string;
  serie: string;
  codigo: string;
  base: number;
  amplitud: number;
  final: { anc: number; inferior: number; superior: number; temperatura: number | null; horasAtras: number };
  silencioHoras: number;
  bateria: number;
  silenciamientos: number;
  emitidas: number;
  atendidas: number;
  cateter: boolean;
  enEstudio: boolean;
}

export const PERFILES_DEMO: readonly Perfil[] = [
  {
    id: "pac-ana",
    nombres: "Ana Lucía",
    apellidos: "Quispe Huamán",
    historiaClinica: "2026-04871",
    edad: 7.2,
    sexo: "F",
    fototipo: "IV",
    departamento: "Amazonas",
    provincia: "Bagua",
    horas: 9,
    puedeViajar: false,
    impedimento: "Costo del pasaje y trabajo del apoderado",
    etapa: "mantenimiento",
    diasEnEtapa: 120,
    apoderado: "Rosa Quispe",
    parentesco: "madre",
    celular: "987654321",
    canal: "whatsapp",
    salida: "18:30",
    sinHorario: false,
    michi: "Nube",
    serie: "MC-3F7A21C0",
    codigo: "3F7A-21C0-0A11",
    base: 1150,
    amplitud: 260,
    final: { anc: 1180, inferior: 610, superior: 2290, temperatura: 36.8, horasAtras: 30 },
    silencioHoras: 6,
    bateria: 78,
    silenciamientos: 0,
    emitidas: 34,
    atendidas: 31,
    cateter: false,
    enEstudio: true,
  },
  {
    id: "pac-diego",
    nombres: "Diego",
    apellidos: "Mamani Condori",
    historiaClinica: "2025-03112",
    edad: 5.4,
    sexo: "M",
    fototipo: "V",
    departamento: "Puno",
    provincia: "Azángaro",
    horas: 20,
    puedeViajar: false,
    impedimento: "Tres hijos menores a cargo",
    etapa: "mantenimiento",
    diasEnEtapa: 210,
    apoderado: "Julia Condori",
    parentesco: "madre",
    celular: "956781234",
    canal: "sms",
    salida: "19:00",
    sinHorario: false,
    michi: "Pelusa",
    serie: "MC-9B2E4471",
    codigo: "9B2E-4471-0D1E",
    base: 760,
    amplitud: 240,
    final: { anc: 390, inferior: 164, superior: 936, temperatura: 37.1, horasAtras: 3 },
    silencioHoras: 0.7,
    bateria: 41,
    silenciamientos: 1,
    emitidas: 52,
    atendidas: 41,
    cateter: false,
    enEstudio: true,
  },
  {
    id: "pac-mateo",
    nombres: "Mateo",
    apellidos: "Ríos Paredes",
    historiaClinica: "2026-05590",
    edad: 9.1,
    sexo: "M",
    fototipo: "IV",
    departamento: "Loreto",
    provincia: "Maynas",
    horas: 2,
    puedeViajar: true,
    impedimento: "",
    etapa: "intensificacion",
    diasEnEtapa: 30,
    apoderado: "Luis Ríos",
    parentesco: "padre",
    celular: "943210987",
    canal: "llamada",
    salida: "17:30",
    sinHorario: false,
    michi: "Tigre",
    serie: "MC-C104D8AA",
    codigo: "C104-D8AA-0A7E",
    base: 560,
    amplitud: 200,
    final: { anc: 180, inferior: 76, superior: 432, temperatura: 38.6, horasAtras: 0.2 },
    silencioHoras: 0.2,
    bateria: 63,
    silenciamientos: 0,
    emitidas: 19,
    atendidas: 18,
    cateter: true,
    enEstudio: true,
  },
  {
    id: "pac-valentina",
    nombres: "Valentina",
    apellidos: "Huamán Torres",
    historiaClinica: "2025-02233",
    edad: 4.8,
    sexo: "F",
    fototipo: "III",
    departamento: "Junín",
    provincia: "Huancayo",
    horas: 7,
    puedeViajar: true,
    impedimento: "",
    etapa: "mantenimiento",
    diasEnEtapa: 300,
    apoderado: "Carmen Torres",
    parentesco: "madre",
    celular: "921334455",
    canal: "app",
    salida: "18:00",
    sinHorario: false,
    michi: "Copito",
    serie: "MC-77E0B3F2",
    codigo: "77E0-B3F2-0B0A",
    base: 1300,
    amplitud: 280,
    final: { anc: 1420, inferior: 760, superior: 2750, temperatura: null, horasAtras: 60 },
    silencioHoras: 50,
    bateria: 22,
    silenciamientos: 2,
    emitidas: 61,
    atendidas: 39,
    cateter: false,
    enEstudio: false,
  },
  {
    id: "pac-joaquin",
    nombres: "Joaquín",
    apellidos: "Ccahuana Mamani",
    historiaClinica: "2026-06104",
    edad: 11.3,
    sexo: "M",
    fototipo: "V",
    departamento: "Cusco",
    provincia: "Quispicanchi",
    horas: 21,
    puedeViajar: false,
    impedimento: "El apoderado perdió el trabajo",
    etapa: "mantenimiento",
    diasEnEtapa: 400,
    apoderado: "Marta Mamani",
    parentesco: "abuela",
    celular: "934567812",
    canal: "llamada",
    salida: "20:00",
    sinHorario: true,
    michi: "Misha",
    serie: "MC-51AC90DD",
    codigo: "51AC-90DD-0C0C",
    base: 1050,
    amplitud: 240,
    final: { anc: 980, inferior: 560, superior: 2010, temperatura: null, horasAtras: 130 },
    silencioHoras: 121,
    bateria: 8,
    silenciamientos: 4,
    emitidas: 47,
    atendidas: 19,
    cateter: false,
    enEstudio: true,
  },
  {
    id: "pac-camila",
    nombres: "Camila",
    apellidos: "Flores Vega",
    historiaClinica: "2026-04002",
    edad: 6.6,
    sexo: "F",
    fototipo: "III",
    departamento: "Lima",
    provincia: "Lima",
    horas: 0.5,
    puedeViajar: true,
    impedimento: "",
    etapa: "induccion",
    diasEnEtapa: 18,
    apoderado: "Ana Vega",
    parentesco: "madre",
    celular: "999112233",
    canal: "app",
    salida: "18:00",
    sinHorario: false,
    michi: "Luna",
    serie: "MC-2D8F16BB",
    codigo: "2D8F-16BB-0CA1",
    base: 1500,
    amplitud: 380,
    final: { anc: 1620, inferior: 880, superior: 3150, temperatura: 36.6, horasAtras: 4 },
    silencioHoras: 3,
    bateria: 91,
    silenciamientos: 0,
    emitidas: 22,
    atendidas: 22,
    cateter: true,
    enEstudio: false,
  },
];

export const CODIGO_DEMO = PERFILES_DEMO[0]!.codigo;

const VALORES_FORZADOS: Readonly<Record<string, Readonly<Record<number, number>>>> = {
  "pac-diego": { 4: 430 },
  "pac-mateo": { 0: 380, 4: 450 },
};

function fechaNacimiento(edad: number, ahora: Date): string {
  return fechaLocalISO(new Date(ahora.getTime() - edad * 365.25 * MS_DIA));
}

function iso(t: number): string {
  return new Date(t).toISOString();
}

function trayectoria(rng: Aleatorio, n: number, base: number, amplitud: number, final: number): number[] {
  const valores: number[] = [];
  let v = base;
  for (let i = 0; i < n - 1; i++) {
    v += normal(rng, 0, amplitud * 0.45);
    v = Math.min(2600, Math.max(140, v * 0.85 + base * 0.15));
    valores.push(Math.round(v));
  }
  valores.push(final);
  return valores;
}

export async function generarDemostracion(ahora: Date = new Date(), semilla = 2026): Promise<DatosDemostracion> {
  const rng = sembrado(semilla);
  const pacientes: Paciente[] = [];
  const tamizajes: Tamizaje[] = [];
  const hemogramas: Hemograma[] = [];
  const citas: Cita[] = [];
  const teleconsultas: Teleconsulta[] = [];
  const referencias: Referencia[] = [];
  const michis: Michi[] = [];
  const latidos: Latido[] = [];
  const participantes: Participante[] = [];
  const hoy = fechaLocalISO(ahora);
  let numeroEstudio = 0;

  for (const p of PERFILES_DEMO) {
    const perfil = PERFILES[p.etapa];
    const fraccionAnclada = Math.round(fraccionNeutrofilos(p.edad) * uniforme(rng, 0.9, 1.1) * 100) / 100;
    const entregado = ahora.getTime() - Math.max(60, p.diasEnEtapa + 20) * MS_DIA;
    const paciente: Paciente = {
      id: p.id,
      historiaClinica: p.historiaClinica,
      nombres: p.nombres,
      apellidos: p.apellidos,
      fechaNacimiento: fechaNacimiento(p.edad, ahora),
      sexo: p.sexo,
      diagnostico: "Leucemia linfoblástica aguda",
      fototipo: p.fototipo,
      etapa: p.etapa,
      inicioEtapa: sumarDias(hoy, -p.diasEnEtapa),
      medicoAsignado: "Dra. Hematología Pediátrica",
      cmpMedico: "",
      cateterCentral: p.cateter,
      fraccionNeutrofilos: fraccionAnclada,
      apoderado: {
        nombre: p.apoderado,
        parentesco: p.parentesco,
        celular: p.celular,
        canalPreferido: p.canal,
        finJornada: p.salida,
        sinHorarioFijo: p.sinHorario,
        segundoContacto: "",
        correo: "",
      },
      domicilio: {
        departamento: p.departamento,
        provincia: p.provincia,
        distrito: "",
        horasAlInsn: p.horas,
        puedeViajarALima: p.puedeViajar,
        motivoImpedimento: p.impedimento,
      },
      nombreMichi: p.michi,
      serieMichi: p.serie,
      codigoVinculacion: p.codigo,
      entregadoEn: iso(entregado),
      seguimiento: "activo",
      creado: iso(entregado),
      actualizado: iso(ahora.getTime() - 3 * MS_DIA),
    };
    pacientes.push(paciente);

    const paso = perfil.diasEntreTamizajes;
    const n = 9;
    const valores = trayectoria(rng, n, p.base, p.amplitud, p.final.anc).map((v, i) => VALORES_FORZADOS[p.id]?.[i] ?? v);
    const finalMs = ahora.getTime() - p.final.horasAtras * MS_HORA;
    const propios: Tamizaje[] = [];
    const hemogramasPropios: Hemograma[] = [];

    for (let i = 0; i < n; i++) {
      const esUltimo = i === n - 1;
      const momentoMs = finalMs - (n - 1 - i) * paso * MS_DIA;
      const real = valores[i] as number;
      if (!esUltimo && (n - 1 - i) % 4 === 0) {
        const fecha = iso(momentoMs - uniforme(rng, 1, 6) * MS_HORA);
        const frac = fraccionAnclada;
        hemogramasPropios.push({
          id: `hem-${p.id}-${i}`,
          pacienteId: p.id,
          fecha,
          anc: Math.round(real * uniforme(rng, 0.92, 1.08)),
          leucocitos: Math.round(real / frac),
          fraccionNeutrofilos: Math.round(frac * 100) / 100,
          hemoglobina: Math.round(uniforme(rng, 9.5, 12.5) * 10) / 10,
          plaquetas: Math.round(uniforme(rng, 140, 320)) * 1000,
          laboratorio: "Laboratorio central · INSN San Borja",
          observaciones: "",
        });
      }
      const sim = simularTamizaje({ ancReal: real, edadAnios: p.edad, rng, probabilidadDeFallo: 0.03, fraccionPaciente: fraccionAnclada });
      const entrada: EntradaTamizaje = {
        id: `tam-${p.id}-${i}`,
        pacienteId: p.id,
        momento: iso(momentoMs),
        origen: "demo",
        serie: p.serie,
        concluyente: esUltimo ? true : sim.concluyente,
        ancEstimado: esUltimo ? p.final.anc : sim.ancEstimado,
        icInferior: esUltimo ? p.final.inferior : sim.icInferior,
        icSuperior: esUltimo ? p.final.superior : sim.icSuperior,
        capilares: sim.capilares,
        eventos: sim.eventos,
        volumenNl: sim.volumenNl,
        razones: esUltimo ? [] : [...sim.razones],
        temperaturaC: esUltimo ? p.final.temperatura : Math.round(uniforme(rng, 36.2, 37.2) * 10) / 10,
        fiebreSostenida: false,
        diasPostQuimio: null,
        simulado: true,
      };
      propios.push(completarTamizaje(entrada, paciente, hemogramaPrevio(hemogramasPropios, p.id, entrada.momento)));
    }
    tamizajes.push(...propios);
    hemogramas.push(...hemogramasPropios);

    for (let k = -1; k <= 2; k++) {
      const fecha = sumarDias(hoy, k === -1 ? -Math.min(perfil.diasEntreControles, 25) : 2 + (k - 0) * perfil.diasEntreControles);
      citas.push({
        id: `cit-${p.id}-${k + 1}`,
        pacienteId: p.id,
        fecha,
        hora: k === 0 ? "09:00" : null,
        tipo: k === 1 ? "hemograma" : "control",
        lugar: k === 1 ? "Laboratorio · INSN San Borja" : "Hematología · INSN San Borja",
        asistio: k === -1 ? p.atendidas / p.emitidas > 0.6 : null,
      });
    }

    const ultimoLatido = ahora.getTime() - p.silencioHoras * MS_HORA;
    for (let j = 11; j >= 0; j--) {
      const momento = ultimoLatido - j * 6 * MS_HORA;
      if (momento < entregado) continue;
      latidos.push({
        id: `lat-${p.serie}-${j}`,
        serie: p.serie,
        momento: iso(momento),
        origen: "simulador",
        bateriaPct: Math.min(100, p.bateria + j * 2),
        rssiDbm: -60 - Math.round(uniforme(rng, 0, 20)),
        firmware: "0.3.0",
        tamizajesEnCola: 0,
        alertasEmitidas: Math.max(0, p.emitidas - j),
        alertasAtendidas: Math.max(0, p.atendidas - Math.ceil(j / 2)),
        silenciamientos: j === 0 ? p.silenciamientos : Math.max(0, p.silenciamientos - 1),
        escalado: p.silenciamientos >= 3 && j === 0,
      });
    }
    michis.push({
      id: p.serie,
      serie: p.serie,
      pacienteId: p.id,
      codigoHash: await sha256Hex(normalizarCodigo(p.codigo)),
      nombre: p.michi,
      firmware: "0.3.0",
      entregadoEn: iso(entregado),
      estado: "activo",
      ultimoLatido: {
        momento: iso(ultimoLatido),
        bateriaPct: p.bateria,
        tamizajesEnCola: 0,
        alertasEmitidas: p.emitidas,
        alertasAtendidas: p.atendidas,
        silenciamientos: p.silenciamientos,
      },
    });

    const ultimo = propios[propios.length - 1] as Tamizaje;
    if (ultimo.estado !== "estable") {
      teleconsultas.push({
        id: `tc-${p.id}`,
        pacienteId: p.id,
        tamizajeId: ultimo.id,
        creada: iso(Date.parse(ultimo.momento) + 5 * 60_000),
        prioridad: ultimo.estado === "priorizable" ? "tiempo_real" : "diferida",
        estado: "abierta",
        origen: "familia",
        pregunta:
          ultimo.estado === "priorizable"
            ? "Tamizaje compatible con neutropenia grave con fiebre. ¿Confirma antibiótico de amplio espectro e ingreso por emergencia?"
            : "Tamizaje por debajo de la ventana terapéutica sin fiebre. ¿Ajusta la 6-MP y repetimos en 48 h, o indica hemograma confirmatorio?",
        respuesta: "",
        respondidaEn: null,
        responsable: "Dra. Hematología Pediátrica",
        puedeViajarALima: p.puedeViajar,
      });
      if (!p.puedeViajar) {
        const prop = proponerReferencia(paciente.domicilio, ultimo.escaladoPorFiebre ? "neutropenia_febril" : "hemograma_de_control");
        referencias.push({
          id: `ref-${p.id}`,
          pacienteId: p.id,
          creada: iso(Date.parse(ultimo.momento) + 20 * 60_000),
          motivo: prop.motivo,
          capacidadesRequeridas: prop.capacidadesRequeridas,
          destinoCodigo: prop.destino.codigo,
          destinoNombre: prop.destino.nombre,
          destinoCiudad: prop.destino.ciudad,
          destinoDepartamento: prop.destino.departamento,
          alternativas: prop.alternativas.map((c) => `${c.nombre} (${c.ciudad})`),
          horasEvitadas: prop.horasDeViajeEvitadas,
          justificacion: prop.justificacion,
          advertencias: prop.advertencias,
          emitidaPor: "Teleconsulta · Dra. Hematología Pediátrica",
          estado: "emitida",
        });
      }
    }

    if (p.enEstudio) {
      numeroEstudio += 1;
      const inclusion = sumarDias(hoy, -Math.min(70, p.diasEnEtapa));
      const aplica = p.edad >= 8;
      participantes.push({
        id: `par-${p.id}`,
        codigoEstudio: `MCK-E-${String(numeroEstudio).padStart(3, "0")}`,
        pacienteId: p.id,
        fechaInclusion: inclusion,
        consentimiento: { fecha: inclusion, version: "v1.0", otorgadoPor: p.apoderado, parentesco: p.parentesco },
        asentimiento: { aplica, otorgado: aplica, fecha: aplica ? inclusion : null },
        fototipoVerificado: p.fototipo,
        estado: "activo",
        fechaRetiro: null,
        motivoRetiro: "",
        observaciones: "",
      });
    }
  }

  return {
    clinica: { pacientes, tamizajes, hemogramas, citas, teleconsultas, referencias },
    dispositivos: { michis, latidos },
    investigacion: { participantes },
  };
}
