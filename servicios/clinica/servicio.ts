import type { Almacen } from "../../compartido/almacen/tipos.js";
import { validar, type DefinicionColeccion, type InfoSalud, type Volcado } from "../../compartido/contratos/comunes.js";
import {
  COLECCIONES_CLINICA,
  EntradaTamizaje,
  Paciente,
  SolicitudTeleconsultaFamilia,
  type ApiClinica,
  type Cita,
  type ColeccionDePaciente,
  type Hemograma,
  type Referencia,
  type RegistroClinico,
  type ResumenFamilia,
  type RespuestaTeleconsultaFamilia,
  type Tamizaje,
  type Teleconsulta,
} from "../../compartido/contratos/clinica.js";
import { completarTamizaje } from "../../compartido/aplicacion/tamizaje.js";
import { motivoDeReferencia } from "../../compartido/dominio/estados.js";
import { edadEnAnios } from "../../compartido/dominio/fechas.js";
import { normalizarCodigo } from "../../compartido/dominio/identificadores.js";
import { proponerReferencia } from "../../compartido/dominio/referencias.js";
import type { ContextoClinico } from "../../compartido/dominio/triaje.js";
import { ErrorMichi, noEncontrado } from "../../compartido/errores.js";
import {
  exportarColecciones,
  informeDeSalud,
  validarVolcado,
  vaciarColecciones,
} from "../../compartido/servicioBase.js";

const C = COLECCIONES_CLINICA;
const LISTA = [C.pacientes, C.tamizajes, C.hemogramas, C.citas, C.teleconsultas, C.referencias] as const;
const DE_PACIENTE: readonly ColeccionDePaciente[] = ["tamizajes", "hemogramas", "citas", "teleconsultas", "referencias"];

interface RegistroGenerico {
  id: string;
  pacienteId: string;
}

function definicion(coleccion: string): DefinicionColeccion<RegistroGenerico> {
  if (!DE_PACIENTE.includes(coleccion as ColeccionDePaciente)) {
    throw new ErrorMichi("validacion", `Colección desconocida: ${coleccion}`);
  }
  return C[coleccion as ColeccionDePaciente] as unknown as DefinicionColeccion<RegistroGenerico>;
}

export class ServicioClinica implements ApiClinica {
  constructor(
    private readonly almacen: Almacen,
    private readonly reloj: () => Date = () => new Date(),
  ) {}

  salud(): Promise<InfoSalud> {
    return informeDeSalud("clinica", this.almacen, LISTA);
  }

  listarPacientes(): Promise<Paciente[]> {
    return this.almacen.listar(C.pacientes);
  }

  async obtenerPaciente(id: string): Promise<Paciente> {
    const p = await this.almacen.obtener(C.pacientes, id);
    if (!p) throw noEncontrado("El paciente");
    return p;
  }

  async guardarPaciente(entrada: Paciente): Promise<Paciente> {
    const ahora = this.reloj();
    const previo = await this.almacen.obtener(C.pacientes, String((entrada as { id?: unknown }).id ?? ""));
    const paciente = validar(
      Paciente,
      { ...entrada, creado: previo?.creado ?? entrada.creado ?? ahora.toISOString(), actualizado: ahora.toISOString() },
      "Paciente",
    );
    const nacimiento = Date.parse(`${paciente.fechaNacimiento}T00:00:00Z`);
    if (nacimiento > ahora.getTime()) {
      throw new ErrorMichi("validacion", "Paciente inválido", [{ campo: "fechaNacimiento", mensaje: "No puede ser futura" }]);
    }
    if (edadEnAnios(paciente.fechaNacimiento, ahora) > 18.99) {
      throw new ErrorMichi("validacion", "Paciente inválido", [{ campo: "fechaNacimiento", mensaje: "Paciente fuera de la edad pediátrica" }]);
    }
    if (!paciente.domicilio.puedeViajarALima && !paciente.domicilio.motivoImpedimento.trim()) {
      paciente.domicilio.motivoImpedimento = "No declarado";
    }
    return this.almacen.guardar(C.pacientes, paciente);
  }

  async eliminarPaciente(id: string): Promise<void> {
    await this.obtenerPaciente(id);
    for (const nombre of DE_PACIENTE) await this.almacen.eliminarDonde(definicion(nombre), "pacienteId", id);
    await this.almacen.eliminar(C.pacientes, id);
  }

  async listarRegistros<K extends ColeccionDePaciente>(coleccion: K, pacienteId?: string): Promise<RegistroClinico[K][]> {
    const def = definicion(coleccion);
    const lista = await this.almacen.listar(def, pacienteId ? { donde: { pacienteId } } : {});
    return lista as unknown as RegistroClinico[K][];
  }

  async guardarRegistro<K extends Exclude<ColeccionDePaciente, "tamizajes">>(
    coleccion: K,
    registro: RegistroClinico[K],
  ): Promise<RegistroClinico[K]> {
    if ((coleccion as string) === "tamizajes") {
      throw new ErrorMichi("validacion", "Los tamizajes se registran con registrarTamizaje para recalcular el triaje");
    }
    const def = definicion(coleccion);
    const valido = validar(def.esquema, registro, "Registro");
    await this.obtenerPaciente(valido.pacienteId);
    const guardado = await this.almacen.guardar(def, valido);
    return guardado as unknown as RegistroClinico[K];
  }

  async eliminarRegistro(coleccion: ColeccionDePaciente, id: string): Promise<void> {
    const borrado = await this.almacen.eliminar(definicion(coleccion), id);
    if (!borrado) throw noEncontrado("El registro");
  }

  private async ultimoHemograma(pacienteId: string, antesDe: string): Promise<Hemograma | null> {
    const lista = await this.almacen.listar(C.hemogramas, { donde: { pacienteId }, ordenarPor: "fecha", descendente: true });
    return lista.find((h) => h.fecha <= antesDe) ?? null;
  }

  async registrarTamizaje(entrada: EntradaTamizaje): Promise<Tamizaje> {
    const datos = validar(EntradaTamizaje, entrada, "Tamizaje");
    const paciente = await this.obtenerPaciente(datos.pacienteId);
    const momento = new Date(datos.momento);
    if (momento.getTime() > this.reloj().getTime() + 10 * 60_000) {
      throw new ErrorMichi("validacion", "Tamizaje inválido", [{ campo: "momento", mensaje: "No puede estar en el futuro" }]);
    }
    const hemograma = await this.ultimoHemograma(paciente.id, datos.momento);
    const tamizaje = completarTamizaje(datos, paciente, hemograma);
    return this.almacen.guardar(C.tamizajes, tamizaje);
  }

  private async pacientePorCodigo(codigo: string): Promise<Paciente> {
    const normalizado = normalizarCodigo(codigo);
    if (!/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/.test(normalizado)) throw new ErrorMichi("validacion", "Código de vinculación inválido");
    const [paciente] = await this.almacen.listar(C.pacientes, { donde: { codigoVinculacion: normalizado }, limite: 1 });
    if (!paciente || paciente.seguimiento !== "activo") throw new ErrorMichi("no_encontrado", "No hay ningún michi vinculado con ese código");
    return paciente;
  }

  async resumenFamilia(codigo: string): Promise<ResumenFamilia> {
    const p = await this.pacientePorCodigo(codigo);
    const [citas, tamizajes] = await Promise.all([
      this.almacen.listar(C.citas, { donde: { pacienteId: p.id }, ordenarPor: "fecha" }),
      this.almacen.listar(C.tamizajes, { donde: { pacienteId: p.id }, ordenarPor: "momento", descendente: true, limite: 30 }),
    ]);
    return {
      pacienteId: p.id,
      nombres: p.nombres,
      nombreMichi: p.nombreMichi,
      serieMichi: p.serieMichi,
      etapa: p.etapa,
      inicioEtapa: p.inicioEtapa,
      fechaNacimiento: p.fechaNacimiento,
      finJornada: p.apoderado.finJornada,
      sinHorarioFijo: p.apoderado.sinHorarioFijo,
      departamento: p.domicilio.departamento,
      provincia: p.domicilio.provincia,
      horasAlInsn: p.domicilio.horasAlInsn,
      puedeViajarALima: p.domicilio.puedeViajarALima,
      citas,
      tamizajes: tamizajes.reverse(),
    };
  }

  async registrarTamizajeFamilia(codigo: string, entrada: EntradaTamizaje): Promise<Tamizaje> {
    const p = await this.pacientePorCodigo(codigo);
    const origen = entrada.origen === "michi" ? "michi" : "app";
    return this.registrarTamizaje({ ...entrada, pacienteId: p.id, origen, serie: p.serieMichi });
  }

  async solicitarTeleconsultaFamilia(codigo: string, solicitud: SolicitudTeleconsultaFamilia): Promise<RespuestaTeleconsultaFamilia> {
    const s = validar(SolicitudTeleconsultaFamilia, solicitud, "Solicitud");
    const p = await this.pacientePorCodigo(codigo);
    const t = await this.almacen.obtener(C.tamizajes, s.tamizajeId);
    if (!t || t.pacienteId !== p.id) throw noEncontrado("El tamizaje");
    const ahora = this.reloj().toISOString();
    const urgente = t.estado === "priorizable";
    const fiebre = t.temperaturaC !== null ? ` con fiebre de ${t.temperaturaC.toFixed(1)} °C` : "";
    const teleconsulta: Teleconsulta = {
      id: `tc-${globalThis.crypto.randomUUID()}`,
      pacienteId: p.id,
      tamizajeId: t.id,
      creada: ahora,
      prioridad: urgente ? "tiempo_real" : "diferida",
      estado: "abierta",
      origen: "familia",
      pregunta: urgente
        ? `Tamizaje compatible con neutropenia grave${fiebre}. ¿Confirma inicio de antibiótico de amplio espectro y autoriza ingreso por emergencia, o indica manejo en el establecimiento de referencia más cercano?`
        : `Tamizaje con estado ${t.estado}${fiebre}. ¿Indica hemograma confirmatorio, ajuste de 6-MP o repetir el tamizaje en 48 h?`,
      respuesta: "",
      respondidaEn: null,
      responsable: p.medicoAsignado,
      puedeViajarALima: s.puedeViajarALima,
    };
    await this.almacen.guardar(C.teleconsultas, teleconsulta);

    let referencia: Referencia | null = null;
    if (!s.puedeViajarALima && t.estado !== "estable") {
      const contexto: ContextoClinico = { edadAnios: edadEnAnios(p.fechaNacimiento), temperaturaC: t.temperaturaC, fiebreSostenida1h: t.fiebreSostenida };
      const propuesta = proponerReferencia(
        { ...p.domicilio, puedeViajarALima: false, motivoImpedimento: p.domicilio.motivoImpedimento },
        motivoDeReferencia(t.estado, contexto),
      );
      const nueva: Referencia = {
        id: `ref-${globalThis.crypto.randomUUID()}`,
        pacienteId: p.id,
        creada: ahora,
        motivo: propuesta.motivo,
        capacidadesRequeridas: propuesta.capacidadesRequeridas,
        destinoCodigo: propuesta.destino.codigo,
        destinoNombre: propuesta.destino.nombre,
        destinoCiudad: propuesta.destino.ciudad,
        destinoDepartamento: propuesta.destino.departamento,
        alternativas: propuesta.alternativas.map((c) => `${c.nombre} (${c.ciudad})`),
        horasEvitadas: propuesta.horasDeViajeEvitadas,
        justificacion: propuesta.justificacion,
        advertencias: propuesta.advertencias,
        emitidaPor: `Teleconsulta · ${p.medicoAsignado}`,
        estado: "emitida",
      };
      referencia = await this.almacen.guardar(C.referencias, nueva);
    }
    return { teleconsulta, referencia };
  }

  async marcarCitaFamilia(codigo: string, citaId: string, asistio: boolean): Promise<Cita> {
    const p = await this.pacientePorCodigo(codigo);
    const cita = await this.almacen.obtener(C.citas, citaId);
    if (!cita || cita.pacienteId !== p.id) throw noEncontrado("La cita");
    if (typeof asistio !== "boolean") throw new ErrorMichi("validacion", "Indique si asistió (sí o no)");
    return this.almacen.guardar(C.citas, { ...cita, asistio });
  }

  exportar(): Promise<Volcado> {
    return exportarColecciones(this.almacen, LISTA);
  }

  async importar(volcado: Volcado): Promise<Record<string, number>> {
    const validos = validarVolcado(LISTA, volcado);
    const existentes = new Set((await this.almacen.listar(C.pacientes)).map((p) => p.id));
    for (const p of validos.get("pacientes") ?? []) existentes.add(p.id);
    for (const nombre of DE_PACIENTE) {
      for (const r of (validos.get(nombre) ?? []) as { id: string; pacienteId: string }[]) {
        if (!existentes.has(r.pacienteId)) {
          throw new ErrorMichi("validacion", `El registro ${r.id} de ${nombre} pertenece a un paciente que no existe (${r.pacienteId})`);
        }
      }
    }
    const conteo: Record<string, number> = {};
    for (const def of LISTA) {
      const docs = validos.get(def.nombre);
      if (docs) conteo[def.nombre] = await this.almacen.guardarVarios(def as unknown as DefinicionColeccion, docs);
    }
    return conteo;
  }

  vaciar(): Promise<void> {
    return vaciarColecciones(this.almacen, LISTA);
  }
}
