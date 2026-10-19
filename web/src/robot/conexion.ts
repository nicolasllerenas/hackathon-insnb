import { interpretarLinea, SeparadorDeLineas, type LatidoRobot, type Orden } from "./protocolo";

export type EstadoConexion = "no_soportado" | "desconectado" | "conectando" | "conectado" | "error";

export interface LineaRegistro {
  id: number;
  momento: string;
  tipo: "entrada" | "salida" | "sistema";
  texto: string;
}

export interface InstantaneaRobot {
  estado: EstadoConexion;
  simulado: boolean;
  error: string | null;
  ultimoLatido: LatidoRobot | null;
  latidosRecibidos: number;
  registro: readonly LineaRegistro[];
}

type OyenteLatido = (latido: LatidoRobot) => void;

const MAX_REGISTRO = 80;

export function serialDisponible(): boolean {
  return typeof navigator !== "undefined" && "serial" in navigator;
}

export class ConexionRobot {
  private instantanea: InstantaneaRobot = {
    estado: serialDisponible() ? "desconectado" : "no_soportado",
    simulado: false,
    error: null,
    ultimoLatido: null,
    latidosRecibidos: 0,
    registro: [],
  };
  private readonly oyentes = new Set<() => void>();
  private readonly oyentesLatido = new Set<OyenteLatido>();
  private puerto: SerialPort | null = null;
  private lector: ReadableStreamDefaultReader<string> | null = null;
  private tuberia: Promise<void> | null = null;
  private contador = 0;
  private temporizador: number | null = null;
  private simulacion: LatidoRobot | null = null;

  suscribir = (fn: () => void): (() => void) => {
    this.oyentes.add(fn);
    return () => this.oyentes.delete(fn);
  };

  obtener = (): InstantaneaRobot => this.instantanea;

  alLatido(fn: OyenteLatido): () => void {
    this.oyentesLatido.add(fn);
    return () => this.oyentesLatido.delete(fn);
  }

  private actualizar(cambios: Partial<InstantaneaRobot>): void {
    this.instantanea = { ...this.instantanea, ...cambios };
    this.oyentes.forEach((fn) => fn());
  }

  private anotar(tipo: LineaRegistro["tipo"], texto: string): void {
    this.contador += 1;
    const linea: LineaRegistro = { id: this.contador, momento: new Date().toISOString(), tipo, texto };
    this.actualizar({ registro: [...this.instantanea.registro, linea].slice(-MAX_REGISTRO) });
  }

  private recibirLatido(latido: LatidoRobot): void {
    this.actualizar({ ultimoLatido: latido, latidosRecibidos: this.instantanea.latidosRecibidos + 1 });
    this.oyentesLatido.forEach((fn) => {
      try {
        fn(latido);
      } catch {
        return;
      }
    });
  }

  private procesarLinea(linea: string): void {
    this.anotar("entrada", linea);
    const latido = interpretarLinea(linea);
    if (latido) this.recibirLatido(latido);
  }

  async conectar(): Promise<void> {
    if (!serialDisponible()) {
      this.actualizar({ estado: "no_soportado", error: "Este navegador no permite USB serial. Use Chrome o Edge en una computadora." });
      return;
    }
    if (this.instantanea.estado === "conectado") return;
    this.actualizar({ estado: "conectando", error: null, simulado: false });
    try {
      const puerto = await navigator.serial.requestPort();
      await puerto.open({ baudRate: 115200 });
      try {
        await puerto.setSignals({ dataTerminalReady: false, requestToSend: false });
      } catch {
        this.anotar("sistema", "No se pudieron liberar DTR/RTS; si el michi no responde, presione su botón de reinicio.");
      }
      this.puerto = puerto;
      this.actualizar({ estado: "conectado" });
      this.anotar("sistema", "Conectado a 115200 baudios");
      void this.leer(puerto);
    } catch (e) {
      const cancelado = e instanceof DOMException && e.name === "NotFoundError";
      this.actualizar({
        estado: cancelado ? "desconectado" : "error",
        error: cancelado ? null : `No se pudo abrir el puerto: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  private async leer(puerto: SerialPort): Promise<void> {
    const separador = new SeparadorDeLineas();
    while (puerto.readable && this.puerto === puerto) {
      const decodificador = new TextDecoderStream();
      this.tuberia = puerto.readable.pipeTo(decodificador.writable as WritableStream<Uint8Array>).catch(() => undefined);
      const lector = decodificador.readable.getReader();
      this.lector = lector;
      try {
        for (;;) {
          const { value, done } = await lector.read();
          if (done) break;
          if (value) separador.agregar(value).forEach((l) => this.procesarLinea(l));
        }
      } catch (e) {
        if (this.puerto === puerto) this.anotar("sistema", `Lectura interrumpida: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        lector.releaseLock();
      }
      if (this.puerto !== puerto) break;
    }
    if (this.puerto === puerto) {
      this.puerto = null;
      this.actualizar({ estado: "desconectado" });
      this.anotar("sistema", "El michi se desconectó");
    }
  }

  async enviar(orden: Orden): Promise<void> {
    if (this.instantanea.simulado) {
      this.anotar("salida", orden);
      this.responderSimulado(orden);
      return;
    }
    const puerto = this.puerto;
    if (!puerto?.writable) throw new Error("El michi no está conectado");
    const escritor = puerto.writable.getWriter();
    try {
      await escritor.write(new TextEncoder().encode(orden));
      this.anotar("salida", orden);
    } finally {
      escritor.releaseLock();
    }
  }

  async desconectar(): Promise<void> {
    if (this.temporizador !== null) {
      window.clearInterval(this.temporizador);
      this.temporizador = null;
    }
    if (this.instantanea.simulado) {
      this.simulacion = null;
      this.actualizar({ estado: serialDisponible() ? "desconectado" : "no_soportado", simulado: false });
      this.anotar("sistema", "Simulador detenido");
      return;
    }
    const puerto = this.puerto;
    this.puerto = null;
    try {
      await this.lector?.cancel();
    } catch {
      this.lector = null;
    }
    await this.tuberia;
    try {
      await puerto?.close();
    } catch {
      this.puerto = null;
    }
    this.lector = null;
    this.tuberia = null;
    this.actualizar({ estado: serialDisponible() ? "desconectado" : "no_soportado" });
    this.anotar("sistema", "Desconectado");
  }

  conectarSimulador(inicial: Partial<LatidoRobot> = {}): void {
    if (this.instantanea.estado === "conectado") return;
    this.simulacion = {
      bateriaPct: 86,
      capturasEnCola: 0,
      alertasEmitidas: 12,
      alertasAtendidas: 11,
      silenciamientos: 0,
      escalado: false,
      firmware: "0.3.0-sim",
      serie: null,
      ...inicial,
    };
    this.actualizar({ estado: "conectado", simulado: true, error: null });
    this.anotar("sistema", "Simulador del michi conectado (sin hardware)");
    this.emitirSimulado();
    this.temporizador = window.setInterval(() => {
      if (this.simulacion) {
        this.simulacion = { ...this.simulacion, bateriaPct: Math.max(0, (this.simulacion.bateriaPct ?? 80) - 1) };
        this.emitirSimulado();
      }
    }, 8000);
  }

  private emitirSimulado(): void {
    const s = this.simulacion;
    if (!s) return;
    const linea = JSON.stringify({
      latido: 1,
      bateria_pct: s.bateriaPct,
      capturas_en_cola: s.capturasEnCola,
      alertas_emitidas: s.alertasEmitidas,
      alertas_atendidas: s.alertasAtendidas,
      silenciamientos: s.silenciamientos,
      escalado: s.escalado,
      firmware: s.firmware,
    });
    this.procesarLinea(linea);
  }

  private responderSimulado(orden: Orden): void {
    const s = this.simulacion;
    if (!s) return;
    if (orden === "M") {
      this.anotar("sistema", "El michi maúlla 🐱");
      return;
    }
    if (orden === "L") {
      this.emitirSimulado();
      return;
    }
    this.simulacion = { ...s, alertasEmitidas: s.alertasEmitidas + 1 };
    this.anotar("sistema", orden === "T" ? "El michi maúlla pidiendo el dedito" : "El michi recuerda la cita");
    this.emitirSimulado();
    if (orden === "T") {
      window.setTimeout(() => {
        if (!this.simulacion) return;
        this.anotar("sistema", "Simulación: el niño apoyó el dedo y el michi capturó");
        this.simulacion = { ...this.simulacion, alertasAtendidas: this.simulacion.alertasAtendidas + 1, silenciamientos: 0 };
        this.emitirSimulado();
      }, 4000);
    }
  }
}

export const robot = new ConexionRobot();
