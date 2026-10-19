import { horasDesde } from "./fechas.js";

export const HORAS_ENTRE_LATIDOS = 6;
export const HORAS_PARA_INTERMITENTE = 24;
export const HORAS_PARA_SIN_CONTACTO = 72;
export const BATERIA_BAJA_PCT = 25;
export const BATERIA_CRITICA_PCT = 10;
export const SILENCIAMIENTOS_PARA_ESCALAR = 3;

export type EstadoEnlace = "en_linea" | "intermitente" | "sin_contacto";

export interface TelemetriaLatido {
  momento: string;
  bateriaPct: number | null;
  tamizajesEnCola: number;
  alertasEmitidas: number;
  alertasAtendidas: number;
  silenciamientos: number;
}

export interface SaludDelEnlace {
  enlace: EstadoEnlace;
  horasDeSilencio: number;
  bateriaPct: number | null;
  titulo: string;
  conducta: string;
  urgente: boolean;
  motivos: string[];
  tasaDeAtencion: number | null;
}

export const NOMBRE_ENLACE: Record<EstadoEnlace, string> = {
  en_linea: "En línea",
  intermitente: "Intermitente",
  sin_contacto: "Sin contacto",
};

export function clasificarSilencio(horas: number): EstadoEnlace {
  if (horas >= HORAS_PARA_SIN_CONTACTO) return "sin_contacto";
  if (horas >= HORAS_PARA_INTERMITENTE) return "intermitente";
  return "en_linea";
}

export function evaluarEnlace(
  ultimo: TelemetriaLatido | null,
  entregadoEn: string | null,
  ahora: Date = new Date(),
): SaludDelEnlace {
  const referencia = ultimo?.momento ?? entregadoEn;
  const horas = referencia ? Math.max(0, horasDesde(referencia, ahora)) : Number.POSITIVE_INFINITY;
  const enlace = clasificarSilencio(horas);
  const bateria = ultimo?.bateriaPct ?? null;
  const motivos: string[] = [];
  let titulo: string;
  let conducta: string;
  let urgente = false;

  let tasa: number | null = null;
  if (ultimo && ultimo.alertasEmitidas > 0) {
    tasa = Math.round((ultimo.alertasAtendidas / ultimo.alertasEmitidas) * 1000) / 1000;
  }

  if (enlace === "sin_contacto") {
    motivos.push(
      Number.isFinite(horas)
        ? `Sin latido desde hace ${Math.round(horas)} h. El umbral de alarma son ${HORAS_PARA_SIN_CONTACTO} h.`
        : "El michi nunca se ha comunicado.",
    );
    titulo = "El michi dejó de comunicarse";
    conducta =
      "Contacto telefónico con el apoderado hoy. Si no responde, activar el circuito de seguimiento del Comité de Abandono. Esta señal llega antes que la cita perdida.";
    urgente = true;
  } else if (enlace === "intermitente") {
    motivos.push(`Último latido hace ${Math.round(horas)} h; lo esperado son ${HORAS_ENTRE_LATIDOS} h.`);
    titulo = "Comunicación intermitente";
    conducta = "Enviar recordatorio por el canal declarado por la familia. Verificar carga del dispositivo y cobertura.";
  } else {
    titulo = "Michi en línea";
    conducta = "Sin acción. Los recordatorios de audio bastan.";
  }

  if (bateria !== null) {
    if (bateria <= BATERIA_CRITICA_PCT) {
      motivos.push(`Batería crítica (${Math.round(bateria)}%). El michi va a apagarse en horas.`);
      urgente = true;
    } else if (bateria <= BATERIA_BAJA_PCT) {
      motivos.push(`Batería baja (${Math.round(bateria)}%). Recordar la carga inalámbrica en la alerta de la noche.`);
    }
  }

  if (ultimo && ultimo.silenciamientos >= SILENCIAMIENTOS_PARA_ESCALAR) {
    motivos.push(
      `${ultimo.silenciamientos} silenciamientos seguidos sin tamizaje. La familia está apagando el michi en lugar de atenderlo.`,
    );
    urgente = true;
    conducta =
      "Llamada del equipo tratante. El patrón de silenciamiento repetido precede al abandono con más antelación que la inasistencia.";
  }

  if (ultimo && ultimo.tamizajesEnCola > 0) {
    motivos.push(`${ultimo.tamizajesEnCola} tamizajes hechos pero sin sincronizar: hay datos que aún no llegaron.`);
  }

  if (tasa !== null && tasa < 0.6) {
    motivos.push(
      `Solo el ${Math.round(tasa * 100)}% de las alertas se atendió. Revisar si la ventana horaria declarada sigue siendo la buena.`,
    );
  }

  return { enlace, horasDeSilencio: horas, bateriaPct: bateria, titulo, conducta, urgente, motivos, tasaDeAtencion: tasa };
}
