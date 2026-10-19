export type Aleatorio = () => number;

export function sembrado(semilla: number): Aleatorio {
  let estado = semilla >>> 0;
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function uniforme(rng: Aleatorio, min: number, max: number): number {
  return min + (max - min) * rng();
}

export function normal(rng: Aleatorio, media = 0, desvio = 1): number {
  let u = 0;
  while (u <= Number.EPSILON) u = rng();
  const v = rng();
  return media + desvio * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function poisson(rng: Aleatorio, lambda: number): number {
  if (!(lambda > 0)) return 0;
  if (lambda > 500) return Math.max(0, Math.round(normal(rng, lambda, Math.sqrt(lambda))));
  const limite = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= rng();
  } while (p > limite);
  return k - 1;
}

export function elegir<T>(rng: Aleatorio, opciones: readonly T[]): T {
  if (opciones.length === 0) throw new RangeError("No hay opciones para elegir");
  return opciones[Math.min(opciones.length - 1, Math.floor(rng() * opciones.length))] as T;
}

export function hexAleatorio(bytes: number): string {
  const datos = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(datos);
  return Array.from(datos, (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

export function nuevoId(prefijo: string): string {
  return `${prefijo}-${globalThis.crypto.randomUUID()}`;
}
