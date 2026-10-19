import type { Almacen } from "../../compartido/almacen/tipos.js";
import { validar, type InfoSalud, type Volcado } from "../../compartido/contratos/comunes.js";
import { COLECCIONES_INVESTIGACION, Participante, type ApiInvestigacion } from "../../compartido/contratos/investigacion.js";
import { ErrorMichi, noEncontrado } from "../../compartido/errores.js";
import { exportarColecciones, importarColecciones, informeDeSalud, vaciarColecciones } from "../../compartido/servicioBase.js";

const C = COLECCIONES_INVESTIGACION;
const LISTA = [C.participantes] as const;

export class ServicioInvestigacion implements ApiInvestigacion {
  constructor(private readonly almacen: Almacen) {}

  salud(): Promise<InfoSalud> {
    return informeDeSalud("investigacion", this.almacen, LISTA);
  }

  listarParticipantes(): Promise<Participante[]> {
    return this.almacen.listar(C.participantes);
  }

  async guardarParticipante(entrada: Participante): Promise<Participante> {
    const p = validar(Participante, entrada, "Participante");
    const errores: { campo: string; mensaje: string }[] = [];
    if (p.asentimiento.aplica && p.asentimiento.otorgado && !p.asentimiento.fecha) {
      errores.push({ campo: "asentimiento.fecha", mensaje: "Indique la fecha del asentimiento" });
    }
    if (p.asentimiento.aplica && !p.asentimiento.otorgado && p.estado === "activo") {
      errores.push({ campo: "asentimiento.otorgado", mensaje: "Sin asentimiento del niño no puede estar activo en el estudio" });
    }
    if (p.estado === "retirado" && !p.fechaRetiro) {
      errores.push({ campo: "fechaRetiro", mensaje: "Indique la fecha de retiro" });
    }
    if (p.consentimiento.fecha > p.fechaInclusion) {
      errores.push({ campo: "consentimiento.fecha", mensaje: "El consentimiento debe ser anterior o igual a la inclusión" });
    }
    if (errores.length) throw new ErrorMichi("validacion", "Participante inválido", errores);
    return this.almacen.guardar(C.participantes, p);
  }

  async eliminarParticipante(id: string): Promise<void> {
    if (!(await this.almacen.eliminar(C.participantes, id))) throw noEncontrado("El participante");
  }

  async siguienteCodigo(): Promise<string> {
    const lista = await this.almacen.listar(C.participantes);
    const mayor = lista.reduce((max, p) => Math.max(max, Number(p.codigoEstudio.replace("MCK-E-", "")) || 0), 0);
    return `MCK-E-${String(mayor + 1).padStart(3, "0")}`;
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
