import { sumarDias } from "./fechas.js";

export const ETAPAS = ["induccion", "consolidacion", "intensificacion", "mantenimiento", "vigilancia"] as const;
export type Etapa = (typeof ETAPAS)[number];

export type RiesgoAbandono = "bajo" | "moderado" | "alto";

export interface PerfilEtapa {
  etapa: Etapa;
  nombre: string;
  semanas: readonly [number, number];
  ambito: "hospitalario" | "mixto" | "domiciliario";
  diasEntreControles: number;
  diasEntreTamizajes: number;
  riesgoAbandono: RiesgoAbandono;
  quimioterapiaOralEnCasa: boolean;
  paraLaFamilia: string;
  porQueElTamizaje: string;
}

export const PERFILES: Readonly<Record<Etapa, PerfilEtapa>> = {
  induccion: {
    etapa: "induccion",
    nombre: "Inducción",
    semanas: [4, 6],
    ambito: "hospitalario",
    diasEntreControles: 3,
    diasEntreTamizajes: 2,
    riesgoAbandono: "bajo",
    quimioterapiaOralEnCasa: false,
    paraLaFamilia:
      "Es la fase en la que se busca la remisión: que la médula deje de producir células enfermas. Es la más intensa y la más vigilada. Aquí el michi acompaña, no reemplaza ningún control.",
    porQueElTamizaje:
      "El nadir de neutrófilos es profundo y esperado. El tamizaje en casa detecta el momento en que cualquier fiebre se vuelve una emergencia.",
  },
  consolidacion: {
    etapa: "consolidacion",
    nombre: "Consolidación",
    semanas: [8, 12],
    ambito: "mixto",
    diasEntreControles: 7,
    diasEntreTamizajes: 3,
    riesgoAbandono: "moderado",
    quimioterapiaOralEnCasa: false,
    paraLaFamilia:
      "La remisión ya se logró; ahora hay que eliminar la enfermedad que no se ve. El niño empieza a estar más tiempo en casa, y ahí empieza a hacer falta que alguien vigile todos los días.",
    porQueElTamizaje: "Primer periodo con días en casa durante el nadir. El tamizaje cubre justo esos días.",
  },
  intensificacion: {
    etapa: "intensificacion",
    nombre: "Intensificación",
    semanas: [6, 10],
    ambito: "mixto",
    diasEntreControles: 7,
    diasEntreTamizajes: 2,
    riesgoAbandono: "moderado",
    quimioterapiaOralEnCasa: true,
    paraLaFamilia:
      "Se vuelve a subir la intensidad para cerrar la puerta a la recaída. Los recuentos vuelven a bajar mucho, y el niño ya está en casa buena parte del tiempo.",
    porQueElTamizaje: "Nadires profundos con el niño en domicilio: la combinación de mayor riesgo del tratamiento.",
  },
  mantenimiento: {
    etapa: "mantenimiento",
    nombre: "Mantenimiento",
    semanas: [96, 130],
    ambito: "domiciliario",
    diasEntreControles: 30,
    diasEntreTamizajes: 7,
    riesgoAbandono: "alto",
    quimioterapiaOralEnCasa: true,
    paraLaFamilia:
      "Dos años de quimioterapia en casa, en pastillas. El niño se ve bien, va al colegio, juega. Por eso es la fase más peligrosa: no porque la enfermedad sea peor, sino porque es fácil creer que ya pasó.",
    porQueElTamizaje:
      "El objetivo es sostener el recuento dentro de una ventana: ni tan alto que la dosis sea insuficiente, ni tan bajo que sea tóxica. Hoy se comprueba con un hemograma mensual; el michi lo convierte en una trayectoria semanal.",
  },
  vigilancia: {
    etapa: "vigilancia",
    nombre: "Vigilancia",
    semanas: [130, 400],
    ambito: "domiciliario",
    diasEntreControles: 90,
    diasEntreTamizajes: 30,
    riesgoAbandono: "moderado",
    quimioterapiaOralEnCasa: false,
    paraLaFamilia:
      "El tratamiento terminó. Ahora toca comprobar que no vuelva. Los controles se espacian, pero no desaparecen.",
    porQueElTamizaje: "Una caída sostenida del recuento entre controles trimestrales es un dato que hoy nadie recoge.",
  },
};

export const VENTANA_MANTENIMIENTO_ANC: readonly [number, number] = [500, 1500];

export interface PlanDeEtapa {
  etapa: Etapa;
  inicio: string;
  finPrevisto: string;
  controles: string[];
  tamizajes: string[];
}

function serie(inicio: string, limite: string, paso: number): string[] {
  const fechas: string[] = [];
  let actual = sumarDias(inicio, paso);
  while (actual <= limite) {
    fechas.push(actual);
    actual = sumarDias(actual, paso);
  }
  return fechas;
}

export function planificarEtapa(etapa: Etapa, inicio: string, horizonteDias = 90): PlanDeEtapa {
  const perfil = PERFILES[etapa];
  const fin = sumarDias(inicio, perfil.semanas[1] * 7);
  const tope = sumarDias(inicio, horizonteDias);
  const limite = fin < tope ? fin : tope;
  return {
    etapa,
    inicio,
    finPrevisto: fin,
    controles: serie(inicio, limite, perfil.diasEntreControles),
    tamizajes: serie(inicio, limite, perfil.diasEntreTamizajes),
  };
}

const EQUIVALENCIAS: Record<string, Etapa> = {
  induccion: "induccion",
  consolidacion: "consolidacion",
  intensificacion: "intensificacion",
  reinduccion: "intensificacion",
  mantenimiento: "mantenimiento",
  vigilancia: "vigilancia",
  seguimiento: "vigilancia",
};

export function etapaDesdeTexto(valor: string): Etapa {
  const limpio = valor
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  const etapa = EQUIVALENCIAS[limpio];
  if (!etapa) throw new RangeError(`Etapa no reconocida: ${valor}`);
  return etapa;
}

export function tamizajePendiente(etapa: Etapa, ultimoTamizajeISO: string | null, ahora: Date = new Date()): boolean {
  if (!ultimoTamizajeISO) return true;
  const t = Date.parse(ultimoTamizajeISO);
  if (Number.isNaN(t)) return true;
  return (ahora.getTime() - t) / 86_400_000 >= PERFILES[etapa].diasEntreTamizajes;
}
