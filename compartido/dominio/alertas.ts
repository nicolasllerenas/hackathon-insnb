import { combinar, diaDeSemana, fechaCorta, fechaLocalISO, horaLocal, MS_MINUTO, sumarDias, sumarMinutosAHora } from "./fechas.js";
import { PERFILES, planificarEtapa, type Etapa } from "./tratamiento.js";

export type CanalAlerta = "app" | "juguete" | "sms" | "llamada" | "correo";
export type TipoAlerta = "recordatorio_cita" | "tamizaje" | "medicacion";
export type SonidoAlerta = "miau_corto" | "miau_insistente" | "maullido_largo" | "campanita_miau";
export type EstadoAlerta = "programada" | "postergada" | "escalada" | "atendida";

export const HORA_MAS_TARDIA = "21:00";
export const HORA_SIN_HORARIO_FIJO = "19:00";
export const MARGEN_TRAS_JORNADA_MIN = 30;
export const MAX_POSTERGACIONES = 3;
export const MINUTOS_ENTRE_INSISTENCIAS = 25;
export const DIAS_DE_AVISO_DE_CITA = [3, 1, 0] as const;
export const DIAS_LABORABLES_POR_DEFECTO: readonly number[] = [0, 1, 2, 3, 4, 5];

export interface Jornada {
  finJornada: string;
  sinHorarioFijo: boolean;
  diasLaborables?: readonly number[];
}

export interface FichaAlertas {
  nombreNino: string;
  nombreMichi: string;
  etapa: Etapa;
  inicioEtapa: string;
  jornada: Jornada;
  controles: readonly string[];
}

export interface Alerta {
  id: string;
  tipo: TipoAlerta;
  canal: CanalAlerta;
  sonido: SonidoAlerta;
  programada: Date;
  titulo: string;
  cuerpo: string;
  exigeTamizaje: boolean;
  estado: EstadoAlerta;
  intento: number;
}

export interface VentanaAudible {
  inicio: Date;
  fin: Date;
}

export function ventanaAudible(jornada: Jornada, dia: string): VentanaAudible {
  const laborables = jornada.diasLaborables ?? DIAS_LABORABLES_POR_DEFECTO;
  const libre = jornada.sinHorarioFijo || !laborables.includes(diaDeSemana(dia));
  const horaInicio = libre ? HORA_SIN_HORARIO_FIJO : sumarMinutosAHora(jornada.finJornada, MARGEN_TRAS_JORNADA_MIN);
  let inicio = combinar(dia, horaInicio);
  const fin = combinar(dia, HORA_MAS_TARDIA);
  if (inicio >= fin) inicio = new Date(fin.getTime() - 60 * MS_MINUTO);
  return { inicio, fin };
}

export function textoVentana(jornada: Jornada, dia: string = fechaLocalISO()): string {
  const { inicio, fin } = ventanaAudible(jornada, dia);
  return `${horaLocal(inicio)} – ${horaLocal(fin)}`;
}

export function dentroDeVentana(jornada: Jornada, momento: Date): Date {
  const dia = fechaLocalISO(momento);
  const { inicio, fin } = ventanaAudible(jornada, dia);
  if (momento < inicio) return inicio;
  if (momento > fin) return ventanaAudible(jornada, sumarDias(dia, 1)).inicio;
  return momento;
}

let contador = 0;
function nueva(
  tipo: TipoAlerta,
  canal: CanalAlerta,
  sonido: SonidoAlerta,
  programada: Date,
  titulo: string,
  cuerpo: string,
  exigeTamizaje = false,
  intento = 1,
): Alerta {
  contador += 1;
  return {
    id: `ALT-${programada.getTime().toString(36)}-${contador.toString(36)}`.toUpperCase(),
    tipo,
    canal,
    sonido,
    programada,
    titulo,
    cuerpo,
    exigeTamizaje,
    estado: "programada",
    intento,
  };
}

export function planificarAlertas(ficha: FichaAlertas, desde: string = fechaLocalISO(), dias = 14): Alerta[] {
  const limite = sumarDias(desde, dias);
  const perfil = PERFILES[ficha.etapa];
  const plan = planificarEtapa(ficha.etapa, ficha.inicioEtapa, Math.max(90, dias + 30));
  const nombre = ficha.nombreMichi;
  const alertas: Alerta[] = [];

  for (const cita of ficha.controles) {
    if (cita < desde || cita > limite) continue;
    for (const antelacion of DIAS_DE_AVISO_DE_CITA) {
      const dia = sumarDias(cita, -antelacion);
      if (dia < desde) continue;
      const cuando = dentroDeVentana(ficha.jornada, combinar(dia, "19:00"));
      const texto =
        antelacion === 3
          ? `Falta poco: el control es el ${fechaCorta(cita)}.`
          : antelacion === 1
            ? `Mañana es el control de ${ficha.nombreNino}.`
            : `Hoy es el control de ${ficha.nombreNino}.`;
      alertas.push(nueva("recordatorio_cita", "app", "campanita_miau", cuando, `${nombre} te recuerda el control`, texto));
      if (antelacion <= 1) {
        alertas.push(
          nueva("recordatorio_cita", "juguete", "miau_corto", new Date(cuando.getTime() + 2 * MS_MINUTO), `${nombre} maúlla`, texto),
        );
      }
    }
  }

  for (const tamizaje of plan.tamizajes) {
    if (tamizaje < desde || tamizaje > limite) continue;
    const cuando = dentroDeVentana(ficha.jornada, combinar(tamizaje, "19:30"));
    alertas.push(
      nueva(
        "tamizaje",
        "juguete",
        "maullido_largo",
        cuando,
        `${nombre} pide su dedito`,
        `${nombre} quiere que ${ficha.nombreNino} ponga el dedito en su nariz. Es un minuto y cuida sus defensas.`,
        true,
      ),
    );
  }

  if (perfil.quimioterapiaOralEnCasa) {
    for (let dia = desde; dia <= limite; dia = sumarDias(dia, 1)) {
      alertas.push(
        nueva(
          "medicacion",
          "app",
          "miau_corto",
          combinar(dia, "21:00"),
          "Hora de la 6-MP",
          "De noche, sin leche ni yogur una hora antes y una después, y siempre de la misma forma.",
        ),
      );
    }
  }

  return alertas.sort((a, b) => a.programada.getTime() - b.programada.getTime());
}

export function escalarAlerta(alerta: Alerta, ahora: Date = new Date()): Alerta | null {
  alerta.estado = "postergada";
  if (alerta.intento >= MAX_POSTERGACIONES) {
    alerta.estado = "escalada";
    return null;
  }
  const sonido: SonidoAlerta = alerta.intento === 1 ? "miau_insistente" : "maullido_largo";
  return nueva(
    alerta.tipo,
    "juguete",
    sonido,
    new Date(ahora.getTime() + MINUTOS_ENTRE_INSISTENCIAS * MS_MINUTO),
    alerta.titulo,
    alerta.cuerpo,
    alerta.exigeTamizaje,
    alerta.intento + 1,
  );
}

export interface AvisoConvencional {
  canal: "sms" | "llamada" | "correo";
  mensaje: string;
  nota: string;
}

export function respaldoConvencional(alerta: Alerta): AvisoConvencional[] {
  return (["sms", "llamada", "correo"] as const).map((canal) => ({
    canal,
    mensaje: `${alerta.titulo}: ${alerta.cuerpo}`,
    nota: "Canal convencional del INSN San Borja. Se emite aunque el michi esté apagado.",
  }));
}
