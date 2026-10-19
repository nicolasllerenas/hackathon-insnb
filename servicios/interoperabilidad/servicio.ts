import type { Almacen } from "../../compartido/almacen/tipos.js";
import { validar, type InfoSalud, type Volcado } from "../../compartido/contratos/comunes.js";
import type { Paciente, Tamizaje } from "../../compartido/contratos/clinica.js";
import {
  COLECCIONES_INTEROP,
  SolicitudMensaje,
  type ApiInteroperabilidad,
  type Mensaje,
} from "../../compartido/contratos/interoperabilidad.js";
import {
  construirBundleFhir,
  construirOruR01,
  type PacienteInterop,
  type TamizajeInterop,
} from "../../compartido/dominio/interop.js";
import { ErrorMichi, noEncontrado } from "../../compartido/errores.js";
import { exportarColecciones, importarColecciones, informeDeSalud, vaciarColecciones } from "../../compartido/servicioBase.js";

const C = COLECCIONES_INTEROP;
const LISTA = [C.mensajes] as const;

export function pacienteInterop(p: Paciente): PacienteInterop {
  return {
    historiaClinica: p.historiaClinica,
    nombres: p.nombres,
    apellidos: p.apellidos,
    fechaNacimiento: p.fechaNacimiento,
    sexo: p.sexo,
    departamento: p.domicilio.departamento,
    provincia: p.domicilio.provincia,
  };
}

export function tamizajeInterop(t: Tamizaje): TamizajeInterop {
  return {
    id: t.id,
    momento: t.momento,
    concluyente: t.concluyente,
    ancEstimado: t.ancEstimado,
    icInferior: t.icInferior,
    icSuperior: t.icSuperior,
    capilares: t.capilares,
    eventos: t.eventos,
    volumenNl: t.volumenNl,
    nivelTriaje: t.nivelTriaje,
    estado: t.estado,
    titulo: t.titulo,
    accion: t.accion,
    razones: t.razones,
    temperaturaC: t.temperaturaC,
    simulado: t.simulado,
  };
}

export class ServicioInteroperabilidad implements ApiInteroperabilidad {
  constructor(
    private readonly almacen: Almacen,
    private readonly reloj: () => Date = () => new Date(),
  ) {}

  salud(): Promise<InfoSalud> {
    return informeDeSalud("interoperabilidad", this.almacen, LISTA);
  }

  async generarMensaje(solicitud: SolicitudMensaje): Promise<Mensaje> {
    const s = validar(SolicitudMensaje, solicitud, "Solicitud de mensaje");
    if (s.tamizaje.pacienteId !== s.paciente.id) {
      throw new ErrorMichi("validacion", "El tamizaje no pertenece al paciente indicado");
    }
    const ahora = this.reloj();
    const id = `msg-${globalThis.crypto.randomUUID()}`;
    const michi = s.michi ? { serie: s.michi.serie, firmware: s.michi.firmware, enlace: s.michi.enlace, bateriaPct: s.michi.bateriaPct } : null;
    const contenido =
      s.formato === "hl7v2"
        ? construirOruR01(pacienteInterop(s.paciente), tamizajeInterop(s.tamizaje), michi, `MCK${ahora.getTime().toString(36).toUpperCase()}`, ahora)
        : JSON.stringify(construirBundleFhir(pacienteInterop(s.paciente), tamizajeInterop(s.tamizaje), michi, ahora), null, 2);
    const mensaje: Mensaje = {
      id,
      pacienteId: s.paciente.id,
      tamizajeId: s.tamizaje.id,
      formato: s.formato,
      contenido,
      creado: ahora.toISOString(),
      estado: "pendiente",
      destino: "GALENUS",
      nota: "En bandeja de salida. El envío a Galenus requiere el endpoint y las credenciales de la OGTI del INSN San Borja.",
    };
    return s.guardar ? this.almacen.guardar(C.mensajes, mensaje) : mensaje;
  }

  listarMensajes(pacienteId?: string): Promise<Mensaje[]> {
    return this.almacen.listar(C.mensajes, { ...(pacienteId ? { donde: { pacienteId } } : {}), ordenarPor: "creado", descendente: true });
  }

  async eliminarMensaje(id: string): Promise<void> {
    if (!(await this.almacen.eliminar(C.mensajes, id))) throw noEncontrado("El mensaje");
  }

  exportar(): Promise<Volcado> {
    return exportarColecciones(this.almacen, LISTA);
  }

  importar(volcado: Volcado): Promise<Record<string, number>> {
    return importarColecciones(this.almacen, LISTA, volcado);
  }

  vaciar(): Promise<void> {
    return vaciarColecciones(this.almacen, LISTA);
  }
}
