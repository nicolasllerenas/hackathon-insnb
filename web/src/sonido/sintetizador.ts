type ContextoAudio = AudioContext;

let contexto: ContextoAudio | null = null;
let silenciado = false;

export function silenciar(valor: boolean): void {
  silenciado = valor;
}

export function audio(): ContextoAudio | null {
  if (silenciado) return null;
  if (!contexto) {
    const Constructor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Constructor) return null;
    try {
      contexto = new Constructor();
    } catch {
      return null;
    }
  }
  if (contexto.state === "suspended") void contexto.resume().catch(() => undefined);
  return contexto;
}

export interface OpcionesMaullido {
  tono?: number;
  dur?: number;
  vol?: number;
  tristeza?: number;
}

export function maullido(opciones: OpcionesMaullido = {}): void {
  const o = { tono: 540, dur: 0.62, vol: 0.2, tristeza: 0, ...opciones };
  const c = audio();
  if (!c) return;
  const t = c.currentTime;
  const salida = c.createGain();
  salida.gain.setValueAtTime(0, t);
  salida.gain.linearRampToValueAtTime(o.vol, t + 0.05);
  salida.gain.setValueAtTime(o.vol, t + o.dur * 0.6);
  salida.gain.exponentialRampToValueAtTime(0.0005, t + o.dur);
  salida.connect(c.destination);

  const f1 = c.createBiquadFilter();
  f1.type = "bandpass";
  f1.Q.value = 5.5;
  const f2 = c.createBiquadFilter();
  f2.type = "bandpass";
  f2.Q.value = 9;
  const mezcla = c.createGain();
  mezcla.gain.value = 0.55;
  f1.connect(salida);
  f2.connect(mezcla);
  mezcla.connect(salida);

  const base = o.tono * (1 - o.tristeza * 0.22);
  const cima = base * (o.tristeza ? 1.02 : 1.16);
  const cierre = base * (o.tristeza ? 0.55 : 0.66);

  f1.frequency.setValueAtTime(base * 1.45, t);
  f1.frequency.linearRampToValueAtTime(cima * 2.0, t + o.dur * 0.3);
  f1.frequency.linearRampToValueAtTime(cierre * 1.25, t + o.dur);
  f2.frequency.setValueAtTime(base * 3.4, t);
  f2.frequency.linearRampToValueAtTime(cima * 4.4, t + o.dur * 0.28);
  f2.frequency.linearRampToValueAtTime(cierre * 2.1, t + o.dur);

  const capas: [OscillatorType, number, number][] = [
    ["sawtooth", 1, 0.42],
    ["triangle", 2, 0.2],
    ["sine", 0.5, 0.16],
  ];
  for (const [forma, mult, nivel] of capas) {
    const osc = c.createOscillator();
    osc.type = forma;
    const g = c.createGain();
    g.gain.value = nivel;
    osc.frequency.setValueAtTime(base * mult * 0.78, t);
    osc.frequency.linearRampToValueAtTime(cima * mult, t + o.dur * 0.26);
    osc.frequency.linearRampToValueAtTime(cierre * mult, t + o.dur);
    osc.connect(g);
    g.connect(f1);
    g.connect(f2);
    osc.start(t);
    osc.stop(t + o.dur + 0.05);
  }

  const vibrato = c.createOscillator();
  vibrato.frequency.value = 19;
  const prof = c.createGain();
  prof.gain.value = 26;
  vibrato.connect(prof);
  prof.connect(f1.frequency);
  vibrato.start(t);
  vibrato.stop(t + o.dur);
}

export interface Ronroneo {
  detener(): void;
}

export function ronroneo(segundos = 2): Ronroneo | null {
  const c = audio();
  if (!c) return null;
  const t = c.currentTime;
  const largo = Math.floor(c.sampleRate * 0.5);
  const buffer = c.createBuffer(1, largo, c.sampleRate);
  const datos = buffer.getChannelData(0);
  for (let i = 0; i < largo; i++) datos[i] = (Math.random() * 2 - 1) * 0.5;
  const ruido = c.createBufferSource();
  ruido.buffer = buffer;
  ruido.loop = true;
  const paso = c.createBiquadFilter();
  paso.type = "lowpass";
  paso.frequency.value = 320;
  const cuerpo = c.createBiquadFilter();
  cuerpo.type = "bandpass";
  cuerpo.frequency.value = 145;
  cuerpo.Q.value = 2.2;
  const amp = c.createGain();
  amp.gain.value = 0;
  const mod = c.createOscillator();
  mod.type = "sine";
  mod.frequency.value = 26;
  const profMod = c.createGain();
  profMod.gain.value = 0.11;
  mod.connect(profMod);
  profMod.connect(amp.gain);
  amp.gain.setValueAtTime(0.03, t);
  ruido.connect(paso);
  paso.connect(cuerpo);
  cuerpo.connect(amp);
  amp.connect(c.destination);
  ruido.start(t);
  mod.start(t);
  const fin = t + segundos;
  amp.gain.setValueAtTime(0.03, Math.max(t, fin - 0.3));
  amp.gain.linearRampToValueAtTime(0, fin);
  ruido.stop(fin + 0.05);
  mod.stop(fin + 0.05);
  return {
    detener() {
      try {
        ruido.stop();
        mod.stop();
      } catch {
        return;
      }
    },
  };
}

export function campanita(): void {
  const c = audio();
  if (!c) return;
  const t = c.currentTime;
  for (const [f, retardo] of [
    [1046.5, 0],
    [1568, 0.09],
  ] as const) {
    const osc = c.createOscillator();
    osc.type = "sine";
    osc.frequency.value = f;
    const arm = c.createOscillator();
    arm.type = "sine";
    arm.frequency.value = f * 2;
    const g = c.createGain();
    const ga = c.createGain();
    g.gain.setValueAtTime(0, t + retardo);
    g.gain.linearRampToValueAtTime(0.17, t + retardo + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0006, t + retardo + 0.55);
    ga.gain.setValueAtTime(0, t + retardo);
    ga.gain.linearRampToValueAtTime(0.05, t + retardo + 0.01);
    ga.gain.exponentialRampToValueAtTime(0.0004, t + retardo + 0.3);
    osc.connect(g);
    arm.connect(ga);
    g.connect(c.destination);
    ga.connect(c.destination);
    osc.start(t + retardo);
    osc.stop(t + retardo + 0.6);
    arm.start(t + retardo);
    arm.stop(t + retardo + 0.35);
  }
}

export function tono(frecuencia: number, duracion = 0.2, volumen = 0.12, forma: OscillatorType = "sine"): void {
  const c = audio();
  if (!c) return;
  const t = c.currentTime;
  const osc = c.createOscillator();
  osc.type = forma;
  osc.frequency.value = frecuencia;
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(volumen, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0005, t + duracion);
  osc.connect(g);
  g.connect(c.destination);
  osc.start(t);
  osc.stop(t + duracion + 0.02);
}

export function vibrar(patron: number | number[]): void {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(patron);
  } catch {
    return;
  }
}
