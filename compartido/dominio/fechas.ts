export const MS_MINUTO = 60_000;
export const MS_HORA = 3_600_000;
export const MS_DIA = 86_400_000;

const PATRON_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;
const PATRON_HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];

function dosDigitos(n: number): string {
  return String(n).padStart(2, "0");
}

export function esFechaValida(valor: string): boolean {
  const m = PATRON_FECHA.exec(valor);
  if (!m) return false;
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  return d.getUTCFullYear() === anio && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

export function esHoraValida(valor: string): boolean {
  return PATRON_HORA.test(valor);
}

function partes(fecha: string): [number, number, number] {
  if (!esFechaValida(fecha)) throw new RangeError(`Fecha inválida: ${fecha}`);
  const [a, m, d] = fecha.split("-").map(Number) as [number, number, number];
  return [a, m, d];
}

export function fechaLocalISO(momento: Date = new Date()): string {
  return `${momento.getFullYear()}-${dosDigitos(momento.getMonth() + 1)}-${dosDigitos(momento.getDate())}`;
}

export function sumarDias(fecha: string, dias: number): string {
  const [a, m, d] = partes(fecha);
  const r = new Date(Date.UTC(a, m - 1, d + dias));
  return `${r.getUTCFullYear()}-${dosDigitos(r.getUTCMonth() + 1)}-${dosDigitos(r.getUTCDate())}`;
}

export function diasEntre(desde: string, hasta: string): number {
  const [a1, m1, d1] = partes(desde);
  const [a2, m2, d2] = partes(hasta);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / MS_DIA);
}

export function diaDeSemana(fecha: string): number {
  const [a, m, d] = partes(fecha);
  return (new Date(Date.UTC(a, m - 1, d)).getUTCDay() + 6) % 7;
}

export function combinar(fecha: string, hora: string): Date {
  const [a, m, d] = partes(fecha);
  if (!esHoraValida(hora)) throw new RangeError(`Hora inválida: ${hora}`);
  const [h, min] = hora.split(":").map(Number) as [number, number];
  return new Date(a, m - 1, d, h, min, 0, 0);
}

export function horaLocal(momento: Date): string {
  return `${dosDigitos(momento.getHours())}:${dosDigitos(momento.getMinutes())}`;
}

export function sumarMinutosAHora(hora: string, minutos: number): string {
  if (!esHoraValida(hora)) throw new RangeError(`Hora inválida: ${hora}`);
  const [h, m] = hora.split(":").map(Number) as [number, number];
  const total = Math.min(23 * 60 + 59, Math.max(0, h * 60 + m + minutos));
  return `${dosDigitos(Math.floor(total / 60))}:${dosDigitos(total % 60)}`;
}

export function edadEnAnios(fechaNacimiento: string, ahora: Date = new Date()): number {
  const [a, m, d] = partes(fechaNacimiento);
  const nacimiento = Date.UTC(a, m - 1, d);
  const hoy = Date.UTC(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  return Math.max(0, (hoy - nacimiento) / MS_DIA / 365.25);
}

export function horasDesde(momentoISO: string, ahora: Date = new Date()): number {
  const t = Date.parse(momentoISO);
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  return (ahora.getTime() - t) / MS_HORA;
}

export function fechaCorta(fecha: string): string {
  const [, m, d] = partes(fecha);
  return `${d} ${MESES[m - 1]}`;
}

export function fechaLarga(fecha: string): string {
  const [a, m, d] = partes(fecha);
  return `${d} ${MESES[m - 1]} ${a}`;
}

export function hace(momentoISO: string, ahora: Date = new Date()): string {
  const horas = horasDesde(momentoISO, ahora);
  if (!Number.isFinite(horas)) return "nunca";
  if (horas < 0) return "en el futuro";
  const minutos = Math.round(horas * 60);
  if (minutos < 1) return "hace instantes";
  if (minutos < 60) return `hace ${minutos} min`;
  if (horas < 24) return `hace ${Math.round(horas)} h`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? "hace 1 día" : `hace ${dias} días`;
}

export function mesCorto(indice: number): string {
  return MESES[((indice % 12) + 12) % 12] ?? "";
}
