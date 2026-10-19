import type { EstadoPaciente } from "@compartido/dominio/estados";

export interface Leccion {
  id: string;
  emo: string;
  titulo: string;
  resumen: string;
  cuerpo: string[];
  premio: number;
}

export const LECCIONES: readonly Leccion[] = [
  {
    id: "que_es",
    emo: "🩸",
    titulo: "¿Qué son los neutrófilos?",
    resumen: "Los soldados de la sangre",
    cuerpo: [
      "Los neutrófilos son los glóbulos blancos que atacan a las bacterias. Son los primeros en llegar cuando entra un microbio.",
      "La quimioterapia mata células que se dividen rápido. Las de la leucemia se dividen rápido, pero las de la médula que fabrican neutrófilos también. Por eso bajan.",
      "Cuando quedan menos de 500 por microlitro se llama <b>neutropenia grave</b>. El niño se siente igual, pero está sin defensas.",
      "Eso es exactamente lo que el michi busca cuando te pide el dedito.",
    ],
    premio: 12,
  },
  {
    id: "fiebre",
    emo: "🌡️",
    titulo: "La fiebre no espera a mañana",
    resumen: "38 °C es una emergencia",
    cuerpo: [
      "Si tu hijo tiene <b>38 °C o más</b> y está en tratamiento, eso es una emergencia oncológica. No es «vamos mañana a ver».",
      "Sin neutrófilos no hay pus, no hay hinchazón, no hay señal. La fiebre puede ser lo único que se vea, y la infección avanza en horas.",
      "El antibiótico debe entrar en la <b>primera hora</b>. Si el hospital está a más de cuatro horas, se empieza antes de viajar, no al llegar.",
      "Nunca le des paracetamol para «bajarla y ver». Esconde la única señal que tienes.",
    ],
    premio: 18,
  },
  {
    id: "mp6",
    emo: "💊",
    titulo: "Las tres reglas de la 6-MP",
    resumen: "Noche, sin leche, siempre igual",
    cuerpo: [
      "<b>1. De noche, no de mañana.</b> Tomarla en la noche mejora los resultados. No es superstición: se midió.",
      "<b>2. Sin leche ni yogur.</b> Los lácteos tienen xantina oxidasa, que destruye parte del medicamento. Una hora antes y una después: solo agua.",
      "<b>3. Siempre igual.</b> Si un día con comida y otro sin, la dosis que llega a la sangre cambia sola.",
      "Tomar menos del 95% de las dosis multiplica por <b>2.7</b> el riesgo de recaída. Son tres pastillas saltadas al mes.",
    ],
    premio: 22,
  },
  {
    id: "ventana",
    emo: "🎯",
    titulo: "La ventana del mantenimiento",
    resumen: "Ni muy alto ni muy bajo",
    cuerpo: [
      "En el mantenimiento el objetivo no es «tener defensas altas». Es mantenerse en una ventana: entre <b>500 y 1500</b>.",
      "Por encima de 1500, la dosis probablemente se quedó corta y la leucemia tiene espacio.",
      "Por debajo de 500, la dosis es tóxica y el niño está desprotegido.",
      "Hoy eso se comprueba con un hemograma al mes. El michi lo convierte en una línea que se ve cada semana.",
    ],
    premio: 20,
  },
  {
    id: "derechos",
    emo: "⚖️",
    titulo: "Lo que la ley les da",
    resumen: "Ley 31041",
    cuerpo: [
      "La <b>Ley 31041</b> reconoce a las familias con un niño con cáncer un subsidio de <b>2 remuneraciones mínimas</b> y licencia laboral de hasta un año.",
      "El SIS cubre el tratamiento completo, incluidos los traslados por referencia.",
      "La mayoría de familias no lo cobra porque nadie se lo explicó.",
      "Pídelo en Servicio Social del hospital. Si te dicen que no existe, insiste: existe.",
    ],
    premio: 25,
  },
  {
    id: "michi",
    emo: "🐱",
    titulo: "Qué mide el michi y qué no",
    resumen: "Orienta, no reemplaza",
    cuerpo: [
      "El michi mira la sangre que pasa por los capilares de tu dedo con una luz verde. Cuenta los huecos que dejan las células blancas al pasar.",
      "Con eso <b>estima</b> cuántas defensas hay. Es un tamizaje: puede decirte «esto no me gusta, vayan», nunca «está todo bien, no vayan».",
      "No mide plaquetas ni hemoglobina, y <b>no reemplaza el hemograma</b>.",
      "Si el michi dice que hay que ir, hay que ir. Si dice que todo va bien pero el niño tiene fiebre, igual hay que ir.",
    ],
    premio: 15,
  },
];

export interface Logro {
  id: string;
  medalla: string;
  titulo: string;
  texto: string;
}

export const LOGROS: readonly Logro[] = [
  { id: "primer", medalla: "🥇", titulo: "Primer dedito", texto: "Hiciste tu primer tamizaje" },
  { id: "racha3", medalla: "🔥", titulo: "Tres seguidos", texto: "3 días sin fallar" },
  { id: "racha7", medalla: "⭐", titulo: "Semana completa", texto: "7 días de racha" },
  { id: "racha30", medalla: "👑", titulo: "Un mes entero", texto: "30 días de racha" },
  { id: "sabio", medalla: "🎓", titulo: "Michi sabio", texto: "Todas las lecciones aprendidas" },
  { id: "cuidador", medalla: "💜", titulo: "Buen cuidador", texto: "Michi con ánimo al tope" },
];

export interface Prenda {
  id: string;
  emoji: string;
  nombre: string;
  precio: number;
}

export const PRENDAS: readonly Prenda[] = [
  { id: "gorro", emoji: "🎩", nombre: "Sombrero", precio: 0 },
  { id: "lazo", emoji: "🎀", nombre: "Lacito", precio: 40 },
  { id: "lentes", emoji: "🕶️", nombre: "Lentes", precio: 60 },
  { id: "bufanda", emoji: "🧣", nombre: "Chalina", precio: 80 },
  { id: "corona", emoji: "👑", nombre: "Corona", precio: 120 },
  { id: "medico", emoji: "🩺", nombre: "Doctor", precio: 150 },
];

export const SENALES_DE_ALARMA = [
  "Fiebre de 38 °C o más",
  "Sangrado de encías o nariz que no para",
  "Moretones nuevos sin golpe",
  "Palidez con cansancio raro",
  "Vómitos que no ceden",
  "Dolor de cabeza fuerte",
  "El michi muestra estado grave o priorizable",
];

export const FRASES_AL_TOCAR = [
  "¡Miau! Me hiciste cosquillas.",
  "Prrr… otra vez, porfa.",
  "Hoy me porté bien, ¿y tú?",
  "¿Ya tomaste tu pastilla de la noche?",
  "Cuando me pones el dedito, cuido tu sangre.",
  "Te estaba esperando 💜",
];

export const TEXTOS_RESULTADO: Record<EstadoPaciente, { emblema: string; titulo: string; frase: string; nota: string; conducta: string }> = {
  estable: {
    emblema: "😺",
    titulo: "Todo en orden",
    frase: "El michi no encontró nada raro. Sigan con el calendario de siempre.",
    nota: "Un tamizaje bueno no reemplaza el hemograma del control. Si aparece fiebre de 38 °C, esto ya no vale: hay que ir igual.",
    conducta: "Basta con el recordatorio de audio.",
  },
  grave: {
    emblema: "🙀",
    titulo: "Hay que avisar hoy",
    frase: "El michi vio menos defensas de las esperadas. Se abrió una teleconsulta con el médico asignado.",
    nota: "No es una emergencia todavía, pero no espera a mañana. El hematólogo del INSN va a responder hoy mismo.",
    conducta: "Teleconsulta con el médico asignado.",
  },
  priorizable: {
    emblema: "🚨",
    titulo: "Atención prioritaria",
    frase: "El michi vio muy pocas defensas. El INSN ya fue avisado y va a llamar.",
    nota: "Si además hay fiebre de 38 °C o más, vayan a emergencias ahora mismo, sin esperar la llamada. El antibiótico debe entrar en la primera hora.",
    conducta: "Teleconsulta con opción de ingreso por emergencia.",
  },
};

export const ACCESORIOS: Record<string, string> = {
  gorro: '<path d="M104 60 L196 60 L186 24 L114 24 Z" fill="#2E1657"/><rect x="96" y="56" width="108" height="12" rx="6" fill="#A855F7"/>',
  lazo: '<path d="M188 66 L212 50 L212 84 Z" fill="#FF6BB5"/><path d="M232 66 L208 50 L208 84 Z" fill="#FF6BB5"/><circle cx="210" cy="67" r="8" fill="#F472B6"/>',
  lentes:
    '<rect x="92" y="108" width="52" height="42" rx="14" fill="#0B0518" opacity=".82"/><rect x="156" y="108" width="52" height="42" rx="14" fill="#0B0518" opacity=".82"/><rect x="142" y="124" width="18" height="6" fill="#0B0518" opacity=".82"/>',
  corona: '<path d="M108 58 L120 26 L136 48 L150 20 L164 48 L180 26 L192 58 Z" fill="#FBBF24"/><circle cx="150" cy="38" r="6" fill="#FF6BB5"/>',
  bufanda: '<path d="M96 196 Q150 224 204 196 L204 214 Q150 240 96 214 Z" fill="#22D3EE"/><path d="M196 210 L216 258 L192 254 L182 214 Z" fill="#0EA5E9"/>',
  medico:
    '<circle cx="206" cy="238" r="14" fill="none" stroke="#E9E2FF" stroke-width="5"/><path d="M206 224 C206 196 176 200 176 216" fill="none" stroke="#E9E2FF" stroke-width="5" stroke-linecap="round"/>',
};
