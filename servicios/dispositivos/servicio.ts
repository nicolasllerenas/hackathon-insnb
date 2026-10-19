import type { Almacen } from "../../compartido/almacen/tipos.js";
import { validar, type InfoSalud, type Volcado } from "../../compartido/contratos/comunes.js";
import {
  COLECCIONES_DISPOSITIVOS,
  EntradaLatido,
  RegistroMichi,
  type ApiDispositivos,
  type EstadoMichi,
  type Latido,
  type Michi,
} from "../../compartido/contratos/dispositivos.js";
import { evaluarEnlace } from "../../compartido/dominio/enlace.js";
import { iguales, normalizarCodigo, sha256Hex } from "../../compartido/dominio/identificadores.js";
import { ErrorMichi, noAutorizado, noEncontrado } from "../../compartido/errores.js";
import { exportarColecciones, importarColecciones, informeDeSalud, vaciarColecciones } from "../../compartido/servicioBase.js";

const C = COLECCIONES_DISPOSITIVOS;
const LISTA = [C.michis, C.latidos] as const;

export class ServicioDispositivos implements ApiDispositivos {
  constructor(
    private readonly almacen: Almacen,
    private readonly reloj: () => Date = () => new Date(),
  ) {}

  salud(): Promise<InfoSalud> {
    return informeDeSalud("dispositivos", this.almacen, LISTA);
  }

  listarMichis(): Promise<Michi[]> {
    return this.almacen.listar(C.michis);
  }

  async obtenerMichi(serie: string): Promise<Michi> {
    const m = await this.almacen.obtener(C.michis, serie);
    if (!m) throw noEncontrado("El michi");
    return m;
  }

  async registrarMichi(entrada: RegistroMichi): Promise<Michi> {
    const r = validar(RegistroMichi, entrada, "Registro del michi");
    const previo = await this.almacen.obtener(C.michis, r.serie);
    if (previo && previo.pacienteId !== r.pacienteId && previo.estado === "activo") {
      throw new ErrorMichi(
        "conflicto",
        "Ese michi ya está vinculado a otro paciente. Un michi corresponde a un solo paciente durante todo el tratamiento.",
      );
    }
    const michi: Michi = {
      id: r.serie,
      serie: r.serie,
      pacienteId: r.pacienteId,
      codigoHash: await sha256Hex(normalizarCodigo(r.codigo)),
      nombre: r.nombre,
      firmware: r.firmware,
      entregadoEn: r.entregadoEn,
      estado: "activo",
      ultimoLatido: previo?.pacienteId === r.pacienteId ? previo.ultimoLatido : null,
    };
    return this.almacen.guardar(C.michis, michi);
  }

  async cambiarEstado(serie: string, estado: Michi["estado"]): Promise<Michi> {
    const m = await this.obtenerMichi(serie);
    const actualizado = validar(C.michis.esquema, { ...m, estado }, "Michi");
    return this.almacen.guardar(C.michis, actualizado);
  }

  async eliminarMichi(serie: string): Promise<void> {
    await this.obtenerMichi(serie);
    await this.almacen.eliminarDonde(C.latidos, "serie", serie);
    await this.almacen.eliminar(C.michis, serie);
  }

  private async guardarLatido(michi: Michi, entrada: EntradaLatido): Promise<Latido> {
    const e = validar(EntradaLatido, entrada, "Latido");
    const ahora = this.reloj();
    const propuesto = e.momento ? new Date(e.momento) : ahora;
    const momento = propuesto.getTime() > ahora.getTime() + 5 * 60_000 ? ahora : propuesto;
    const latido: Latido = {
      id: `lat-${globalThis.crypto.randomUUID()}`,
      serie: michi.serie,
      momento: momento.toISOString(),
      origen: e.origen,
      bateriaPct: e.bateriaPct,
      rssiDbm: e.rssiDbm ?? null,
      firmware: e.firmware ?? michi.firmware,
      tamizajesEnCola: e.tamizajesEnCola ?? 0,
      alertasEmitidas: e.alertasEmitidas ?? 0,
      alertasAtendidas: e.alertasAtendidas ?? 0,
      silenciamientos: e.silenciamientos ?? 0,
      escalado: e.escalado ?? false,
    };
    const guardado = await this.almacen.guardar(C.latidos, latido);
    if (!michi.ultimoLatido || michi.ultimoLatido.momento <= latido.momento) {
      await this.almacen.guardar(C.michis, {
        ...michi,
        firmware: latido.firmware || michi.firmware,
        ultimoLatido: {
          momento: latido.momento,
          bateriaPct: latido.bateriaPct,
          tamizajesEnCola: latido.tamizajesEnCola,
          alertasEmitidas: latido.alertasEmitidas,
          alertasAtendidas: latido.alertasAtendidas,
          silenciamientos: latido.silenciamientos,
        },
      });
    }
    return guardado;
  }

  async registrarLatido(serie: string, codigo: string, entrada: EntradaLatido): Promise<Latido> {
    const m = await this.almacen.obtener(C.michis, serie);
    if (!m) throw noAutorizado("Serie o código del michi incorrectos");
    const hash = await sha256Hex(normalizarCodigo(codigo ?? ""));
    if (!iguales(hash, m.codigoHash)) throw noAutorizado("Serie o código del michi incorrectos");
    if (m.estado !== "activo") throw new ErrorMichi("prohibido", "Este michi fue dado de baja");
    return this.guardarLatido(m, entrada);
  }

  async registrarLatidoClinico(serie: string, entrada: EntradaLatido): Promise<Latido> {
    const m = await this.obtenerMichi(serie);
    return this.guardarLatido(m, entrada);
  }

  async listarLatidos(serie: string, limite = 50): Promise<Latido[]> {
    await this.obtenerMichi(serie);
    const tope = Math.min(500, Math.max(1, Math.floor(limite)));
    return this.almacen.listar(C.latidos, { donde: { serie }, ordenarPor: "momento", descendente: true, limite: tope });
  }

  async parque(): Promise<EstadoMichi[]> {
    const ahora = this.reloj();
    const michis = await this.almacen.listar(C.michis);
    return michis.map((michi) => ({
      michi,
      salud: evaluarEnlace(michi.estado === "activo" ? michi.ultimoLatido : null, michi.entregadoEn, ahora),
    }));
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
