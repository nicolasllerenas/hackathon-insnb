import type { InfoSalud, Volcado } from "../contratos/comunes.js";
import type {
  ApiClinica,
  Cita,
  ColeccionDePaciente,
  EntradaTamizaje,
  Paciente,
  RegistroClinico,
  RespuestaTeleconsultaFamilia,
  ResumenFamilia,
  SolicitudTeleconsultaFamilia,
  Tamizaje,
} from "../contratos/clinica.js";
import type { ApiDispositivos, EntradaLatido, EstadoMichi, Latido, Michi, RegistroMichi } from "../contratos/dispositivos.js";
import type { ApiInteroperabilidad, Mensaje, SolicitudMensaje } from "../contratos/interoperabilidad.js";
import type { ApiInvestigacion, Participante } from "../contratos/investigacion.js";
import { ClienteHttp, segmento as s, type OpcionesCliente } from "./http.js";

const VACIAR = { confirmar: "VACIAR" };

export class ClienteClinica implements ApiClinica {
  private readonly http: ClienteHttp;
  constructor(opciones: OpcionesCliente) {
    this.http = new ClienteHttp(opciones);
  }
  salud = () => this.http.pedir<InfoSalud>("GET", "/salud");
  listarPacientes = () => this.http.pedir<Paciente[]>("GET", "/pacientes");
  obtenerPaciente = (id: string) => this.http.pedir<Paciente>("GET", `/pacientes/${s(id)}`);
  guardarPaciente = (p: Paciente) => this.http.pedir<Paciente>("PUT", `/pacientes/${s(p.id)}`, p);
  eliminarPaciente = async (id: string) => {
    await this.http.pedir<null>("DELETE", `/pacientes/${s(id)}`);
  };
  listarRegistros = <K extends ColeccionDePaciente>(coleccion: K, pacienteId?: string) =>
    this.http.pedir<RegistroClinico[K][]>("GET", `/registros/${s(coleccion)}${pacienteId ? `?pacienteId=${s(pacienteId)}` : ""}`);
  guardarRegistro = <K extends Exclude<ColeccionDePaciente, "tamizajes">>(coleccion: K, registro: RegistroClinico[K]) =>
    this.http.pedir<RegistroClinico[K]>("PUT", `/registros/${s(coleccion)}/${s(registro.id)}`, registro);
  eliminarRegistro = async (coleccion: ColeccionDePaciente, id: string) => {
    await this.http.pedir<null>("DELETE", `/registros/${s(coleccion)}/${s(id)}`);
  };
  registrarTamizaje = (entrada: EntradaTamizaje) => this.http.pedir<Tamizaje>("POST", "/tamizajes", entrada);
  resumenFamilia = (codigo: string) => this.http.pedir<ResumenFamilia>("GET", `/familia/${s(codigo)}`);
  registrarTamizajeFamilia = (codigo: string, entrada: EntradaTamizaje) =>
    this.http.pedir<Tamizaje>("POST", `/familia/${s(codigo)}/tamizajes`, entrada);
  solicitarTeleconsultaFamilia = (codigo: string, solicitud: SolicitudTeleconsultaFamilia) =>
    this.http.pedir<RespuestaTeleconsultaFamilia>("POST", `/familia/${s(codigo)}/teleconsultas`, solicitud);
  marcarCitaFamilia = (codigo: string, citaId: string, asistio: boolean) =>
    this.http.pedir<Cita>("PUT", `/familia/${s(codigo)}/citas/${s(citaId)}`, { asistio });
  exportar = () => this.http.pedir<Volcado>("GET", "/_exportar");
  importar = (volcado: Volcado) => this.http.pedir<Record<string, number>>("POST", "/_importar", volcado);
  vaciar = async () => {
    await this.http.pedir<null>("POST", "/_vaciar", VACIAR);
  };
}

export class ClienteDispositivos implements ApiDispositivos {
  private readonly http: ClienteHttp;
  constructor(opciones: OpcionesCliente) {
    this.http = new ClienteHttp(opciones);
  }
  salud = () => this.http.pedir<InfoSalud>("GET", "/salud");
  listarMichis = () => this.http.pedir<Michi[]>("GET", "/michis");
  obtenerMichi = (serie: string) => this.http.pedir<Michi>("GET", `/michis/${s(serie)}`);
  registrarMichi = (registro: RegistroMichi) => this.http.pedir<Michi>("POST", "/michis", registro);
  cambiarEstado = (serie: string, estado: Michi["estado"]) => this.http.pedir<Michi>("PUT", `/michis/${s(serie)}/estado`, { estado });
  eliminarMichi = async (serie: string) => {
    await this.http.pedir<null>("DELETE", `/michis/${s(serie)}`);
  };
  registrarLatido = (serie: string, codigo: string, entrada: EntradaLatido) =>
    this.http.pedir<Latido>("POST", `/michis/${s(serie)}/latidos`, entrada, { "x-michi-codigo": codigo });
  registrarLatidoClinico = (serie: string, entrada: EntradaLatido) =>
    this.http.pedir<Latido>("POST", `/michis/${s(serie)}/latidos-clinicos`, entrada);
  listarLatidos = (serie: string, limite = 50) => this.http.pedir<Latido[]>("GET", `/michis/${s(serie)}/latidos?limite=${limite}`);
  parque = () => this.http.pedir<EstadoMichi[]>("GET", "/parque");
  exportar = () => this.http.pedir<Volcado>("GET", "/_exportar");
  importar = (volcado: Volcado) => this.http.pedir<Record<string, number>>("POST", "/_importar", volcado);
  vaciar = async () => {
    await this.http.pedir<null>("POST", "/_vaciar", VACIAR);
  };
}

export class ClienteInteroperabilidad implements ApiInteroperabilidad {
  private readonly http: ClienteHttp;
  constructor(opciones: OpcionesCliente) {
    this.http = new ClienteHttp(opciones);
  }
  salud = () => this.http.pedir<InfoSalud>("GET", "/salud");
  generarMensaje = (solicitud: SolicitudMensaje) => this.http.pedir<Mensaje>("POST", "/mensajes", solicitud);
  listarMensajes = (pacienteId?: string) => this.http.pedir<Mensaje[]>("GET", `/mensajes${pacienteId ? `?pacienteId=${s(pacienteId)}` : ""}`);
  eliminarMensaje = async (id: string) => {
    await this.http.pedir<null>("DELETE", `/mensajes/${s(id)}`);
  };
  exportar = () => this.http.pedir<Volcado>("GET", "/_exportar");
  importar = (volcado: Volcado) => this.http.pedir<Record<string, number>>("POST", "/_importar", volcado);
  vaciar = async () => {
    await this.http.pedir<null>("POST", "/_vaciar", VACIAR);
  };
}

export class ClienteInvestigacion implements ApiInvestigacion {
  private readonly http: ClienteHttp;
  constructor(opciones: OpcionesCliente) {
    this.http = new ClienteHttp(opciones);
  }
  salud = () => this.http.pedir<InfoSalud>("GET", "/salud");
  listarParticipantes = () => this.http.pedir<Participante[]>("GET", "/participantes");
  guardarParticipante = (p: Participante) => this.http.pedir<Participante>("PUT", `/participantes/${s(p.id)}`, p);
  eliminarParticipante = async (id: string) => {
    await this.http.pedir<null>("DELETE", `/participantes/${s(id)}`);
  };
  siguienteCodigo = () => this.http.pedir<string>("GET", "/codigo-siguiente");
  exportar = () => this.http.pedir<Volcado>("GET", "/_exportar");
  importar = (volcado: Volcado) => this.http.pedir<Record<string, number>>("POST", "/_importar", volcado);
  vaciar = async () => {
    await this.http.pedir<null>("POST", "/_vaciar", VACIAR);
  };
}
